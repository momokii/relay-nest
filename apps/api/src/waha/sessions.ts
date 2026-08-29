import type { AuthPrincipal } from "../auth/service"
import type { AccountScope } from "../db/schema/shared"
import type {
  NewSession,
  ScopedSessionRepository,
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
  type NewSession,
  ScopedSessionError,
  type ScopedSessionRepository,
  SESSION_LIFECYCLE_ACTIONS,
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

export function createScopedSessionService(options: {
  readonly repository: ScopedSessionRepository
  readonly clientFor: (session: StoredSession) => WahaSessionClient | Promise<WahaSessionClient>
  readonly clientForConnection?: (
    connectionId: string,
  ) => WahaSessionClient | Promise<WahaSessionClient>
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
      const upstream = await client.createSession(body)
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
        body,
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
    ): Promise<
      readonly { readonly id: string; readonly name: string | null; readonly isGroup: boolean }[]
    > {
      const session = await authorized(principal, sessionId, scope, "read")
      const chats = await (await options.clientFor(session)).chats(session.wahaSessionName)
      return chats.map((chat) => ({
        id: chat.id._serialized,
        name: chat.name ?? null,
        isGroup: chat.isGroup ?? false,
      }))
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
