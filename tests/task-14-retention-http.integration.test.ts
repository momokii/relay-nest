import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createApiApp } from "../apps/api/src/app"
import { createDatabase } from "../apps/api/src/db/client"
import { createRepositories } from "../apps/api/src/db/repositories"

const databaseUrl = process.env.TASK14_DATABASE_URL
const database = databaseUrl ? createDatabase(databaseUrl) : undefined
const repositories = database ? createRepositories(database.db) : undefined
const app = database ? createApiApp(database) : undefined

type AuthContext = Readonly<{ cookie: string; csrf: string }>

describe.skipIf(!app || !repositories)("Todo 14 authenticated retention HTTP contract", () => {
  beforeEach(async () => {
    await database?.sql.unsafe(
      "TRUNCATE retention_policies, scheduled_jobs, auth_sessions, auth_rate_limits, user_roles, users, audit_entries, sessions, waha_connections CASCADE",
    )
  })

  it("keeps cancellation non-destructive and binds confirmation to the preview", async () => {
    // Given an authenticated Admin, a Personal policy, and an old Personal schedule
    const admin = await bootstrap()
    const connection = await repositories.wahaConnections.create({
      name: `task14-retention-connection-${crypto.randomUUID()}`,
      baseUrl: "http://waha.internal",
      apiKeyCiphertext: "opaque",
      apiKeyNonce: "opaque",
      apiKeyAuthTag: "opaque",
    })
    const session = await repositories.sessions.create({
      connectionId: connection.id,
      accountScope: "personal",
      name: `task14-retention-session-${crypto.randomUUID()}`,
      wahaSessionName: `task14-retention-waha-${crypto.randomUUID()}`,
      status: "linked",
    })
    const job = await repositories.scheduledJobs.create({
      sessionId: session.id,
      accountScope: "personal",
      recipientPhoneCiphertext: "opaque",
      recipientPhoneNonce: "opaque",
      recipientPhoneAuthTag: "opaque",
      messageCiphertext: "opaque",
      messageNonce: "opaque",
      messageAuthTag: "opaque",
      scheduledFor: new Date("2019-01-01T00:00:00.000Z"),
      createdAt: new Date("2019-01-01T00:00:00.000Z"),
      updatedAt: new Date("2019-01-01T00:00:00.000Z"),
      timezone: "UTC",
      idempotencyKey: `task14-retention-job-${crypto.randomUUID()}`,
    })
    const headers = mutationHeaders(admin)
    const policy = await app.inject({
      method: "PUT",
      url: "/admin/retention/personal",
      headers,
      payload: { category: "messages", retentionDays: 30 },
    })

    // When the Admin reads the policy and previews the Personal messages category
    const read = await app.inject({ method: "GET", url: "/admin/retention/personal", headers })
    const previewResponse = await app.inject({
      method: "POST",
      url: "/admin/retention/personal/preview",
      headers,
      payload: { category: "messages" },
    })
    const preview = previewResponse.json<{
      readonly cutoff: string
      readonly count: number
      readonly previewToken: string
    }>()

    // Then the read and preview are scoped and the old job is counted once
    expect(policy.statusCode).toBe(200)
    expect(read.statusCode).toBe(200)
    expect(read.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ accountScope: "personal" })]),
    )
    expect(previewResponse.statusCode).toBe(200)
    expect(preview.count).toBe(1)

    // When the Admin cancels by omitting explicit confirmation
    const cancelled = await app.inject({
      method: "POST",
      url: "/admin/retention/personal/purge",
      headers,
      payload: {
        category: "messages",
        cutoff: preview.cutoff,
        previewCount: preview.count,
        previewToken: preview.previewToken,
        confirmed: false,
      },
    })

    // Then cancellation deletes zero rows and the preview remains usable
    expect(cancelled.statusCode).toBe(409)
    await expect(repositories.scheduledJobs.find(job.id, "personal")).resolves.toMatchObject({
      id: job.id,
    })

    // When the Admin confirms the unchanged scope, category, cutoff, count, and token
    const confirmed = await app.inject({
      method: "POST",
      url: "/admin/retention/personal/purge",
      headers,
      payload: {
        category: "messages",
        cutoff: preview.cutoff,
        previewCount: preview.count,
        previewToken: preview.previewToken,
        confirmed: true,
      },
    })

    // Then exactly the preview batch is deleted
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json()).toEqual(expect.objectContaining({ deletedCount: 1 }))
    await expect(repositories.scheduledJobs.find(job.id, "personal")).resolves.toBeNull()
  })

  it("denies a Business-only Operator from mutating Personal retention", async () => {
    // Given an Admin and a Business-only Operator
    const admin = await bootstrap()
    const operatorEmail = `task14-operator-${crypto.randomUUID()}@example.invalid`
    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: mutationHeaders(admin),
      payload: {
        email: operatorEmail,
        password: "opaque-operator-password",
        displayName: "Task 14 Operator",
        roles: [{ accountScope: "business", role: "operator" }],
      },
    })
    expect(created.statusCode).toBe(201)
    const operator = await login(operatorEmail, "opaque-operator-password")

    // When the Operator attempts to read and preview Personal retention
    const read = await app.inject({
      method: "GET",
      url: "/admin/retention/personal",
      headers: { cookie: operator.cookie },
    })
    const preview = await app.inject({
      method: "POST",
      url: "/admin/retention/personal/preview",
      headers: mutationHeaders(operator),
      payload: { category: "messages" },
    })

    // Then the scope boundary denies both operations without exposing retention data
    expect(read.statusCode).toBe(403)
    expect(preview.statusCode).toBe(403)
    expect(preview.body).not.toContain("cutoff")
  })
})

async function bootstrap(): Promise<AuthContext> {
  if (!app) throw new Error("TASK14_DATABASE_URL is required")
  const response = await app.inject({
    method: "POST",
    url: "/auth/bootstrap",
    payload: {
      email: `task14-retention-admin-${crypto.randomUUID()}@example.invalid`,
      password: "opaque-admin-password",
      displayName: "Task 14 Retention Admin",
    },
  })
  return readCookies(response.headers["set-cookie"] ?? [])
}

async function login(email: string, password: string): Promise<AuthContext> {
  if (!app) throw new Error("TASK14_DATABASE_URL is required")
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  })
  return readCookies(response.headers["set-cookie"] ?? [])
}

function readCookies(values: readonly string[]): AuthContext {
  const session = values.find((value) => value.startsWith("waha_session="))?.split(";", 1)[0]
  const csrf = values.find((value) => value.startsWith("waha_csrf="))?.split(";", 1)[0]
  if (!session || !csrf) throw new Error("authenticated test cookies unavailable")
  return { cookie: session, csrf: csrf.split("=", 2)[1] ?? "" }
}

function mutationHeaders(context: AuthContext): Record<string, string> {
  return {
    cookie: context.cookie,
    "x-csrf-token": context.csrf,
    origin: "http://localhost:80",
  }
}

afterAll(async () => {
  await app?.close()
  await database?.close()
})
