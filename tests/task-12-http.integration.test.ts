import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createApiApp } from "../apps/api/src/app"
import { createDatabase } from "../apps/api/src/db/client"
import { createRepositories } from "../apps/api/src/db/repositories"

const databaseUrl = process.env.TASK12_DATABASE_URL
const database = databaseUrl ? createDatabase(databaseUrl) : undefined
const app = database ? createApiApp(database) : undefined
const repositories = database ? createRepositories(database.db) : undefined

describe.skipIf(!app || !repositories)("Todo 12 authenticated HTTP boundary", () => {
  beforeEach(async () => {
    await database.sql.unsafe(
      "TRUNCATE auth_sessions, auth_rate_limits, session_grants, user_roles, users, audit_entries, scheduled_jobs, sessions, waha_connections, retention_policies CASCADE",
    )
  })

  it("requires Admin scope and CSRF, then keeps preview/cancel/confirm exact", async () => {
    // Given an authenticated Admin and one old Personal schedule
    const bootstrap = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: `todo12-http-${crypto.randomUUID()}@example.invalid`,
        password: "correct horse battery staple",
        displayName: "Todo 12 Admin",
      },
    })
    const cookies = bootstrap.headers["set-cookie"] ?? []
    const sessionCookie = cookies
      .find((cookie) => cookie.startsWith("waha_session="))
      ?.split(";", 1)[0]
    const csrfToken = cookies
      .find((cookie) => cookie.startsWith("waha_csrf="))
      ?.split("=", 2)[1]
      ?.split(";", 1)[0]
    const connection = await repositories.wahaConnections.create({
      name: `todo12-http-connection-${crypto.randomUUID()}`,
      baseUrl: "http://waha.internal",
      apiKeyCiphertext: "opaque",
      apiKeyNonce: "opaque",
      apiKeyAuthTag: "opaque",
    })
    const session = await repositories.sessions.create({
      connectionId: connection.id,
      accountScope: "personal",
      name: `todo12-http-session-${crypto.randomUUID()}`,
      wahaSessionName: `todo12-http-waha-${crypto.randomUUID()}`,
      status: "linked",
    })
    await repositories.scheduledJobs.create({
      sessionId: session.id,
      accountScope: "personal",
      recipientPhoneCiphertext: "opaque",
      recipientPhoneNonce: "opaque",
      recipientPhoneAuthTag: "opaque",
      messageCiphertext: "opaque",
      messageNonce: "opaque",
      messageAuthTag: "opaque",
      scheduledFor: new Date("2019-01-01T00:00:00.000Z"),
      timezone: "UTC",
      idempotencyKey: `todo12-http-job-${crypto.randomUUID()}`,
      createdAt: new Date("2019-01-01T00:00:00.000Z"),
      updatedAt: new Date("2019-01-01T00:00:00.000Z"),
    })
    await repositories.retentionPolicies.upsert({
      accountScope: "personal",
      category: "messages",
      retentionDays: 30,
    })

    // When preview, cancellation, and confirmed purge are requested
    const headers = {
      cookie: sessionCookie,
      "x-csrf-token": csrfToken,
      origin: "http://localhost:80",
    }
    const previewWithoutCsrf = await app.inject({
      method: "POST",
      url: "/admin/retention/personal/preview",
      headers: { cookie: sessionCookie, origin: "http://localhost:80" },
      payload: { category: "messages" },
    })
    const preview = await app.inject({
      method: "POST",
      url: "/admin/retention/personal/preview",
      headers,
      payload: { category: "messages" },
    })
    const previewBody = preview.json<{ cutoff: string; count: number; previewToken: string }>()
    const cancelled = await app.inject({
      method: "POST",
      url: "/admin/retention/personal/purge",
      headers,
      payload: {
        category: "messages",
        cutoff: previewBody.cutoff,
        previewCount: previewBody.count,
        previewToken: previewBody.previewToken,
        confirmed: false,
      },
    })
    const stale = await app.inject({
      method: "POST",
      url: "/admin/retention/personal/purge",
      headers,
      payload: {
        category: "messages",
        cutoff: "2019-01-01T00:00:00.000Z",
        previewCount: previewBody.count,
        previewToken: previewBody.previewToken,
        confirmed: true,
      },
    })
    const confirmed = await app.inject({
      method: "POST",
      url: "/admin/retention/personal/purge",
      headers,
      payload: {
        category: "messages",
        cutoff: previewBody.cutoff,
        previewCount: previewBody.count,
        previewToken: previewBody.previewToken,
        confirmed: true,
      },
    })

    // Then cancellation is denied without deletion and confirmation deletes the preview count
    expect(previewWithoutCsrf.statusCode).toBe(403)
    expect(preview.statusCode).toBe(200)
    expect(previewBody.count).toBe(1)
    expect(cancelled.statusCode).toBe(409)
    expect(stale.statusCode).toBe(409)
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json<{ deletedCount: number }>().deletedCount).toBe(1)

    // When origin, malformed category, and cross-scope mutation probes are sent
    const csrfDenied = await app.inject({
      method: "PUT",
      url: "/admin/retention/personal",
      headers: { cookie: sessionCookie, origin: "https://evil.invalid" },
      payload: { category: "messages", retentionDays: 30 },
    })
    const malformed = await app.inject({
      method: "POST",
      url: "/admin/retention/personal/preview",
      headers,
      payload: { category: "not-a-category" },
    })
    const crossScope = await app.inject({
      method: "POST",
      url: "/admin/retention/business/preview",
      headers,
      payload: { category: "messages" },
    })

    // Then all probes fail closed with generic or authorization-safe responses
    expect(csrfDenied.statusCode).toBe(403)
    expect(malformed.statusCode).toBe(400)
    expect(crossScope.statusCode).toBe(409)
  })
})

afterAll(async () => {
  await app?.close()
  await database?.close()
})
