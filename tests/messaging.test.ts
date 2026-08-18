import { describe, expect, it } from "vitest"

import { createMessagingService, normalizePhoneNumber } from "../apps/api/src/messaging"
import { principal, serviceOptions } from "./messaging-fixtures"

describe("individual text messaging", () => {
  it("normalizes an international manual number before any provider call", () => {
    // Given a formatted E.164-compatible number
    // When the number crosses the messaging boundary
    // Then the service receives only canonical digits with a plus prefix
    expect(normalizePhoneNumber(" +62 (812) 3456-789 ")).toBe("+628123456789")
    expect(() => normalizePhoneNumber("0812-3456")).toThrow("international phone number")
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

  it("does not mutate consent for a contact owned by another session", async () => {
    // Given a contact in the same scope but owned by a different session
    const updates: unknown[] = []
    const service = createMessagingService(
      serviceOptions({
        contacts: {
          find: async () => null,
          findById: async () => ({
            id: "contact-1",
            accountScope: "personal" as const,
            sessionId: "session-2",
            phone: "+628123456789",
            displayName: "Example",
            providerChatId: "628123456789@c.us",
            consentGranted: false,
            optedOut: false,
          }),
          save: async (contact: unknown) => contact,
          updateConsent: async (...input: readonly unknown[]) => {
            updates.push(input)
            return null
          },
        },
      }),
    )

    // When an operator attempts to update that contact through session-1
    const result = await service.setConsent(
      principal,
      "session-1",
      "personal",
      "contact-1",
      true,
      false,
    )

    // Then the session grant boundary rejects the mutation before persistence
    expect(result).toEqual({ updated: false })
    expect(updates).toHaveLength(0)
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
      readonly sessionId: string
      readonly accountScope: "personal"
      readonly state: "submitted"
      readonly providerMessageId: string
    } | null = null
    let sends = 0
    const scheduler = {
      schedule: async () => ({ jobId: "job-1", duplicate: Boolean(durable) }),
      findByIdempotencyKey: async () => durable,
      dispatch: async () => {
        sends += 1
        durable = {
          jobId: "job-1",
          sessionId: "session-1",
          accountScope: "personal",
          state: "submitted",
          providerMessageId: "provider-1",
        }
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

  it("does not replay a durable result for another session", async () => {
    // Given a durable result bound to session-1
    let dispatched = 0
    const service = createMessagingService(
      serviceOptions({
        sessions: {
          find: async (sessionId: string) => ({
            id: sessionId,
            accountScope: "personal" as const,
            wahaSessionName: "personal",
            status: "WORKING",
            linkedAt: new Date("2029-12-01T00:00:00.000Z"),
          }),
        },
        scheduler: {
          schedule: async () => ({ jobId: "job-2", duplicate: false }),
          findByIdempotencyKey: async () => ({
            jobId: "job-1",
            sessionId: "session-1",
            accountScope: "personal" as const,
            state: "submitted" as const,
            providerMessageId: "provider-1",
          }),
          dispatch: async () => {
            dispatched += 1
            return { state: "submitted" as const, providerMessageId: "provider-2" }
          },
        },
      }),
    )

    // When the same idempotency key is submitted through session-2
    const result = await service.sendImmediate(principal, {
      sessionId: "session-2",
      accountScope: "personal",
      phoneNumber: "+628123456789",
      message: "hello",
      idempotencyKey: "send-cross-session",
    })

    // Then the old provider result is not disclosed or replayed
    expect(result).toEqual({ state: "submitted", providerMessageId: "provider-2" })
    expect(dispatched).toBe(1)
  })
})
