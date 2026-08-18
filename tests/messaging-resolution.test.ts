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
})
