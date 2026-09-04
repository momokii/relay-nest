import { describe, expect, it } from "vitest"
import type { UserRole } from "../apps/api/src/auth/authorization"
import type { AuthPrincipal } from "../apps/api/src/auth/service"
import type { AccountScope } from "../apps/api/src/db/schema/shared"
import {
  createScopedSessionService,
  type ScopedSessionRepository,
} from "../apps/api/src/waha/sessions"
import { createEnvelopeCipher, EnvelopeEncryptionError } from "../packages/config/src/index"

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
      {
        id: { server: "c.us", user: "628123456789", _serialized: "628123456789@c.us" },
        name: "Example Contact",
        isGroup: false,
      },
    ],
    contact: async (_name: string, contactId: string) => {
      if (contactId === "239629714329822@lid")
        return { id: "628987654321@c.us", number: "239629714329822" }
      throw new Error("unexpected contact lookup")
    },
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
    messages: async () => [],
    timelock: async () => ({ locked: true, until: "2026-08-16T12:00:00Z" }),
    capping: async () => ({ remaining: 4, resetAt: "2026-08-16T12:00:00Z" }),
  }
}

function stubChatRef() {
  return {
    seal: (chatId: string) => `ref-${chatId}`,
    open: (ref: string) => (ref.startsWith("ref-") ? ref.slice("ref-".length) : null),
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

  it("injects a signed webhook config when a webhook base url is configured", async () => {
    // Given a session service pointed at an API webhook ingest base URL
    const bodies: string[] = []
    const baseClient = client()
    const capturingClient = {
      ...baseClient,
      createSession: async (body: string) => {
        bodies.push(body)
        return baseClient.createSession(body)
      },
      updateSession: async (name: string, body: string) => {
        bodies.push(body)
        return baseClient.updateSession(name, body)
      },
    }
    const service = createScopedSessionService({
      repository: repository(),
      clientFor: () => capturingClient,
      clientForConnection: async () => capturingClient,
      webhookBaseUrl: "http://api:3000",
    })

    // When the Admin creates and updates sessions
    await service.create(
      admin,
      "personal",
      {
        connectionId: "connection-1",
        name: "Webhook link",
        wahaSessionName: "webhook-link",
      },
      JSON.stringify({ name: "webhook-link" }),
    )
    await service.update(
      admin,
      personalSession.id,
      "personal",
      JSON.stringify({ status: "WORKING" }),
    )

    // Then each provider body carries the scoped ingest URL for its own session
    const urls = bodies.map(
      (body) =>
        (JSON.parse(body) as { config?: { webhooks?: { url: string }[] } }).config?.webhooks?.[0]
          ?.url,
    )
    expect(urls).toEqual([
      "http://api:3000/api/webhooks/waha/personal/webhook-link",
      "http://api:3000/api/webhooks/waha/personal/personal",
    ])
    for (const body of bodies) {
      const events = (JSON.parse(body) as { config?: { webhooks?: { events: string[] }[] } }).config
        ?.webhooks?.[0]?.events
      expect(events).toEqual([
        "message",
        "message.any",
        "message.ack",
        "message.reaction",
        "session.status",
      ])
    }
  })

  it("leaves provider bodies untouched without a webhook base url", async () => {
    // Given a session service without webhook ingestion configured
    const bodies: string[] = []
    const baseClient = client()
    const capturingClient = {
      ...baseClient,
      createSession: async (body: string) => {
        bodies.push(body)
        return baseClient.createSession(body)
      },
    }
    const service = createScopedSessionService({
      repository: repository(),
      clientFor: () => capturingClient,
      clientForConnection: async () => capturingClient,
    })

    // When the Admin creates a session
    await service.create(
      admin,
      "personal",
      {
        connectionId: "connection-1",
        name: "Plain link",
        wahaSessionName: "plain-link",
      },
      JSON.stringify({ name: "plain-link" }),
    )

    // Then the provider body stays exactly as submitted
    expect(JSON.parse(bodies[0] ?? "{}")).toEqual({ name: "plain-link" })
  })

  it("lists provider chats as a redacted safe directory", async () => {
    // Given a granted Admin session backed by a provider with chats
    const service = createScopedSessionService({
      repository: repository(),
      clientFor: () => client(),
    })

    // When the dashboard requests the chat directory
    const chats = await service.chats(admin, personalSession.id, "personal")

    // Then only safe directory fields return and provider identifiers/content never do
    expect(chats).toEqual([
      {
        phone: null,
        name: "Ops Group",
        isGroup: true,
        lastActivity: { preview: null, at: null, fromMe: null },
        ref: null,
      },
      { phone: "+628987654321", name: null, isGroup: false, lastActivity: null, ref: null },
      {
        phone: "+628123456789",
        name: "Example Contact",
        isGroup: false,
        lastActivity: null,
        ref: null,
      },
    ])
    expect(JSON.stringify(chats)).not.toContain("redact")
    expect(JSON.stringify(chats)).not.toContain("120363162617804781@g.us")
    expect(JSON.stringify(chats)).not.toContain("239629714329822@lid")
  })

  it("truncates long multiline previews and keeps missing activity null", async () => {
    // Given a directory whose chats carry a long multiline body and no activity at all
    const longBody = `${"A".repeat(200)}\nsecond line that must never leak`
    const activityClient = {
      ...client(),
      chats: async () => [
        {
          id: { server: "c.us", user: "628123456789", _serialized: "628123456789@c.us" },
          name: "Long preview",
          isGroup: false,
          lastMessage: { body: longBody, timestamp: 1757000000, fromMe: true },
        },
        {
          id: { server: "c.us", user: "628123456780", _serialized: "628123456780@c.us" },
          name: "Quiet chat",
          isGroup: false,
        },
      ],
    }
    const service = createScopedSessionService({
      repository: repository(),
      clientFor: () => activityClient,
    })

    // When the dashboard requests the chat directory
    const chats = await service.chats(admin, personalSession.id, "personal")

    // Then the preview is the trimmed first line truncated to 90 chars and absent activity stays null
    expect(chats).toEqual([
      {
        phone: "+628123456789",
        name: "Long preview",
        isGroup: false,
        lastActivity: {
          preview: `${"A".repeat(90)}…`,
          at: "2025-09-04T15:33:20.000Z",
          fromMe: true,
        },
        ref: null,
      },
      { phone: "+628123456780", name: "Quiet chat", isGroup: false, lastActivity: null, ref: null },
    ])
    expect(JSON.stringify(chats)).not.toContain("second line")
    expect(JSON.stringify(chats)).not.toContain("A".repeat(120))
  })

  it("keeps failed lid lookups unavailable without querying groups or c.us chats", async () => {
    // Given a directory containing group, c.us, valid lid, malformed lid, and failed lid chats
    const contactIds: string[] = []
    const baseClient = client()
    const directoryClient = {
      ...baseClient,
      chats: async () => [
        {
          id: { _serialized: "group@g.us" },
          name: "Group",
          isGroup: true,
        },
        {
          id: { _serialized: "628123456789@c.us" },
          name: "C.us contact",
          isGroup: false,
        },
        {
          id: { _serialized: "valid@lid" },
          name: "Valid lid",
          isGroup: false,
        },
        {
          id: { _serialized: "malformed@lid" },
          name: "Malformed lid",
          isGroup: false,
        },
        {
          id: { _serialized: "failed@lid" },
          name: "Failed lid",
          isGroup: false,
        },
        {
          id: { _serialized: "239629714329822@lid" },
          name: "Echo lid",
          isGroup: false,
        },
      ],
      contact: async (_name: string, contactId: string) => {
        contactIds.push(contactId)
        if (contactId === "valid@lid")
          return { id: "628987654321@c.us", number: contactId.slice(0, -4) }
        if (contactId === "malformed@lid") return { id: contactId, number: "not-a-phone" }
        if (contactId === "239629714329822@lid")
          return { id: contactId, number: contactId.slice(0, -4) }
        throw new Error("lookup failed")
      },
    }
    const service = createScopedSessionService({
      repository: repository(),
      clientFor: () => directoryClient,
    })

    // When the dashboard requests the chat directory
    const chats = await service.chats(admin, personalSession.id, "personal")

    // Then only valid returned numbers are enabled and the original order is preserved
    expect(chats).toEqual([
      { phone: null, name: "Group", isGroup: true, lastActivity: null, ref: null },
      {
        phone: "+628123456789",
        name: "C.us contact",
        isGroup: false,
        lastActivity: null,
        ref: null,
      },
      { phone: "+628987654321", name: "Valid lid", isGroup: false, lastActivity: null, ref: null },
      { phone: null, name: "Malformed lid", isGroup: false, lastActivity: null, ref: null },
      { phone: null, name: "Failed lid", isGroup: false, lastActivity: null, ref: null },
      { phone: null, name: "Echo lid", isGroup: false, lastActivity: null, ref: null },
    ])
    expect(contactIds).toEqual(["valid@lid", "malformed@lid", "failed@lid", "239629714329822@lid"])
    expect(JSON.stringify(chats)).not.toContain("@g.us")
    expect(JSON.stringify(chats)).not.toContain("@c.us")
    expect(JSON.stringify(chats)).not.toContain("@lid")
  })

  it("seals an opaque ref into every directory row when a codec is provided", async () => {
    // Given a granted Admin session whose service carries a chat ref codec
    const service = createScopedSessionService({
      repository: repository(),
      clientFor: () => client(),
      chatRef: stubChatRef(),
    })

    // When the dashboard requests the chat directory
    const chats = await service.chats(admin, personalSession.id, "personal")

    // Then each row carries exactly the codec output for its serialized chat id
    expect(chats.map((chat) => chat.ref)).toEqual([
      "ref-120363162617804781@g.us",
      "ref-239629714329822@lid",
      "ref-628123456789@c.us",
    ])
    expect(JSON.stringify(chats)).not.toContain("redact")
    expect(JSON.stringify(chats)).not.toContain("_data")
  })

  it("keeps real sealed refs free of raw provider chat ids and scope-bound", async () => {
    // Given a codec backed by the production envelope cipher
    const cipher = createEnvelopeCipher(Buffer.from("0123456789abcdef0123456789abcdef", "utf8"))
    const chatRef = {
      seal: (chatId: string, scope: AccountScope): string =>
        Buffer.from(
          JSON.stringify(cipher.encrypt(chatId, { accountScope: scope })),
          "utf8",
        ).toString("base64url"),
      open: (ref: string, scope: AccountScope): string | null => {
        try {
          return cipher.decrypt(JSON.parse(Buffer.from(ref, "base64url").toString("utf8")), {
            accountScope: scope,
          })
        } catch (error) {
          if (error instanceof SyntaxError || error instanceof EnvelopeEncryptionError) return null
          throw error
        }
      },
    }
    const service = createScopedSessionService({
      repository: repository(),
      clientFor: () => client(),
      chatRef,
    })

    // When the dashboard requests the chat directory
    const chats = await service.chats(admin, personalSession.id, "personal")
    const serialized = JSON.stringify(chats)

    // Then refs are opaque: no raw ids or provider suffixes appear, and opening is scope-bound
    expect(chats.every((chat) => typeof chat.ref === "string" && chat.ref.length > 0)).toBe(true)
    expect(serialized).not.toContain("@g.us")
    expect(serialized).not.toContain("@c.us")
    expect(serialized).not.toContain("@lid")
    expect(serialized).not.toContain("120363162617804781")
    const groupRef = chats[0]?.ref ?? ""
    expect(chatRef.open(groupRef, "personal")).toBe("120363162617804781@g.us")
    expect(chatRef.open(groupRef, "business")).toBe(null)
  })

  it("maps provider chat messages into a redacted bounded preview list", async () => {
    // Given a granted session whose provider returns varied recent messages
    const messageCalls: string[] = []
    const historyClient = {
      ...client(),
      messages: async (name: string, chatId: string) => {
        messageCalls.push(`${name}:${chatId}`)
        return [
          { body: "first line\nsecond line secret", timestamp: 1757000000, fromMe: true },
          { body: "B".repeat(300), timestamp: 1757000001, fromMe: false },
          { hasMedia: true, timestamp: 1757000002 },
          { body: "no timestamp message" },
          { body: "E".repeat(280), timestamp: 1757000003, fromMe: false },
        ]
      },
    }
    const service = createScopedSessionService({
      repository: repository(),
      clientFor: () => historyClient,
      chatRef: stubChatRef(),
    })

    // When the sealed ref is opened for the chat history
    const messages = await service.messages(
      admin,
      personalSession.id,
      "personal",
      "ref-628123456789@c.us",
    )

    // Then previews are first-line, media-aware, truncated, and direction/time are safe
    expect(messages).toEqual([
      { at: "2025-09-04T15:33:20.000Z", direction: "out", preview: "first line" },
      { at: "2025-09-04T15:33:21.000Z", direction: "in", preview: `${"B".repeat(280)}…` },
      { at: "2025-09-04T15:33:22.000Z", direction: "unknown", preview: "[media]" },
      { at: null, direction: "unknown", preview: "no timestamp message" },
      { at: "2025-09-04T15:33:23.000Z", direction: "in", preview: "E".repeat(280) },
    ])
    expect(messageCalls).toEqual(["personal:628123456789@c.us"])
    expect(JSON.stringify(messages)).not.toContain("second line secret")
    expect(JSON.stringify(messages)).not.toContain("@c.us")
  })

  it("rejects unknown or tampered chat refs as forbidden", async () => {
    // Given a service whose codec cannot open the presented ref
    const service = createScopedSessionService({
      repository: repository(),
      clientFor: () => client(),
      chatRef: { seal: (chatId) => `ref-${chatId}`, open: () => null },
    })
    const withoutCodec = createScopedSessionService({
      repository: repository(),
      clientFor: () => client(),
    })

    // When chat history is requested with a tampered ref, or no codec exists at all
    const tampered = service.messages(admin, personalSession.id, "personal", "tampered-ref")
    const unopened = withoutCodec.messages(admin, personalSession.id, "personal", "ref-anything")

    // Then both requests are denied before any provider call
    await expect(tampered).rejects.toMatchObject({ code: "forbidden" })
    await expect(unopened).rejects.toMatchObject({ code: "forbidden" })
  })

  it("denies an ungranted viewer from chat history", async () => {
    // Given a Viewer without a session grant but a codec that would open any ref
    const service = createScopedSessionService({
      repository: repository([]),
      clientFor: () => client(),
      chatRef: { seal: (chatId) => `ref-${chatId}`, open: () => "628123456789@c.us" },
    })

    // When the Viewer requests chat history
    const denied = service.messages(viewer, personalSession.id, "personal", "ref-anything")

    // Then authorization runs before the ref is ever opened
    await expect(denied).rejects.toMatchObject({ code: "forbidden" })
  })
})
