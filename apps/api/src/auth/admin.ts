import { and, eq } from "drizzle-orm"
import type { PersistenceDatabase } from "../db/client"
import { sessionGrants, sessions, userRoles, users } from "../db/schema"
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
