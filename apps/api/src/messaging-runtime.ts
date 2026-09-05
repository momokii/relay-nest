import { createBlindIndex, createEnvelopeCipher } from "@waha-command-center/config"
import type { UserRole } from "./auth/authorization"
import { authorizeSessionAction } from "./auth/authorization"
import { type CampaignPrincipal, createCampaignService, createCampaignTransport } from "./campaigns"
import type { DatabaseHandle } from "./db/client"
import type { createRepositories } from "./db/repositories"
import { createMessagingRepositories } from "./db/repositories/messaging"
import { createMessagingService, isSupportedProviderChatId } from "./messaging"
import { evaluateMessagingSafety, isQuietHoursActive } from "./messaging-safety"
import { createMessagingTransport } from "./messaging-transport"
import {
  createEncryptedSchedulerRepository,
  createSchedulerService,
  createSchedulerTicker,
  type SchedulerTicker,
} from "./scheduler"
import { createWahaClient } from "./waha/adapter"

type Repositories = ReturnType<typeof createRepositories>
type ConfiguredMessagingServiceOptions = Readonly<{ allowLoopbackWaha?: boolean }>
export type ConfiguredMessagingService = ReturnType<typeof createMessagingService> & {
  readonly campaigns: ReturnType<typeof createCampaignService>
  readonly schedulerTicker: SchedulerTicker
}

export function createConfiguredMessagingService(
  database: DatabaseHandle,
  repositories: Repositories,
  masterKey: Buffer | undefined,
  options: ConfiguredMessagingServiceOptions = {},
): ConfiguredMessagingService | undefined {
  if (!masterKey || masterKey.length !== 32) return undefined
  const cipher = createEnvelopeCipher(masterKey)
  const messagingRepositories = createMessagingRepositories(database.db, masterKey)
  const encryptedScheduler = createEncryptedSchedulerRepository(
    repositories.scheduledJobs,
    masterKey,
  )

  const clientForSession = async (sessionId: string, accountScope: "personal" | "business") => {
    const session = await repositories.sessions.find(sessionId, accountScope)
    if (!session) throw new Error("messaging session was not found")
    const connection = await repositories.wahaConnections.findById(session.connectionId)
    if (!connection) throw new Error("messaging connection was not found")
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
    return {
      session,
      client: createWahaClient({
        baseUrl: connection.baseUrl,
        apiKey,
        allowLoopback: options.allowLoopbackWaha ?? false,
      }),
    }
  }

  const messagingTransport = createMessagingTransport({
    clientForSession,
    contacts: messagingRepositories.contacts,
  })
  const campaignTransport = createCampaignTransport({
    campaigns: repositories.campaigns,
    sessions: { find: (id, scope) => repositories.sessions.find(id, scope) },
    wahaForSession: async (session) =>
      (await clientForSession(session.id, session.accountScope)).client,
  })
  const scheduler = createSchedulerService({
    repository: encryptedScheduler,
    transport: async (job) => {
      const result = job.idempotencyKey.startsWith("campaign:")
        ? await campaignTransport(job)
        : await messagingTransport(job)
      await repositories.auditEntries.append({
        action: `message.dispatch_${result.state}`,
        subjectType: "dispatch_attempt",
        subjectId: job.id,
        accountScope: job.accountScope,
        sessionId: job.sessionId,
      })
      return result
    },
    gate: async (job) => {
      if (job.idempotencyKey.startsWith("campaign:")) return { allowed: true as const }
      const context = await clientForSession(job.sessionId, job.accountScope)
      const contact = await messagingRepositories.contacts.find(
        job.accountScope,
        job.sessionId,
        job.recipientPhone,
      )
      if (!contact) return { allowed: false, recoveryCode: "contact_not_found" as const }
      if (!isSupportedProviderChatId(contact.providerChatId))
        return { allowed: false, recoveryCode: "contact_not_found" as const }
      const safety = await messagingRepositories.safety.find(job.sessionId, job.accountScope)
      const stats = await repositories.scheduledJobs.safetyStats(
        job.sessionId,
        job.accountScope,
        createBlindIndex(masterKey, job.message),
        new Date(),
      )
      const [timelock, capping] = await Promise.all([
        context.client.timelock(context.session.wahaSessionName),
        context.client.capping(context.session.wahaSessionName),
      ])
      const decision = evaluateMessagingSafety(
        {
          accountScope: job.accountScope,
          sessionStatus: context.session.status,
          consentGranted: contact.consentGranted,
          optedOut: contact.optedOut,
          timelockLocked: timelock.locked === true,
          cappingRemaining: capping.remaining ?? null,
          cooldownUntil: safety?.newlyLinkedCooldownUntil ?? null,
          quietHoursActive: isQuietHoursActive(
            safety?.quietHoursStart,
            safety?.quietHoursEnd,
            new Date(),
            job.timezone,
          ),
          lastSentAt: stats.lastSentAt,
          pacingSeconds: safety?.pacingSeconds ?? 30,
          dailyCount: stats.dailyCount,
          dailyBudget: safety?.dailyBudget ?? 20,
          burstCount: stats.burstCount,
          burstLimit: safety?.burstLimit ?? 3,
          duplicateContent: stats.duplicateContent,
        },
        new Date(),
      )
      if (!decision.allowed)
        await repositories.auditEntries.append({
          action: "message.dispatch_gate_blocked",
          subjectType: "dispatch_attempt",
          subjectId: job.id,
          accountScope: job.accountScope,
          sessionId: job.sessionId,
        })
      return decision
    },
  })
  const schedulerTicker = createSchedulerTicker(scheduler)

  const authorize = async (
    principal: CampaignPrincipal,
    sessionId: string,
    accountScope: "personal" | "business",
    _action: "command" = "command",
  ) => {
    const session = await repositories.sessions.find(sessionId, accountScope)
    const grant = await repositories.sessionGrants.find(principal.userId, sessionId, accountScope)
    return authorizeSessionAction({
      principal: {
        roles: principal.roles.filter(
          (role): role is UserRole => role === "admin" || role === "operator" || role === "viewer",
        ),
      },
      accountScope,
      sessionScope: session?.accountScope ?? accountScope,
      hasGrant: Boolean(grant),
      action: "command",
      sessionActive: session?.status !== "disabled",
    })
  }
  const messagingService = createMessagingService({
    authorize,
    sessions: {
      find: async (sessionId, accountScope) => {
        const session = await repositories.sessions.find(sessionId, accountScope)
        return session
          ? {
              id: session.id,
              accountScope: session.accountScope,
              wahaSessionName: session.wahaSessionName,
              status: session.status,
              linkedAt: session.linkedAt,
            }
          : null
      },
    },
    contacts: messagingRepositories.contacts,
    safety: {
      evaluate: async (input) => {
        const safety = await messagingRepositories.safety.find(
          input.session.id,
          input.session.accountScope,
        )
        const stats = await repositories.scheduledJobs.safetyStats(
          input.session.id,
          input.session.accountScope,
          createBlindIndex(masterKey, input.message),
          input.now,
        )
        const context = await clientForSession(input.session.id, input.session.accountScope)
        const [timelock, capping] = await Promise.all([
          context.client.timelock(context.session.wahaSessionName),
          context.client.capping(context.session.wahaSessionName),
        ])
        return evaluateMessagingSafety(
          {
            accountScope: input.session.accountScope,
            sessionStatus: input.session.status,
            consentGranted: input.contact.consentGranted,
            optedOut: input.contact.optedOut,
            timelockLocked: timelock.locked === true,
            cappingRemaining: capping.remaining ?? null,
            cooldownUntil: safety?.newlyLinkedCooldownUntil ?? null,
            quietHoursActive: isQuietHoursActive(
              safety?.quietHoursStart,
              safety?.quietHoursEnd,
              input.now,
              input.timezone,
            ),
            lastSentAt: stats.lastSentAt,
            pacingSeconds: safety?.pacingSeconds ?? 30,
            dailyCount: stats.dailyCount,
            dailyBudget: safety?.dailyBudget ?? 20,
            burstCount: stats.burstCount,
            burstLimit: safety?.burstLimit ?? 3,
            duplicateContent: stats.duplicateContent,
          },
          input.now,
        )
      },
    },
    scheduler: {
      schedule: async (input) => {
        const result = await encryptedScheduler.scheduleWithIdempotency(input)
        return { jobId: result.job.id, duplicate: result.duplicate }
      },
      dispatch: async (jobId) => {
        const job = await scheduler.runOnce(`messaging-${jobId}`)
        if (!job) return { state: "unknown", recoveryCode: "dispatch_not_claimed" }
        if (job.state === "submitted" || job.state === "acknowledged") {
          const providerMessageId = job.providerMessageId
          return providerMessageId
            ? { state: job.state, providerMessageId }
            : { state: "unknown" as const, recoveryCode: "provider_message_id_missing" }
        }
        if (job.state === "unknown")
          return { state: "unknown", recoveryCode: job.recoveryCode ?? "provider_unknown" }
        return { state: "failed", recoveryCode: job.recoveryCode ?? "provider_failed" }
      },
      findByIdempotencyKey: async (idempotencyKey) =>
        encryptedScheduler.findByIdempotencyKey(idempotencyKey),
    },
    wahaForSession: async (session) =>
      (await clientForSession(session.id, session.accountScope)).client,
    audit: async (input) => {
      await repositories.auditEntries.append(input)
    },
  })
  return {
    ...messagingService,
    campaigns: createCampaignService({
      campaigns: repositories.campaigns,
      sessions: { find: (id, scope) => repositories.sessions.find(id, scope) },
      contactGroups: repositories.contactGroups,
      authorize,
      scheduler: {
        schedule: async (input) => {
          const result = await encryptedScheduler.scheduleWithIdempotency(input)
          return { jobId: result.job.id, duplicate: result.duplicate }
        },
        cancel: (jobId, scope) => encryptedScheduler.cancel(jobId, scope),
      },
      wahaForSession: async (session) =>
        (await clientForSession(session.id, session.accountScope)).client,
    }),
    schedulerTicker,
  }
}
