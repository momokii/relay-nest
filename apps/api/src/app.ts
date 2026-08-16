import cors from "@fastify/cors"
import { createEnvelopeCipher, EnvelopeEncryptionError } from "@waha-command-center/config"
import Fastify, { type FastifyInstance } from "fastify"
import { z } from "zod"

import { AdminService } from "./auth/admin"
import { registerAuthRoutes } from "./auth/http"
import { AuthService } from "./auth/service"
import type { DatabaseHandle } from "./db/client"
import { createRepositories } from "./db/repositories"
import type { createMessagingService } from "./messaging"
import { registerMessagingRoutes } from "./messaging-http"
import { createConfiguredMessagingService } from "./messaging-runtime"
import { registerNotificationRoutes } from "./notifications/http"
import { createNotificationService } from "./notifications/service"
import { createWahaClient } from "./waha/adapter"
import { registerSessionRoutes } from "./waha/session-http"
import type { SessionStatusHistoryEntry } from "./waha/session-types"
import {
  createScopedSessionService,
  type StoredSession,
  WahaConnectionUnavailableError,
} from "./waha/sessions"
import {
  isMalformedWahaWebhookBodyError,
  isOversizedWahaWebhookBodyError,
  registerWahaWebhookRoutes,
} from "./waha/webhook-http"

export function createApiApp(
  database: DatabaseHandle,
  options: {
    readonly sessionService?: ReturnType<typeof createScopedSessionService>
    readonly messagingService?: ReturnType<typeof createMessagingService>
    readonly notificationService?: ReturnType<typeof createNotificationService>
  } = {},
): FastifyInstance {
  const app = Fastify({ logger: true })
  const repositories = createRepositories(database.db)
  const audit = async (input: {
    readonly actorUserId?: string
    readonly action: string
    readonly subjectType: string
    readonly subjectId: string
    readonly accountScope: "personal" | "business"
  }) => {
    await repositories.auditEntries.append(input)
  }
  const auth = new AuthService({ db: database.db, audit })
  const admin = new AdminService(database.db, audit)
  const webhookEnvironment = z
    .object({
      WAHA_WEBHOOK_SECRET: z.string().optional(),
      ENCRYPTION_MASTER_KEY: z.string().base64().optional(),
    })
    .parse(process.env)
  const configuredMessagingService =
    options.messagingService ??
    createConfiguredMessagingService(
      database,
      repositories,
      webhookEnvironment.ENCRYPTION_MASTER_KEY
        ? Buffer.from(webhookEnvironment.ENCRYPTION_MASTER_KEY, "base64")
        : undefined,
    )
  const configuredNotificationService =
    options.notificationService ??
    (webhookEnvironment.ENCRYPTION_MASTER_KEY
      ? createNotificationService({
          repository: repositories,
          cipher: createEnvelopeCipher(
            Buffer.from(webhookEnvironment.ENCRYPTION_MASTER_KEY, "base64"),
          ),
          audit,
        })
      : undefined)
  registerWahaWebhookRoutes(app, {
    secret: webhookEnvironment.WAHA_WEBHOOK_SECRET,
    encryptionMasterKey: webhookEnvironment.ENCRYPTION_MASTER_KEY
      ? Buffer.from(webhookEnvironment.ENCRYPTION_MASTER_KEY, "base64")
      : undefined,
    store: {
      findSession: (accountScope, sessionName) =>
        repositories.sessions.findByWahaSessionName(accountScope, sessionName),
      insertEvent: (input) =>
        repositories.normalizedEvents.insert({
          sessionId: input.sessionId,
          accountScope: input.accountScope,
          eventType: input.eventType,
          providerEventId: input.providerEventId,
          requestId: input.requestId,
          payloadCiphertext: input.payload.payloadCiphertext,
          payloadNonce: input.payload.payloadNonce,
          payloadAuthTag: input.payload.payloadAuthTag,
          occurredAt: input.occurredAt,
        }),
      insertEventAndUpdateDispatchState: (input, dispatch) =>
        repositories.normalizedEvents.insertAndUpdateDispatchState(
          {
            sessionId: input.sessionId,
            accountScope: input.accountScope,
            eventType: input.eventType,
            providerEventId: input.providerEventId,
            requestId: input.requestId,
            payloadCiphertext: input.payload.payloadCiphertext,
            payloadNonce: input.payload.payloadNonce,
            payloadAuthTag: input.payload.payloadAuthTag,
            occurredAt: input.occurredAt,
          },
          dispatch,
        ),
      updateSessionStatus: async (sessionId, accountScope, status, occurredAt) => {
        await repositories.sessions.updateStatus(sessionId, accountScope, status, occurredAt)
      },
      updateDispatchState: (sessionId, accountScope, providerMessageId, state) =>
        repositories.dispatchAttempts.updateState(
          sessionId,
          accountScope,
          providerMessageId,
          state,
        ),
    },
  })

  app.register(cors, { origin: false })
  app.setErrorHandler((error, request, reply) => {
    if (isMalformedWahaWebhookBodyError(error, request.url)) {
      return reply.code(400).send({ error: "invalid webhook body" })
    }
    if (isOversizedWahaWebhookBodyError(error, request.url)) {
      return reply.code(413).send({ error: "webhook body too large" })
    }
    if (error instanceof z.ZodError) return reply.code(400).send({ error: "invalid request" })
    return reply.code(500).send({ error: "internal error" })
  })
  app.get("/health", async () => ({ status: "ok" }))
  const sessionService = options.sessionService ?? createConfiguredSessionService(repositories)
  registerAuthRoutes(app, auth, admin, {
    includeScopedSessionCompatibility: !sessionService,
  })
  if (sessionService) registerSessionRoutes(app, auth, sessionService)
  if (configuredMessagingService) registerMessagingRoutes(app, auth, configuredMessagingService)
  if (configuredNotificationService)
    registerNotificationRoutes(app, auth, admin, configuredNotificationService)
  return app
}

function createConfiguredSessionService(repositories: ReturnType<typeof createRepositories>) {
  // biome-ignore lint/complexity/useLiteralKeys: required by noPropertyAccessFromIndexSignature
  const encodedKey = process.env["ENCRYPTION_MASTER_KEY"]
  const masterKey = encodedKey ? Buffer.from(encodedKey, "base64") : undefined
  if (!masterKey || masterKey.length !== 32) return undefined
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
    return createWahaClient({ baseUrl: connection.baseUrl, apiKey })
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
      update: (id, scope, input) => repositories.sessions.update(id, scope, input),
      remove: (id, scope) => repositories.sessions.remove(id, scope),
      statusHistory,
    },
    clientFor,
    clientForConnection,
  })
}
