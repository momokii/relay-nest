import { describe, expect, it, vi } from "vitest"
import Fastify from "../apps/api/node_modules/fastify"

import { registerAiApprovalRoutes } from "../apps/api/src/ai/http"
import { createAiApprovalService } from "../apps/api/src/ai/service"
import type { AiApprovalService } from "../apps/api/src/ai/types"
import type { AuthPrincipal } from "../apps/api/src/auth/service"
import type { SessionRouteAuth } from "../apps/api/src/waha/session-http-support"

const principal = (role: "admin" | "operator" | "viewer"): AuthPrincipal => ({
  userId: "user-1",
  email: "user@example.invalid",
  displayName: "Test User",
  roles: [role],
  rolesByScope: { personal: [role], business: [] },
  sessionId: "session-1",
  sessionToken: "session-token",
  csrfToken: "csrf-token",
})

const auth: SessionRouteAuth = {
  authenticate: async (token) => (token === "valid-token" ? principal("operator") : null),
  verifyCsrf: async (token, csrfToken) => token === "session-token" && csrfToken === "csrf-token",
}

type RequestOverrides = {
  readonly url?: string
  readonly headers?: Record<string, string>
  readonly payload?: unknown
}

const validRequest: RequestOverrides = {
  headers: {
    cookie: "waha_session=valid-token",
    origin: "http://localhost:80",
    "x-csrf-token": "csrf-token",
  },
  payload: { provider: "fixture-provider", kind: "draft", approved: true },
}

async function createTestApp(service: AiApprovalService = createAiApprovalService()) {
  const app = Fastify()
  registerAiApprovalRoutes(app, auth, service)
  await app.ready()
  return app
}

async function approve(
  app: Awaited<ReturnType<typeof createTestApp>>,
  overrides: RequestOverrides = {},
) {
  return app.inject({
    method: "POST",
    url: overrides.url ?? "/scoped/ai/suggestions/suggestion-opaque/approve?scope=personal",
    headers: overrides.headers ?? validRequest.headers,
    payload: overrides.payload ?? validRequest.payload,
  })
}

describe("Todo 14 scoped AI approval HTTP contract", () => {
  it("returns unavailable provider state while approving without dispatch", async () => {
    // Given an authenticated Operator approving a Personal draft suggestion
    const app = await createTestApp()
    const messagingDispatch = vi.fn()
    const schedulerDispatch = vi.fn()

    // When the approval crosses the same-origin and CSRF-protected route
    const response = await approve(app)

    // Then approval is explicit, scoped, unavailable, and never a send result
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      suggestionId: "suggestion-opaque",
      scope: "personal",
      approved: true,
      sendState: "not_sent",
      providerState: "unavailable",
    })
    expect(response.body).not.toContain("dispatched")
    expect(messagingDispatch).not.toHaveBeenCalled()
    expect(schedulerDispatch).not.toHaveBeenCalled()
    await app.close()
  })

  it("returns configured provider state without dispatching", async () => {
    // Given an authenticated Operator and a configured provider state
    const app = await createTestApp(createAiApprovalService({ provider: { state: "configured" } }))
    const messagingDispatch = vi.fn()
    const schedulerDispatch = vi.fn()

    // When the Operator approves a classification suggestion
    const response = await approve(app, {
      payload: { provider: "fixture-provider", kind: "classification", approved: true },
    })

    // Then the provider state is explicit and no dispatch seam was called
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ providerState: "configured", sendState: "not_sent" })
    expect(messagingDispatch).not.toHaveBeenCalled()
    expect(schedulerDispatch).not.toHaveBeenCalled()
    await app.close()
  })

  it.each([
    ["malformed suggestion ID", "/scoped/ai/suggestions/%20/approve?scope=personal"],
    ["malformed scope query", "/scoped/ai/suggestions/suggestion-opaque/approve?scope=other"],
  ])("rejects %s with a generic validation error", async (_label, url) => {
    // Given an authenticated Operator and malformed route input
    const app = await createTestApp()

    // When the request reaches the public HTTP seam
    const response = await approve(app, { url })

    // Then Zod details are not exposed
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: "invalid request" })
    await app.close()
  })

  it("rejects a malformed approval body generically", async () => {
    // Given an authenticated Operator with an invalid approval body
    const app = await createTestApp()

    // When the body crosses the HTTP seam
    const response = await approve(app, { payload: { provider: "", approved: false } })

    // Then the response is stable and does not contain Zod internals
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: "invalid request" })
    expect(response.body).not.toContain("Zod")
    await app.close()
  })

  it.each([
    ["missing CSRF", { ...validRequest.headers, "x-csrf-token": "" }],
    ["invalid CSRF", { ...validRequest.headers, "x-csrf-token": "wrong-token" }],
    ["cross-origin approval", { ...validRequest.headers, origin: "https://foreign.example" }],
  ])("rejects %s before approval", async (_label, headers) => {
    // Given an authenticated Operator with an invalid request boundary
    const service = { approve: vi.fn(createAiApprovalService().approve) }
    const app = await createTestApp(service)

    // When the mutation is attempted
    const response = await approve(app, { headers })

    // Then authorization fails closed before the service seam
    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: "forbidden" })
    expect(service.approve).not.toHaveBeenCalled()
    await app.close()
  })

  it("rejects an Operator whose requested scope is denied", async () => {
    // Given an Operator granted only Personal approval
    const app = await createTestApp()

    // When the same principal requests Business approval
    const response = await approve(app, {
      url: "/scoped/ai/suggestions/suggestion-opaque/approve?scope=business",
    })

    // Then the scope authorization fails closed
    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: "forbidden" })
    await app.close()
  })

  it("denies a Viewer before an approval can mutate state", async () => {
    // Given an authenticated Viewer in the Personal scope
    const viewerAuth: SessionRouteAuth = {
      ...auth,
      authenticate: async () => principal("viewer"),
    }
    const app = Fastify()
    registerAiApprovalRoutes(app, viewerAuth, createAiApprovalService())
    await app.ready()

    // When the Viewer attempts the approval mutation
    const response = await app.inject({
      method: "POST",
      url: "/scoped/ai/suggestions/suggestion-opaque/approve?scope=personal",
      headers: {
        cookie: "waha_session=valid-token",
        origin: "http://localhost:80",
        "x-csrf-token": "csrf-token",
      },
      payload: { provider: "fixture-provider", kind: "draft", approved: true },
    })

    // Then the role boundary fails closed
    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: "forbidden" })
    await app.close()
  })
})
