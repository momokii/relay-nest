import { and, asc, eq, inArray, lt } from "drizzle-orm"

import { RETENTION_CATEGORIES, type RetentionCategory } from "../../retention/contracts"
import type { PersistenceDatabase } from "../client"
import {
  contacts,
  dispatchAttempts,
  normalizedEvents,
  notifications,
  scheduledJobs,
} from "../schema"
import type { AccountScope } from "../schema/shared"

export type RetentionDatabase = Pick<PersistenceDatabase, "select" | "delete">

export const DEFAULT_BATCH_SIZE = 100

export function boundedBatchSize(batchSize: number | undefined): number {
  return Math.min(Math.max(batchSize ?? DEFAULT_BATCH_SIZE, 1), DEFAULT_BATCH_SIZE)
}

export async function countCandidates(
  db: RetentionDatabase,
  accountScope: AccountScope,
  category: RetentionCategory,
  cutoff: Date,
  batchSize: number,
): Promise<number> {
  if (category === "audit") return 0
  if (category === "messages") {
    const jobs = await db
      .select({ id: scheduledJobs.id })
      .from(scheduledJobs)
      .where(and(eq(scheduledJobs.accountScope, accountScope), lt(scheduledJobs.createdAt, cutoff)))
      .orderBy(asc(scheduledJobs.createdAt), asc(scheduledJobs.id))
      .limit(batchSize)
    if (jobs.length === 0) return 0
    const attempts = await db
      .select({ id: dispatchAttempts.id })
      .from(dispatchAttempts)
      .where(
        and(
          inArray(
            dispatchAttempts.jobId,
            jobs.map(({ id }) => id),
          ),
          eq(dispatchAttempts.accountScope, accountScope),
        ),
      )
    return jobs.length + attempts.length
  }
  switch (category) {
    case "contacts":
      return (
        await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(and(eq(contacts.accountScope, accountScope), lt(contacts.createdAt, cutoff)))
          .orderBy(asc(contacts.createdAt), asc(contacts.id))
          .limit(batchSize)
      ).length
    case "events":
      return (
        await db
          .select({ id: normalizedEvents.id })
          .from(normalizedEvents)
          .where(
            and(
              eq(normalizedEvents.accountScope, accountScope),
              lt(normalizedEvents.receivedAt, cutoff),
            ),
          )
          .orderBy(asc(normalizedEvents.receivedAt), asc(normalizedEvents.id))
          .limit(batchSize)
      ).length
    case "notifications":
      return (
        await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(eq(notifications.accountScope, accountScope), lt(notifications.createdAt, cutoff)),
          )
          .orderBy(asc(notifications.createdAt), asc(notifications.id))
          .limit(batchSize)
      ).length
    default:
      return unreachableCategory(category)
  }
}

export async function deleteCandidates(
  db: RetentionDatabase,
  selection: {
    readonly accountScope: AccountScope
    readonly category: RetentionCategory
    readonly cutoff: Date
    readonly batchSize?: number
  },
): Promise<number> {
  if (selection.category === "audit") return 0
  if (selection.category === "messages") {
    const jobs = await db
      .select({ id: scheduledJobs.id })
      .from(scheduledJobs)
      .where(
        and(
          eq(scheduledJobs.accountScope, selection.accountScope),
          lt(scheduledJobs.createdAt, selection.cutoff),
        ),
      )
      .orderBy(asc(scheduledJobs.createdAt), asc(scheduledJobs.id))
      .limit(boundedBatchSize(selection.batchSize))
    if (jobs.length === 0) return 0
    const jobIds = jobs.map(({ id }) => id)
    const attempts = await db
      .delete(dispatchAttempts)
      .where(
        and(
          inArray(dispatchAttempts.jobId, jobIds),
          eq(dispatchAttempts.accountScope, selection.accountScope),
        ),
      )
      .returning({ id: dispatchAttempts.id })
    const deletedJobs = await db
      .delete(scheduledJobs)
      .where(inArray(scheduledJobs.id, jobIds))
      .returning({ id: scheduledJobs.id })
    return attempts.length + deletedJobs.length
  }
  const category = selection.category
  switch (category) {
    case "contacts":
      return deleteContacts(db, selection)
    case "events":
      return deleteEvents(db, selection)
    case "notifications":
      return deleteNotifications(db, selection)
    default:
      return unreachableCategory(category)
  }
}

async function deleteContacts(
  db: RetentionDatabase,
  selection: {
    readonly accountScope: AccountScope
    readonly cutoff: Date
    readonly batchSize?: number
  },
): Promise<number> {
  const candidates = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.accountScope, selection.accountScope),
        lt(contacts.createdAt, selection.cutoff),
      ),
    )
    .orderBy(asc(contacts.createdAt), asc(contacts.id))
    .limit(boundedBatchSize(selection.batchSize))
  if (candidates.length === 0) return 0
  return (
    await db
      .delete(contacts)
      .where(
        inArray(
          contacts.id,
          candidates.map(({ id }) => id),
        ),
      )
      .returning({ id: contacts.id })
  ).length
}

async function deleteEvents(
  db: RetentionDatabase,
  selection: {
    readonly accountScope: AccountScope
    readonly cutoff: Date
    readonly batchSize?: number
  },
): Promise<number> {
  const candidates = await db
    .select({ id: normalizedEvents.id })
    .from(normalizedEvents)
    .where(
      and(
        eq(normalizedEvents.accountScope, selection.accountScope),
        lt(normalizedEvents.receivedAt, selection.cutoff),
      ),
    )
    .orderBy(asc(normalizedEvents.receivedAt), asc(normalizedEvents.id))
    .limit(boundedBatchSize(selection.batchSize))
  if (candidates.length === 0) return 0
  return (
    await db
      .delete(normalizedEvents)
      .where(
        inArray(
          normalizedEvents.id,
          candidates.map(({ id }) => id),
        ),
      )
      .returning({ id: normalizedEvents.id })
  ).length
}

async function deleteNotifications(
  db: RetentionDatabase,
  selection: {
    readonly accountScope: AccountScope
    readonly cutoff: Date
    readonly batchSize?: number
  },
): Promise<number> {
  const candidates = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.accountScope, selection.accountScope),
        lt(notifications.createdAt, selection.cutoff),
      ),
    )
    .orderBy(asc(notifications.createdAt), asc(notifications.id))
    .limit(boundedBatchSize(selection.batchSize))
  if (candidates.length === 0) return 0
  return (
    await db
      .delete(notifications)
      .where(
        inArray(
          notifications.id,
          candidates.map(({ id }) => id),
        ),
      )
      .returning({ id: notifications.id })
  ).length
}

function unreachableCategory(category: never): never {
  throw new Error(`unsupported retention category: ${category}`)
}

export { RETENTION_CATEGORIES }
