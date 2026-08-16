import { and, eq, isNull, lt, or } from "drizzle-orm"

import type { PersistenceDatabase } from "../client"
import { withPersistenceErrors } from "../repository-support"
import {
  contacts,
  dispatchAttempts,
  normalizedEvents,
  scheduledJobs,
  sessionGrants,
  sessions,
  wahaConnections,
} from "../schema"
import type { AccountScope } from "../schema/shared"

export type SessionInput = {
  readonly connectionId: string
  readonly accountScope: AccountScope
  readonly name: string
  readonly wahaSessionName: string
  readonly status: string
}

export function createTransportRepositories(db: PersistenceDatabase) {
  return {
    wahaConnections: {
      create: (input: typeof wahaConnections.$inferInsert) =>
        withPersistenceErrors(
          db
            .insert(wahaConnections)
            .values(input)
            .returning()
            .then(([connection]) => connection),
        ),
      findForSession: async (id: string, accountScope: AccountScope) => {
        const [result] = await db
          .select({ connection: wahaConnections })
          .from(wahaConnections)
          .innerJoin(sessions, eq(sessions.connectionId, wahaConnections.id))
          .where(and(eq(wahaConnections.id, id), eq(sessions.accountScope, accountScope)))
          .limit(1)
        return result?.connection ?? null
      },
      findById: async (id: string) => {
        const [connection] = await db
          .select()
          .from(wahaConnections)
          .where(eq(wahaConnections.id, id))
          .limit(1)
        return connection ?? null
      },
      findActive: async () => {
        const [connection] = await db
          .select()
          .from(wahaConnections)
          .where(eq(wahaConnections.active, true))
          .limit(1)
        return connection ?? null
      },
      update: (id: string, input: Partial<typeof wahaConnections.$inferInsert>) =>
        withPersistenceErrors(
          db
            .update(wahaConnections)
            .set(input)
            .where(eq(wahaConnections.id, id))
            .returning()
            .then(([connection]) => connection),
        ),
    },
    sessions: {
      create: (input: SessionInput) =>
        withPersistenceErrors(
          db
            .insert(sessions)
            .values(input)
            .returning()
            .then(([session]) => session),
        ),
      find: async (id: string, accountScope: AccountScope) => {
        const [session] = await db
          .select()
          .from(sessions)
          .where(and(eq(sessions.id, id), eq(sessions.accountScope, accountScope)))
          .limit(1)
        return session ?? null
      },
      list: (accountScope: AccountScope) =>
        db.select().from(sessions).where(eq(sessions.accountScope, accountScope)),
      findByWahaSessionName: async (accountScope: AccountScope, wahaSessionName: string) => {
        const [session] = await db
          .select()
          .from(sessions)
          .where(
            and(
              eq(sessions.accountScope, accountScope),
              eq(sessions.wahaSessionName, wahaSessionName),
            ),
          )
          .limit(1)
        return session ?? null
      },
      updateStatus: async (
        id: string,
        accountScope: AccountScope,
        status: string,
        occurredAt: Date,
      ) => {
        await db
          .update(sessions)
          .set({ status, statusOccurredAt: occurredAt, updatedAt: new Date() })
          .where(
            and(
              eq(sessions.id, id),
              eq(sessions.accountScope, accountScope),
              or(isNull(sessions.statusOccurredAt), lt(sessions.statusOccurredAt, occurredAt)),
            ),
          )
      },
      update: async (id: string, accountScope: AccountScope, input: Partial<SessionInput>) => {
        const [session] = await db
          .update(sessions)
          .set(input)
          .where(and(eq(sessions.id, id), eq(sessions.accountScope, accountScope)))
          .returning()
        return session ?? null
      },
      remove: async (id: string, accountScope: AccountScope) => {
        await db.transaction(async (tx) => {
          await tx
            .delete(dispatchAttempts)
            .where(
              and(
                eq(dispatchAttempts.sessionId, id),
                eq(dispatchAttempts.accountScope, accountScope),
              ),
            )
          await tx
            .delete(scheduledJobs)
            .where(
              and(eq(scheduledJobs.sessionId, id), eq(scheduledJobs.accountScope, accountScope)),
            )
          await tx
            .delete(contacts)
            .where(and(eq(contacts.sessionId, id), eq(contacts.accountScope, accountScope)))
          await tx
            .delete(normalizedEvents)
            .where(
              and(
                eq(normalizedEvents.sessionId, id),
                eq(normalizedEvents.accountScope, accountScope),
              ),
            )
          await tx
            .delete(sessionGrants)
            .where(
              and(eq(sessionGrants.sessionId, id), eq(sessionGrants.accountScope, accountScope)),
            )
          await tx
            .delete(sessions)
            .where(and(eq(sessions.id, id), eq(sessions.accountScope, accountScope)))
        })
      },
    },
    contacts: {
      create: (input: typeof contacts.$inferInsert) =>
        withPersistenceErrors(
          db
            .insert(contacts)
            .values(input)
            .returning()
            .then(([contact]) => contact),
        ),
      findByBlindIndex: async (accountScope: AccountScope, phoneBlindIndex: string) => {
        const [contact] = await db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.accountScope, accountScope),
              eq(contacts.phoneBlindIndex, phoneBlindIndex),
            ),
          )
          .limit(1)
        return contact ?? null
      },
      messagingSafety: {
        find: async (sessionId: string, accountScope: AccountScope) => {
          const { sessionMessagingSafety } = await import("../schema/messaging")
          const [safety] = await db
            .select()
            .from(sessionMessagingSafety)
            .where(
              and(
                eq(sessionMessagingSafety.sessionId, sessionId),
                eq(sessionMessagingSafety.accountScope, accountScope),
              ),
            )
            .limit(1)
          return safety ?? null
        },
      },
    },
  }
}
