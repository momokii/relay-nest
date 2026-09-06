import { and, count, desc, eq, gte, inArray, lte } from "drizzle-orm"

import type { PersistenceDatabase } from "../client"
import { dispatchAttempts, scheduledJobs, sessionGrants } from "../schema"
import type { AccountScope } from "../schema/shared"

export function createSentHistoryRepository(db: PersistenceDatabase) {
  return {
    listForUser: async (
      userId: string,
      accountScope: AccountScope,
      limit: number,
      offset: number,
      filters: {
        readonly state?: string
        readonly from?: Date
        readonly to?: Date
      } = {},
    ) => {
      const boundedLimit = Math.min(Math.max(limit, 1), 50)
      const boundedOffset = Math.max(offset, 0)
      const conditions = [eq(scheduledJobs.accountScope, accountScope)]
      if (filters.state) conditions.push(eq(scheduledJobs.state, filters.state as never))
      if (filters.from) conditions.push(gte(scheduledJobs.scheduledFor, filters.from))
      if (filters.to) conditions.push(lte(scheduledJobs.scheduledFor, filters.to))
      const jobs = await db
        .select()
        .from(scheduledJobs)
        .innerJoin(
          sessionGrants,
          and(
            eq(sessionGrants.userId, userId),
            eq(sessionGrants.sessionId, scheduledJobs.sessionId),
            eq(sessionGrants.accountScope, scheduledJobs.accountScope),
          ),
        )
        .where(and(...conditions))
        .orderBy(desc(scheduledJobs.createdAt), desc(scheduledJobs.id))
        .limit(boundedLimit + 1)
        .offset(boundedOffset)

      const hasMore = jobs.length > boundedLimit
      const pageJobs = jobs.slice(0, boundedLimit)
      const jobIds = pageJobs.map(({ scheduled_jobs: job }) => job.id)
      const attempts =
        jobIds.length === 0
          ? []
          : await db
              .select()
              .from(dispatchAttempts)
              .where(
                and(
                  eq(dispatchAttempts.accountScope, accountScope),
                  inArray(dispatchAttempts.jobId, jobIds),
                ),
              )
              .orderBy(desc(dispatchAttempts.attemptNumber), desc(dispatchAttempts.attemptedAt))
      const [totalRow] = await db
        .select({ value: count() })
        .from(scheduledJobs)
        .innerJoin(
          sessionGrants,
          and(
            eq(sessionGrants.userId, userId),
            eq(sessionGrants.sessionId, scheduledJobs.sessionId),
            eq(sessionGrants.accountScope, scheduledJobs.accountScope),
          ),
        )
        .where(and(...conditions))
      return {
        jobs: pageJobs.map(({ scheduled_jobs: job }) => ({
          job,
          attempt: attempts.find((candidate) => candidate.jobId === job.id) ?? null,
        })),
        hasMore,
        total: totalRow?.value ?? 0,
      }
    },
    findForUser: async (jobId: string, userId: string, accountScope: AccountScope) => {
      const [row] = await db
        .select()
        .from(scheduledJobs)
        .innerJoin(
          sessionGrants,
          and(
            eq(sessionGrants.userId, userId),
            eq(sessionGrants.sessionId, scheduledJobs.sessionId),
            eq(sessionGrants.accountScope, scheduledJobs.accountScope),
          ),
        )
        .where(and(eq(scheduledJobs.id, jobId), eq(scheduledJobs.accountScope, accountScope)))
        .limit(1)
      if (!row) return null
      const [attempt] = await db
        .select()
        .from(dispatchAttempts)
        .where(
          and(eq(dispatchAttempts.jobId, jobId), eq(dispatchAttempts.accountScope, accountScope)),
        )
        .orderBy(desc(dispatchAttempts.attemptNumber), desc(dispatchAttempts.attemptedAt))
        .limit(1)
      return { job: row.scheduled_jobs, attempt: attempt ?? null }
    },
  }
}
