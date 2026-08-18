import { afterAll, beforeEach, describe, expect, it } from "vitest"

import {
  app,
  database,
  mutationHeaders,
  repositories,
  resetScheduleDatabase,
  seedAdditionalSchedule,
  seedSchedule,
} from "./task-14-schedule-fixtures"

describe.skipIf(!app || !repositories)("Todo 14 adversarial schedule contracts", () => {
  beforeEach(resetScheduleDatabase)

  it("denies an authenticated cross-session job-id mismatch", async () => {
    // Given an authenticated Admin granted to two Personal sessions
    const first = await seedSchedule()
    const second = await seedAdditionalSchedule(first)

    // When the Admin addresses the second job through the first session path
    const response = await app.inject({
      method: "GET",
      url: `/scoped/sessions/${first.sessionId}/messages/schedules/${second.jobId}?scope=personal`,
      headers: { cookie: first.cookie },
    })

    // Then the route refuses the cross-session identifier without exposing schedule data
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: "not_found" })
    expect(response.body).not.toMatch(/recipientPhone|message|opaque/)
  })

  it("rejects malformed UUID, scope, and mutation body inputs at the authenticated seam", async () => {
    // Given an authenticated Admin with a valid Personal schedule
    const context = await seedSchedule()

    // When authenticated requests contain malformed route, query, or body input
    const malformedUuid = await app.inject({
      method: "GET",
      url: "/scoped/sessions/not-a-uuid/messages/schedules?scope=personal",
      headers: { cookie: context.cookie },
    })
    const malformedScope = await app.inject({
      method: "GET",
      url: `/scoped/sessions/${context.sessionId}/messages/schedules?scope=not-a-scope`,
      headers: { cookie: context.cookie },
    })
    const malformedBody = await app.inject({
      method: "PUT",
      url: `/scoped/sessions/${context.sessionId}/messages/schedules/${context.jobId}?scope=personal`,
      headers: mutationHeaders(context),
      payload: { scheduledFor: "not-a-date", timezone: "" },
    })

    // Then each invalid boundary is a stable generic 400 response
    expect(malformedUuid.statusCode).toBe(400)
    expect(malformedUuid.json()).toEqual({ error: "invalid request" })
    expect(malformedScope.statusCode).toBe(400)
    expect(malformedScope.json()).toEqual({ error: "invalid request" })
    expect(malformedBody.statusCode).toBe(400)
    expect(malformedBody.json()).toEqual({ error: "invalid request" })
  })

  it("requires valid CSRF and same-origin proof for authenticated mutations", async () => {
    // Given an authenticated Admin with a valid schedule and CSRF token
    const context = await seedSchedule()
    const baseUrl = `/scoped/sessions/${context.sessionId}/messages/schedules/${context.jobId}/cancel?scope=personal`

    // When mutation proof is missing, invalid, or cross-origin
    const missingCsrf = await app.inject({
      method: "POST",
      url: baseUrl,
      headers: { cookie: context.cookie, origin: "http://localhost:80" },
    })
    const invalidCsrf = await app.inject({
      method: "POST",
      url: baseUrl,
      headers: { cookie: context.cookie, "x-csrf-token": "invalid", origin: "http://localhost:80" },
    })
    const crossOrigin = await app.inject({
      method: "POST",
      url: baseUrl,
      headers: {
        cookie: context.cookie,
        "x-csrf-token": context.csrf,
        origin: "https://evil.invalid",
      },
    })

    // Then all mutation-boundary failures are forbidden and do not mutate the schedule
    for (const response of [missingCsrf, invalidCsrf, crossOrigin]) {
      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual({ error: "forbidden" })
    }
    await expect(repositories.scheduledJobs.find(context.jobId, "personal")).resolves.toMatchObject(
      {
        state: "scheduled",
      },
    )
  })

  it("returns a content-safe recovery DTO with only the public schedule fields", async () => {
    // Given an authenticated Admin whose job recovered into an unknown state
    const context = await seedSchedule()
    await database.sql`
      UPDATE scheduled_jobs
      SET state = 'unknown', recovery_code = 'lease_expired'
      WHERE id = ${context.jobId}
    `

    // When the Admin reads the recovered schedule
    const response = await app.inject({
      method: "GET",
      url: `/scoped/sessions/${context.sessionId}/messages/schedules/${context.jobId}?scope=personal`,
      headers: { cookie: context.cookie },
    })

    // Then the DTO exposes recovery classification but no message, recipient, secret, or lease data
    expect(response.statusCode).toBe(200)
    const dto = response.json<Record<string, unknown>>()
    expect(dto).toMatchObject({ state: "unknown", recoveryCode: "lease_expired" })
    expect(Object.keys(dto).sort()).toEqual(
      [
        "accountScope",
        "attempts",
        "failureCode",
        "id",
        "nextAttemptAt",
        "providerMessageId",
        "recoveryCode",
        "scheduledFor",
        "sessionId",
        "state",
        "timezone",
      ].sort(),
    )
    expect(response.body).not.toMatch(/recipientPhone|message|idempotencyKey|leaseOwner|opaque/)
  })
})

afterAll(async () => {
  await app?.close()
  await database?.close()
})
