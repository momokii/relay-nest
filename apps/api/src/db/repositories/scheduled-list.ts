import { and, asc, eq } from "drizzle-orm"

import type { PersistenceDatabase } from "../client"
import { scheduledJobs } from "../schema"
import type { AccountScope } from "../schema/shared"

export function createScheduledListRepository(db: PersistenceDatabase) {
  return {
    listForSession: (sessionId: string, accountScope: AccountScope) =>
      db
        .select()
        .from(scheduledJobs)
        .where(
          and(eq(scheduledJobs.sessionId, sessionId), eq(scheduledJobs.accountScope, accountScope)),
        )
        .orderBy(asc(scheduledJobs.scheduledFor), asc(scheduledJobs.id)),
  }
}
