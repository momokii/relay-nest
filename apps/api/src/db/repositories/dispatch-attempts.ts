import { and, eq } from "drizzle-orm"

import type { PersistenceDatabase } from "../client"
import { withPersistenceErrors } from "../repository-support"
import { dispatchAttempts, scheduledJobs } from "../schema"
import type { AccountScope } from "../schema/shared"

const attemptStates = ["attempting", "submitted", "acknowledged", "failed"] as const

export function createDispatchAttemptRepositories(db: PersistenceDatabase) {
  return {
    dispatchAttempts: {
      create: (input: typeof dispatchAttempts.$inferInsert) =>
        withPersistenceErrors(
          db
            .insert(dispatchAttempts)
            .values(input)
            .returning()
            .then(([attempt]) => attempt),
        ),
      listForJob: (jobId: string, accountScope: AccountScope) =>
        db
          .select()
          .from(dispatchAttempts)
          .where(
            and(eq(dispatchAttempts.jobId, jobId), eq(dispatchAttempts.accountScope, accountScope)),
          ),
      updateState: async (
        sessionId: string,
        accountScope: AccountScope,
        providerMessageId: string,
        state: (typeof attemptStates)[number],
      ) => {
        await db.transaction(async (tx) => {
          await tx
            .update(dispatchAttempts)
            .set({ state })
            .where(
              and(
                eq(dispatchAttempts.sessionId, sessionId),
                eq(dispatchAttempts.accountScope, accountScope),
                eq(dispatchAttempts.providerMessageId, providerMessageId),
              ),
            )
          const [job] = await tx
            .select({ id: scheduledJobs.id, state: scheduledJobs.state })
            .from(scheduledJobs)
            .where(
              and(
                eq(scheduledJobs.sessionId, sessionId),
                eq(scheduledJobs.accountScope, accountScope),
                eq(scheduledJobs.providerMessageId, providerMessageId),
              ),
            )
            .limit(1)
          if (!job) return
          const rank = {
            scheduled: 0,
            queued: 0,
            attempting: 1,
            submitted: 2,
            acknowledged: 3,
            failed: 5,
            unknown: 0,
            cancelled: 0,
          } as const
          if (rank[state] <= rank[job.state]) return
          await tx
            .update(scheduledJobs)
            .set({ state, updatedAt: new Date() })
            .where(eq(scheduledJobs.id, job.id))
        })
      },
    },
  }
}
