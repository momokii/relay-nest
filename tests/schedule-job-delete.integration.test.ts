import { afterAll, beforeEach, describe, expect, it } from "vitest"

import {
  app,
  database,
  mutationHeaders,
  repositories,
  resetScheduleDatabase,
  type ScheduleContext,
  seedAdditionalSchedule,
  seedSchedule,
} from "./task-14-schedule-fixtures"

function deleteUrl(context: ScheduleContext, scope = "personal"): string {
  return `/scoped/sessions/${context.sessionId}/messages/schedules/${context.jobId}?scope=${scope}`
}

async function auditActionsFor(subjectId: string): Promise<readonly string[]> {
  const rows = await database.sql<{ readonly action: string }>`
    SELECT action FROM audit_entries WHERE subject_id = ${subjectId}
  `
  return rows.map((row) => row.action)
}

async function createExtraJob(context: ScheduleContext) {
  return repositories.scheduledJobs.create({
    sessionId: context.sessionId,
    accountScope: "personal",
    recipientPhoneCiphertext: "opaque",
    recipientPhoneNonce: "opaque",
    recipientPhoneAuthTag: "opaque",
    messageCiphertext: "opaque",
    messageNonce: "opaque",
    messageAuthTag: "opaque",
    scheduledFor: new Date("2099-01-05T00:00:00.000Z"),
    timezone: "UTC",
    idempotencyKey: `task2-delete-job-${crypto.randomUUID()}`,
  })
}

describe.skipIf(!app || !repositories)("Schedule terminal-state delete contracts", () => {
  beforeEach(resetScheduleDatabase)

  it("deletes a terminal schedule job and records a content-free audit trail", async () => {
    // Given an authenticated Admin with a job whose dispatch reached a terminal state
    const context = await seedSchedule()
    await database.sql`
      UPDATE scheduled_jobs
      SET state = 'submitted', provider_message_id = 'provider-safe-id'
      WHERE id = ${context.jobId}
    `
    await repositories.dispatchAttempts.create({
      jobId: context.jobId,
      sessionId: context.sessionId,
      accountScope: "personal",
      attemptNumber: 1,
      state: "submitted",
    })

    // When the Admin deletes the terminal job through the authenticated scoped route
    const response = await app.inject({
      method: "DELETE",
      url: deleteUrl(context),
      headers: mutationHeaders(context),
    })

    // Then the job and its dispatch attempts are gone and a content-free audit entry remains
    expect(response.statusCode).toBe(200)
    await expect(repositories.scheduledJobs.find(context.jobId, "personal")).resolves.toBeNull()
    await expect(
      repositories.dispatchAttempts.listForJob(context.jobId, "personal"),
    ).resolves.toEqual([])
    const actions = await auditActionsFor(context.jobId)
    expect(actions).toContain("schedule.deleted")
    expect(JSON.stringify(actions)).not.toMatch(/opaque|recipientPhone|message/)
  })

  it("locks deletion for scheduled, queued, and attempting jobs", async () => {
    // Given an authenticated Admin with jobs in every non-deletable dispatch state
    const context = await seedSchedule()
    const queued = await createExtraJob(context)
    const attempting = await createExtraJob(context)
    await database.sql`UPDATE scheduled_jobs SET state = 'queued' WHERE id = ${queued.id}`
    await database.sql`UPDATE scheduled_jobs SET state = 'attempting' WHERE id = ${attempting.id}`

    // When the Admin attempts to delete each non-terminal job
    const scheduledResponse = await app.inject({
      method: "DELETE",
      url: deleteUrl(context),
      headers: mutationHeaders(context),
    })
    const queuedResponse = await app.inject({
      method: "DELETE",
      url: deleteUrl({ ...context, jobId: queued.id }),
      headers: mutationHeaders(context),
    })
    const attemptingResponse = await app.inject({
      method: "DELETE",
      url: deleteUrl({ ...context, jobId: attempting.id }),
      headers: mutationHeaders(context),
    })

    // Then every deletion stays locked behind the generic schedule_locked contract
    for (const response of [scheduledResponse, queuedResponse, attemptingResponse]) {
      expect(response.statusCode).toBe(409)
      expect(response.json()).toEqual({ error: "schedule_locked" })
    }
  })

  it("refuses to delete a terminal job that still holds a dispatch lease", async () => {
    // Given an authenticated Admin with a terminal job whose lease has not expired
    const context = await seedSchedule()
    await database.sql`
      UPDATE scheduled_jobs
      SET state = 'submitted', provider_message_id = 'provider-safe-id',
          lease_owner = 'stale-worker', lease_expires_at = now() + interval '5 minutes'
      WHERE id = ${context.jobId}
    `

    // When the Admin attempts to delete the leased job
    const response = await app.inject({
      method: "DELETE",
      url: deleteUrl(context),
      headers: mutationHeaders(context),
    })

    // Then the lease lock wins and the job survives
    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ error: "schedule_locked" })
    await expect(repositories.scheduledJobs.find(context.jobId, "personal")).resolves.toMatchObject(
      { state: "submitted" },
    )
  })

  it("requires same-origin and CSRF proof before deleting", async () => {
    // Given an authenticated Admin with a deletable terminal job
    const context = await seedSchedule()
    await database.sql`UPDATE scheduled_jobs SET state = 'cancelled' WHERE id = ${context.jobId}`

    // When mutation proof is missing or cross-origin
    const missingCsrf = await app.inject({
      method: "DELETE",
      url: deleteUrl(context),
      headers: { cookie: context.cookie, origin: "http://localhost:80" },
    })
    const crossOrigin = await app.inject({
      method: "DELETE",
      url: deleteUrl(context),
      headers: {
        cookie: context.cookie,
        "x-csrf-token": context.csrf,
        origin: "https://evil.invalid",
      },
    })

    // Then both deletion attempts are forbidden and the job survives
    for (const response of [missingCsrf, crossOrigin]) {
      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual({ error: "forbidden" })
    }
    await expect(repositories.scheduledJobs.find(context.jobId, "personal")).resolves.toMatchObject(
      { state: "cancelled" },
    )
  })

  it("denies cross-scope deletion and cross-session job ids without leaking content", async () => {
    // Given an authenticated Admin granted to two Personal sessions
    const first = await seedSchedule()
    const second = await seedAdditionalSchedule(first)

    // When the Admin crosses the account scope or the session boundary
    const crossScope = await app.inject({
      method: "DELETE",
      url: deleteUrl(first, "business"),
      headers: mutationHeaders(first),
    })
    const crossSession = await app.inject({
      method: "DELETE",
      url: deleteUrl({ ...first, jobId: second.jobId }),
      headers: mutationHeaders(first),
    })

    // Then scope crossing is forbidden, session crossing is not found, and both jobs survive
    expect(crossScope.statusCode).toBe(403)
    expect(crossScope.json()).toEqual({ error: "forbidden" })
    expect(crossSession.statusCode).toBe(404)
    expect(crossSession.json()).toEqual({ error: "not_found" })
    expect(`${crossScope.body}${crossSession.body}`).not.toMatch(/opaque|recipientPhone|message/)
    await expect(repositories.scheduledJobs.find(first.jobId, "personal")).resolves.toBeTruthy()
    await expect(repositories.scheduledJobs.find(second.jobId, "personal")).resolves.toBeTruthy()
  })

  it("returns not_found for a repeated delete of the same job", async () => {
    // Given an authenticated Admin with a deletable terminal job
    const context = await seedSchedule()
    await database.sql`UPDATE scheduled_jobs SET state = 'failed' WHERE id = ${context.jobId}`

    // When the Admin deletes the job twice
    const first = await app.inject({
      method: "DELETE",
      url: deleteUrl(context),
      headers: mutationHeaders(context),
    })
    const repeat = await app.inject({
      method: "DELETE",
      url: deleteUrl(context),
      headers: mutationHeaders(context),
    })

    // Then the first delete succeeds and the repeat is a generic not_found
    expect(first.statusCode).toBe(200)
    expect(repeat.statusCode).toBe(404)
    expect(repeat.json()).toEqual({ error: "not_found" })
  })

  it("records a content-free schedule.cancelled audit entry when cancelling", async () => {
    // Given an authenticated Admin with a cancellable future job
    const context = await seedSchedule()

    // When the Admin cancels it through the authenticated scoped route
    const response = await app.inject({
      method: "POST",
      url: `/scoped/sessions/${context.sessionId}/messages/schedules/${context.jobId}/cancel?scope=personal`,
      headers: mutationHeaders(context),
    })

    // Then the cancellation is observable and leaves a content-free audit entry
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(expect.objectContaining({ state: "cancelled" }))
    const actions = await auditActionsFor(context.jobId)
    expect(actions).toContain("schedule.cancelled")
    expect(JSON.stringify(actions)).not.toMatch(/opaque|recipientPhone|message/)
  })
})

afterAll(async () => {
  await app?.close()
  await database?.close()
})
