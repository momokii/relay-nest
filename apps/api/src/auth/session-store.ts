import { randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"

import type { PersistenceDatabase } from "../db/client"
import { authSessions, userRoles, type users } from "../db/schema"
import type { AccountScope } from "../db/schema/shared"
import type { UserRole } from "./authorization"
import { hashToken } from "./token"

const SESSION_TTL_MS = 8 * 60 * 60 * 1000

export async function rolesForUser(
  db: PersistenceDatabase,
  userId: string,
): Promise<readonly UserRole[]> {
  const roles = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
  return [...new Set(roles.map(({ role }) => role))]
}

export async function rolesByScope(
  db: PersistenceDatabase,
  userId: string,
): Promise<Readonly<Record<AccountScope, readonly UserRole[]>>> {
  const roles = await db
    .select({ scope: userRoles.accountScope, role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
  return {
    personal: roles.filter((entry) => entry.scope === "personal").map((entry) => entry.role),
    business: roles.filter((entry) => entry.scope === "business").map((entry) => entry.role),
  }
}

export async function createAuthSession(
  db: PersistenceDatabase,
  user: typeof users.$inferSelect,
  now: Date,
) {
  const token = randomBytes(32).toString("base64url")
  const csrfToken = randomBytes(32).toString("base64url")
  const session = await db
    .insert(authSessions)
    .values({
      userId: user.id,
      tokenHash: hashToken(token),
      csrfTokenHash: hashToken(csrfToken),
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    })
    .returning()
    .then(([created]) => created)
  if (!session) throw new SessionStoreFailure("session creation failed")
  return { session, token, csrfToken }
}

export class SessionStoreFailure extends Error {
  readonly name = "SessionStoreFailure"
}
