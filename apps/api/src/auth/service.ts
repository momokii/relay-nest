import { timingSafeEqual } from "node:crypto"
import { and, eq, isNull, sql } from "drizzle-orm"

import type { PersistenceDatabase } from "../db/client"
import { authSessions, sessionGrants, sessions, userRoles, users } from "../db/schema"
import type { AccountScope } from "../db/schema/shared"
import { authorizeSessionAction, type SessionAction, type UserRole } from "./authorization"
import { hashPassword, verifyPassword } from "./password"
import { PostgresLoginRateLimiter } from "./postgres-rate-limit"
import { createAuthSession, rolesByScope, rolesForUser } from "./session-store"
import { hashToken } from "./token"

export type AuthPrincipal = {
  readonly userId: string
  readonly email: string
  readonly displayName: string
  readonly roles: readonly UserRole[]
  readonly rolesByScope: Readonly<Record<AccountScope, readonly UserRole[]>>
  readonly sessionId: string
  readonly sessionToken: string
  readonly csrfToken: string
}

export type AuthServiceOptions = {
  readonly db: PersistenceDatabase
  readonly now?: () => Date
  readonly rateLimiter?: PostgresLoginRateLimiter
  readonly audit: (input: {
    readonly actorUserId?: string
    readonly action: string
    readonly subjectType: string
    readonly subjectId: string
    readonly accountScope: AccountScope
  }) => Promise<void>
}

export class AuthService {
  private readonly db: PersistenceDatabase
  private readonly now: () => Date
  private readonly rateLimiter: PostgresLoginRateLimiter
  private readonly audit: AuthServiceOptions["audit"]

  constructor(options: AuthServiceOptions) {
    this.db = options.db
    this.now = options.now ?? (() => new Date())
    this.rateLimiter = options.rateLimiter ?? new PostgresLoginRateLimiter(options.db)
    this.audit = options.audit
  }

  async bootstrap(input: {
    readonly email: string
    readonly password: string
    readonly displayName: string
  }): Promise<AuthPrincipal> {
    const user = await this.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(781245901)`)
      const existingUsers = await transaction.select({ id: users.id }).from(users)
      if (existingUsers.length > 0) throw new AuthFailure("bootstrap already completed")
      const [created] = await transaction
        .insert(users)
        .values({
          email: input.email,
          passwordHash: await hashPassword(input.password),
          displayName: input.displayName,
        })
        .returning()
      if (!created) throw new AuthFailure("user creation failed")
      await transaction.insert(userRoles).values([
        { userId: created.id, accountScope: "personal", role: "admin" },
        { userId: created.id, accountScope: "business", role: "admin" },
      ])
      return created
    })
    await this.audit({
      actorUserId: user.id,
      action: "auth.bootstrap",
      subjectType: "user",
      subjectId: user.id,
      accountScope: "personal",
    })
    return this.createSession(user)
  }

  async login(input: {
    readonly email: string
    readonly password: string
    readonly rateKey: string
  }): Promise<AuthPrincipal> {
    const decision = await this.rateLimiter.check(input.rateKey)
    if (!decision.allowed) {
      await this.audit({
        action: "auth.login_rate_limited",
        subjectType: "authentication",
        subjectId: "login",
        accountScope: "personal",
      })
      throw new RateLimitFailure(decision.retryAfterSeconds)
    }
    const [user] = await this.db.select().from(users).where(eq(users.email, input.email)).limit(1)
    if (!user || !user.active || !(await verifyPassword(input.password, user.passwordHash))) {
      await this.recordFailedLogin(input.rateKey)
      throw new AuthFailure("invalid credentials")
    }
    await this.rateLimiter.clear(input.rateKey)
    await this.audit({
      actorUserId: user.id,
      action: "auth.login",
      subjectType: "user",
      subjectId: user.id,
      accountScope: "personal",
    })
    return this.createSession(user)
  }

  async recordFailedLogin(rateKey: string): Promise<void> {
    await this.audit({
      action: "auth.login_failed",
      subjectType: "authentication",
      subjectId: "login",
      accountScope: "personal",
    })
    const decision = await this.rateLimiter.recordFailure(rateKey)
    if (!decision.allowed) {
      await this.audit({
        action: "auth.login_rate_limited",
        subjectType: "authentication",
        subjectId: "login",
        accountScope: "personal",
      })
      throw new RateLimitFailure(decision.retryAfterSeconds)
    }
  }

  async authenticate(token: string | undefined): Promise<AuthPrincipal | null> {
    if (!token) return null
    const tokenHash = hashToken(token)
    const [session] = await this.db
      .select({ session: authSessions, user: users })
      .from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(
        and(
          eq(authSessions.tokenHash, tokenHash),
          isNull(authSessions.revokedAt),
          eq(users.active, true),
        ),
      )
      .limit(1)
    if (!session || session.session.expiresAt <= this.now()) return null
    return {
      userId: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      roles: await rolesForUser(this.db, session.user.id),
      rolesByScope: await rolesByScope(this.db, session.user.id),
      sessionId: session.session.id,
      sessionToken: token,
      csrfToken: "",
    }
  }

  async revoke(token: string | undefined): Promise<void> {
    if (!token) return
    const [session] = await this.db
      .select({ id: authSessions.id, userId: authSessions.userId })
      .from(authSessions)
      .where(eq(authSessions.tokenHash, hashToken(token)))
      .limit(1)
    await this.db
      .update(authSessions)
      .set({ revokedAt: this.now() })
      .where(eq(authSessions.tokenHash, hashToken(token)))
    const logoutAudit = session
      ? {
          actorUserId: session.userId,
          action: "auth.logout",
          subjectType: "authentication",
          subjectId: "logout",
          accountScope: "personal" as const,
        }
      : {
          action: "auth.logout",
          subjectType: "authentication",
          subjectId: "logout",
          accountScope: "personal" as const,
        }
    await this.audit(logoutAudit)
  }

  async verifyCsrf(token: string | undefined, csrfToken: string | undefined): Promise<boolean> {
    if (!token || !csrfToken) return false
    const [session] = await this.db
      .select({ csrfTokenHash: authSessions.csrfTokenHash })
      .from(authSessions)
      .where(and(eq(authSessions.tokenHash, hashToken(token)), isNull(authSessions.revokedAt)))
      .limit(1)
    if (!session) return false
    const actual = Buffer.from(hashToken(csrfToken), "utf8")
    const expected = Buffer.from(session.csrfTokenHash, "utf8")
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }

  async disableUser(userId: string, actorUserId: string): Promise<void> {
    await this.db.update(users).set({ active: false }).where(eq(users.id, userId))
    await this.db
      .update(authSessions)
      .set({ revokedAt: this.now() })
      .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)))
    for (const accountScope of ["personal", "business"] as const) {
      await this.audit({
        actorUserId,
        action: "auth.sessions_revoked",
        subjectType: "user",
        subjectId: userId,
        accountScope,
      })
      await this.audit({
        actorUserId,
        action: "auth.user_disabled",
        subjectType: "user",
        subjectId: userId,
        accountScope,
      })
    }
  }

  async authorize(
    principal: AuthPrincipal,
    sessionId: string,
    scope: AccountScope,
    action: SessionAction,
  ) {
    const [session] = await this.db
      .select({ accountScope: sessions.accountScope, status: sessions.status })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1)
    const [grant] = await this.db
      .select({ id: sessionGrants.id })
      .from(sessionGrants)
      .where(
        and(
          eq(sessionGrants.userId, principal.userId),
          eq(sessionGrants.sessionId, sessionId),
          eq(sessionGrants.accountScope, scope),
        ),
      )
      .limit(1)
    const hasGrant = Boolean(grant)
    return authorizeSessionAction({
      principal: { roles: (await rolesByScope(this.db, principal.userId))[scope] },
      accountScope: scope,
      sessionScope: session?.accountScope ?? scope,
      hasGrant,
      action,
      sessionActive: session?.status !== "disabled",
    })
  }

  private async createSession(user: typeof users.$inferSelect): Promise<AuthPrincipal> {
    const { session, token, csrfToken } = await createAuthSession(this.db, user, this.now())
    return {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: await rolesForUser(this.db, user.id),
      rolesByScope: await rolesByScope(this.db, user.id),
      sessionId: session.id,
      sessionToken: token,
      csrfToken,
    }
  }
}

export class AuthFailure extends Error {
  readonly name = "AuthFailure"
}
export class RateLimitFailure extends Error {
  readonly name = "RateLimitFailure"
  constructor(readonly retryAfterSeconds: number) {
    super("too many login attempts")
  }
}
export { hashToken } from "./token"
