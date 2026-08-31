import { afterAll, describe, expect, it } from "vitest"

import { createDatabase } from "../apps/api/src/db/client"
import { createRepositories } from "../apps/api/src/db/repositories"
import { createMessagingRepositories } from "../apps/api/src/db/repositories/messaging"
import { createMessagingService, type MessagingPrincipal } from "../apps/api/src/messaging"
import {
  createEncryptedSchedulerRepository,
  createSchedulerService,
  type DispatchResult,
  type SchedulerJob,
} from "../apps/api/src/scheduler"

const databaseUrl = process.env.DATABASE_URL
const database = databaseUrl ? createDatabase(databaseUrl) : undefined
const repositories = database ? createRepositories(database.db) : undefined
const personal = "personal" as const
const principal: MessagingPrincipal = { userId: "postgres-user", roles: ["operator"] }

describe.skipIf(!repositories)("PostgreSQL messaging idempotency", () => {
  it("keeps same-phone contacts owned by separate sessions", async () => {
    // Given two Personal sessions and the same normalized phone number
    const connection = await repositories.wahaConnections.create({
      name: `contact-scope-connection-${crypto.randomUUID()}`,
      baseUrl: "http://waha.internal",
      apiKeyCiphertext: "opaque-ciphertext",
      apiKeyNonce: "opaque-nonce",
      apiKeyAuthTag: "opaque-tag",
    })
    const firstSession = await repositories.sessions.create({
      connectionId: connection.id,
      accountScope: personal,
      name: `contact-scope-session-${crypto.randomUUID()}`,
      wahaSessionName: `contact-scope-waha-${crypto.randomUUID()}`,
      status: "WORKING",
    })
    const secondSession = await repositories.sessions.create({
      connectionId: connection.id,
      accountScope: personal,
      name: `contact-scope-session-${crypto.randomUUID()}`,
      wahaSessionName: `contact-scope-waha-${crypto.randomUUID()}`,
      status: "WORKING",
    })
    const contacts = createMessagingRepositories(database.db, Buffer.alloc(32, 9)).contacts

    // When each session persists its own contact for that phone
    const firstContact = await contacts.save({
      id: crypto.randomUUID(),
      accountScope: personal,
      sessionId: firstSession.id,
      phone: "+628123456789",
      displayName: "First session contact",
      providerChatId: "628123456789@c.us",
      consentGranted: true,
      optedOut: false,
    })
    const secondContact = await contacts.save({
      id: crypto.randomUUID(),
      accountScope: personal,
      sessionId: secondSession.id,
      phone: "+628123456789",
      displayName: "Second session contact",
      providerChatId: "628123456789@c.us",
      consentGranted: false,
      optedOut: false,
    })

    // Then lookup returns each session's identity and consent independently
    const firstFound = await contacts.find(personal, firstSession.id, "+628123456789")
    const secondFound = await contacts.find(personal, secondSession.id, "+628123456789")
    expect(firstContact.id).not.toBe(secondContact.id)
    expect(firstFound).toMatchObject({
      id: firstContact.id,
      sessionId: firstSession.id,
      consentGranted: true,
    })
    expect(secondFound).toMatchObject({
      id: secondContact.id,
      sessionId: secondSession.id,
      consentGranted: false,
    })
  })

  it("updates provider identity without resetting consent", async () => {
    // Given one session and a persisted consented contact
    const connection = await repositories.wahaConnections.create({
      name: `contact-upsert-connection-${crypto.randomUUID()}`,
      baseUrl: "http://waha.internal",
      apiKeyCiphertext: "opaque-ciphertext",
      apiKeyNonce: "opaque-nonce",
      apiKeyAuthTag: "opaque-tag",
    })
    const session = await repositories.sessions.create({
      connectionId: connection.id,
      accountScope: personal,
      name: `contact-upsert-session-${crypto.randomUUID()}`,
      wahaSessionName: `contact-upsert-waha-${crypto.randomUUID()}`,
      status: "WORKING",
    })
    const contacts = createMessagingRepositories(database.db, Buffer.alloc(32, 9)).contacts
    const id = crypto.randomUUID()
    await contacts.save({
      id,
      accountScope: personal,
      sessionId: session.id,
      phone: "+628123456789",
      displayName: "Original name",
      providerChatId: "628123456789@c.us",
      consentGranted: true,
      optedOut: false,
    })

    // When the same session persists refreshed provider routing data
    const updated = await contacts.save({
      id,
      accountScope: personal,
      sessionId: session.id,
      phone: "+628123456789",
      displayName: "Original name",
      providerChatId: "628123456789@c.us",
      consentGranted: true,
      optedOut: false,
    })
    const found = await contacts.find(personal, session.id, "+628123456789")

    // Then one row remains and its refreshed identity retains consent
    expect(updated.id).toBe(id)
    expect(found).toMatchObject({
      id,
      displayName: "Original name",
      consentGranted: true,
      optedOut: false,
    })
  })

  it("replays the original encrypted result across fresh services without a provider call", async () => {
    // Given two fresh encrypted repositories sharing one PostgreSQL database and key
    const connection = await repositories.wahaConnections.create({
      name: `idempotency-connection-${crypto.randomUUID()}`,
      baseUrl: "http://waha.internal",
      apiKeyCiphertext: "opaque-ciphertext",
      apiKeyNonce: "opaque-nonce",
      apiKeyAuthTag: "opaque-tag",
    })
    const session = await repositories.sessions.create({
      connectionId: connection.id,
      accountScope: personal,
      name: `idempotency-session-${crypto.randomUUID()}`,
      wahaSessionName: `idempotency-waha-${crypto.randomUUID()}`,
      status: "WORKING",
    })
    const masterKey = Buffer.alloc(32, 7)
    const firstRepository = createEncryptedSchedulerRepository(
      repositories.scheduledJobs,
      masterKey,
    )
    const secondRepository = createEncryptedSchedulerRepository(
      repositories.scheduledJobs,
      masterKey,
    )
    // Keep this synthetic clock before opaque fixtures from other integration files.
    const now = new Date("2000-01-01T12:00:00.000Z")
    let providerCalls = 0
    const transport = async (_job: SchedulerJob): Promise<DispatchResult> => {
      providerCalls += 1
      return { state: "submitted", providerMessageId: "provider-postgres-1" }
    }
    const firstScheduler = createSchedulerService({
      repository: firstRepository,
      transport,
      now: () => now,
    })
    const secondScheduler = createSchedulerService({
      repository: secondRepository,
      transport,
      now: () => now,
    })
    const first = createMessagingService(
      serviceOptions(session.id, firstRepository, firstScheduler, now),
    )
    const second = createMessagingService(
      serviceOptions(session.id, secondRepository, secondScheduler, now),
    )
    const input = {
      sessionId: session.id,
      accountScope: personal,
      contactId: "contact-postgres-1",
      message: "durable postgres message",
      idempotencyKey: crypto.randomUUID(),
    } as const

    // When the first service sends and the second fresh service replays the same command
    const firstResult = await first.sendImmediate(principal, input)
    const secondResult = await second.sendImmediate(principal, input)
    const durable = await secondRepository.findByIdempotencyKey(input.idempotencyKey)

    // Then the encrypted durable result is reused and the replay makes no provider call
    expect(firstResult).toEqual({ state: "submitted", providerMessageId: "provider-postgres-1" })
    expect(secondResult).toEqual(firstResult)
    expect(durable).toMatchObject({
      jobId: expect.any(String),
      state: "submitted",
      providerMessageId: "provider-postgres-1",
    })
    expect(providerCalls).toBe(1)
  })
})

function serviceOptions(
  sessionId: string,
  repository: ReturnType<typeof createEncryptedSchedulerRepository>,
  scheduler: ReturnType<typeof createSchedulerService>,
  now: Date,
) {
  return {
    now: () => now,
    authorize: async () => ({ allowed: true as const }),
    sessions: {
      find: async () => ({
        id: sessionId,
        accountScope: personal,
        wahaSessionName: "postgres-waha",
        status: "WORKING",
        linkedAt: now,
      }),
    },
    contacts: {
      find: async () => null,
      findById: async () => ({
        id: "contact-postgres-1",
        phone: "+628123456789",
        displayName: "Postgres contact",
        providerChatId: "628123456789@c.us",
        consentGranted: true,
        optedOut: false,
      }),
      save: async (contact: never) => contact,
    },
    safety: { evaluate: async () => ({ allowed: true as const }) },
    scheduler: {
      schedule: async (input: Parameters<typeof repository.scheduleWithIdempotency>[0]) => {
        const result = await repository.scheduleWithIdempotency(input)
        return { jobId: result.job.id, duplicate: result.duplicate }
      },
      dispatch: async (jobId: string) => {
        const job = await scheduler.runOnce(`postgres-${jobId}`)
        if (!job || job.id !== jobId || !job.providerMessageId) {
          return { state: "unknown" as const, recoveryCode: "dispatch_not_claimed" }
        }
        return {
          state: job.state as "submitted" | "acknowledged",
          providerMessageId: job.providerMessageId,
        }
      },
      findByIdempotencyKey: repository.findByIdempotencyKey,
    },
    wahaForSession: async () => ({
      checkExists: async () => ({ numberExists: true, chatId: "628123456789@c.us" }),
      contact: async () => ({ id: "628123456789@c.us" }),
    }),
    audit: async () => undefined,
  }
}

if (database) {
  afterAll(async () => database.close())
}
