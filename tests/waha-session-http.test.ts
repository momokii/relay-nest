import { describe, expect, it } from "vitest"
import Fastify from "../apps/api/node_modules/fastify"

import type { AuthPrincipal } from "../apps/api/src/auth/service"
import { WahaHttpError } from "../apps/api/src/waha/errors"
import { registerSessionRoutes } from "../apps/api/src/waha/session-http"
import type { WahaSessionClient } from "../apps/api/src/waha/session-types"
import {
  createScopedSessionService,
  type ScopedSessionRepository,
  type StoredSession,
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

function repository(createdInputs: Array<Omit<StoredSession, "id">> = []): ScopedSessionRepository {
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
    create: async (input) => {
      createdInputs.push(input)
      return { id: sessionId, ...input }
    },
    createGrant: async () => undefined,
  }
}

function serviceWithCalls(
  calls: string[],
  providerBodies: string[] = [],
  createdInputs = [],
  overrides: Partial<Pick<WahaSessionClient, "qr">> = {},
) {
  const client = {
    sessions: async () => [],
    session: async () => ({
      name: "personal",
      status: "PASSKEY_REQUIRED" as const,
      presence: {},
      timestamps: { activity: null },
    }),
    createSession: async (body: string) => {
      providerBodies.push(body)
      return {
        name: "personal",
        status: "STARTING" as const,
        presence: {},
        timestamps: { activity: null },
      }
    },
    updateSession: async () => ({
      name: "personal",
      status: "STARTING" as const,
      presence: {},
      timestamps: { activity: null },
    }),
    remove: async () => undefined,
    start: async () => ({
      name: "personal",
      status: "STARTING" as const,
      presence: {},
      timestamps: { activity: null },
    }),
    stop: async () => ({
      name: "personal",
      status: "STOPPED" as const,
      presence: {},
      timestamps: { activity: null },
    }),
    restart: async () => ({
      name: "personal",
      status: "STARTING" as const,
      presence: {},
      timestamps: { activity: null },
    }),
    logout: async () => ({
      name: "personal",
      status: "STOPPED" as const,
      presence: {},
      timestamps: { activity: null },
    }),
    qr: overrides.qr ?? (async () => ({ value: "qr" })),
    chats: async () => [
      {
        id: { server: "g.us", user: "120363162617804781", _serialized: "120363162617804781@g.us" },
        name: "Ops Group",
        isGroup: true,
        lastMessage: { _data: { secret: "redact" } },
      },
      {
        id: { server: "c.us", user: "628123456789", _serialized: "628123456789@c.us" },
        name: "Alice",
        isGroup: false,
      },
      {
        id: { server: "lid", user: "987654321", _serialized: "987654321@lid" },
        name: "Linked identity",
        isGroup: false,
      },
    ],
    contact: async (_name: string, contactId: string) => ({
      id: "628111111111@c.us",
      number: contactId.replace(/@.*$/, ""),
    }),
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
  }
  return createScopedSessionService({
    repository: repository(createdInputs),
    clientFor: () => client,
    clientForConnection: () => client,
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

  it("sends only the persisted WAHA session name to the provider on create", async () => {
    // Given an authenticated Admin linking a display name to a distinct WAHA session name
    const calls: string[] = []
    const providerBodies: string[] = []
    const createdInputs: Array<Omit<StoredSession, "id">> = []
    const app = Fastify()
    const auth = {
      authenticate: async () => principal,
      verifyCsrf: async () => true,
    }
    registerSessionRoutes(app, auth, serviceWithCalls(calls, providerBodies, createdInputs))

    // When the session-link endpoint receives the RelayNest record
    const response = await app.inject({
      method: "POST",
      url: "/scoped/sessions?scope=personal",
      headers: { cookie: "waha_session=session-token", "x-csrf-token": "csrf-token" },
      payload: {
        connectionId: "33333333-3333-4333-8333-333333333333",
        name: "Personal account",
        wahaSessionName: "personal",
      },
    })

    // Then provider creation and local persistence use the same WAHA session name
    expect(response.statusCode).toBe(200)
    expect(providerBodies).toEqual([JSON.stringify({ name: "personal" })])
    expect(createdInputs).toEqual([
      expect.objectContaining({
        accountScope: "personal",
        connectionId: "33333333-3333-4333-8333-333333333333",
        name: "Personal account",
        wahaSessionName: "personal",
        status: "STARTING",
      }),
    ])
    await app.close()
  })

  it("surfaces a safe provider rejection detail on unavailable session reads", async () => {
    // Given a granted session whose provider rejects the QR read in the current state
    const calls: string[] = []
    const app = Fastify()
    const auth = {
      authenticate: async () => principal,
      verifyCsrf: async () => true,
    }
    const failingQr = serviceWithCalls(calls, [], [], {
      qr: async () => {
        throw new WahaHttpError(
          422,
          "/api/personal/auth/qr?format=image",
          "http",
          "The WhatsApp provider expects the session to be in the QR-scan state. Start the session and try again.",
        )
      },
    })
    registerSessionRoutes(app, auth, failingQr)

    // When the QR route is called for the scoped session
    const response = await app.inject({
      method: "GET",
      url: `/scoped/sessions/${sessionId}/qr?scope=personal`,
      headers: { cookie: "waha_session=session-token" },
    })

    // Then the unavailable body carries the safe reason for the dashboard to display
    expect(response.statusCode).toBe(502)
    expect(response.json()).toEqual({
      error: "WAHA unavailable",
      detail:
        "The WhatsApp provider expects the session to be in the QR-scan state. Start the session and try again.",
    })
    await app.close()
  })

  it("lists a redacted provider chat directory for the scoped session", async () => {
    // Given an authenticated Admin with a granted session backed by provider chats
    const calls: string[] = []
    const app = Fastify()
    const auth = {
      authenticate: async () => principal,
      verifyCsrf: async () => true,
    }
    registerSessionRoutes(app, auth, serviceWithCalls(calls))

    // When the chat directory route is called
    const response = await app.inject({
      method: "GET",
      url: `/scoped/sessions/${sessionId}/chats?scope=personal`,
      headers: { cookie: "waha_session=session-token" },
    })

    // Then the directory returns safe fields only
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([
      { phone: null, name: "Ops Group", isGroup: true },
      { phone: "+628123456789", name: "Alice", isGroup: false },
      { phone: "+628111111111", name: "Linked identity", isGroup: false },
    ])
    expect(JSON.stringify(response.json())).not.toContain("@g.us")
    expect(JSON.stringify(response.json())).not.toContain("@c.us")
    expect(JSON.stringify(response.json())).not.toContain("@lid")
    expect(response.body).not.toContain("redact")
    await app.close()
  })
})
