import { describe, expect, it } from "vitest"
import Fastify from "../apps/api/node_modules/fastify"

import type { ScheduleInput } from "../apps/api/src/messaging"
import { registerMessagingRoutes } from "../apps/api/src/messaging-http"
import { registerScheduledRoutes } from "../apps/api/src/scheduled-http"

const sessionId = "11111111-1111-4111-8111-111111111111"
const jobId = "11111111-1111-4111-8111-111111111121"
const contactId = "11111111-1111-4111-8111-111111111112"
const principal = {
  userId: "11111111-1111-4111-8111-111111111113",
  email: "operator@example.invalid",
  displayName: "Operator",
  roles: ["operator"] as const,
  rolesByScope: { personal: ["operator"], business: [] } as const,
  sessionId: "11111111-1111-4111-8111-111111111114",
  sessionToken: "session-token",
  csrfToken: "csrf-token",
}
const MUTATION_HEADERS = {
  origin: "http://localhost",
  host: "localhost",
  cookie: "waha_session=session-token",
  "x-csrf-token": "csrf-token",
}

function storedJob() {
  return {
    id: jobId,
    sessionId,
    accountScope: "personal" as const,
    recipientPhone: "+628123456789",
    message: "hello",
    scheduledFor: new Date("2099-01-01T00:00:00.000Z"),
    timezone: "UTC",
    idempotencyKey: "11111111-1111-4111-8111-111111111119",
    state: "scheduled" as const,
    attempts: 0,
    nextAttemptAt: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    providerMessageId: null,
    recoveryCode: null,
    failureCode: null,
  }
}

describe("schedule wall-clock HTTP boundaries", () => {
  it("persists an Asia/Jakarta wall-clock schedule as its true UTC instant on create", async () => {
    // Given an authenticated operator and the composer's offset-less wall clock
    const app = Fastify()
    const auth = {
      authenticate: async () => principal,
      verifyCsrf: async () => true,
    }
    let captured: ScheduleInput | undefined
    registerMessagingRoutes(app, auth, {
      resolveContact: async () => ({
        id: contactId,
        phone: "+628123456789",
        displayName: null,
        consentGranted: true,
        optedOut: false,
      }),
      sendImmediate: async () => ({ state: "submitted", providerMessageId: "provider-1" }),
      scheduleText: async (_principal, input) => {
        captured = input
        return { state: "scheduled", jobId: "job-1" }
      },
      setConsent: async () => ({ updated: true }),
    })

    // When the schedule is created for 2026-09-06T17:38 Asia/Jakarta
    const response = await app.inject({
      method: "POST",
      url: `/scoped/sessions/${sessionId}/messages/schedule?scope=personal`,
      headers: MUTATION_HEADERS,
      payload: {
        phoneNumber: "+628123456789",
        message: "hello",
        idempotencyKey: "11111111-1111-4111-8111-111111111115",
        scheduledFor: "2026-09-06T17:38",
        timezone: "Asia/Jakarta",
      },
    })

    // Then the scheduler receives 2026-09-06T10:38:00.000Z, not 17:38 in UTC
    expect(response.statusCode).toBe(200)
    expect(captured?.scheduledFor.toISOString()).toBe("2026-09-06T10:38:00.000Z")
    expect(captured?.timezone).toBe("Asia/Jakarta")
    await app.close()
  })

  it("edits a schedule by interpreting the wall clock in the submitted timezone", async () => {
    // Given a mutable scheduled job behind the authenticated edit seam
    const app = Fastify()
    const auth = {
      authenticate: async () => principal,
      verifyCsrf: async () => true,
      authorize: async () => ({ allowed: true as const }),
    }
    let edited: { scheduledFor: Date; timezone: string } | undefined
    const job = storedJob()
    registerScheduledRoutes(app, auth, {
      scheduledJobs: {
        find: async () => job,
        listForSession: async () => [],
        edit: async (_id, _scope, input) => {
          edited = input
          return { ...job, ...input }
        },
        cancel: async () => null,
        remove: async () => null,
      },
      auditEntries: { append: async () => {} },
    })

    // When the job is edited to 2026-09-06T17:38 Asia/Jakarta
    const response = await app.inject({
      method: "PUT",
      url: `/scoped/sessions/${sessionId}/messages/schedules/${jobId}?scope=personal`,
      headers: MUTATION_HEADERS,
      payload: { scheduledFor: "2026-09-06T17:38", timezone: "Asia/Jakarta" },
    })

    // Then the persisted instant is 2026-09-06T10:38:00.000Z with the timezone kept
    expect(response.statusCode).toBe(200)
    expect(edited?.scheduledFor.toISOString()).toBe("2026-09-06T10:38:00.000Z")
    expect(edited?.timezone).toBe("Asia/Jakarta")
    await app.close()
  })

  it("rejects an unknown timezone with a generic 400 before any scheduler call", async () => {
    // Given an authenticated operator submitting a non-IANA timezone
    const app = Fastify()
    const auth = {
      authenticate: async () => principal,
      verifyCsrf: async () => true,
    }
    let schedulerCalls = 0
    registerMessagingRoutes(app, auth, {
      resolveContact: async () => ({
        id: contactId,
        phone: "+628123456789",
        displayName: null,
        consentGranted: true,
        optedOut: false,
      }),
      sendImmediate: async () => {
        schedulerCalls += 1
        return { state: "submitted", providerMessageId: "provider-1" }
      },
      scheduleText: async () => {
        schedulerCalls += 1
        return { state: "scheduled", jobId: "job-1" }
      },
      setConsent: async () => ({ updated: true }),
    })

    // When the schedule is created with a timezone that does not exist
    const response = await app.inject({
      method: "POST",
      url: `/scoped/sessions/${sessionId}/messages/schedule?scope=personal`,
      headers: MUTATION_HEADERS,
      payload: {
        phoneNumber: "+628123456789",
        message: "hello",
        idempotencyKey: "11111111-1111-4111-8111-111111111115",
        scheduledFor: "2026-09-06T17:38",
        timezone: "Mars/Olympus",
      },
    })

    // Then the boundary answers a safe generic 400 and nothing is scheduled
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: "invalid request" })
    expect(schedulerCalls).toBe(0)
    await app.close()
  })

  it("rejects a nonexistent DST gap wall clock with a generic 400", async () => {
    // Given the America/New_York spring-forward gap on 2026-03-08 at 02:30
    const app = Fastify()
    const auth = {
      authenticate: async () => principal,
      verifyCsrf: async () => true,
    }
    let schedulerCalls = 0
    registerMessagingRoutes(app, auth, {
      resolveContact: async () => ({
        id: contactId,
        phone: "+628123456789",
        displayName: null,
        consentGranted: true,
        optedOut: false,
      }),
      sendImmediate: async () => {
        schedulerCalls += 1
        return { state: "submitted", providerMessageId: "provider-1" }
      },
      scheduleText: async () => {
        schedulerCalls += 1
        return { state: "scheduled", jobId: "job-1" }
      },
      setConsent: async () => ({ updated: true }),
    })

    // When the schedule is created inside the gap
    const response = await app.inject({
      method: "POST",
      url: `/scoped/sessions/${sessionId}/messages/schedule?scope=personal`,
      headers: MUTATION_HEADERS,
      payload: {
        phoneNumber: "+628123456789",
        message: "hello",
        idempotencyKey: "11111111-1111-4111-8111-111111111115",
        scheduledFor: "2026-03-08T02:30",
        timezone: "America/New_York",
      },
    })

    // Then the boundary rejects the wall clock with a generic 400
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: "invalid request" })
    expect(schedulerCalls).toBe(0)
    await app.close()
  })
})
