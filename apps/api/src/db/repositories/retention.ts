import { and, eq } from "drizzle-orm"

import { RETENTION_CATEGORIES, type RetentionCategory } from "../../retention/contracts"
import type { PersistenceDatabase } from "../client"
import { withPersistenceErrors } from "../repository-support"
import { auditEntries, retentionPolicies } from "../schema"
import type { AccountScope } from "../schema/shared"
import {
  boundedBatchSize,
  countCandidates,
  deleteCandidates,
  type RetentionDatabase,
} from "./retention-operations"

export type RetentionInput = {
  readonly accountScope: AccountScope
  readonly category: string
  readonly retentionDays: number
}

export type PurgeSelection = {
  readonly accountScope: AccountScope
  readonly category: RetentionCategory
  readonly cutoff: Date
  readonly previewCount: number
  readonly actorUserId: string
  readonly batchSize?: number
}

export type PurgePreview = {
  readonly accountScope: AccountScope
  readonly category: RetentionCategory
  readonly cutoff: Date
  readonly count: number
  readonly batchSize: number
}

export function createRetentionRepositories(db: PersistenceDatabase) {
  return {
    retentionPolicies: {
      insert: (input: RetentionInput) =>
        withPersistenceErrors(
          db
            .insert(retentionPolicies)
            .values(input)
            .returning()
            .then(([policy]) => policy),
        ),
      upsert: (input: RetentionInput) =>
        db
          .insert(retentionPolicies)
          .values(input)
          .onConflictDoUpdate({
            target: [retentionPolicies.accountScope, retentionPolicies.category],
            set: { retentionDays: input.retentionDays, updatedAt: new Date() },
          })
          .returning()
          .then(([policy]) => policy),
      find: async (input: Pick<RetentionInput, "accountScope" | "category">) => {
        const [policy] = await db
          .select()
          .from(retentionPolicies)
          .where(
            and(
              eq(retentionPolicies.accountScope, input.accountScope),
              eq(retentionPolicies.category, input.category),
            ),
          )
          .limit(1)
        return policy ?? null
      },
      list: (accountScope: AccountScope) =>
        db.select().from(retentionPolicies).where(eq(retentionPolicies.accountScope, accountScope)),
      preview: async (
        selection: Omit<PurgeSelection, "actorUserId" | "previewCount">,
      ): Promise<PurgePreview> => {
        const batchSize = boundedBatchSize(selection.batchSize)
        const count = await countCandidates(
          db,
          selection.accountScope,
          selection.category,
          selection.cutoff,
          batchSize,
        )
        return { ...selection, count, batchSize }
      },
      purge: async (
        selection: PurgeSelection,
      ): Promise<PurgePreview & { readonly deletedCount: number }> => {
        const batchSize = boundedBatchSize(selection.batchSize)
        return db.transaction(async (tx) => {
          const current = await countCandidates(
            tx,
            selection.accountScope,
            selection.category,
            selection.cutoff,
            batchSize,
          )
          if (current !== selection.previewCount)
            throw new RetentionPreviewMismatchError(selection.previewCount, current)
          const deletedCount = await deleteCandidates(tx, selection)
          await tx.insert(auditEntries).values({
            actorUserId: selection.actorUserId,
            accountScope: selection.accountScope,
            action: "retention.purge_completed",
            subjectType: "retention_purge",
            subjectId: crypto.randomUUID(),
          })
          return { ...selection, count: current, batchSize, deletedCount }
        })
      },
    },
  }
}

export class RetentionPreviewMismatchError extends Error {
  readonly name = "RetentionPreviewMismatchError"
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super("retention preview is stale")
  }
}

export { RETENTION_CATEGORIES }
export type { RetentionDatabase }
