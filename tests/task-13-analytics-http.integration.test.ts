import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createApiApp } from "../apps/api/src/app"
import { createDatabase } from "../apps/api/src/db/client"
import { createRepositories } from "../apps/api/src/db/repositories"
import { seedAnalyticsRecords } from "./task-13-analytics-db-fixture"

const databaseUrl = process.env.TASK13_ANALYTICS_DATABASE_URL
if (databaseUrl) process.env.ENCRYPTION_MASTER_KEY = Buffer.alloc(32, 7).toString("base64")
const database = databaseUrl ? createDatabase(databaseUrl) : undefined
const repositories = database ? createRepositories(database.db) : undefined
const app = database ? createApiApp(database) : undefined

function cookie(response: {
  readonly headers: Record<string, string | string[] | undefined>
}): string {
  const cookies = response.headers["set-cookie"]
  const values = Array.isArray(cookies) ? cookies : cookies ? [cookies] : []
  const session = values.find((value) => value.startsWith("waha_session="))?.split(";", 1)[0]
  if (!session) throw new Error("session cookie missing")
  return session
}

async function login(email: string, password: string): Promise<string> {
  if (!app) throw new Error("analytics integration app unavailable")
  return cookie(
    await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    }),
  )
}

describe.skipIf(!app || !repositories)("Todo 13 authenticated analytics HTTP surface", () => {
  beforeEach(async () => {
    if (database)
      await database.sql.unsafe(
        "TRUNCATE auth_sessions, auth_rate_limits, session_grants, user_roles, users, normalized_events, dispatch_attempts, scheduled_jobs, contacts, sessions, waha_connections, audit_entries CASCADE",
      )
  })

  it("allows granted Admin, Operator, and Viewer reads while denying scope and grant crossings", async () => {
    // Given one Personal session, one Business session, and users with explicit Personal grants
    if (!app || !repositories || !database)
      throw new Error("analytics integration dependencies unavailable")
    const adminEmail = `analytics-admin-${crypto.randomUUID()}@example.invalid`
    const bootstrap = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: { email: adminEmail, password: "admin fixture password", displayName: "Admin" },
    })
    const adminSession = cookie(bootstrap)
    const adminCsrf = bootstrap.headers["set-cookie"]
      ?.find((value) => value.startsWith("waha_csrf="))
      ?.split("=", 2)[1]
      ?.split(";", 1)[0]
    if (!adminCsrf) throw new Error("csrf cookie missing")
    const connection = await repositories.wahaConnections.create({
      name: `analytics-${crypto.randomUUID()}`,
      baseUrl: "http://waha.invalid",
      apiKeyCiphertext: "opaque-ciphertext",
      apiKeyNonce: "opaque-nonce",
      apiKeyAuthTag: "opaque-tag",
    })
    const personal = await repositories.sessions.create({
      connectionId: connection.id,
      accountScope: "personal",
      name: `personal-${crypto.randomUUID()}`,
      wahaSessionName: `personal-${crypto.randomUUID()}`,
      status: "linked",
    })
    const business = await repositories.sessions.create({
      connectionId: connection.id,
      accountScope: "business",
      name: `business-${crypto.randomUUID()}`,
      wahaSessionName: `business-${crypto.randomUUID()}`,
      status: "linked",
    })
    await seedAnalyticsRecords(database, personal.id)
    const operatorEmail = `analytics-operator-${crypto.randomUUID()}@example.invalid`
    const viewerEmail = `analytics-viewer-${crypto.randomUUID()}@example.invalid`
    const operator = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { cookie: adminSession, "x-csrf-token": adminCsrf },
      payload: {
        email: operatorEmail,
        password: "operator fixture password",
        displayName: "Operator",
        roles: [{ accountScope: "personal", role: "operator" }],
      },
    })
    const viewer = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { cookie: adminSession, "x-csrf-token": adminCsrf },
      payload: {
        email: viewerEmail,
        password: "viewer fixture password",
        displayName: "Viewer",
        roles: [{ accountScope: "personal", role: "viewer" }],
      },
    })
    const operatorId = operator.json<{ readonly id: string }>().id
    const viewerId = viewer.json<{ readonly id: string }>().id
    for (const userId of [operatorId, viewerId]) {
      const grant = await app.inject({
        method: "POST",
        url: "/admin/grants",
        headers: { cookie: adminSession, "x-csrf-token": adminCsrf },
        payload: { userId, sessionId: personal.id, accountScope: "personal" },
      })
      expect(grant.statusCode).toBe(204)
    }
    const adminGrant = await app.inject({
      method: "POST",
      url: "/admin/grants",
      headers: { cookie: adminSession, "x-csrf-token": adminCsrf },
      payload: {
        userId: bootstrap.json<{ readonly user: { readonly id: string } }>().user.id,
        sessionId: personal.id,
        accountScope: "personal",
      },
    })
    expect(adminGrant.statusCode).toBe(204)

    // When each authenticated role reads Personal analytics and a Viewer crosses scope/grant seams
    const requests = await Promise.all(
      [
        adminSession,
        await login(operatorEmail, "operator fixture password"),
        await login(viewerEmail, "viewer fixture password"),
      ].map((session) =>
        app.inject({
          method: "GET",
          url: `/scoped/analytics?scope=personal&sessionId=${personal.id}&from=2026-01-01T00:00:00.000Z&to=2026-01-03T00:00:00.000Z`,
          headers: { cookie: session },
        }),
      ),
    )
    const viewerSession = await login(viewerEmail, "viewer fixture password")
    const crossScope = await app.inject({
      method: "GET",
      url: `/scoped/analytics?scope=business`,
      headers: { cookie: viewerSession },
    })
    const ungranted = await app.inject({
      method: "GET",
      url: `/scoped/analytics?scope=business&sessionId=${business.id}`,
      headers: { cookie: viewerSession },
    })

    // Then authorized reads succeed and denied reads reveal neither aggregate nor session data
    expect(requests.map((response) => response.statusCode)).toEqual([200, 200, 200])
    const personalAnalytics = requests[0]?.json<{
      readonly messageVolume: { readonly total: number; readonly outbound: number }
      readonly acknowledgments: { readonly failed: number; readonly unknown: number }
      readonly failureRate: number | null
      readonly retryCount: number
      readonly timelockIndicators: number
      readonly contactActivity: number
      readonly uptimeMs: number | null
      readonly scheduledJobs: { readonly failed: number; readonly retries: number }
      readonly sessions: readonly {
        readonly sessionId: string
        readonly messageVolume: { readonly total: number }
      }[]
    }>()
    expect(personalAnalytics).toMatchObject({
      messageVolume: { total: 1, outbound: 1 },
      acknowledgments: { failed: 1, unknown: 0 },
      failureRate: 1,
      retryCount: 1,
      timelockIndicators: 2,
      contactActivity: 1,
      uptimeMs: 7_200_000,
      scheduledJobs: { failed: 1, retries: 1 },
    })
    expect(
      personalAnalytics?.sessions.map(({ sessionId, messageVolume: { total } }) => ({
        sessionId,
        messageVolume: { total },
      })),
    ).toEqual([{ sessionId: personal.id, messageVolume: { total: 1 } }])
    expect(crossScope.statusCode).toBe(200)
    expect(crossScope.json<{ readonly sessions: readonly unknown[] }>().sessions).toEqual([])
    expect(ungranted.statusCode).toBe(403)
    expect(ungranted.body).not.toContain(business.id)
    expect(ungranted.body).not.toContain("messageVolume")
  })
})

if (database)
  afterAll(async () => {
    await app?.close()
    await database.close()
    delete process.env.ENCRYPTION_MASTER_KEY
  })
