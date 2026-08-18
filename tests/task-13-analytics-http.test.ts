import { describe, expect, it } from "vitest"
import Fastify from "../apps/api/node_modules/fastify"
import { z } from "../apps/api/node_modules/zod"

import { registerAnalyticsRoutes } from "../apps/api/src/analytics/http"
import { createAnalyticsService } from "../apps/api/src/analytics/service"
import type { AuthPrincipal } from "../apps/api/src/auth/service"
import type { SessionRouteAuth } from "../apps/api/src/waha/session-http-support"

const principal: AuthPrincipal = {
  userId: "user-1",
  email: "viewer@example.invalid",
  displayName: "Viewer",
  roles: ["viewer"],
  rolesByScope: { personal: ["viewer"], business: [] },
  sessionId: "auth-session-1",
  sessionToken: "opaque-token",
  csrfToken: "opaque-csrf",
}

const auth: SessionRouteAuth = {
  authenticate: async (token) => (token === "valid-token" ? principal : null),
  verifyCsrf: async () => false,
}

const service = createAnalyticsService({
  source: {
    listSessions: async () => [],
    read: async () => ({
      sessions: [],
      events: [],
      dispatchAttempts: [],
      contacts: [],
      jobs: [],
      statusHistory: [],
    }),
  },
  authorize: async () => ({ allowed: true }),
})

async function createTestApp() {
  const app = Fastify()
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ error: "invalid request" })
    throw error
  })
  registerAnalyticsRoutes(app, auth, service)
  await app.ready()
  return app
}

describe("analytics HTTP surface", () => {
  it("requires authentication before returning an aggregate", async () => {
    // Given an unauthenticated request to the scoped analytics route
    const app = await createTestApp()

    // When the request is made without the session cookie
    const response = await app.inject({ method: "GET", url: "/scoped/analytics?scope=personal" })

    // Then the route returns only the established authentication error
    expect(response.statusCode).toBe(401)
    await app.close()
  })

  it("rejects malformed date input at the HTTP boundary", async () => {
    // Given an authenticated request with a malformed analytics window
    const app = await createTestApp()

    // When the request crosses the Zod query boundary
    const response = await app.inject({
      method: "GET",
      url: "/scoped/analytics?scope=personal&from=not-a-date",
      headers: { cookie: "waha_session=valid-token" },
    })

    // Then malformed input is rejected without calling the projection service
    expect(response.statusCode).toBe(400)
    await app.close()
  })

  it("rejects an unbounded analytics window at the HTTP boundary", async () => {
    // Given an authenticated request spanning more than the supported analytics window
    const app = await createTestApp()

    // When the oversized range crosses the query boundary
    const response = await app.inject({
      method: "GET",
      url: "/scoped/analytics?scope=personal&from=2020-01-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z",
      headers: { cookie: "waha_session=valid-token" },
    })

    // Then the request is rejected before projection work
    expect(response.statusCode).toBe(400)
    await app.close()
  })

  it("rejects a cross-origin read without exposing aggregate values", async () => {
    // Given an authenticated request from an untrusted Origin
    const app = await createTestApp()

    // When the same route receives the cross-origin request
    const response = await app.inject({
      method: "GET",
      url: "/scoped/analytics?scope=personal",
      headers: { cookie: "waha_session=valid-token", origin: "https://evil.invalid" },
    })

    // Then the existing same-origin control fails closed
    expect(response.statusCode).toBe(403)
    expect(response.body).not.toContain("messageVolume")
    await app.close()
  })

  it("returns an empty aggregate for an authenticated empty scope", async () => {
    // Given an authenticated Viewer with an empty authorized scope
    const app = await createTestApp()

    // When the mandatory scope query is supplied
    const response = await app.inject({
      method: "GET",
      url: "/scoped/analytics?scope=personal",
      headers: { cookie: "waha_session=valid-token" },
    })

    // Then the response is scoped and contains no invented delivery evidence
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      scope: "personal",
      messageVolume: { total: 0 },
      acknowledgments: { unknown: 0 },
      sessions: [],
    })
    await app.close()
  })
})
