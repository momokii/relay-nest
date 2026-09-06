import { and, eq, isNull, sql } from "drizzle-orm"
import type { PersistenceDatabase } from "../db/client"
import { auditEntries, authSessions, sessionGrants, sessions, userRoles, users } from "../db/schema"
import type { AccountScope } from "../db/schema/shared"
import type { UserRole } from "./authorization"
import { hashPassword } from "./password"

type Audit = (input: {
  readonly actorUserId: string
  readonly action: string
  readonly subjectType: string
  readonly subjectId: string
  readonly accountScope: AccountScope
}) => Promise<void>

export class AdminService {
  constructor(
    private readonly db: PersistenceDatabase,
    private readonly audit: Audit,
  ) {}

  async createUser(input: {
    readonly email: string
    readonly password: string
    readonly displayName: string
    readonly roles: readonly { readonly accountScope: AccountScope; readonly role: UserRole }[]
    readonly actorUserId: string
  }): Promise<{ readonly id: string; readonly email: string; readonly displayName: string }> {
    const user = await this.db.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(users)
        .values({
          email: input.email,
          passwordHash: await hashPassword(input.password),
          displayName: input.displayName,
        })
        .returning()
      if (!created) throw new AdminFailure("user creation failed")
      await transaction
        .insert(userRoles)
        .values(input.roles.map((role) => ({ ...role, userId: created.id })))
      return created
    })
    const scopes = [...new Set(input.roles.map((role) => role.accountScope))]
    for (const accountScope of scopes) {
      await this.audit({
        actorUserId: input.actorUserId,
        action: "auth.user_created",
        subjectType: "user",
        subjectId: user.id,
        accountScope,
      })
    }
    return { id: user.id, email: user.email, displayName: user.displayName }
  }

  async createGrant(input: {
    readonly userId: string
    readonly sessionId: string
    readonly accountScope: AccountScope
    readonly actorUserId: string
  }): Promise<void> {
    const [session] = await this.db
      .select({ accountScope: sessions.accountScope })
      .from(sessions)
      .where(eq(sessions.id, input.sessionId))
      .limit(1)
    if (!session || session.accountScope !== input.accountScope)
      throw new AdminFailure("session scope mismatch")
    await this.db.insert(sessionGrants).values(input)
    await this.audit({
      actorUserId: input.actorUserId,
      action: "auth.grant_created",
      subjectType: "session_grant",
      subjectId: input.sessionId,
      accountScope: input.accountScope,
    })
  }

  async canManage(principalId: string, scope: AccountScope): Promise<boolean> {
    const [role] = await this.db
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, principalId),
          eq(userRoles.accountScope, scope),
          eq(userRoles.role, "admin"),
        ),
      )
      .limit(1)
    return Boolean(role)
  }

  async listUsers(): Promise<readonly AdminUserWithLogin[]> {
    const rows = await this.db
      .select({
        user: {
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          active: users.active,
          createdAt: users.createdAt,
        },
        role: {
          accountScope: userRoles.accountScope,
          role: userRoles.role,
        },
      })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .orderBy(users.createdAt, users.id, userRoles.accountScope)
    const logins = await this.db
      .select({
        subjectId: auditEntries.subjectId,
        lastLoginAt: sql<string>`max(${auditEntries.createdAt})`,
      })
      .from(auditEntries)
      .where(eq(auditEntries.action, "auth.login"))
      .groupBy(auditEntries.subjectId)
    const lastLogins = new Map<string, Date | null>()
    for (const login of logins) {
      const parsed = login.lastLoginAt ? new Date(login.lastLoginAt) : null
      lastLogins.set(login.subjectId, parsed && !Number.isNaN(parsed.getTime()) ? parsed : null)
    }
    return mergeLastLogins(groupUserRows(rows), lastLogins)
  }

  async resetPassword(input: {
    readonly userId: string
    readonly password: string
    readonly actorUserId: string
  }): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const updated = await transaction
        .update(users)
        .set({ passwordHash: await hashPassword(input.password) })
        .where(eq(users.id, input.userId))
        .returning({ id: users.id })
      if (!updated[0]) throw new AdminFailure("user not found")
      await transaction
        .update(authSessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(authSessions.userId, input.userId), isNull(authSessions.revokedAt)))
    })
    for (const accountScope of ["personal", "business"] as const) {
      await this.audit({
        actorUserId: input.actorUserId,
        action: "auth.sessions_revoked",
        subjectType: "user",
        subjectId: input.userId,
        accountScope,
      })
      await this.audit({
        actorUserId: input.actorUserId,
        action: "auth.password_reset",
        subjectType: "user",
        subjectId: input.userId,
        accountScope,
      })
    }
  }

  async canDisable(principalId: string, targetUserId: string): Promise<boolean> {
    const targetRoles = await this.db
      .select({ accountScope: userRoles.accountScope })
      .from(userRoles)
      .where(eq(userRoles.userId, targetUserId))
    const scopes = [...new Set(targetRoles.map((role) => role.accountScope))]
    const permissions = await Promise.all(scopes.map((scope) => this.canManage(principalId, scope)))
    return permissions.every(Boolean)
  }
}

export class AdminFailure extends Error {
  readonly name = "AdminFailure"
}

export type AdminUserRole = { readonly accountScope: AccountScope; readonly role: UserRole }

export type AdminUserRecord = {
  readonly id: string
  readonly email: string
  readonly displayName: string
  readonly active: boolean
  readonly createdAt: Date
  readonly roles: readonly AdminUserRole[]
}

export type AdminUserWithLogin = AdminUserRecord & { readonly lastLoginAt: Date | null }

export function mergeLastLogins(
  users: readonly AdminUserRecord[],
  lastLogins: ReadonlyMap<string, Date | null>,
): readonly AdminUserWithLogin[] {
  return users.map((user) => ({ ...user, lastLoginAt: lastLogins.get(user.id) ?? null }))
}

type UserWithRoleRow = {
  readonly user: {
    readonly id: string
    readonly email: string
    readonly displayName: string
    readonly active: boolean
    readonly createdAt: Date
  }
  readonly role: AdminUserRole | null
}

export function groupUserRows(rows: readonly UserWithRoleRow[]): readonly AdminUserRecord[] {
  const grouped = new Map<string, AdminUserRecord>()
  for (const row of rows) {
    const existing = grouped.get(row.user.id)
    if (!existing) {
      grouped.set(row.user.id, {
        ...row.user,
        roles: row.role ? [row.role] : [],
      })
      continue
    }
    const role = row.role
    if (
      role &&
      !existing.roles.some(
        (candidate) => candidate.accountScope === role.accountScope && candidate.role === role.role,
      )
    ) {
      grouped.set(row.user.id, { ...existing, roles: [...existing.roles, role] })
    }
  }
  return [...grouped.values()]
}
