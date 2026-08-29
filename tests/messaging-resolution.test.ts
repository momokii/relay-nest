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
    expect(result).toEqual({ id: "contact-1", phone: "+628123456789", displayName: "Example" })
    expect(JSON.stringify(result)).not.toContain("secret raw field")
  })

  it("resolves numbers whose provider chat id uses the WhatsApp LID form", async () => {
    // Given WAHA returning the new linked-identity chat id for a valid number
    const service = createMessagingService(
      serviceOptions({
        waha: {
          checkExists: async () => ({
            numberExists: true,
            chatId: "239629714329822@lid",
          }),
          contact: async () => ({ id: "239629714329822@lid", name: "Lid Person" }),
        },
        wahaForSession: async () => ({
          checkExists: async () => ({ numberExists: true, chatId: "239629714329822@lid" }),
          contact: async () => ({ id: "239629714329822@lid", name: "Lid Person" }),
        }),
      }),
    )

    // When the operator resolves the target
    const result = await service.resolveContact(principal, "session-1", "personal", {
      phoneNumber: "+628123456789",
    })

    // Then the LID chat id is accepted as the provider routing address
    expect(result).toEqual({ id: "contact-1", phone: "+628123456789", displayName: "Example" })
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
    ).rejects.toThrow("contact was not found")
    expect(saved).toHaveLength(0)
  })
})
