import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm"

import type { PersistenceDatabase } from "../client"
import { withPersistenceErrors } from "../repository-support"
import { dispatchAttempts, scheduledJobs } from "../schema"
import type { AccountScope } from "../schema/shared"

const claimableStates = ["scheduled", "queued"] as const

export function createSchedulingRepositories(db: PersistenceDatabase) {
  return {
    scheduledJobs: {
      create: (input: typeof scheduledJobs.$inferInsert) =>
        withPersistenceErrors(
          db
            .insert(scheduledJobs)
            .values(input)
            .returning()
            .then(([job]) => job),
        ),
      find: async (id: string, accountScope: AccountScope) => {
        const [job] = await db
          .select()
          .from(scheduledJobs)
          .where(and(eq(scheduledJobs.id, id), eq(scheduledJobs.accountScope, accountScope)))
          .limit(1)
        return job ?? null
      },
      findByIdempotencyKey: async (idempotencyKey: string) => {
        const [job] = await db
          .select()
          .from(scheduledJobs)
          .where(eq(scheduledJobs.idempotencyKey, idempotencyKey))
          .limit(1)
        return job ?? null
      },
      safetyStats: async (
        sessionId: string,
        accountScope: AccountScope,
        messageBlindIndex: string,
        now: Date,
      ) => {
        const dailyStart = new Date(now.getTime() - 86_400_000)
        const burstStart = new Date(now.getTime() - 300_000)
        const daily = await db
          .select({ id: scheduledJobs.id, updatedAt: scheduledJobs.updatedAt })
          .from(scheduledJobs)
          .where(
            and(
              eq(scheduledJobs.sessionId, sessionId),
              eq(scheduledJobs.accountScope, accountScope),
              inArray(scheduledJobs.state, ["submitted", "acknowledged"]),
              gte(scheduledJobs.updatedAt, dailyStart),
            ),
          )
          .orderBy(desc(scheduledJobs.updatedAt))
        const burst = daily.filter((job) => job.updatedAt >= burstStart)
        const [duplicate] = await db
          .select({ id: scheduledJobs.id })
          .from(scheduledJobs)
          .where(
            and(
              eq(scheduledJobs.sessionId, sessionId),
              eq(scheduledJobs.accountScope, accountScope),
              eq(scheduledJobs.messageBlindIndex, messageBlindIndex),
              inArray(scheduledJobs.state, ["submitted", "acknowledged"]),
              gte(scheduledJobs.updatedAt, dailyStart),
            ),
          )
          .limit(1)
        return {
          dailyCount: daily.length,
          burstCount: burst.length,
          lastSentAt: daily[0]?.updatedAt ?? null,
          duplicateContent: Boolean(duplicate),
        }
      },
      claimDue: async (owner: string, now: Date, leaseMs: number) =>
        db.transaction(async (tx) => {
          const [candidate] = await tx
            .select()
            .from(scheduledJobs)
            .where(
              and(
                inArray(scheduledJobs.state, claimableStates),
                lte(scheduledJobs.scheduledFor, now),
                or(isNull(scheduledJobs.nextAttemptAt), lte(scheduledJobs.nextAttemptAt, now)),
                or(isNull(scheduledJobs.leaseExpiresAt), lte(scheduledJobs.leaseExpiresAt, now)),
              ),
            )
            .orderBy(asc(scheduledJobs.scheduledFor))
            .limit(1)
            .for("update", { skipLocked: true })
          if (!candidate) return null
          const [claimed] = await tx
            .update(scheduledJobs)
            .set({
              state: "attempting",
              attempts: sql`${scheduledJobs.attempts} + 1`,
              leaseOwner: owner,
              leaseExpiresAt: new Date(now.getTime() + leaseMs),
              updatedAt: now,
            })
            .where(
              and(
                eq(scheduledJobs.id, candidate.id),
                inArray(scheduledJobs.state, claimableStates),
              ),
            )
            .returning()
          if (!claimed) return null
          await tx.insert(dispatchAttempts).values({
            jobId: claimed.id,
            sessionId: claimed.sessionId,
            accountScope: claimed.accountScope,
            attemptNumber: claimed.attempts,
            state: "attempting",
          })
          return claimed
        }),
      complete: async (
        jobId: string,
        owner: string,
        result: {
          readonly state: "submitted" | "acknowledged"
          readonly providerMessageId: string
        },
      ) =>
        db.transaction(async (tx) => {
          const [job] = await tx
            .update(scheduledJobs)
            .set({
              state: result.state,
              providerMessageId: result.providerMessageId,
              leaseOwner: null,
              leaseExpiresAt: null,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(scheduledJobs.id, jobId),
                eq(scheduledJobs.leaseOwner, owner),
                eq(scheduledJobs.state, "attempting"),
              ),
            )
            .returning()
          if (!job) return null
          await tx
            .update(dispatchAttempts)
            .set({ state: result.state, providerMessageId: result.providerMessageId })
            .where(
              and(
                eq(dispatchAttempts.jobId, job.id),
                eq(dispatchAttempts.attemptNumber, job.attempts),
              ),
            )
          return job
        }),
      fail: async (
        jobId: string,
        owner: string,
        failure: {
          readonly state: "failed" | "unknown" | "queued"
          readonly failureCode: string
          readonly recoveryCode: string
          readonly nextAttemptAt: Date | null
        },
      ) =>
        db.transaction(async (tx) => {
          const [job] = await tx
            .update(scheduledJobs)
            .set({
              state: failure.state,
              failureCode: failure.failureCode,
              recoveryCode: failure.recoveryCode,
              nextAttemptAt: failure.nextAttemptAt,
              leaseOwner: null,
              leaseExpiresAt: null,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(scheduledJobs.id, jobId),
                eq(scheduledJobs.leaseOwner, owner),
                eq(scheduledJobs.state, "attempting"),
              ),
            )
            .returning()
          if (!job) return null
          await tx
            .update(dispatchAttempts)
            .set({ state: failure.state, failureCode: failure.failureCode })
            .where(
              and(
                eq(dispatchAttempts.jobId, job.id),
                eq(dispatchAttempts.attemptNumber, job.attempts),
              ),
            )
          return job
        }),
      cancel: async (id: string, accountScope: AccountScope) => {
        const [job] = await db
          .update(scheduledJobs)
          .set({ state: "cancelled", nextAttemptAt: null, updatedAt: new Date() })
          .where(
            and(
              eq(scheduledJobs.id, id),
              eq(scheduledJobs.accountScope, accountScope),
              inArray(scheduledJobs.state, claimableStates),
              isNull(scheduledJobs.leaseOwner),
            ),
          )
          .returning()
        return job ?? null
      },
      edit: async (
        id: string,
        accountScope: AccountScope,
        input: Partial<typeof scheduledJobs.$inferInsert>,
      ) => {
        const [job] = await db
          .update(scheduledJobs)
          .set({
            ...input,
            editVersion: sql`${scheduledJobs.editVersion} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(scheduledJobs.id, id),
              eq(scheduledJobs.accountScope, accountScope),
              inArray(scheduledJobs.state, claimableStates),
              isNull(scheduledJobs.leaseOwner),
            ),
          )
          .returning()
        return job ?? null
      },
      recoverExpiredLeases: async (now: Date) => {
        const jobs = await db
          .update(scheduledJobs)
          .set({
            state: "unknown",
            recoveryCode: "lease_expired",
            failureCode: "worker_interrupted",
            leaseOwner: null,
            leaseExpiresAt: null,
            nextAttemptAt: null,
            updatedAt: now,
          })
          .where(and(eq(scheduledJobs.state, "attempting"), lte(scheduledJobs.leaseExpiresAt, now)))
          .returning({ id: scheduledJobs.id })
        return jobs.length
      },
      markMissed: async (now: Date, graceMs: number) => {
        const cutoff = new Date(now.getTime() - graceMs)
        const jobs = await db
          .update(scheduledJobs)
          .set({
            state: "unknown",
            recoveryCode: "missed_schedule",
            failureCode: "dispatch_window_missed",
            nextAttemptAt: null,
            updatedAt: now,
          })
          .where(
            and(
              inArray(scheduledJobs.state, claimableStates),
              lte(scheduledJobs.scheduledFor, cutoff),
              isNull(scheduledJobs.leaseOwner),
            ),
          )
          .returning({ id: scheduledJobs.id })
        return jobs.length
      },
    },
  }
}
