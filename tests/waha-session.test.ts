import { describe, expect, it } from "vitest"
import type { UserRole } from "../apps/api/src/auth/authorization"
import type { AuthPrincipal } from "../apps/api/src/auth/service"
import {
  createScopedSessionService,
  type ScopedSessionRepository,
} from "../apps/api/src/waha/sessions"

function principal(userId: string, role: UserRole): AuthPrincipal {
  return {
    userId,
    email: `${userId}@example.invalid`,
    displayName: userId,
    roles: [role],
    rolesByScope: { personal: [role], business: [] },
    sessionId: `session-${userId}`,
    sessionToken: `token-${userId}`,
    csrfToken: `csrf-${userId}`,
  }
}

const admin = principal("admin", "admin")
const operator = principal("operator", "operator")
const viewer = principal("viewer", "viewer")

const personalSession = {
  id: "11111111-1111-4111-8111-111111111111",
  connectionId: "connection-1",
  accountScope: "personal" as const,
  name: "Personal account",
  wahaSessionName: "personal",
  status: "WORKING",
}
const businessSession = {
  ...personalSession,
  id: "22222222-2222-4222-8222-222222222222",
  accountScope: "business" as const,
  name: "Business account",
  wahaSessionName: "business",
}

function repository(grants: readonly string[] = ["admin"]): ScopedSessionRepository & {
  readonly grantedInputs: { userId: string; sessionId: string; scope: string }[]
} {
  const sessions = [personalSession, businessSession]
  const grantedInputs: { userId: string; sessionId: string; scope: string }[] = []
  return {
    list: async (scope) => sessions.filter((session) => session.accountScope === scope),
    find: async (id, scope) =>
      sessions.find((session) => session.id === id && session.accountScope === scope) ?? null,
    hasGrant: async (userId, sessionId, scope) =>
      grants.includes(userId) &&
      sessions.some((session) => session.id === sessionId && session.accountScope === scope),
    saveStatus: async () => undefined,
    statusHistory: async () => [
      { status: "STARTING", observedAt: "2026-08-16T11:00:00Z" },
      { status: "WORKING", observedAt: "2026-08-16T11:01:00Z" },
    ],
    create: async (input) => ({
      ...personalSession,
      id: "99999999-9999-4999-8999-999999999999",
      ...input,
    }),
    createGrant: async (input) => {
      grantedInputs.push(input)
    },
    grantedInputs,
  }
}

function client() {
  return {
    sessions: async () => [
      { name: "personal", status: "WORKING", presence: {}, timestamps: { activity: null } },
    ],
    chats: async () => [
      {
        id: { server: "g.us", user: "120363162617804781", _serialized: "120363162617804781@g.us" },
        name: "Ops Group",
        isGroup: true,
        lastMessage: { _data: { secret: "redact" } },
      },
      {
        id: { server: "lid", user: "239629714329822", _serialized: "239629714329822@lid" },
        isGroup: false,
      },
    ],
    session: async () => ({
      name: "personal",
      status: "SCAN_QR_CODE",
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
    remove: async () => undefined,
    qr: async () => ({ value: "data:image/png;base64,qr-image-bytes" }),
    requestPairingCode: async () => undefined,
    passkeyChallenge: async () => ({ challenge: "challenge" }),
    passkeyAssertion: async () => undefined,
    passkeyConfirmation: async () => ({ code: "123456" }),
    confirmPasskey: async () => undefined,
    me: async () => ({ id: "phone-id", pushname: "Safe name" }),
    timelock: async () => ({ locked: true, until: "2026-08-16T12:00:00Z" }),
    capping: async () => ({ remaining: 4, resetAt: "2026-08-16T12:00:00Z" }),
  }
}

describe("scoped WAHA session lifecycle", () => {
  it("lists only sessions in the requested scope and exposes safety state without credentials", async () => {
    // Given an Admin with Personal and Business sessions and a server-side client
    const service = createScopedSessionService({
      repository: repository(),
      clientFor: () => client(),
    })

    // When the Admin lists Personal sessions
    const result = await service.list(admin, "personal")

    // Then only Personal data and safe status fields are returned
    expect(result).toEqual([
      expect.objectContaining({
        id: personalSession.id,
        accountScope: "personal",
        status: "WORKING",
      }),
    ])
    expect(JSON.stringify(result)).not.toContain("apiKey")
    expect(JSON.stringify(result)).not.toContain("qr-value")
  })

  it("denies an ungranted Viewer and rejects cross-scope access", async () => {
    // Given a Viewer with no grant and a Personal service
    const service = createScopedSessionService({
      repository: repository([]),
      clientFor: () => client(),
    })

    // When the Viewer requests a Personal session and a Business session through the Personal scope
    const denied = service.get(viewer, personalSession.id, "personal")
    const crossScope = service.get(viewer, businessSession.id, "personal")

    // Then both requests are safely denied
    await expect(denied).rejects.toMatchObject({ code: "forbidden" })
    await expect(crossScope).rejects.toMatchObject({ code: "forbidden" })
  })

  it("allows Operator start but requires Admin confirmation for logout and delete", async () => {
    // Given an Operator and an Admin with a granted Personal session
    const service = createScopedSessionService({
      repository: repository(["operator", "admin"]),
      clientFor: () => client(),
    })

    // When the Operator starts the session and attempts destructive actions
    await expect(
      service.lifecycle(operator, personalSession.id, "personal", "start"),
    ).resolves.toMatchObject({ status: "STARTING" })
    await expect(
      service.lifecycle(operator, personalSession.id, "personal", "logout", false),
    ).rejects.toMatchObject({ code: "confirmation_required" })
    await expect(
      service.lifecycle(operator, personalSession.id, "personal", "delete", true),
    ).rejects.toMatchObject({ code: "role_denied" })

    // Then an Admin can confirm logout
    await expect(
      service.lifecycle(admin, personalSession.id, "personal", "logout", true),
    ).resolves.toMatchObject({ status: "STOPPED" })
  })

  it("returns linking parity and visible timelock/capping state", async () => {
    // Given a granted Admin session in a QR and safety-gated state
    const service = createScopedSessionService({
      repository: repository(),
      clientFor: () => client(),
    })

    // When the dashboard requests identity, QR, pairing, passkey, and safety surfaces
    const [metadata, qr, timelock, capping, history] = await Promise.all([
      service.metadata(admin, personalSession.id, "personal"),
      service.qr(admin, personalSession.id, "personal"),
      service.timelock(admin, personalSession.id, "personal"),
      service.capping(admin, personalSession.id, "personal"),
      service.history(admin, personalSession.id, "personal"),
    ])

    // Then responses are typed, redacted, and do not treat WORKING as unrestricted sending
    expect(metadata).toEqual({ id: "phone-id", pushname: "Safe name" })
    expect(qr).toEqual({ value: "data:image/png;base64,qr-image-bytes" })
    expect(timelock).toEqual({ locked: true, until: "2026-08-16T12:00:00Z" })
    expect(capping).toEqual({ remaining: 4, resetAt: "2026-08-16T12:00:00Z" })
    expect(history).toHaveLength(2)
  })

  it("grants the creating Admin the linked session", async () => {
    // Given an Admin linking a new session through an active connection
    const repo = repository()
    const service = createScopedSessionService({
      repository: repo,
      clientFor: () => client(),
      clientForConnection: async () => client(),
    })

    // When the Admin creates the session
    const created = await service.create(
      admin,
      "personal",
      {
        connectionId: "connection-1",
        name: "New link",
        wahaSessionName: "new-link",
      },
      JSON.stringify({ name: "new-link" }),
    )

    // Then the creator receives a grant for the created session
    expect(repo.grantedInputs).toEqual([
      { userId: "admin", sessionId: created.id, scope: "personal" },
    ])
  })

  it("lists provider chats as a redacted safe directory", async () => {
    // Given a granted Admin session backed by a provider with chats
    const service = createScopedSessionService({
      repository: repository(),
      clientFor: () => client(),
    })

    // When the dashboard requests the chat directory
    const chats = await service.chats(admin, personalSession.id, "personal")

    // Then only safe directory fields return and message content never does
    expect(chats).toEqual([
      { id: "120363162617804781@g.us", name: "Ops Group", isGroup: true },
      { id: "239629714329822@lid", name: null, isGroup: false },
    ])
    expect(JSON.stringify(chats)).not.toContain("redact")
  })
})
