import { and, desc, eq, inArray } from "drizzle-orm"

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
    ) => {
      const boundedLimit = Math.min(Math.max(limit, 1), 50)
      const boundedOffset = Math.max(offset, 0)
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
        .where(eq(scheduledJobs.accountScope, accountScope))
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
      return {
        jobs: pageJobs.map(({ scheduled_jobs: job }) => ({
          job,
          attempt: attempts.find((candidate) => candidate.jobId === job.id) ?? null,
        })),
        hasMore,
      }
    },
  }
}
