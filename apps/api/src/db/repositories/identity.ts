import { and, eq } from "drizzle-orm"

import type { PersistenceDatabase } from "../client"
import { requireSessionScope, withPersistenceErrors } from "../repository-support"
import { sessionGrants, userRoles, users } from "../schema"
import type { AccountScope } from "../schema/shared"

export function createIdentityRepositories(db: PersistenceDatabase) {
  return {
    users: {
      create: (input: {
        readonly email: string
        readonly passwordHash: string
        readonly displayName: string
      }) =>
        withPersistenceErrors(
          db
            .insert(users)
            .values(input)
            .returning()
            .then(([user]) => user),
        ),
      findByEmail: async (email: string) => {
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
        return user ?? null
      },
      findById: async (id: string) => {
        const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1)
        return user ?? null
      },
      disable: async (id: string) => {
        const [user] = await db
          .update(users)
          .set({ active: false })
          .where(eq(users.id, id))
          .returning()
        return user ?? null
      },
      count: async () => {
        const result = await db.select({ id: users.id }).from(users)
        return result.length
      },
    },
    userRoles: {
      create: (input: typeof userRoles.$inferInsert) =>
        withPersistenceErrors(
          db
            .insert(userRoles)
            .values(input)
            .returning()
            .then(([role]) => role),
        ),
      listForUser: (userId: string, accountScope: AccountScope) =>
        db
          .select()
          .from(userRoles)
          .where(and(eq(userRoles.userId, userId), eq(userRoles.accountScope, accountScope))),
    },
    sessionGrants: {
      create: async (input: typeof sessionGrants.$inferInsert) => {
        await requireSessionScope(db, input.sessionId, input.accountScope)
        return withPersistenceErrors(
          db
            .insert(sessionGrants)
            .values(input)
            .returning()
            .then(([grant]) => grant),
        )
      },
      find: async (userId: string, sessionId: string, accountScope: AccountScope) => {
        const [grant] = await db
          .select()
          .from(sessionGrants)
          .where(
            and(
              eq(sessionGrants.userId, userId),
              eq(sessionGrants.sessionId, sessionId),
              eq(sessionGrants.accountScope, accountScope),
            ),
          )
          .limit(1)
        return grant ?? null
      },
      listForUser: (userId: string, accountScope: AccountScope) =>
        db
          .select()
          .from(sessionGrants)
          .where(
            and(eq(sessionGrants.userId, userId), eq(sessionGrants.accountScope, accountScope)),
          ),
    },
  }
}
