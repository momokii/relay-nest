import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createApiApp } from "../apps/api/src/app"
import { PostgresLoginRateLimiter } from "../apps/api/src/auth/postgres-rate-limit"
import { createDatabase } from "../apps/api/src/db/client"
import { createRepositories } from "../apps/api/src/db/repositories"

const databaseUrl = process.env.TASK5_AUTH_DATABASE_URL
const database = databaseUrl ? createDatabase(databaseUrl) : undefined
const app = database ? createApiApp(database) : undefined
const repositories = database ? createRepositories(database.db) : undefined

describe.skipIf(!app || !repositories)("authentication HTTP boundary", () => {
  beforeEach(async () => {
    if (database)
      await database.sql.unsafe(
        "TRUNCATE auth_sessions, auth_rate_limits, session_grants, user_roles, users, audit_entries, sessions, waha_connections CASCADE",
      )
  })

  it("supports secure bootstrap, logout revocation, and safe malformed login", async () => {
    // Given an empty migrated PostgreSQL database
    const email = `admin-${crypto.randomUUID()}@example.invalid`

    // When the first Admin bootstraps
    const bootstrap = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: { email, password: "correct horse battery staple", displayName: "Initial Admin" },
    })
    const cookies = bootstrap.headers["set-cookie"]
    const sessionCookie = cookies
      ?.find((cookie) => cookie.startsWith("waha_session="))
      ?.split(";", 1)[0]
    const csrfCookie = cookies?.find((cookie) => cookie.startsWith("waha_csrf="))?.split(";", 1)[0]

    // Then credentials are redacted and session cookies are protected
    expect(bootstrap.statusCode).toBe(201)
    expect(bootstrap.body).not.toContain("correct horse")
    expect(
      cookies?.some((cookie) => cookie.includes("HttpOnly") && cookie.includes("SameSite=Strict")),
    ).toBe(true)

    // When logout is attempted without the CSRF header
    const csrfDenied = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie: `${sessionCookie}; ${csrfCookie}` },
    })

    // Then the double-submit proof is required
    expect(csrfDenied.statusCode).toBe(403)

    // When the authenticated browser logs out with its CSRF token
    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie: `${sessionCookie}; ${csrfCookie}`,
        "x-csrf-token": csrfCookie?.split("=", 2)[1],
      },
    })
    const revoked = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: sessionCookie },
    })

    // Then logout succeeds and the old session is denied
    expect(logout.statusCode).toBe(204)
    expect(revoked.statusCode).toBe(401)

    // When malformed credentials are submitted
    const malformed = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "not-an-email", password: "short" },
    })

    // Then the response is a safe validation error
    expect(malformed.statusCode).toBe(400)
    expect(malformed.body).toBe('{"error":"invalid request"}')

    // When authentication audit rows are inspected
    const auditRows = await database.sql<
      {
        action: string
        actor_user_id: string | null
        subject_id: string
        details_ciphertext: string | null
      }[]
    >`
      SELECT action, actor_user_id, subject_id, details_ciphertext
      FROM audit_entries
      WHERE action LIKE 'auth.%'
      ORDER BY created_at
    `

    // Then logout is audited without storing secrets or token values
    expect(auditRows.map((row) => row.action)).toContain("auth.logout")
    expect(auditRows.every((row) => row.details_ciphertext === null)).toBe(true)
    expect(auditRows.every((row) => !row.subject_id.includes("correct horse"))).toBe(true)
  })

  it("permits only one concurrent first-user bootstrap", async () => {
    // Given an empty database and two simultaneous bootstrap requests
    const requests = ["one", "two"].map((suffix) =>
      app.inject({
        method: "POST",
        url: "/auth/bootstrap",
        payload: {
          email: `concurrent-${suffix}-${crypto.randomUUID()}@example.invalid`,
          password: "correct horse battery staple",
          displayName: "Concurrent Admin",
        },
      }),
    )

    // When both requests contend for the bootstrap lock
    const responses = await Promise.all(requests)

    // Then exactly one Admin is created
    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409])
  })

  it("enforces rate limits, grants, roles, and account scopes", async () => {
    // Given a bootstrapped Admin and two scoped sessions
    const adminEmail = `admin-${crypto.randomUUID()}@example.invalid`
    const boot = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: adminEmail,
        password: "correct horse battery staple",
        displayName: "Admin",
      },
    })
    const bootCookies = boot.headers["set-cookie"] ?? []
    const adminSession = bootCookies
      .find((cookie) => cookie.startsWith("waha_session="))
      ?.split(";", 1)[0]
    const adminCsrf = bootCookies
      .find((cookie) => cookie.startsWith("waha_csrf="))
      ?.split("=", 2)[1]
      ?.split(";", 1)[0]
    const connection = await repositories.wahaConnections.create({
      name: `connection-${crypto.randomUUID()}`,
      baseUrl: "http://waha.internal",
      apiKeyCiphertext: "cipher",
      apiKeyNonce: "nonce",
      apiKeyAuthTag: "tag",
    })
    const personal = await repositories.sessions.create({
      connectionId: connection.id,
      accountScope: "personal",
      name: `personal-${crypto.randomUUID()}`,
      wahaSessionName: "personal",
      status: "linked",
    })
    const business = await repositories.sessions.create({
      connectionId: connection.id,
      accountScope: "business",
      name: `business-${crypto.randomUUID()}`,
      wahaSessionName: "business",
      status: "linked",
    })
    const viewerEmail = `viewer-${crypto.randomUUID()}@example.invalid`
    const createViewer = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { cookie: adminSession, "x-csrf-token": adminCsrf },
      payload: {
        email: viewerEmail,
        password: "viewer password safe",
        displayName: "Viewer",
        roles: [{ accountScope: "personal", role: "viewer" }],
      },
    })
    const viewerId = createViewer.json<{ id: string }>().id
    await app.inject({
      method: "POST",
      url: "/admin/grants",
      headers: { cookie: adminSession, "x-csrf-token": adminCsrf },
      payload: { userId: viewerId, sessionId: personal.id, accountScope: "personal" },
    })
    const viewerLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: viewerEmail, password: "viewer password safe" },
    })
    expect(
      viewerLogin.json<{ user: { rolesByScope: { personal: string[]; business: string[] } } }>()
        .user.rolesByScope,
    ).toEqual({ personal: ["viewer"], business: [] })
    const viewerCookies = viewerLogin.headers["set-cookie"] ?? []
    const viewerSession = viewerCookies
      .find((cookie) => cookie.startsWith("waha_session="))
      ?.split(";", 1)[0]
    const viewerCsrf = viewerCookies
      .find((cookie) => cookie.startsWith("waha_csrf="))
      ?.split("=", 2)[1]
      ?.split(";", 1)[0]

    // When the Viewer reads the granted Personal session, mutates it, or crosses to Business
    const read = await app.inject({
      method: "GET",
      url: `/scoped/sessions/${personal.id}?scope=personal`,
      headers: { cookie: viewerSession },
    })
    const command = await app.inject({
      method: "POST",
      url: `/scoped/sessions/${personal.id}/commands?scope=personal`,
      headers: { cookie: viewerSession, "x-csrf-token": viewerCsrf },
    })
    const crossScope = await app.inject({
      method: "GET",
      url: `/scoped/sessions/${business.id}?scope=business`,
      headers: { cookie: viewerSession },
    })

    // Then only the granted read is allowed
    expect(read.statusCode).toBe(200)
    expect(command.statusCode).toBe(403)
    expect(crossScope.statusCode).toBe(403)

    // When the Admin disables the Viewer
    const disable = await app.inject({
      method: "POST",
      url: `/admin/users/${viewerId}/disable`,
      headers: { cookie: adminSession, "x-csrf-token": adminCsrf },
    })
    const revokedViewer = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: viewerSession },
    })

    // Then all of the Viewer sessions are revoked
    expect(disable.statusCode).toBe(204)
    expect(revokedViewer.statusCode).toBe(401)

    // When the same client submits repeated bad logins
    for (let attempt = 0; attempt < 5; attempt += 1)
      await app.inject({
        method: "POST",
        url: "/auth/login",
        remoteAddress: "192.0.2.10",
        payload: { email: adminEmail, password: "wrong password value" },
      })

    // Then the next attempt is rate limited without credential disclosure
    const limited = await app.inject({
      method: "POST",
      url: "/auth/login",
      remoteAddress: "192.0.2.10",
      payload: { email: adminEmail, password: "wrong password value" },
    })
    expect(limited.statusCode).toBe(429)
    expect(limited.body).not.toContain(adminEmail)

    // When independent limiter instances receive concurrent failures for one IP
    const sharedKey = `198.51.100.${crypto.randomUUID()}`
    const limiterResults = await Promise.all(
      Array.from({ length: 8 }, () =>
        new PostgresLoginRateLimiter(database.db).recordFailure(`${sharedKey}-shared`),
      ),
    )
    const [sharedEntry] = await database.sql<{ failures: number }[]>`
      SELECT failures FROM auth_rate_limits WHERE key = ${`${sharedKey}-shared`}
    `
    const authAuditRows = await database.sql<
      { action: string; actor_user_id: string | null; subject_id: string }[]
    >`
      SELECT action, actor_user_id, subject_id FROM audit_entries WHERE action IN ('auth.login_failed', 'auth.login_rate_limited')
    `

    // Then PostgreSQL shares the counter safely and failure audits stay generic
    expect(limiterResults.some((result) => !result.allowed)).toBe(true)
    expect(sharedEntry?.failures).toBe(5)
    expect(authAuditRows.some((row) => row.action === "auth.login_failed")).toBe(true)
    expect(authAuditRows.some((row) => row.action === "auth.login_rate_limited")).toBe(true)
    expect(
      authAuditRows.every((row) => row.actor_user_id === null && row.subject_id === "login"),
    ).toBe(true)
  })
})

if (database) afterAll(async () => database.close())
