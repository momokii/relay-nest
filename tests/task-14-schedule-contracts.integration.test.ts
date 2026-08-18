import { afterAll, beforeEach, describe, expect, it } from "vitest"

import {
  app,
  database,
  mutationHeaders,
  repositories,
  resetScheduleDatabase,
  seedSchedule,
} from "./task-14-schedule-fixtures"

describe.skipIf(!app || !repositories)("Todo 14 authenticated schedule contracts", () => {
  beforeEach(resetScheduleDatabase)

  it("lists scoped schedules through an authenticated session seam", async () => {
    // Given an authenticated Admin with a Personal session and one scheduled job
    const context = await seedSchedule()

    // When the Admin lists schedules for that session
    const response = await app.inject({
      method: "GET",
      url: `/scoped/sessions/${context.sessionId}/messages/schedules?scope=personal`,
      headers: { cookie: context.cookie },
    })

    // Then the authenticated route returns a scoped collection, not a demo or 404
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: context.jobId, accountScope: "personal" }),
      ]),
    )
  })

  it("returns schedule detail with persisted recovery state", async () => {
    // Given an authenticated Admin with a scheduled job that exposes recovery state
    const context = await seedSchedule()
    await database.sql`
      UPDATE scheduled_jobs
      SET state = 'unknown', recovery_code = 'lease_expired'
      WHERE id = ${context.jobId}
    `

    // When the Admin opens that job detail
    const response = await app.inject({
      method: "GET",
      url: `/scoped/sessions/${context.sessionId}/messages/schedules/${context.jobId}?scope=personal`,
      headers: { cookie: context.cookie },
    })

    // Then the detail seam exposes recovery evidence without message or recipient data
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(
      expect.objectContaining({
        id: context.jobId,
        accountScope: "personal",
        state: "unknown",
        recoveryCode: "lease_expired",
      }),
    )
    expect(response.body).not.toMatch(/recipientPhone|message|idempotencyKey|leaseOwner|opaque/)
  })

  it("edits a future schedule only through the authenticated mutation seam", async () => {
    // Given an authenticated Admin with a future one-time job
    const context = await seedSchedule()

    // When the Admin edits its schedule with same-origin and CSRF proof
    const response = await app.inject({
      method: "PUT",
      url: `/scoped/sessions/${context.sessionId}/messages/schedules/${context.jobId}?scope=personal`,
      headers: mutationHeaders(context),
      payload: { scheduledFor: "2099-01-02T00:00:00.000Z", timezone: "UTC" },
    })

    // Then the public schedule mutation seam accepts the scoped edit
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(
      expect.objectContaining({
        id: context.jobId,
        scheduledFor: "2099-01-02T00:00:00.000Z",
        timezone: "UTC",
      }),
    )
  })

  it("cancels a future schedule without crossing account scope", async () => {
    // Given an authenticated Admin with a future Personal job
    const context = await seedSchedule()

    // When the Admin cancels it through the authenticated scoped route
    const response = await app.inject({
      method: "POST",
      url: `/scoped/sessions/${context.sessionId}/messages/schedules/${context.jobId}/cancel?scope=personal`,
      headers: mutationHeaders(context),
    })

    // Then cancellation is observable at the public seam and remains idempotent
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(
      expect.objectContaining({ id: context.jobId, state: "cancelled" }),
    )
    await expect(repositories.scheduledJobs.find(context.jobId, "personal")).resolves.toMatchObject(
      {
        state: "cancelled",
      },
    )
    const repeated = await app.inject({
      method: "POST",
      url: `/scoped/sessions/${context.sessionId}/messages/schedules/${context.jobId}/cancel?scope=personal`,
      headers: mutationHeaders(context),
    })
    expect(repeated.statusCode).toBe(200)
    expect(repeated.json()).toEqual(expect.objectContaining({ state: "cancelled" }))
  })

  it("denies cross-scope, ungranted, and missing-CSRF access without leaking content", async () => {
    // Given an authenticated Admin with one granted Personal session and one ungranted session
    const context = await seedSchedule()
    const connection = await repositories.wahaConnections.create({
      name: `task14-denied-connection-${crypto.randomUUID()}`,
      baseUrl: "http://waha.internal",
      apiKeyCiphertext: "opaque",
      apiKeyNonce: "opaque",
      apiKeyAuthTag: "opaque",
    })
    const ungranted = await repositories.sessions.create({
      connectionId: connection.id,
      accountScope: "personal",
      name: `task14-ungranted-session-${crypto.randomUUID()}`,
      wahaSessionName: `task14-ungranted-waha-${crypto.randomUUID()}`,
      status: "linked",
    })

    // When the principal crosses scope, crosses a grant boundary, or omits CSRF
    const crossScope = await app.inject({
      method: "GET",
      url: `/scoped/sessions/${context.sessionId}/messages/schedules?scope=business`,
      headers: { cookie: context.cookie },
    })
    const ungrantedRead = await app.inject({
      method: "GET",
      url: `/scoped/sessions/${ungranted.id}/messages/schedules?scope=personal`,
      headers: { cookie: context.cookie },
    })
    const missingCsrf = await app.inject({
      method: "POST",
      url: `/scoped/sessions/${context.sessionId}/messages/schedules/${context.jobId}/cancel?scope=personal`,
      headers: { cookie: context.cookie, origin: "http://localhost:80" },
    })

    // Then every denial is generic and no encrypted or plaintext sensitive field crosses the seam
    expect(crossScope.statusCode).toBe(403)
    expect(ungrantedRead.statusCode).toBe(403)
    expect(missingCsrf.statusCode).toBe(403)
    expect(`${crossScope.body}${ungrantedRead.body}${missingCsrf.body}`).not.toMatch(
      /sensitive-api-key|opaque|recipientPhone|message|idempotencyKey/,
    )
  })

  it("locks edits and cancellation after dispatch has started", async () => {
    // Given an authenticated Admin with a job already in a terminal dispatch state
    const context = await seedSchedule()
    await database.sql`
      UPDATE scheduled_jobs
      SET state = 'submitted', provider_message_id = 'provider-safe-id'
      WHERE id = ${context.jobId}
    `

    // When the Admin attempts to change or cancel the dispatched job
    const edit = await app.inject({
      method: "PUT",
      url: `/scoped/sessions/${context.sessionId}/messages/schedules/${context.jobId}?scope=personal`,
      headers: mutationHeaders(context),
      payload: { scheduledFor: "2099-01-02T00:00:00.000Z", timezone: "UTC" },
    })
    const cancel = await app.inject({
      method: "POST",
      url: `/scoped/sessions/${context.sessionId}/messages/schedules/${context.jobId}/cancel?scope=personal`,
      headers: mutationHeaders(context),
    })

    // Then the durable terminal-state lock is preserved at the HTTP seam
    expect(edit.statusCode).toBe(409)
    expect(edit.json()).toEqual({ error: "schedule_locked" })
    expect(cancel.statusCode).toBe(409)
    expect(cancel.json()).toEqual({ error: "schedule_locked" })
    expect(`${edit.body}${cancel.body}`).not.toContain("provider-safe-id")
  })
})

afterAll(async () => {
  await app?.close()
  await database?.close()
})
