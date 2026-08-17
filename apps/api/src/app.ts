import cors from "@fastify/cors"
import { createEnvelopeCipher } from "@waha-command-center/config"
import Fastify, { type FastifyInstance } from "fastify"
import { z } from "zod"

import { createConfiguredSessionService } from "./app-session-service"
import { AdminService } from "./auth/admin"
import { registerAuthRoutes } from "./auth/http"
import { AuthService } from "./auth/service"
import { BackupFormatError } from "./backup/format"
import { BackupRepositoryError, createBackupRepository } from "./backup/repository"
import type { DatabaseHandle } from "./db/client"
import { createRepositories } from "./db/repositories"
import { RetentionPreviewMismatchError } from "./db/repositories/retention"
import type { createMessagingService } from "./messaging"
import { registerMessagingRoutes } from "./messaging-http"
import { createConfiguredMessagingService } from "./messaging-runtime"
import { registerNotificationRoutes } from "./notifications/http"
import { createNotificationService } from "./notifications/service"
import { registerRetentionRoutes } from "./retention/http"
import {
  createRetentionService,
  PurgeConfirmationRequiredError,
  PurgePreviewTokenError,
  RetentionPolicyMissingError,
} from "./retention/service"
import { registerSessionRoutes } from "./waha/session-http"
import type { createScopedSessionService } from "./waha/sessions"
import {
  isMalformedWahaWebhookBodyError,
  isOversizedWahaWebhookBodyError,
  registerWahaWebhookRoutes,
} from "./waha/webhook-http"

type AuditCallback = (input: {
  readonly actorUserId?: string
  readonly action: string
  readonly subjectType: string
  readonly subjectId: string
  readonly accountScope: "personal" | "business"
}) => Promise<void>

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
  const audit: AuditCallback = async (input) => {
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
  const retention = createRetentionService({ repository: repositories.retentionPolicies, audit })
  const backupRepository = createBackupRepository(database.sql)
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
    if (error instanceof BackupFormatError || error instanceof BackupRepositoryError)
      return reply.code(400).send({ error: "invalid backup" })
    if (error instanceof PurgeConfirmationRequiredError)
      return reply.code(409).send({ error: "confirmation_required" })
    if (error instanceof RetentionPolicyMissingError)
      return reply.code(409).send({ error: "policy_missing" })
    if (error instanceof RetentionPreviewMismatchError)
      return reply.code(409).send({ error: "preview_stale" })
    if (error instanceof PurgePreviewTokenError)
      return reply.code(409).send({ error: "preview_stale" })
    return reply.code(500).send({ error: "internal error" })
  })
  app.get("/health", async () => ({ status: "ok" }))
  const sessionService =
    options.sessionService ?? createConfiguredSessionService(repositories, audit)
  registerAuthRoutes(app, auth, admin, {
    includeScopedSessionCompatibility: !sessionService,
  })
  if (sessionService) registerSessionRoutes(app, auth, sessionService)
  if (configuredMessagingService) registerMessagingRoutes(app, auth, configuredMessagingService)
  if (configuredNotificationService)
    registerNotificationRoutes(app, auth, admin, configuredNotificationService)
  registerRetentionRoutes(
    app,
    auth,
    admin,
    retention,
    backupRepository,
    webhookEnvironment.ENCRYPTION_MASTER_KEY
      ? Buffer.from(webhookEnvironment.ENCRYPTION_MASTER_KEY, "base64")
      : undefined,
    audit,
  )
  return app
}
