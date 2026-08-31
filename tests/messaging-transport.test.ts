import { describe, expect, it } from "vitest"

import { createMessagingTransport } from "../apps/api/src/messaging-transport"
import type { MessagingContact } from "../apps/api/src/messaging-types"
import {
  createSchedulerService,
  type DispatchResult,
  type SchedulerJob,
  type SchedulerRepository,
} from "../apps/api/src/scheduler"

const baseJob = (): SchedulerJob => ({
  id: "job-1",
  sessionId: "session-1",
  accountScope: "personal",
  recipientPhone: "+15550000001",
  message: "hello",
  scheduledFor: new Date("2030-01-01T12:00:00.000Z"),
  timezone: "UTC",
  idempotencyKey: "idem-1",
  state: "scheduled",
  attempts: 0,
  nextAttemptAt: new Date("2030-01-01T12:00:00.000Z"),
  leaseOwner: null,
  leaseExpiresAt: null,
  recoveryCode: null,
  failureCode: null,
})

function repository(initial: SchedulerJob): SchedulerRepository {
  let job = initial
  return {
    create: async (input) => {
      job = input
      return job
    },
    find: async () => job,
    claimDue: async (owner, now, leaseMs) => {
      if ((job.state !== "scheduled" && job.state !== "queued") || job.scheduledFor > now)
        return null
      job = {
        ...job,
        state: "attempting",
        attempts: job.attempts + 1,
        leaseOwner: owner,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
      }
      return job
    },
    complete: async (jobId, owner, result) => {
      if (job.id !== jobId || job.leaseOwner !== owner) return null
      job = {
        ...job,
        state: result.state,
        providerMessageId: result.providerMessageId,
        leaseOwner: null,
        leaseExpiresAt: null,
      }
      return job
    },
    fail: async (jobId, owner, failure) => {
      if (job.id !== jobId || job.leaseOwner !== owner) return null
      job = {
        ...job,
        state: failure.state,
        nextAttemptAt: failure.nextAttemptAt,
        recoveryCode: failure.recoveryCode,
        failureCode: failure.failureCode,
        leaseOwner: null,
        leaseExpiresAt: null,
      }
      return job
    },
    cancel: async () => null,
    edit: async () => null,
    recoverExpiredLeases: async () => 0,
  }
}

function transportFor(
  findContact: () => MessagingContact,
  onSend: () => void,
): (job: SchedulerJob) => Promise<DispatchResult> {
  return createMessagingTransport({
    clientForSession: async () => ({
      session: { wahaSessionName: "personal" },
      client: {
        sendText: async () => {
          onSend()
          return { id: "provider-1" }
        },
      },
    }),
    contacts: { find: async () => findContact() },
  })
}

describe("messaging scheduler transport safety", () => {
  it("does not submit when consent is revoked after the scheduler gate", async () => {
    // Given a due job whose target is consented during the scheduler gate
    const now = new Date("2030-01-01T12:00:00.000Z")
    const shared = repository(baseJob())
    let contact: MessagingContact = {
      id: "contact-1",
      phone: "+15550000001",
      displayName: null,
      providerChatId: "15550000001@c.us",
      consentGranted: true,
      optedOut: false,
    }
    let sends = 0
    const service = createSchedulerService({
      repository: shared,
      transport: transportFor(
        () => contact,
        () => {
          sends += 1
        },
      ),
      gate: async () => {
        contact = { ...contact, consentGranted: false }
        return { allowed: true }
      },
      now: () => now,
    })

    // When the worker dispatches after the contact revocation
    await service.runOnce("worker-a")

    // Then the provider is not called and the safe failure is durable
    expect(sends).toBe(0)
    await expect(shared.find("job-1", "personal")).resolves.toMatchObject({
      state: "failed",
      failureCode: "consent_required",
      recoveryCode: "consent_required",
    })
  })

  it("does not submit an opted-out contact at the transport boundary", async () => {
    // Given an opted-out contact freshly read by the transport
    let sends = 0
    const optedOutContact: MessagingContact = {
      id: "contact-1",
      phone: "+15550000001",
      displayName: null,
      providerChatId: "15550000001@c.us",
      consentGranted: true,
      optedOut: true,
    }
    const transport = transportFor(
      () => optedOutContact,
      () => {
        sends += 1
      },
    )

    // When the transport prepares the provider submission
    const result = await transport(baseJob())

    // Then it returns a consent failure without invoking the provider
    expect(sends).toBe(0)
    expect(result).toEqual({
      state: "failed",
      failureCode: "consent_required",
      recoveryCode: "consent_required",
    })
  })

  it("submits the provider-native lid identifier returned by verification", async () => {
    // Given a consented contact whose provider-verified identifier is a LID
    const lidContact: MessagingContact = {
      id: "contact-lid",
      phone: "+15550000001",
      displayName: null,
      providerChatId: "123456789@lid",
      consentGranted: true,
      optedOut: false,
    }
    let sends = 0
    const transport = transportFor(
      () => lidContact,
      () => {
        sends += 1
      },
    )

    // When the transport prepares the provider submission
    const result = await transport(baseJob())

    // Then the provider-native target is submitted exactly once
    expect(sends).toBe(1)
    expect(result).toEqual({ state: "submitted", providerMessageId: "provider-1" })
  })

  it("does not submit a malformed c.us provider identifier", async () => {
    // Given a consented contact with a malformed c.us provider identifier
    const malformedContact: MessagingContact = {
      id: "contact-malformed",
      phone: "+15550000001",
      displayName: null,
      providerChatId: "attacker@c.us",
      consentGranted: true,
      optedOut: false,
    }
    let sends = 0
    const transport = transportFor(
      () => malformedContact,
      () => {
        sends += 1
      },
    )

    // When the transport prepares the provider submission
    const result = await transport(baseJob())

    // Then the malformed target is rejected without a provider call
    expect(sends).toBe(0)
    expect(result).toEqual({
      state: "failed",
      failureCode: "contact_not_found",
      recoveryCode: "contact_not_found",
    })
  })

  it("preserves provider evidence for a consented contact", async () => {
    // Given a consented contact freshly read by the transport
    let sends = 0
    const transport = transportFor(
      () => ({
        id: "contact-1",
        phone: "+15550000001",
        displayName: null,
        providerChatId: "15550000001@c.us",
        consentGranted: true,
        optedOut: false,
      }),
      () => {
        sends += 1
      },
    )

    // When the transport submits the message
    const result = await transport(baseJob())

    // Then the provider evidence is returned without duplicate submission
    expect(sends).toBe(1)
    expect(result).toEqual({ state: "submitted", providerMessageId: "provider-1" })
  })
})
