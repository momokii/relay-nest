import { describe, expect, it } from "vitest"
import Fastify from "../apps/api/node_modules/fastify"

import type { AuthPrincipal } from "../apps/api/src/auth/service"
import { registerSessionRoutes } from "../apps/api/src/waha/session-http"
import {
  createScopedSessionService,
  type ScopedSessionRepository,
} from "../apps/api/src/waha/sessions"

const sessionId = "11111111-1111-4111-8111-111111111111"
const principal: AuthPrincipal = {
  userId: "11111111-1111-4111-8111-111111111112",
  email: "admin@example.invalid",
  displayName: "Admin",
  roles: ["admin"],
  rolesByScope: { personal: ["admin"], business: [] },
  sessionId: "11111111-1111-4111-8111-111111111113",
  sessionToken: "session-token",
  csrfToken: "csrf-token",
}

function repository(): ScopedSessionRepository {
  const session = {
    id: sessionId,
    connectionId: "connection-1",
    accountScope: "personal" as const,
    name: "Personal",
    wahaSessionName: "personal",
    status: "PASSKEY_REQUIRED",
  }
  return {
    list: async () => [session],
    find: async () => session,
    hasGrant: async () => true,
    saveStatus: async () => undefined,
  }
}

function serviceWithCalls(calls: string[]) {
  return createScopedSessionService({
    repository: repository(),
    clientFor: () => ({
      sessions: async () => [],
      session: async () => ({
        name: "personal",
        status: "PASSKEY_REQUIRED",
        presence: {},
        timestamps: { activity: null },
      }),
      createSession: async () => ({
        name: "personal",
        status: "STARTING",
        presence: {},
        timestamps: { activity: null },
      }),
      updateSession: async () => ({
        name: "personal",
        status: "STARTING",
        presence: {},
        timestamps: { activity: null },
      }),
      remove: async () => undefined,
      start: async () => ({
        name: "personal",
        status: "STARTING",
        presence: {},
        timestamps: { activity: null },
      }),
      stop: async () => ({
        name: "personal",
        status: "STOPPED",
        presence: {},
        timestamps: { activity: null },
      }),
      restart: async () => ({
        name: "personal",
        status: "STARTING",
        presence: {},
        timestamps: { activity: null },
      }),
      logout: async () => ({
        name: "personal",
        status: "STOPPED",
        presence: {},
        timestamps: { activity: null },
      }),
      qr: async () => ({ value: "qr" }),
      requestPairingCode: async () => undefined,
      passkeyChallenge: async () => {
        calls.push("GET /api/personal/auth/passkey/challenge")
        return { challenge: "challenge" }
      },
      passkeyAssertion: async () => {
        calls.push("POST /api/personal/auth/passkey")
      },
      passkeyConfirmation: async () => {
        calls.push("GET /api/personal/auth/passkey/confirmation")
        return { code: "123456" }
      },
      confirmPasskey: async () => {
        calls.push("POST /api/personal/auth/passkey/confirm")
      },
      me: async () => ({ id: "phone" }),
      timelock: async () => ({ locked: false }),
      capping: async () => ({ remaining: 4 }),
    }),
  })
}

describe("scoped passkey HTTP routes", () => {
  it("uses exact product methods and safely returns passkey responses", async () => {
    // Given an authenticated Admin with a granted Personal session
    const calls: string[] = []
    const app = Fastify()
    const auth = {
      authenticate: async () => principal,
      verifyCsrf: async () => true,
    }
    registerSessionRoutes(app, auth, serviceWithCalls(calls))

    // When the challenge, assertion, confirmation, and confirm routes are called
    const headers = { cookie: "waha_session=session-token", "x-csrf-token": "csrf-token" }
    const challenge = await app.inject({
      method: "GET",
      url: `/scoped/sessions/${sessionId}/auth/passkey/challenge?scope=personal`,
      headers,
    })
    const assertion = await app.inject({
      method: "POST",
      url: `/scoped/sessions/${sessionId}/auth/passkey?scope=personal`,
      headers,
      payload: { response: "opaque" },
    })
    const confirmation = await app.inject({
      method: "GET",
      url: `/scoped/sessions/${sessionId}/auth/passkey/confirmation?scope=personal`,
      headers,
    })
    const confirm = await app.inject({
      method: "POST",
      url: `/scoped/sessions/${sessionId}/auth/passkey/confirm?scope=personal`,
      headers,
    })

    // Then all operations are scoped, redacted, and mapped to the documented upstream paths
    expect(challenge.statusCode).toBe(200)
    expect(challenge.json()).toEqual({ challenge: "challenge" })
    expect(assertion.statusCode).toBe(200)
    expect(confirmation.json()).toEqual({ code: "123456" })
    expect(confirm.statusCode).toBe(200)
    expect(calls).toEqual([
      "GET /api/personal/auth/passkey/challenge",
      "POST /api/personal/auth/passkey",
      "GET /api/personal/auth/passkey/confirmation",
      "POST /api/personal/auth/passkey/confirm",
    ])
    await app.close()
  })
})
