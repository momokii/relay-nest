import type { FastifyInstance } from "fastify"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createApiApp } from "../apps/api/src/app"
import { createDatabase } from "../apps/api/src/db/client"
import { createRepositories } from "../apps/api/src/db/repositories"
import { NotificationProviderError } from "../apps/api/src/notifications/providers"
import { createNotificationService } from "../apps/api/src/notifications/service"
import { createEnvelopeCipher } from "../packages/config/src/encryption"

const databaseUrl = process.env.TASK11_DATABASE_URL
const database = databaseUrl ? createDatabase(databaseUrl) : undefined
const repositories = database ? createRepositories(database.db) : undefined
let emailCalls = 0
let telegramCalls = 0
let providerMode: "success" | "transient" = "success"
const notificationService =
  database && repositories
    ? createNotificationService({
        repository: repositories,
        cipher: createEnvelopeCipher(Buffer.alloc(32, 9)),
        providers: {
          email: async () => {
            emailCalls += 1
            if (providerMode === "transient")
              throw new NotificationProviderError("timeout", "opaque provider failure")
          },
          telegram: async () => {
            telegramCalls += 1
          },
        },
        audit: (input) => repositories.auditEntries.append(input).then(() => undefined),
        sleep: async () => undefined,
      })
    : undefined
const app = database
  ? createApiApp(database, notificationService ? { notificationService } : {})
  : undefined

describe.skipIf(!app || !repositories)("Todo 11 notification HTTP authorization", () => {
  beforeEach(async () => {
    emailCalls = 0
    telegramCalls = 0
    providerMode = "success"
    await database?.sql.unsafe(
      "TRUNCATE notification_preferences, notification_provider_settings, notifications, auth_sessions, auth_rate_limits, user_roles, users, audit_entries CASCADE",
    )
  })

  it("keeps notification settings Admin-only and never returns secrets", async () => {
    // Given an authenticated Admin, Operator, and Viewer in the Personal scope
    const admin = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: `task11-admin-${crypto.randomUUID()}@example.invalid`,
        password: "correct horse battery staple",
        displayName: "Task 11 Admin",
      },
    })
    const adminCookies = cookies(admin.headers["set-cookie"] ?? [])
    const adminSession = adminCookies.session
    const adminCsrf = adminCookies.csrf
    const createUser = async (role: "operator" | "viewer") => {
      const email = `task11-${role}-${crypto.randomUUID()}@example.invalid`
      const response = await app.inject({
        method: "POST",
        url: "/admin/users",
        headers: { cookie: adminSession, "x-csrf-token": adminCsrf },
        payload: {
          email,
          password: "valid user password",
          displayName: `Task 11 ${role}`,
          roles: [{ accountScope: "personal", role }],
        },
      })
      return { email, id: response.json<{ id: string }>().id }
    }
    const operator = await createUser("operator")
    const viewer = await createUser("viewer")

    // When the Admin writes and reads a complete channel configuration
    const save = await app.inject({
      method: "PUT",
      url: "/admin/notifications/personal/settings",
      headers: { cookie: adminSession, "x-csrf-token": adminCsrf },
      payload: {
        email: {
          enabled: true,
          host: "smtp.example.invalid",
          port: 465,
          secure: true,
          username: "admin@example.invalid",
          password: "opaque-smtp-fixture",
          from: "admin@example.invalid",
        },
        telegram: { enabled: true, botToken: "opaque-telegram-fixture", chatIds: ["12345"] },
      },
    })
    const read = await app.inject({
      method: "GET",
      url: "/admin/notifications/personal/settings",
      headers: { cookie: adminSession },
    })

    // Then Admin access succeeds but response projections never contain plaintext secrets
    expect(save.statusCode).toBe(200)
    expect(read.statusCode).toBe(200)
    expect(read.body).not.toContain("opaque-smtp-fixture")
    expect(read.body).not.toContain("opaque-telegram-fixture")
    expect(read.body).toContain("••••••••")

    // When malformed settings, missing CSRF, or a foreign Origin crosses the route boundary
    const malformed = await app.inject({
      method: "PUT",
      url: "/admin/notifications/personal/settings",
      headers: { cookie: adminSession, "x-csrf-token": adminCsrf },
      payload: { email: {}, telegram: {} },
    })
    const missingCsrf = await app.inject({
      method: "PUT",
      url: "/admin/notifications/personal/preferences",
      headers: { cookie: adminSession },
      payload: {
        security: { email: false, telegram: false },
        delivery: { email: false, telegram: false },
        operations: { email: false, telegram: false },
      },
    })
    const foreignOrigin = await app.inject({
      method: "POST",
      url: "/admin/notifications/personal/test",
      headers: { cookie: adminSession, "x-csrf-token": adminCsrf, origin: "https://evil.invalid" },
      payload: {},
    })

    // Then malformed input is generic 400 and browser proof failures are 403
    expect(malformed.statusCode).toBe(400)
    expect(malformed.body).toBe('{"error":"invalid request"}')
    expect(missingCsrf.statusCode).toBe(403)
    expect(foreignOrigin.statusCode).toBe(403)

    // When the Admin disables both channel preferences and requests a test send
    const disabledPreferences = await app.inject({
      method: "PUT",
      url: "/admin/notifications/personal/preferences",
      headers: { cookie: adminSession, "x-csrf-token": adminCsrf },
      payload: {
        security: { email: false, telegram: false },
        delivery: { email: false, telegram: false },
        operations: { email: false, telegram: false },
      },
    })
    const disabledTest = await app.inject({
      method: "POST",
      url: "/admin/notifications/personal/test",
      headers: { cookie: adminSession, "x-csrf-token": adminCsrf },
      payload: { category: "operations" },
    })

    // Then the disabled channels make zero provider calls
    expect(disabledPreferences.statusCode).toBe(204)
    expect(disabledTest.statusCode).toBe(200)
    expect(disabledTest.json()).toEqual({ email: "disabled", telegram: "disabled" })
    expect(emailCalls).toBe(0)
    expect(telegramCalls).toBe(0)

    // When the Admin enables both preferences and the SMTP provider transiently fails
    await app.inject({
      method: "PUT",
      url: "/admin/notifications/personal/preferences",
      headers: { cookie: adminSession, "x-csrf-token": adminCsrf },
      payload: {
        security: { email: false, telegram: false },
        delivery: { email: false, telegram: false },
        operations: { email: true, telegram: true },
      },
    })
    providerMode = "transient"
    const failedTest = await app.inject({
      method: "POST",
      url: "/admin/notifications/personal/test",
      headers: { cookie: adminSession, "x-csrf-token": adminCsrf },
      payload: { category: "operations" },
    })
    const history = await app.inject({
      method: "GET",
      url: "/admin/notifications/personal/history",
      headers: { cookie: adminSession },
    })

    // Then retry exhaustion is safe and history exposes only redacted state
    expect(failedTest.statusCode).toBe(200)
    expect(failedTest.json()).toEqual({ email: "failed", telegram: "sent" })
    expect(emailCalls).toBe(3)
    expect(telegramCalls).toBe(1)
    expect(history.statusCode).toBe(200)
    expect(history.body).not.toContain("opaque provider failure")
    expect(history.body).toContain("provider timeout")

    // When non-Admin principals and an unauthenticated caller access settings
    const operatorSession = await login(app, operator.email)
    const viewerSession = await login(app, viewer.email)
    const denied = await Promise.all([
      app.inject({ method: "GET", url: "/admin/notifications/personal/settings" }),
      app.inject({
        method: "GET",
        url: "/admin/notifications/personal/settings",
        headers: { cookie: operatorSession.session },
      }),
      app.inject({
        method: "GET",
        url: "/admin/notifications/personal/settings",
        headers: { cookie: viewerSession.session },
      }),
    ])

    // Then all non-Admin reads are denied with no configuration leakage
    expect(denied.map((response) => response.statusCode)).toEqual([401, 403, 403])
    expect(denied.every((response) => !response.body.includes("opaque-"))).toBe(true)
  })
})

async function login(
  application: FastifyInstance,
  email: string,
): Promise<{ readonly session: string }> {
  const response = await application.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      email,
      password: "valid user password",
    },
  })
  return { session: cookies(response.headers["set-cookie"] ?? []).session }
}

function cookies(values: readonly string[]): { readonly session: string; readonly csrf: string } {
  const session = values.find((cookie) => cookie.startsWith("waha_session="))?.split(";", 1)[0]
  const csrf = values.find((cookie) => cookie.startsWith("waha_csrf="))?.split(";", 1)[0]
  if (!session || !csrf) throw new Error("authentication cookies unavailable")
  return { session, csrf: csrf.split("=", 2)[1] ?? "" }
}

afterAll(async () => {
  await database?.close()
})
