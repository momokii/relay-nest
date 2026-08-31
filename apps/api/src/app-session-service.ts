import {
  createEnvelopeCipher,
  EnvelopeEncryptionError,
  resolveEncryptionMasterKey,
} from "@waha-command-center/config"
import { z } from "zod"

import { createWahaClient } from "./waha/adapter"
import type { SessionStatusHistoryEntry } from "./waha/session-types"
import {
  createScopedSessionService,
  type StoredSession,
  WahaConnectionUnavailableError,
} from "./waha/sessions"

type AuditCallback = (input: {
  readonly actorUserId?: string
  readonly action: string
  readonly subjectType: string
  readonly subjectId: string
  readonly accountScope: "personal" | "business"
}) => Promise<void>

type Repositories = ReturnType<typeof import("./db/repositories").createRepositories>
type ConfiguredSessionServiceOptions = Readonly<{ allowLoopbackWaha?: boolean }>

export function createConfiguredSessionService(
  repositories: Repositories,
  audit: AuditCallback,
  options: ConfiguredSessionServiceOptions = {},
) {
  const masterKey = resolveEncryptionMasterKey(process.env)
  if (!masterKey) return undefined
  const cipher = createEnvelopeCipher(masterKey)
  const clientForConnection = async (connectionId: string) => {
    const connection = await repositories.wahaConnections.findById(connectionId)
    if (!connection) throw new WahaConnectionUnavailableError()
    const apiKey = cipher.decrypt(
      {
        version: 1,
        algorithm: "aes-256-gcm",
        ciphertext: connection.apiKeyCiphertext,
        nonce: connection.apiKeyNonce,
        authTag: connection.apiKeyAuthTag,
      },
      { accountScope: "personal" },
    )
    return createWahaClient({
      baseUrl: connection.baseUrl,
      apiKey,
      allowLoopback: options.allowLoopbackWaha ?? false,
    })
  }
  const clientFor = (session: StoredSession) => clientForConnection(session.connectionId)
  const statusHistory = async (
    sessionId: string,
    accountScope: "personal" | "business",
  ): Promise<readonly SessionStatusHistoryEntry[]> => {
    const events = await repositories.normalizedEvents.listForSession(sessionId, accountScope)
    const entries: SessionStatusHistoryEntry[] = []
    for (const event of events) {
      if (event.eventType !== "session.status") continue
      try {
        const payload = JSON.parse(
          cipher.decrypt(
            {
              version: 1,
              algorithm: "aes-256-gcm",
              ciphertext: event.payloadCiphertext,
              nonce: event.payloadNonce,
              authTag: event.payloadAuthTag,
            },
            { accountScope },
          ),
        )
        const parsed = z.object({ status: z.string().min(1) }).safeParse(payload)
        if (parsed.success)
          entries.push({ status: parsed.data.status, observedAt: event.occurredAt.toISOString() })
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof EnvelopeEncryptionError) continue
        throw error
      }
    }
    return entries
  }
  return createScopedSessionService({
    webhookBaseUrl: process.env["WAHA_WEBHOOK_BASE_URL"],
    repository: {
      list: (scope) => repositories.sessions.list(scope),
      find: (id, scope) => repositories.sessions.find(id, scope),
      hasGrant: async (userId, sessionId, scope) =>
        Boolean(await repositories.sessionGrants.find(userId, sessionId, scope)),
      saveStatus: (id, scope, status, observedAt = new Date()) =>
        repositories.sessions.updateStatus(id, scope, status, observedAt),
      create: async (input) => {
        const created = await repositories.sessions.create(input)
        if (!created) throw new WahaConnectionUnavailableError()
        return created
      },
      createGrant: async (input) => {
        await repositories.sessionGrants.create({
          userId: input.userId,
          sessionId: input.sessionId,
          accountScope: input.scope,
        })
      },
      update: (id, scope, input) => repositories.sessions.update(id, scope, input),
      remove: (id, scope) => repositories.sessions.remove(id, scope),
      statusHistory,
    },
    clientFor,
    clientForConnection,
    audit,
  })
}
