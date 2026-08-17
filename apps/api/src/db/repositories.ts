import { and, asc, eq, inArray } from "drizzle-orm"

import type { PersistenceDatabase } from "./client"
import { createDispatchAttemptRepositories } from "./repositories/dispatch-attempts"
import { createIdentityRepositories } from "./repositories/identity"
import { createNotificationRepositories } from "./repositories/notifications"
import { createRetentionRepositories } from "./repositories/retention"
import { createSchedulingRepositories } from "./repositories/scheduling"
import { createTransportRepositories } from "./repositories/transport"
import {
  AuditImmutabilityError,
  DuplicateRecordError,
  isAuditMutation,
  requireSessionScope,
  withPersistenceErrors,
} from "./repository-support"
import { auditEntries, dispatchAttempts, normalizedEvents } from "./schema"
import type { AccountScope } from "./schema/shared"

export {
  AuditImmutabilityError,
  DuplicateRecordError,
  RepositoryScopeError,
} from "./repository-support"

type AuditInput = {
  readonly accountScope: AccountScope
  readonly sessionId?: string
  readonly actorUserId?: string
  readonly action: string
  readonly subjectType: string
  readonly subjectId: string
}

export function createRepositories(db: PersistenceDatabase) {
  return {
    ...createIdentityRepositories(db),
    ...createDispatchAttemptRepositories(db),
    ...createSchedulingRepositories(db),
    ...createTransportRepositories(db),
    ...createNotificationRepositories(db),
    ...createRetentionRepositories(db),
    normalizedEvents: {
      create: (input: typeof normalizedEvents.$inferInsert) =>
        withPersistenceErrors(
          db
            .insert(normalizedEvents)
            .values(input)
            .returning()
            .then(([event]) => event),
        ),
      findByProviderId: async (providerEventId: string, accountScope: AccountScope) => {
        const [event] = await db
          .select()
          .from(normalizedEvents)
          .where(
            and(
              eq(normalizedEvents.providerEventId, providerEventId),
              eq(normalizedEvents.accountScope, accountScope),
            ),
          )
          .limit(1)
        return event ?? null
      },
      listForSession: (sessionId: string, accountScope: AccountScope) =>
        db
          .select({
            eventType: normalizedEvents.eventType,
            payloadCiphertext: normalizedEvents.payloadCiphertext,
            payloadNonce: normalizedEvents.payloadNonce,
            payloadAuthTag: normalizedEvents.payloadAuthTag,
            occurredAt: normalizedEvents.occurredAt,
          })
          .from(normalizedEvents)
          .where(
            and(
              eq(normalizedEvents.sessionId, sessionId),
              eq(normalizedEvents.accountScope, accountScope),
            ),
          )
          .orderBy(asc(normalizedEvents.occurredAt)),
      insert: async (input: typeof normalizedEvents.$inferInsert) => {
        try {
          await withPersistenceErrors(db.insert(normalizedEvents).values(input))
          return "inserted" as const
        } catch (error) {
          if (error instanceof DuplicateRecordError) return "duplicate" as const
          throw error
        }
      },
      insertAndUpdateDispatchState: async (
        input: typeof normalizedEvents.$inferInsert,
        dispatch: {
          readonly sessionId: string
          readonly accountScope: AccountScope
          readonly providerMessageId: string
          readonly state: "attempting" | "submitted" | "acknowledged" | "failed"
        },
      ) =>
        db.transaction(async (tx) => {
          const rows = await withPersistenceErrors(
            tx.insert(normalizedEvents).values(input).onConflictDoNothing().returning(),
          )
          const inserted = rows.length > 0 ? ("inserted" as const) : ("duplicate" as const)
          const rank = {
            scheduled: 0,
            attempting: 1,
            submitted: 2,
            acknowledged: 3,
            failed: 5,
            unknown: 0,
            cancelled: 0,
          } as const
          const lowerStates = Object.entries(rank)
            .filter(([, currentRank]) => currentRank < rank[dispatch.state])
            .map(([currentState]) => currentState as keyof typeof rank)
          if (lowerStates.length > 0) {
            await tx
              .update(dispatchAttempts)
              .set({ state: dispatch.state })
              .where(
                and(
                  eq(dispatchAttempts.sessionId, dispatch.sessionId),
                  eq(dispatchAttempts.accountScope, dispatch.accountScope),
                  eq(dispatchAttempts.providerMessageId, dispatch.providerMessageId),
                  inArray(dispatchAttempts.state, lowerStates),
                ),
              )
          }
          return inserted
        }),
    },
    auditEntries: {
      append: async (input: AuditInput) => {
        if (input.sessionId) await requireSessionScope(db, input.sessionId, input.accountScope)
        return db
          .insert(auditEntries)
          .values(input)
          .returning()
          .then(([entry]) => entry)
      },
      update: async (id: string, patch: { readonly action: string }) => {
        try {
          await db.update(auditEntries).set(patch).where(eq(auditEntries.id, id))
        } catch (error) {
          if (isAuditMutation(error))
            throw new AuditImmutabilityError("audit entries are immutable")
          throw error
        }
      },
      remove: async (id: string) => {
        try {
          await db.delete(auditEntries).where(eq(auditEntries.id, id))
        } catch (error) {
          if (isAuditMutation(error))
            throw new AuditImmutabilityError("audit entries are immutable")
          throw error
        }
      },
    },
  }
}
