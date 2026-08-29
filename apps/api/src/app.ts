import cors from "@fastify/cors"
import { createEnvelopeCipher, resolveEncryptionMasterKey } from "@waha-command-center/config"
import Fastify, { type FastifyInstance } from "fastify"
import { z } from "zod"
import { registerAiApprovalRoutes } from "./ai/http"
import { createAiApprovalService } from "./ai/service"
import type { AiApprovalService } from "./ai/types"
import { registerAnalyticsRoutes } from "./analytics/http"
import { createAnalyticsSource } from "./analytics/runtime"
import type { AnalyticsService } from "./analytics/service"
import { createAnalyticsService } from "./analytics/service"
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
import { registerScheduledRoutes } from "./scheduled-http"
import { registerConnectionRoutes } from "./waha/connection-http"
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

type RuntimeEnvironment = Readonly<{
  APP_ENV?: string | undefined
  NODE_ENV?: string | undefined
}>

export function resolveLoopbackWahaOption(
  requested: boolean | undefined,
  environment: RuntimeEnvironment = {
    // biome-ignore lint/complexity/useLiteralKeys: required by exactOptionalPropertyTypes for ProcessEnv.
    APP_ENV: process.env["APP_ENV"],
    // biome-ignore lint/complexity/useLiteralKeys: required by exactOptionalPropertyTypes for ProcessEnv.
    NODE_ENV: process.env["NODE_ENV"],
  },
): Readonly<{ allowLoopbackWaha?: true }> {
  if (requested !== true || environment.APP_ENV !== "test" || environment.NODE_ENV !== "test") {
    return {}
  }
  return { allowLoopbackWaha: true }
}

export function createApiApp(
  database: DatabaseHandle,
  options: {
    readonly sessionService?: ReturnType<typeof createScopedSessionService>
    readonly messagingService?: ReturnType<typeof createMessagingService>
    readonly notificationService?: ReturnType<typeof createNotificationService>
    readonly analyticsService?: AnalyticsService
    readonly aiApprovalService?: AiApprovalService
    readonly allowLoopbackWaha?: boolean
  } = {},
): FastifyInstance {
  const app = Fastify({ logger: true })
  const repositories = createRepositories(database.db)
  const audit: AuditCallback = async (input) => {
    await repositories.auditEntries.append(input)
  }
  const auth = new AuthService({ db: database.db, audit })
  const admin = new AdminService(database.db, audit)
  const loopbackOptions = resolveLoopbackWahaOption(options.allowLoopbackWaha)
  const webhookEnvironment = z
    .object({
      WAHA_WEBHOOK_SECRET: z.string().optional(),
    })
    .parse(process.env)
  const encryptionMasterKey = resolveEncryptionMasterKey(process.env)
  const configuredMessagingService =
    options.messagingService ??
    createConfiguredMessagingService(database, repositories, encryptionMasterKey, loopbackOptions)
  const configuredNotificationService =
    options.notificationService ??
    (encryptionMasterKey
      ? createNotificationService({
          repository: repositories,
          cipher: createEnvelopeCipher(encryptionMasterKey),
          audit,
        })
      : undefined)
  const configuredAnalyticsService =
    options.analyticsService ??
    (encryptionMasterKey
      ? createAnalyticsService({
          source: createAnalyticsSource(database, encryptionMasterKey),
          authorize: (principal, sessionId, scope) =>
            auth.authorize(principal, sessionId, scope, "read"),
        })
      : undefined)
  const aiApprovalService = options.aiApprovalService ?? createAiApprovalService()
  const retention = createRetentionService({ repository: repositories.retentionPolicies, audit })
  const backupRepository = createBackupRepository(database.sql)
  registerWahaWebhookRoutes(app, {
    secret: webhookEnvironment.WAHA_WEBHOOK_SECRET,
    encryptionMasterKey,
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
    options.sessionService ?? createConfiguredSessionService(repositories, audit, loopbackOptions)
  registerAuthRoutes(app, auth, admin, {
    includeScopedSessionCompatibility: !sessionService,
  })
  registerConnectionRoutes(app, auth, repositories)
  registerAiApprovalRoutes(app, auth, aiApprovalService)
  if (sessionService) registerSessionRoutes(app, auth, sessionService)
  if (configuredMessagingService) registerMessagingRoutes(app, auth, configuredMessagingService)
  registerScheduledRoutes(app, auth, repositories.scheduledJobs)
  if (configuredAnalyticsService) registerAnalyticsRoutes(app, auth, configuredAnalyticsService)
  if (configuredNotificationService)
    registerNotificationRoutes(app, auth, admin, configuredNotificationService)
  registerRetentionRoutes(app, auth, admin, retention, backupRepository, encryptionMasterKey, audit)
  return app
}
