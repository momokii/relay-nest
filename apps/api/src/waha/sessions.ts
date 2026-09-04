import type { WahaChat, WahaGroup, WahaMessage } from "@waha-command-center/waha-contracts"
import type { AuthPrincipal } from "../auth/service"
import type { AccountScope } from "../db/schema/shared"
import type {
  ChatRefCodec,
  NewSession,
  ScopedSessionRepository,
  SessionChatMessageView,
  SessionChatView,
  SessionLifecycleAction,
  SessionStatusHistoryEntry,
  SessionView,
  StoredSession,
  WahaCapping,
  WahaMetadata,
  WahaPasskeyChallenge,
  WahaPasskeyConfirmation,
  WahaQrResponse,
  WahaSessionClient,
  WahaTimelock,
} from "./session-types"
import { ScopedSessionError } from "./session-types"

export {
  type ChatRefCodec,
  type NewSession,
  ScopedSessionError,
  type ScopedSessionRepository,
  SESSION_LIFECYCLE_ACTIONS,
  type SessionChatMessageView,
  type SessionChatView,
  type SessionLifecycleAction,
  type SessionStatusHistoryEntry,
  type StoredSession,
  WahaConnectionUnavailableError,
  type WahaSessionClient,
} from "./session-types"

function isAdmin(principal: AuthPrincipal, scope: AccountScope): boolean {
  return principal.rolesByScope[scope].includes("admin")
}

function canCommand(principal: AuthPrincipal, scope: AccountScope): boolean {
  return isAdmin(principal, scope) || principal.rolesByScope[scope].includes("operator")
}

function view(session: StoredSession, status: string): SessionView {
  return {
    id: session.id,
    accountScope: session.accountScope,
    name: session.name,
    status,
    serviceHealth: "unknown",
    sendingReadiness: "unknown",
  }
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  return /^\+[1-9]\d{7,14}$/.test(phone)
    ? phone
    : /^[1-9]\d{7,14}$/.test(phone)
      ? `+${phone}`
      : null
}

const LAST_ACTIVITY_PREVIEW_LIMIT = 90
const CHAT_MESSAGE_PREVIEW_LIMIT = 280

function isPhoneLikeName(name: string | null | undefined): boolean {
  if (!name) return true
  const trimmed = name.trim()
  return /^\+?[\d\s\-()]+$/.test(trimmed) && trimmed.replace(/\D/g, "").length >= 7
}

function chatView(
  chat: WahaChat,
  phone: string | null | undefined,
  enrichedName: string | null | undefined,
  scope: AccountScope,
  chatRef: ChatRefCodec | undefined,
): SessionChatView {
  const serializedId = chat.id._serialized
  const chatPhone = serializedId.endsWith("@c.us") ? serializedId.slice(0, -"@c.us".length) : phone
  const resolvedName =
    enrichedName !== null && enrichedName !== undefined && enrichedName.trim().length > 0
      ? enrichedName
      : null
  const lastMessage = chat.lastMessage
  const firstLine = (lastMessage?.body ?? "").split("\n", 1)[0]?.trim() ?? ""
  let preview: string | null = firstLine.length > 0 ? firstLine : null
  if (preview === null && lastMessage?.hasMedia === true) preview = "[media]"
  if (preview !== null && preview.length > LAST_ACTIVITY_PREVIEW_LIMIT) {
    preview = `${preview.slice(0, LAST_ACTIVITY_PREVIEW_LIMIT)}…`
  }
  const at =
    typeof lastMessage?.timestamp === "number" && Number.isFinite(lastMessage.timestamp)
      ? new Date(lastMessage.timestamp * 1000).toISOString()
      : null
  const rawName = chat.name ?? null
  const effectiveName =
    resolvedName !== null ? resolvedName : isPhoneLikeName(rawName) ? null : rawName
  return {
    phone: normalizePhone(chatPhone),
    name: effectiveName,
    isGroup: chat.isGroup ?? false,
    lastActivity: lastMessage
      ? {
          preview,
          at,
          fromMe: typeof lastMessage.fromMe === "boolean" ? lastMessage.fromMe : null,
        }
      : null,
    ref: chatRef ? chatRef.seal(serializedId, scope) : null,
  }
}

function chatMessageView(message: WahaMessage): SessionChatMessageView {
  const firstLine = (message.body ?? "").split("\n", 1)[0]?.trim() ?? ""
  let preview: string | null = firstLine.length > 0 ? firstLine : null
  if (preview === null && message.hasMedia === true) preview = "[media]"
  if (preview !== null && preview.length > CHAT_MESSAGE_PREVIEW_LIMIT) {
    preview = `${preview.slice(0, CHAT_MESSAGE_PREVIEW_LIMIT)}…`
  }
  const raw = message as unknown as Record<string, unknown>
  // biome-ignore lint/complexity/useLiteralKeys: index signature requires bracket access
  const media = raw["media"] as { mimetype?: string } | undefined
  // biome-ignore lint/complexity/useLiteralKeys: index signature requires bracket access
  const participant = typeof raw["participant"] === "string" ? (raw["participant"] as string) : null
  // biome-ignore lint/complexity/useLiteralKeys: index signature requires bracket access
  const data = raw["_data"] as Record<string, unknown> | undefined
  // biome-ignore lint/complexity/useLiteralKeys: index signature requires bracket access
  const notifyName = typeof data?.["notifyName"] === "string" ? (data["notifyName"] as string) : null
  const rawSender = message.fromMe === true ? null : (notifyName ?? participant ?? null)
  const sender = rawSender && isPhoneLikeName(rawSender) ? null : rawSender
  return {
    // biome-ignore lint/complexity/useLiteralKeys: index signature requires bracket access
    id: typeof raw["id"] === "string" ? (raw["id"] as string) : null,
    at:
      typeof message.timestamp === "number" && Number.isFinite(message.timestamp)
        ? new Date(message.timestamp * 1000).toISOString()
        : null,
    direction: message.fromMe === true ? "out" : message.fromMe === false ? "in" : "unknown",
    preview,
    hasMedia: message.hasMedia === true,
    mimetype:
      typeof media?.mimetype === "string"
        ? media.mimetype
        : // biome-ignore lint/complexity/useLiteralKeys: index signature requires bracket access
          typeof raw["mimetype"] === "string"
          ? // biome-ignore lint/complexity/useLiteralKeys: index signature requires bracket access
            (raw["mimetype"] as string)
          : // biome-ignore lint/complexity/useLiteralKeys: index signature requires bracket access
            typeof (raw["_data"] as Record<string, unknown> | undefined)?.["mimetype"] === "string"
            ? // biome-ignore lint/complexity/useLiteralKeys: index signature requires bracket access
              ((raw["_data"] as Record<string, unknown>)["mimetype"] as string)
            : null,
    sender: sender && !isPhoneLikeName(sender) ? sender : sender,
  }
}

function contactPhone(
  contact: { readonly id: string; readonly number?: string | undefined },
  serializedId: string,
): string | null {
  const lidUser = serializedId.endsWith("@lid") ? serializedId.slice(0, -"@lid".length) : null
  const jidPhone = contact.id.endsWith("@c.us") ? contact.id.slice(0, -"@c.us".length) : null
  if (jidPhone && jidPhone !== lidUser) return jidPhone
  if (contact.number && contact.number !== lidUser) return contact.number
  return null
}

async function projectChats(
  client: WahaSessionClient,
  sessionName: string,
  chats: readonly WahaChat[],
  scope: AccountScope,
  chatRef: ChatRefCodec | undefined,
): Promise<readonly SessionChatView[]> {
  const phones = new Map<number, string | null>()
  const enrichedNames = new Map<number, string | null>()
  const lidLookups = chats
    .map((chat, index) => ({ chat, index }))
    .filter(({ chat }) => chat.isGroup !== true && chat.id._serialized.endsWith("@lid"))

  for (let offset = 0; offset < lidLookups.length; offset += 8) {
    const batch = lidLookups.slice(offset, offset + 8)
    const results = await Promise.allSettled(
      batch.map(({ chat }) => client.contact(sessionName, chat.id._serialized)),
    )
    results.forEach((result, batchIndex) => {
      const lookup = batch[batchIndex]
      if (!lookup) return
      phones.set(
        lookup.index,
        result.status === "fulfilled"
          ? contactPhone(result.value, lookup.chat.id._serialized)
          : null,
      )
      if (result.status === "fulfilled") {
        const fetchedName = result.value.name ?? result.value.pushname ?? null
        if (fetchedName && !isPhoneLikeName(fetchedName))
          enrichedNames.set(lookup.index, fetchedName)
      }
    })
  }

  const nameLookups = chats
    .map((chat, index) => ({ chat, index }))
    .filter(
      ({ chat, index }) =>
        chat.isGroup !== true && !enrichedNames.has(index) && isPhoneLikeName(chat.name ?? null),
    )

  for (let offset = 0; offset < nameLookups.length; offset += 8) {
    const batch = nameLookups.slice(offset, offset + 8)
    const results = await Promise.allSettled(
      batch.map(({ chat }) => client.contact(sessionName, chat.id._serialized)),
    )
    results.forEach((result, batchIndex) => {
      const lookup = batch[batchIndex]
      if (!lookup) return
      if (result.status === "fulfilled") {
        const fetchedName = result.value.name ?? result.value.pushname ?? null
        if (fetchedName && !isPhoneLikeName(fetchedName))
          enrichedNames.set(lookup.index, fetchedName)
      }
    })
  }

  return chats.map((chat, index) =>
    chatView(chat, phones.get(index), enrichedNames.get(index), scope, chatRef),
  )
}

function webhookConfig(
  scope: AccountScope,
  sessionName: string,
  baseUrl: string,
): Record<string, unknown> {
  return {
    webhooks: [
      {
        url: `${baseUrl}/api/webhooks/waha/${scope}/${sessionName}`,
        events: ["message", "message.any", "message.ack", "message.reaction", "session.status"],
      },
    ],
  }
}

function withWebhookConfig(
  body: string,
  scope: AccountScope,
  sessionName: string,
  baseUrl: string | undefined,
): string {
  if (!baseUrl) return body
  const parsed: unknown = JSON.parse(body)
  const record: Record<string, unknown> =
    typeof parsed === "object" && parsed !== null ? { ...parsed } : {}
  // biome-ignore lint/complexity/useLiteralKeys: index signature requires bracket access
  record["config"] = {
    // biome-ignore lint/complexity/useLiteralKeys: index signature requires bracket access
    ...(typeof record["config"] === "object" && record["config"] !== null ? record["config"] : {}),
    ...webhookConfig(scope, sessionName, baseUrl),
  }
  return JSON.stringify(record)
}

export function createScopedSessionService(options: {
  readonly repository: ScopedSessionRepository
  readonly clientFor: (session: StoredSession) => WahaSessionClient | Promise<WahaSessionClient>
  readonly clientForConnection?: (
    connectionId: string,
  ) => WahaSessionClient | Promise<WahaSessionClient>
  readonly webhookBaseUrl?: string | undefined
  readonly chatRef?: ChatRefCodec
  readonly audit?: (input: {
    readonly actorUserId: string
    readonly action: string
    readonly subjectType: string
    readonly subjectId: string
    readonly accountScope: AccountScope
  }) => Promise<void>
}) {
  const authorized = async (
    principal: AuthPrincipal,
    sessionId: string,
    scope: AccountScope,
    action: "read" | "command",
  ): Promise<StoredSession> => {
    const session = await options.repository.find(sessionId, scope)
    const granted = session
      ? await options.repository.hasGrant(principal.userId, sessionId, scope)
      : false
    if (session === null || !granted) throw new ScopedSessionError("forbidden")
    if (action === "command" && !canCommand(principal, scope))
      throw new ScopedSessionError("role_denied")
    return session
  }

  return {
    async create(
      principal: AuthPrincipal,
      scope: AccountScope,
      input: NewSession,
      body: string,
    ): Promise<SessionView> {
      if (!isAdmin(principal, scope)) throw new ScopedSessionError("role_denied")
      const client = await options.clientForConnection?.(input.connectionId)
      if (!client || !options.repository.create || !options.repository.createGrant)
        throw new ScopedSessionError("unsupported")
      const upstream = await client.createSession(
        withWebhookConfig(body, scope, input.wahaSessionName, options.webhookBaseUrl),
      )
      const stored = await options.repository.create({
        ...input,
        accountScope: scope,
        status: upstream.status,
      })
      await options.repository.createGrant({
        userId: principal.userId,
        sessionId: stored.id,
        scope,
      })
      await options.audit?.({
        actorUserId: principal.userId,
        action: "session.created",
        subjectType: "session",
        subjectId: stored.id,
        accountScope: scope,
      })
      return view(stored, upstream.status)
    },
    async update(
      principal: AuthPrincipal,
      sessionId: string,
      scope: AccountScope,
      body: string,
    ): Promise<SessionView> {
      if (!isAdmin(principal, scope)) throw new ScopedSessionError("role_denied")
      const session = await authorized(principal, sessionId, scope, "read")
      const upstream = await (await options.clientFor(session)).updateSession(
        session.wahaSessionName,
        withWebhookConfig(body, scope, session.wahaSessionName, options.webhookBaseUrl),
      )
      const stored = await options.repository.update?.(session.id, scope, {
        status: upstream.status,
      })
      await options.repository.saveStatus(session.id, scope, upstream.status, new Date())
      await options.audit?.({
        actorUserId: principal.userId,
        action: "session.updated",
        subjectType: "session",
        subjectId: session.id,
        accountScope: scope,
      })
      return view(stored ?? session, upstream.status)
    },
    async list(principal: AuthPrincipal, scope: AccountScope): Promise<readonly SessionView[]> {
      const sessions = await options.repository.list(scope)
      const visible: SessionView[] = []
      for (const session of sessions) {
        if (!(await options.repository.hasGrant(principal.userId, session.id, scope))) continue
        const upstream = (await (await options.clientFor(session)).sessions()).find(
          (candidate) => candidate.name === session.wahaSessionName,
        )
        visible.push(view(session, upstream?.status ?? session.status))
      }
      return visible
    },
    async get(
      principal: AuthPrincipal,
      sessionId: string,
      scope: AccountScope,
    ): Promise<SessionView> {
      const session = await authorized(principal, sessionId, scope, "read")
      const upstream = await (await options.clientFor(session)).session(session.wahaSessionName)
      return view(session, upstream.status)
    },
    async history(
      principal: AuthPrincipal,
      sessionId: string,
      scope: AccountScope,
    ): Promise<readonly SessionStatusHistoryEntry[]> {
      const session = await authorized(principal, sessionId, scope, "read")
      const history = await options.repository.statusHistory?.(session.id, scope)
      return history ?? []
    },
    async chats(
      principal: AuthPrincipal,
      sessionId: string,
      scope: AccountScope,
    ): Promise<readonly SessionChatView[]> {
      const session = await authorized(principal, sessionId, scope, "read")
      const client = await options.clientFor(session)
      const chats = await client.chats(session.wahaSessionName)
      return projectChats(client, session.wahaSessionName, chats, scope, options.chatRef)
    },
    async groups(
      principal: AuthPrincipal,
      sessionId: string,
      scope: AccountScope,
    ): Promise<readonly WahaGroup[]> {
      const session = await authorized(principal, sessionId, scope, "read")
      const client = await options.clientFor(session)
      return client.groups(session.wahaSessionName)
    },
    async addGroupParticipants(
      principal: AuthPrincipal,
      sessionId: string,
      scope: AccountScope,
      groupId: string,
      participantIds: readonly string[],
    ): Promise<unknown> {
      const session = await authorized(principal, sessionId, scope, "command")
      const client = await options.clientFor(session)
      return client.addGroupParticipants(session.wahaSessionName, groupId, participantIds)
    },
    async messages(
      principal: AuthPrincipal,
      sessionId: string,
      scope: AccountScope,
      ref: string,
      limit = 50,
    ): Promise<readonly SessionChatMessageView[]> {
      const session = await authorized(principal, sessionId, scope, "read")
      const chatId = options.chatRef?.open(ref, scope) ?? null
      if (chatId === null) throw new ScopedSessionError("forbidden")
      const client = await options.clientFor(session)
      const messages = await client.messages(session.wahaSessionName, chatId)
      const sliced = messages.slice(0, Math.max(0, limit))
      const initialViews = sliced.map(chatMessageView)
      const mentionLids = new Set<string>()
      for (const message of sliced) {
        const body = (message.body ?? "") as string
        for (const match of body.matchAll(/@(\d{8,})/g)) {
          const lid = match[1]
          if (lid) mentionLids.add(lid)
        }
      }
      const senderLids = new Set<string>()
      for (const view of initialViews) {
        if (view.sender?.endsWith("@lid")) {
          const lid = view.sender.slice(0, -"@lid".length)
          if (lid) senderLids.add(lid)
        }
      }
      const allLids = new Set<string>([...mentionLids, ...senderLids])
      const lidMap = new Map<string, string>()
      if (allLids.size > 0) {
        const lids = [...allLids]
        for (let offset = 0; offset < lids.length; offset += 8) {
          const batch = lids.slice(offset, offset + 8)
          const results = await Promise.allSettled(
            batch.map((lid) => client.contact(session.wahaSessionName, `${lid}@lid`)),
          )
          results.forEach((result, index) => {
            const lid = batch[index]
            if (!lid) return
            if (result.status === "fulfilled") {
              const contact = result.value
              const displayName =
                contact.name && !isPhoneLikeName(contact.name)
                  ? contact.name
                  : contact.pushname && !isPhoneLikeName(contact.pushname)
                    ? contact.pushname
                    : null
              const phone = contactPhone(contact, `${lid}@lid`)
              const normalized = phone ? normalizePhone(phone) : null
              const label = displayName ?? normalized ?? lid
              lidMap.set(lid, label)
            } else {
              lidMap.set(lid, lid)
            }
          })
        }
      }
      return initialViews.map((view) => {
        let enrichedPreview = view.preview
        let enrichedSender = view.sender
        if (lidMap.size > 0) {
          if (enrichedPreview !== null) {
            for (const [lid, label] of lidMap) {
              if (mentionLids.has(lid)) {
                enrichedPreview = enrichedPreview.split(`@${lid}`).join(`@${label}`)
              }
            }
          }
          if (enrichedSender?.endsWith("@lid")) {
            const lid = enrichedSender.slice(0, -"@lid".length)
            const label = lidMap.get(lid)
            if (label) enrichedSender = label
          }
        }
        if (enrichedPreview === view.preview && enrichedSender === view.sender) return view
        return { ...view, preview: enrichedPreview, sender: enrichedSender }
      })
    },
    async messageMedia(
      principal: AuthPrincipal,
      sessionId: string,
      scope: AccountScope,
      ref: string,
      messageId: string,
    ): Promise<{ buffer: ArrayBuffer; contentType: string | null }> {
      const session = await authorized(principal, sessionId, scope, "read")
      const chatId = options.chatRef?.open(ref, scope) ?? null
      if (chatId === null) throw new ScopedSessionError("forbidden")
      const client = await options.clientFor(session)
      const message = await client.message(session.wahaSessionName, chatId, messageId)
      const raw = message as unknown as Record<string, unknown>
      // biome-ignore lint/complexity/useLiteralKeys: index signature requires bracket access
      const media = raw["media"] as { url?: string } | undefined
      // biome-ignore lint/complexity/useLiteralKeys: index signature requires bracket access
      const mediaUrl = typeof media?.url === "string" ? media["url"] : null
      if (!mediaUrl) throw new ScopedSessionError("unsupported")
      let path: string
      try {
        path = new URL(mediaUrl).pathname
      } catch {
        path = mediaUrl
      }
      if (!path.startsWith("/api/files/")) throw new ScopedSessionError("unsupported")
      return client.downloadFile(path)
    },
    async lifecycle(
      principal: AuthPrincipal,
      sessionId: string,
      scope: AccountScope,
      action: SessionLifecycleAction,
      confirmed = false,
    ): Promise<SessionView | null> {
      const session = await authorized(principal, sessionId, scope, "command")
      if ((action === "logout" || action === "delete") && !confirmed)
        throw new ScopedSessionError("confirmation_required")
      if ((action === "logout" || action === "delete") && !isAdmin(principal, scope))
        throw new ScopedSessionError("role_denied")
      const client = await options.clientFor(session)
      if (action === "delete") {
        await client.remove(session.wahaSessionName)
        await options.repository.remove?.(session.id, scope)
        await options.audit?.({
          actorUserId: principal.userId,
          action: "session.deleted",
          subjectType: "session",
          subjectId: session.id,
          accountScope: scope,
        })
        return null
      }
      const upstream = await client[action](session.wahaSessionName)
      await options.repository.saveStatus(session.id, scope, upstream.status)
      await options.audit?.({
        actorUserId: principal.userId,
        action: `session.${action}`,
        subjectType: "session",
        subjectId: session.id,
        accountScope: scope,
      })
      return view(session, upstream.status)
    },
    async metadata(
      principal: AuthPrincipal,
      sessionId: string,
      scope: AccountScope,
    ): Promise<WahaMetadata> {
      const session = await authorized(principal, sessionId, scope, "read")
      return (await options.clientFor(session)).me(session.wahaSessionName)
    },
    async qr(
      principal: AuthPrincipal,
      sessionId: string,
      scope: AccountScope,
    ): Promise<WahaQrResponse> {
      const session = await authorized(principal, sessionId, scope, "command")
      return (await options.clientFor(session)).qr(session.wahaSessionName, "image")
    },
    async requestPairingCode(
      principal: AuthPrincipal,
      sessionId: string,
      scope: AccountScope,
      phoneNumber: string,
    ): Promise<void> {
      const session = await authorized(principal, sessionId, scope, "command")
      await (await options.clientFor(session)).requestPairingCode(
        session.wahaSessionName,
        phoneNumber,
      )
    },
    async passkeyChallenge(
      principal: AuthPrincipal,
      sessionId: string,
      scope: AccountScope,
    ): Promise<WahaPasskeyChallenge> {
      const session = await authorized(principal, sessionId, scope, "command")
      return (await options.clientFor(session)).passkeyChallenge(session.wahaSessionName)
    },
    async passkeyAssertion(
      principal: AuthPrincipal,
      sessionId: string,
      scope: AccountScope,
      body: string,
    ): Promise<void> {
      const session = await authorized(principal, sessionId, scope, "command")
      await (await options.clientFor(session)).passkeyAssertion(session.wahaSessionName, body)
    },
    async passkeyConfirmation(
      principal: AuthPrincipal,
      sessionId: string,
      scope: AccountScope,
    ): Promise<WahaPasskeyConfirmation> {
      const session = await authorized(principal, sessionId, scope, "command")
      return (await options.clientFor(session)).passkeyConfirmation(session.wahaSessionName)
    },
    async confirmPasskey(
      principal: AuthPrincipal,
      sessionId: string,
      scope: AccountScope,
    ): Promise<void> {
      const session = await authorized(principal, sessionId, scope, "command")
      await (await options.clientFor(session)).confirmPasskey(session.wahaSessionName)
    },
    async timelock(
      principal: AuthPrincipal,
      sessionId: string,
      scope: AccountScope,
    ): Promise<WahaTimelock> {
      const session = await authorized(principal, sessionId, scope, "read")
      return (await options.clientFor(session)).timelock(session.wahaSessionName)
    },
    async capping(
      principal: AuthPrincipal,
      sessionId: string,
      scope: AccountScope,
    ): Promise<WahaCapping> {
      const session = await authorized(principal, sessionId, scope, "read")
      return (await options.clientFor(session)).capping(session.wahaSessionName)
    },
  }
}
