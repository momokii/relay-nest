import type {
  WahaCapping,
  WahaChat,
  WahaContact,
  WahaMessage,
  WahaMetadata,
  WahaPasskeyChallenge,
  WahaPasskeyConfirmation,
  WahaQrResponse,
  WahaSession,
  WahaTimelock,
} from "@waha-command-center/waha-contracts"

import type { AccountScope } from "../db/schema/shared"

export type {
  WahaCapping,
  WahaContact,
  WahaMessage,
  WahaMetadata,
  WahaPasskeyChallenge,
  WahaPasskeyConfirmation,
  WahaQrResponse,
  WahaTimelock,
} from "@waha-command-center/waha-contracts"

export type SessionChatActivityView = {
  readonly preview: string | null
  readonly at: string | null
  readonly fromMe: boolean | null
}

export type SessionChatView = {
  readonly phone: string | null
  readonly name: string | null
  readonly isGroup: boolean
  readonly lastActivity: SessionChatActivityView | null
  readonly ref: string | null
}

export type SessionChatMessageView = {
  readonly id: string | null
  readonly at: string | null
  readonly direction: "in" | "out" | "unknown"
  readonly preview: string | null
  readonly hasMedia: boolean
  readonly mimetype: string | null
  readonly sender: string | null
}

export type ChatRefCodec = {
  readonly seal: (chatId: string, scope: AccountScope) => string
  readonly open: (ref: string, scope: AccountScope) => string | null
}

export type StoredSession = {
  readonly id: string
  readonly connectionId: string
  readonly accountScope: AccountScope
  readonly name: string
  readonly wahaSessionName: string
  readonly status: string
}

export type NewSession = Omit<StoredSession, "id" | "status" | "accountScope"> & {
  readonly status?: string | undefined
}

export type SessionStatusHistoryEntry = {
  readonly status: string
  readonly observedAt: string
}

export type ScopedSessionRepository = {
  readonly list: (scope: AccountScope) => Promise<readonly StoredSession[]>
  readonly find: (id: string, scope: AccountScope) => Promise<StoredSession | null>
  readonly hasGrant: (userId: string, sessionId: string, scope: AccountScope) => Promise<boolean>
  readonly saveStatus: (
    id: string,
    scope: AccountScope,
    status: string,
    observedAt?: Date,
  ) => Promise<void>
  readonly statusHistory?: (
    id: string,
    scope: AccountScope,
  ) => Promise<readonly SessionStatusHistoryEntry[]>
  readonly create?: (input: Omit<StoredSession, "id">) => Promise<StoredSession>
  readonly createGrant?: (input: {
    readonly userId: string
    readonly sessionId: string
    readonly scope: AccountScope
  }) => Promise<void>
  readonly update?: (
    id: string,
    scope: AccountScope,
    input: Partial<StoredSession>,
  ) => Promise<StoredSession | null>
  readonly remove?: (id: string, scope: AccountScope) => Promise<void>
}

export type WahaSessionClient = {
  readonly sessions: () => Promise<readonly WahaSession[]>
  readonly session: (name: string) => Promise<WahaSession>
  readonly createSession: (body: string) => Promise<WahaSession>
  readonly updateSession: (name: string, body: string) => Promise<WahaSession>
  readonly remove: (name: string) => Promise<unknown>
  readonly start: (name: string) => Promise<WahaSession>
  readonly stop: (name: string) => Promise<WahaSession>
  readonly restart: (name: string) => Promise<WahaSession>
  readonly logout: (name: string) => Promise<WahaSession>
  readonly qr: (name: string, format: "image") => Promise<WahaQrResponse>
  readonly requestPairingCode: (name: string, phoneNumber: string) => Promise<unknown>
  readonly passkeyChallenge: (name: string) => Promise<WahaPasskeyChallenge>
  readonly passkeyAssertion: (name: string, body: string) => Promise<unknown>
  readonly passkeyConfirmation: (name: string) => Promise<WahaPasskeyConfirmation>
  readonly confirmPasskey: (name: string) => Promise<unknown>
  readonly me: (name: string) => Promise<WahaMetadata>
  readonly chats: (name: string) => Promise<readonly WahaChat[]>
  readonly messages: (name: string, chatId: string, signal?: AbortSignal) => Promise<WahaMessage[]>
  readonly message: (
    name: string,
    chatId: string,
    messageId: string,
    signal?: AbortSignal,
  ) => Promise<import("@waha-command-center/waha-contracts").WahaSingleMessage>
  readonly downloadFile: (
    path: string,
    signal?: AbortSignal,
  ) => Promise<{ buffer: ArrayBuffer; contentType: string | null }>
  readonly timelock: (name: string) => Promise<WahaTimelock>
  readonly capping: (name: string) => Promise<WahaCapping>
  readonly checkExists: (
    name: string,
    phoneNumber: string,
  ) => Promise<{
    readonly numberExists: boolean
    readonly chatId?: string | undefined
  }>
  readonly contact: (name: string, contactId: string) => Promise<WahaContact>
  readonly sendText: (
    name: string,
    chatId: string,
    text: string,
  ) => Promise<{ readonly id: string }>
}

export const SESSION_LIFECYCLE_ACTIONS = ["start", "stop", "restart", "logout", "delete"] as const
export type SessionLifecycleAction = (typeof SESSION_LIFECYCLE_ACTIONS)[number]

export class ScopedSessionError extends Error {
  readonly name = "ScopedSessionError"

  constructor(
    readonly code: "forbidden" | "role_denied" | "confirmation_required" | "unsupported",
  ) {
    super(code)
  }
}

export class WahaConnectionUnavailableError extends Error {
  readonly name = "WahaConnectionUnavailableError"
}

export type SessionView = {
  readonly id: string
  readonly accountScope: AccountScope
  readonly name: string
  readonly status: string
  readonly serviceHealth: "unknown"
  readonly sendingReadiness: "unknown"
}
