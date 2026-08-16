import { describe, expect, it } from "vitest"
import Fastify from "../apps/api/node_modules/fastify"

import { registerMessagingRoutes } from "../apps/api/src/messaging-http"

const sessionId = "11111111-1111-4111-8111-111111111111"
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

describe("scoped messaging HTTP routes", () => {
  it("validates scope and CSRF before exposing safe send results", async () => {
    // Given an authenticated Operator and a service that returns transport state only
    const app = Fastify()
    const auth = {
      authenticate: async () => principal,
      verifyCsrf: async () => true,
    }
    registerMessagingRoutes(app, auth, {
      resolveContact: async () => ({ id: contactId, phone: "+628123456789", displayName: null }),
      sendImmediate: async () => ({ state: "submitted", providerMessageId: "provider-1" }),
      scheduleText: async () => ({ state: "scheduled", jobId: "job-1" }),
      setConsent: async () => ({ updated: true }),
    })

    // When the operator submits one immediate text command
    const response = await app.inject({
      method: "POST",
      url: `/scoped/sessions/${sessionId}/messages/immediate?scope=personal`,
      headers: {
        origin: "http://localhost",
        host: "localhost",
        cookie: "waha_session=session-token",
        "x-csrf-token": "csrf-token",
      },
      payload: {
        phoneNumber: "+628123456789",
        message: "hello",
        idempotencyKey: "11111111-1111-4111-8111-111111111115",
      },
    })

    // Then the route returns only safe delivery evidence
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ state: "submitted", providerMessageId: "provider-1" })
    await app.close()
  })

  it("rejects a cross-origin mutating command before the service", async () => {
    // Given a browser request from a different origin
    const app = Fastify()
    const auth = {
      authenticate: async () => principal,
      verifyCsrf: async () => true,
    }
    let called = false
    registerMessagingRoutes(app, auth, {
      resolveContact: async () => ({ id: contactId, phone: "+628123456789", displayName: null }),
      sendImmediate: async () => {
        called = true
        return { state: "submitted", providerMessageId: "provider-1" }
      },
      scheduleText: async () => ({ state: "scheduled", jobId: "job-1" }),
      setConsent: async () => ({ updated: true }),
    })

    // When the command is sent with a mismatched Origin header
    const response = await app.inject({
      method: "POST",
      url: `/scoped/sessions/${sessionId}/messages/immediate?scope=personal`,
      headers: { origin: "https://attacker.invalid", host: "localhost" },
      payload: {
        phoneNumber: "+628123456789",
        message: "hello",
        idempotencyKey: "11111111-1111-4111-8111-111111111115",
      },
    })

    // Then no messaging operation is reached
    expect(response.statusCode).toBe(403)
    expect(called).toBe(false)
    await app.close()
  })

  it("maps malformed immediate input to a generic 400 without Zod details", async () => {
    // Given an authenticated operator with malformed message and idempotency input
    const app = Fastify()
    const auth = {
      authenticate: async () => principal,
      verifyCsrf: async () => true,
    }
    let called = false
    registerMessagingRoutes(app, auth, {
      resolveContact: async () => ({ id: contactId, phone: "+628123456789", displayName: null }),
      sendImmediate: async () => {
        called = true
        return { state: "submitted", providerMessageId: "provider-1" }
      },
      scheduleText: async () => ({ state: "scheduled", jobId: "job-1" }),
      setConsent: async () => ({ updated: true }),
    })

    // When the request reaches the route boundary
    const response = await app.inject({
      method: "POST",
      url: `/scoped/sessions/${sessionId}/messages/immediate?scope=personal`,
      headers: {
        origin: "http://localhost",
        host: "localhost",
        cookie: "waha_session=session-token",
        "x-csrf-token": "csrf-token",
      },
      payload: { phoneNumber: "+628123456789", message: "", idempotencyKey: "not-a-uuid" },
    })

    // Then the response is a safe generic client error and the service is untouched
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: "invalid request" })
    expect(JSON.stringify(response.json())).not.toContain("idempotencyKey")
    expect(JSON.stringify(response.json())).not.toContain("not-a-uuid")
    expect(called).toBe(false)
    await app.close()
  })

  it("maps malformed scheduled input to a generic 400 without Zod details", async () => {
    // Given an authenticated operator with an empty message and invalid schedule UUID
    const app = Fastify()
    const auth = {
      authenticate: async () => principal,
      verifyCsrf: async () => true,
    }
    let called = false
    registerMessagingRoutes(app, auth, {
      resolveContact: async () => ({ id: contactId, phone: "+628123456789", displayName: null }),
      sendImmediate: async () => ({ state: "submitted", providerMessageId: "provider-1" }),
      scheduleText: async () => {
        called = true
        return { state: "scheduled", jobId: "job-1" }
      },
      setConsent: async () => ({ updated: true }),
    })

    // When malformed input reaches the scheduled-send route
    const response = await app.inject({
      method: "POST",
      url: `/scoped/sessions/${sessionId}/messages/schedule?scope=personal`,
      headers: {
        origin: "http://localhost",
        host: "localhost",
        cookie: "waha_session=session-token",
        "x-csrf-token": "csrf-token",
      },
      payload: {
        phoneNumber: "+628123456789",
        message: "",
        idempotencyKey: "not-a-uuid",
        scheduledFor: "not-a-date",
        timezone: "UTC",
      },
    })

    // Then no validation details, paths, payload, or service call cross the boundary
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: "invalid request" })
    expect(JSON.stringify(response.json())).not.toMatch(/Zod|message|idempotencyKey|not-a-uuid/)
    expect(called).toBe(false)
    await app.close()
  })
})
