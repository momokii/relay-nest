import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createApiApp } from "../apps/api/src/app"
import { createDatabase } from "../apps/api/src/db/client"
import { createRepositories } from "../apps/api/src/db/repositories"

const databaseUrl = process.env.TASK14_DATABASE_URL
const database = databaseUrl ? createDatabase(databaseUrl) : undefined
const repositories = database ? createRepositories(database.db) : undefined
const app = database ? createApiApp(database) : undefined

describe.skipIf(!app || !repositories)("Todo 14 authenticated AI approval contract", () => {
  beforeEach(async () => {
    await database?.sql.unsafe(
      "TRUNCATE auth_sessions, auth_rate_limits, session_grants, user_roles, users, audit_entries, sessions, waha_connections CASCADE",
    )
  })

  it("approves a scoped provider suggestion without dispatching a message", async () => {
    // Given an authenticated Admin and an opt-in provider-agnostic draft suggestion
    const bootstrap = await app?.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: `task14-ai-${crypto.randomUUID()}@example.invalid`,
        password: "opaque-test-password",
        displayName: "Task 14 AI Admin",
      },
    })
    const cookies = bootstrap?.headers["set-cookie"] ?? []
    const cookie = cookies.find((value) => value.startsWith("waha_session="))?.split(";", 1)[0]
    const csrf = cookies
      .find((value) => value.startsWith("waha_csrf="))
      ?.split(";", 1)[0]
      ?.slice("waha_csrf=".length)
    if (!cookie || !csrf) throw new Error("authenticated test cookies unavailable")

    // When the Admin approves the suggestion for the Personal scope
    const response = await app?.inject({
      method: "POST",
      url: "/scoped/ai/suggestions/suggestion-opaque/approve?scope=personal",
      headers: { cookie, "x-csrf-token": csrf, origin: "http://localhost:80" },
      payload: { provider: "fixture-provider", kind: "draft", approved: true },
    })

    // Then approval is explicit, remains not_sent, and cannot be mistaken for dispatch
    expect(response?.statusCode).toBe(200)
    if (response?.statusCode === 200) {
      expect(response.json()).toMatchObject({ approved: true, sendState: "not_sent" })
      expect(response.body).not.toContain("dispatched")
    }
  })
})

afterAll(async () => {
  await app?.close()
  await database?.close()
})
