import { describe, expect, it } from "vitest"

import { createMessagingService } from "../apps/api/src/messaging"
import { principal, serviceOptions } from "./messaging-fixtures"

describe("individual text contact resolution", () => {
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
    expect(result).toEqual({
      id: "contact-1",
      phone: "+628123456789",
      displayName: "Example",
      consentGranted: true,
      optedOut: false,
    })
    expect(JSON.stringify(result)).not.toContain("secret raw field")
  })

  it("does not reuse a consented contact from another session", async () => {
    // Given a consented contact for Session 2 and the same number entered in Session 1
    const service = createMessagingService(
      serviceOptions({
        contacts: {
          find: async (_scope: string, sessionId: string, _phone: string) => {
            if (sessionId === "session-1") return null
            return {
              id: "session-2-contact",
              sessionId: "session-2",
              phone: "+628123456789",
              displayName: "Session 2 contact",
              providerChatId: "628123456789@c.us",
              consentGranted: true,
              optedOut: false,
            }
          },
          save: async (input: {
            readonly id: string
            readonly sessionId: string
            readonly consentGranted: boolean
          }) => ({
            ...input,
            phone: "+628123456789",
            displayName: null,
            providerChatId: "628123456789@c.us",
          }),
        },
      }),
    )

    // When the operator resolves that number in Session 1
    const result = await service.resolveContact(principal, "session-1", "personal", {
      phoneNumber: "+628123456789",
    })

    // Then Session 1 receives a new contact identity rather than Session 2's consent
    expect(result.id).not.toBe("session-2-contact")
    expect(result.phone).toBe("+628123456789")
  })

  it("accepts the provider lid chat id returned for a verified number", async () => {
    // Given WAHA verifying a real number and returning its linked-identity chat id
    const saved: { phone: string; providerChatId: string; consentGranted: boolean }[] = []
    const waha = {
      checkExists: async () => ({
        numberExists: true,
        chatId: "239629714329822@lid",
      }),
      contact: async () => ({ id: "239629714329822@lid", name: "Lid Person" }),
    }
    const service = createMessagingService(
      serviceOptions({
        contacts: {
          find: async () => null,
          save: async (input: {
            phone: string
            providerChatId: string
            consentGranted: boolean
          }) => {
            saved.push(input)
            return { ...input, id: "lid-contact-1" }
          },
        },
        waha,
        wahaForSession: async () => waha,
      }),
    )

    // When the operator resolves the verified target
    // Then the provider-native LID is stored as the verified routing address
    const result = await service.resolveContact(principal, "session-1", "personal", {
      phoneNumber: "+628123456789",
    })
    expect(result.phone).toBe("+628123456789")
    expect(saved).toHaveLength(1)
    expect(saved[0]?.providerChatId).toBe("239629714329822@lid")
  })

  it("rejects an unverified directory chat address", async () => {
    // Given the operator submits a fabricated group chat address
    const saved: { phone: string; providerChatId: string; consentGranted: boolean }[] = []
    const waha = {
      checkExists: async () => {
        throw new Error("must not check-exists a chat address")
      },
      contact: async () => {
        throw new Error("must not resolve a chat address")
      },
    }
    const service = createMessagingService(
      serviceOptions({
        contacts: {
          find: async () => null,
          save: async (input: {
            phone: string
            providerChatId: string
            consentGranted: boolean
          }) => {
            saved.push(input)
            return { ...input, id: "group-contact-1" }
          },
        },
        waha,
        wahaForSession: async () => waha,
      }),
    )

    // When the operator resolves the unverified chat address target
    // Then no fabricated target is persisted
    await expect(
      service.resolveContact(principal, "session-1", "personal", {
        phoneNumber: "120363162617804781@g.us",
      }),
    ).rejects.toThrow("international phone number is invalid")
    expect(saved).toHaveLength(0)
  })

  it("rejects a raw non-derivable lid chat address", async () => {
    // Given a directory-only @lid row whose chat id derives no E.164 number
    const saved: { phone: string; providerChatId: string; consentGranted: boolean }[] = []
    const waha = {
      checkExists: async () => {
        throw new Error("must not check-exists a raw chat address")
      },
      contact: async () => {
        throw new Error("must not resolve a raw chat address")
      },
    }
    const service = createMessagingService(
      serviceOptions({
        contacts: {
          find: async () => null,
          save: async (input: {
            phone: string
            providerChatId: string
            consentGranted: boolean
          }) => {
            saved.push(input)
            return { ...input, id: "lid-contact-1" }
          },
        },
        waha,
        wahaForSession: async () => waha,
      }),
    )

    // When the raw @lid chat address is offered as a resolution target
    // Then it never reaches the provider and nothing is persisted
    await expect(
      service.resolveContact(principal, "session-1", "personal", {
        phoneNumber: "239629714329822@lid",
      }),
    ).rejects.toThrow("international phone number is invalid")
    expect(saved).toHaveLength(0)
  })

  it("rejects a raw c.us chat address even when a matching contact exists", async () => {
    // Given a saved provider contact that must only be addressed by contactId
    const service = createMessagingService(
      serviceOptions({
        contacts: {
          find: async () => ({
            id: "contact-1",
            accountScope: "personal" as const,
            sessionId: "session-1",
            phone: "+628123456789",
            displayName: "Example",
            providerChatId: "628123456789@c.us",
            consentGranted: true,
            optedOut: false,
          }),
          save: async (input: never): Promise<never> => input,
        },
        wahaForSession: async () => ({
          checkExists: async () => {
            throw new Error("must not check-exists a raw chat address")
          },
          contact: async () => {
            throw new Error("must not resolve a raw chat address")
          },
        }),
      }),
    )

    // When a raw provider address is submitted instead of the contact id
    // Then the service refuses it before provider access
    await expect(
      service.resolveContact(principal, "session-1", "personal", {
        phoneNumber: "628123456789@c.us",
      }),
    ).rejects.toThrow("international phone number is invalid")
  })

  it("sends through a stored contact whose provider chat id is a verified LID", async () => {
    // Given a consented contact persisted with a provider-verified LID
    const scheduled: unknown[] = []
    const service = createMessagingService(
      serviceOptions({
        contacts: {
          find: async () => null,
          findById: async () => ({
            id: "contact-lid",
            accountScope: "personal" as const,
            sessionId: "session-1",
            phone: "+628123456789",
            displayName: "LID contact",
            providerChatId: "239629714329822@lid",
            consentGranted: true,
            optedOut: false,
          }),
          save: async (input: never): Promise<never> => input,
        },
        scheduler: {
          schedule: async (input: unknown) => {
            scheduled.push(input)
            return { jobId: "job-lid", duplicate: false }
          },
          dispatch: async () => ({
            state: "submitted" as const,
            providerMessageId: "provider-lid",
          }),
        },
      }),
    )

    // When the operator sends using the stored contact id
    const result = await service.sendImmediate(principal, {
      sessionId: "session-1",
      accountScope: "personal",
      contactId: "contact-lid",
      message: "verified provider target",
      idempotencyKey: "88888888-8888-4888-8888-888888888888",
    })

    // Then the provider-native address routes the send exactly once
    expect(result).toEqual({ state: "submitted", providerMessageId: "provider-lid" })
    expect(scheduled).toHaveLength(1)
  })

  it("rejects a contact id owned by another session in the same scope", async () => {
    // Given a contact that belongs to a different Personal session
    const scheduled: unknown[] = []
    const service = createMessagingService(
      serviceOptions({
        contacts: {
          find: async () => null,
          findById: async () => ({
            id: "contact-2",
            accountScope: "personal" as const,
            sessionId: "session-2",
            phone: "+628123456789",
            displayName: "Other session contact",
            providerChatId: "628123456789@c.us",
            consentGranted: true,
            optedOut: false,
          }),
          save: async (input: never): Promise<never> => input,
        },
        scheduler: {
          schedule: async (input: unknown) => {
            scheduled.push(input)
            return { jobId: "job-cross-session", duplicate: false }
          },
          dispatch: async () => ({ state: "submitted" as const, providerMessageId: "provider-2" }),
        },
      }),
    )

    // When Session 1 submits Session 2's contact id
    const result = await service.sendImmediate(principal, {
      sessionId: "session-1",
      accountScope: "personal",
      contactId: "contact-2",
      message: "must not send",
      idempotencyKey: "77777777-7777-4777-8777-777777777777",
    })

    // Then the session boundary blocks the send before scheduling
    expect(result).toEqual({ state: "failed", recoveryCode: "contact_not_found" })
    expect(scheduled).toHaveLength(0)
  })
})
