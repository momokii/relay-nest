import { eq } from "drizzle-orm"

import type { PersistenceDatabase } from "./client"
import { sessions } from "./schema"
import type { AccountScope } from "./schema/shared"

export class DuplicateRecordError extends Error {
  readonly name = "DuplicateRecordError"
}

export class RepositoryScopeError extends Error {
  readonly name = "RepositoryScopeError"
}

export class AuditImmutabilityError extends Error {
  readonly name = "AuditImmutabilityError"
}

export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 3; depth += 1) {
    if (!(current instanceof Error)) return false
    if ("code" in current && current.code === "23505") return true
    current = current.cause
  }
  return false
}

export function isAuditMutation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 3; depth += 1) {
    if (!(current instanceof Error)) return false
    if (current.message.includes("audit entries are immutable")) return true
    current = current.cause
  }
  return false
}

export async function withPersistenceErrors<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateRecordError("record already exists")
    throw error
  }
}

export async function requireSessionScope(
  db: PersistenceDatabase,
  sessionId: string,
  accountScope: AccountScope,
): Promise<void> {
  const [session] = await db
    .select({ accountScope: sessions.accountScope })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1)
  if (!session || session.accountScope !== accountScope) {
    throw new RepositoryScopeError("record scope does not match session scope")
  }
}
