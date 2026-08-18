import { createBlindIndex, createEnvelopeCipher } from "@waha-command-center/config"

import { authorizeSessionAction } from "./auth/authorization"
import type { DatabaseHandle } from "./db/client"
import type { createRepositories } from "./db/repositories"
import { createMessagingRepositories } from "./db/repositories/messaging"
import { createMessagingService } from "./messaging"
import { evaluateMessagingSafety, isQuietHoursActive } from "./messaging-safety"
import {
  classifyWahaDispatchError,
  createEncryptedSchedulerRepository,
  createSchedulerService,
  type DispatchResult,
} from "./scheduler"
import { createWahaClient } from "./waha/adapter"

type Repositories = ReturnType<typeof createRepositories>
type ConfiguredMessagingServiceOptions = Readonly<{ allowLoopbackWaha?: boolean }>

export function createConfiguredMessagingService(
  database: DatabaseHandle,
  repositories: Repositories,
  masterKey: Buffer | undefined,
  options: ConfiguredMessagingServiceOptions = {},
) {
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

  const scheduler = createSchedulerService({
    repository: encryptedScheduler,
    transport: async (job) => {
      let result: DispatchResult
      try {
        const context = await clientForSession(job.sessionId, job.accountScope)
        const contact = await messagingRepositories.contacts.find(
          job.accountScope,
          job.recipientPhone,
        )
        if (!contact) {
          result = {
            state: "failed",
            failureCode: "contact_not_found",
            recoveryCode: "contact_not_found",
          }
        } else {
          const sent = await context.client.sendText(
            context.session.wahaSessionName,
            contact.providerChatId,
            job.message,
          )
          result = { state: "submitted", providerMessageId: sent.id }
        }
      } catch (error) {
        result = classifyWahaDispatchError(error)
      }
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
      const context = await clientForSession(job.sessionId, job.accountScope)
      const contact = await messagingRepositories.contacts.find(
        job.accountScope,
        job.recipientPhone,
      )
      if (!contact) return { allowed: false, recoveryCode: "contact_not_found" as const }
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

  return createMessagingService({
    authorize: async (principal, sessionId, accountScope) => {
      const session = await repositories.sessions.find(sessionId, accountScope)
      const grant = await repositories.sessionGrants.find(principal.userId, sessionId, accountScope)
      return authorizeSessionAction({
        principal: { roles: principal.roles },
        accountScope,
        sessionScope: session?.accountScope ?? accountScope,
        hasGrant: Boolean(grant),
        action: "command",
        sessionActive: session?.status !== "disabled",
      })
    },
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
}
