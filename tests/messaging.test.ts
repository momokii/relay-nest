import { describe, expect, it } from "vitest"

import {
  createMessagingService,
  type MessagingPrincipal,
  normalizePhoneNumber,
} from "../apps/api/src/messaging"

const principal: MessagingPrincipal = {
  userId: "user-1",
  roles: ["operator"],
}

function serviceOptions(overrides: Record<string, unknown> = {}) {
  return {
    authorize: async () => ({ allowed: true as const }),
    sessions: {
      find: async () => ({
        id: "session-1",
        accountScope: "personal" as const,
        wahaSessionName: "personal",
        status: "WORKING",
        linkedAt: new Date("2029-12-01T00:00:00.000Z"),
      }),
    },
    contacts: {
      find: async () => ({
        id: "contact-1",
        phone: "+628123456789",
        displayName: "Example",
        consentGranted: true,
        optedOut: false,
      }),
      save: async (contact: unknown) => contact,
    },
    safety: {
      evaluate: async () => ({ allowed: true as const }),
    },
    scheduler: {
      schedule: async (input: unknown) => ({ jobId: "job-1", duplicate: false, ...input }),
      dispatch: async () => ({ state: "submitted" as const, providerMessageId: "provider-1" }),
    },
    waha: {
      checkExists: async () => ({ numberExists: true, chatId: "628123456789@c.us" }),
      contact: async () => ({ id: "628123456789@c.us", isMyContact: false }),
    },
    wahaForSession: async () => ({
      checkExists: async (session: string, phone: string) => {
        void session
        void phone
        return { numberExists: true, chatId: "628123456789@c.us" }
      },
      contact: async () => ({ id: "628123456789@c.us", name: "Example" }),
    }),
    audit: async () => undefined,
    ...overrides,
  }
}

describe("individual text messaging", () => {
  it("normalizes an international manual number before any provider call", () => {
    // Given a formatted E.164-compatible number
    // When the number crosses the messaging boundary
    // Then the service receives only canonical digits with a plus prefix
    expect(normalizePhoneNumber(" +62 (812) 3456-789 ")).toBe("+628123456789")
    expect(() => normalizePhoneNumber("0812-3456")).toThrow("international phone number")
  })

  it("resolves a manual number through WAHA without exposing the raw response", async () => {
    // Given a granted Personal session and a valid manual number
    const calls: string[] = []
    const service = createMessagingService(
      serviceOptions({
        waha: {
          checkExists: async (session: string, phone: string) => {
            calls.push(`${session}:${phone}`)
            return { numberExists: true, chatId: "628123456789@c.us" }
          },
          contact: async () => ({ id: "628123456789@c.us", name: "secret raw field" }),
        },
        wahaForSession: async () => ({
          checkExists: async (session: string, phone: string) => {
            calls.push(`${session}:${phone}`)
            return { numberExists: true, chatId: "628123456789@c.us" }
          },
          contact: async () => ({ id: "628123456789@c.us", name: "secret raw field" }),
        }),
      }),
    )

    // When the operator resolves the target
    const result = await service.resolveContact(principal, "session-1", "personal", {
      phoneNumber: "+62 812 3456 789",
    })

    // Then the provider was called with the normalized value and only a safe projection returns
    expect(calls).toEqual(["personal:+628123456789"])
    expect(result).toEqual({ id: "contact-1", phone: "+628123456789", displayName: "Example" })
    expect(JSON.stringify(result)).not.toContain("secret raw field")
  })

  it("rejects an unconsented or opted-out target before scheduling", async () => {
    // Given a target with no send consent
    const schedule = async (): Promise<never> => {
      throw new Error("scheduler must not be called")
    }
    const service = createMessagingService(
      serviceOptions({
        contacts: {
          find: async () => ({
            id: "contact-1",
            phone: "+628123456789",
            displayName: null,
            consentGranted: false,
            optedOut: true,
          }),
          save: async (contact: unknown) => contact,
        },
        scheduler: { schedule },
      }),
    )

    // When an operator attempts an immediate send
    const result = await service.sendImmediate(principal, {
      sessionId: "session-1",
      accountScope: "personal",
      phoneNumber: "+628123456789",
      message: "hello",
      idempotencyKey: "send-1",
    })

    // Then the decision is safe and no send is authorized
    expect(result).toEqual({ state: "failed", recoveryCode: "consent_required" })
  })

  it("uses the scheduler for immediate and future sends and remains idempotent", async () => {
    // Given a consented target and a scheduler with a durable idempotency key
    const scheduled: unknown[] = []
    let runs = 0
    const options = serviceOptions({
      scheduler: {
        schedule: async (input: unknown) => {
          scheduled.push(input)
          return { jobId: "job-1", duplicate: false }
        },
        dispatch: async () => {
          runs += 1
          return { state: "submitted" as const, providerMessageId: "provider-1" }
        },
      },
    })
    const service = createMessagingService(options)

    // When the same immediate command is submitted twice and a future job is created
    const first = await service.sendImmediate(principal, {
      sessionId: "session-1",
      accountScope: "personal",
      phoneNumber: "+628123456789",
      message: "hello",
      idempotencyKey: "send-1",
    })
    const second = await service.sendImmediate(principal, {
      sessionId: "session-1",
      accountScope: "personal",
      phoneNumber: "+628123456789",
      message: "hello",
      idempotencyKey: "send-1",
    })
    const future = await service.scheduleText(principal, {
      sessionId: "session-1",
      accountScope: "personal",
      phoneNumber: "+628123456789",
      message: "later",
      idempotencyKey: "send-2",
      scheduledFor: new Date("2030-01-01T00:00:00.000Z"),
      timezone: "UTC",
    })

    // Then scheduling is delegated once per idempotency key and HTTP submission is not delivery
    expect(first).toMatchObject({ state: "submitted", providerMessageId: "provider-1" })
    expect(second).toMatchObject({ state: "submitted", providerMessageId: "provider-1" })
    expect(future).toMatchObject({ state: "scheduled", jobId: "job-1" })
    expect(scheduled).toHaveLength(2)
    expect(runs).toBe(1)
  })

  it("returns the original durable result across fresh service instances", async () => {
    // Given two service instances sharing a durable idempotency/result repository
    let durable: {
      readonly jobId: string
      readonly state: "submitted"
      readonly providerMessageId: string
    } | null = null
    let sends = 0
    const scheduler = {
      schedule: async () => ({ jobId: "job-1", duplicate: Boolean(durable) }),
      findByIdempotencyKey: async () => durable,
      dispatch: async () => {
        sends += 1
        durable = { jobId: "job-1", state: "submitted", providerMessageId: "provider-1" }
        return { state: "submitted" as const, providerMessageId: "provider-1" }
      },
    }
    const first = createMessagingService(serviceOptions({ scheduler }))
    const second = createMessagingService(serviceOptions({ scheduler }))
    const input = {
      sessionId: "session-1",
      accountScope: "personal" as const,
      phoneNumber: "+628123456789",
      message: "hello",
      idempotencyKey: "send-cross-instance",
    }

    // When each instance receives the same immediate command
    const firstResult = await first.sendImmediate(principal, input)
    const secondResult = await second.sendImmediate(principal, input)

    // Then the second instance returns the durable provider result without another send
    expect(firstResult).toEqual({ state: "submitted", providerMessageId: "provider-1" })
    expect(secondResult).toEqual({ state: "submitted", providerMessageId: "provider-1" })
    expect(sends).toBe(1)
  })
})
