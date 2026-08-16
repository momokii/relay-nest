import { describe, expect, it } from "vitest"

import {
  classifyNotificationFailure,
  maskSecret,
  NOTIFICATION_CATEGORIES,
  retryDelayMs,
} from "../apps/api/src/notifications/contracts"
import { NotificationProviderError } from "../apps/api/src/notifications/providers"
import { createNotificationService } from "../apps/api/src/notifications/service"
import { createEnvelopeCipher } from "../packages/config/src/encryption"

type StoredSetting = {
  readonly accountScope: "personal" | "business"
  readonly channel: "email" | "telegram"
  readonly enabled: boolean
  readonly configCiphertext: string
  readonly configNonce: string
  readonly configAuthTag: string
}

function createFixture() {
  const settings: StoredSetting[] = []
  const preferences: Array<{
    readonly accountScope: "personal" | "business"
    readonly category: string
    readonly emailEnabled: boolean
    readonly telegramEnabled: boolean
  }> = []
  const updates: Array<Record<string, unknown>> = []
  let notificationNumber = 0
  const cipher = createEnvelopeCipher(Buffer.alloc(32, 7))
  const repository = {
    notificationProviderSettings: {
      upsert: async (input: StoredSetting) => {
        settings.push(input)
        return input
      },
      list: async (accountScope: "personal" | "business") =>
        settings.filter((setting) => setting.accountScope === accountScope),
    },
    notificationPreferences: {
      upsert: async (input: (typeof preferences)[number]) => {
        preferences.push(input)
        return input
      },
      list: async (accountScope: "personal" | "business") =>
        preferences.filter((preference) => preference.accountScope === accountScope),
    },
    notifications: {
      enqueue: async () => ({ id: `notification-${++notificationNumber}` }),
      updateAttempt: async (_id: string, patch: Record<string, unknown>) => {
        updates.push(patch)
        return patch
      },
      list: async () => [],
    },
  }
  return { cipher, repository, settings, preferences, updates }
}

describe("Todo 11 notification contracts", () => {
  it("defines explicit operational categories", () => {
    // Given the product notification taxonomy
    // When a caller enumerates supported categories
    // Then the category set is stable and provider-independent
    expect(NOTIFICATION_CATEGORIES).toEqual(["security", "delivery", "operations"])
  })

  it("masks short and long secrets without returning plaintext", () => {
    // Given provider credentials at a response or logging boundary
    // When they are masked
    // Then only a safe suffix is retained
    expect(maskSecret("opaque-token-fixture")).toBe("••••••••ture")
    expect(maskSecret("abc")).toBe("••••••••")
    expect(maskSecret("")).toBe("••••••••")
  })

  it("bounds retries and uses exponential backoff", () => {
    // Given transient notification delivery attempts
    // When retry delays are calculated
    // Then delays are bounded and never become an unbounded retry loop
    expect(retryDelayMs(1)).toBe(250)
    expect(retryDelayMs(2)).toBe(500)
    expect(retryDelayMs(3)).toBe(1000)
    expect(retryDelayMs(4)).toBe(2000)
    expect(retryDelayMs(99)).toBe(2000)
  })

  it("classifies provider failures without including provider payloads", () => {
    // Given a transient timeout, a permanent status, and an unsafe provider response
    // When failures cross the notification boundary
    // Then only stable redacted classifications leave the adapter
    expect(classifyNotificationFailure(new Error("socket timeout"), "timeout")).toEqual({
      code: "transient",
      retryable: true,
      detail: "provider timeout",
    })
    expect(classifyNotificationFailure(new Error("telegram 400 bad token"), "provider")).toEqual({
      code: "permanent",
      retryable: false,
      detail: "provider rejected request",
    })
    expect(
      classifyNotificationFailure(new Error("smtp password=opaque-token-fixture"), "unknown"),
    ).toEqual({
      code: "unknown",
      retryable: false,
      detail: "provider failure",
    })
  })

  it("does not call a disabled channel and masks encrypted settings", async () => {
    // Given independently configured but disabled channels and enabled category preferences
    const fixture = createFixture()
    let emailCalls = 0
    const service = createNotificationService({
      repository: fixture.repository,
      cipher: fixture.cipher,
      providers: {
        email: async () => {
          emailCalls += 1
        },
        telegram: async () => undefined,
      },
      audit: async () => undefined,
      sleep: async () => undefined,
    })
    await service.saveSettings("admin-1", {
      accountScope: "personal",
      email: {
        enabled: false,
        host: "smtp.example.invalid",
        port: 465,
        secure: true,
        username: "admin@example.invalid",
        password: "opaque-smtp-fixture",
        from: "admin@example.invalid",
      },
      telegram: { enabled: false, botToken: "opaque-telegram-fixture", chatIds: ["12345"] },
    })
    await service.savePreferences("personal", {
      security: { email: true, telegram: true },
      delivery: { email: true, telegram: true },
      operations: { email: true, telegram: true },
    })

    // When a test send is requested
    const result = await service.sendTest("admin-1", "personal")

    // Then disabled channels make no provider call and settings never return plaintext
    expect(result).toEqual({ email: "disabled", telegram: "disabled" })
    expect(emailCalls).toBe(0)
    expect(fixture.settings[0]?.configCiphertext).not.toContain("opaque-smtp-fixture")
    await expect(service.readSettings("personal")).resolves.toMatchObject({
      email: { password: "••••••••ture" },
      telegram: { botToken: "••••••••ture" },
    })
  })

  it("retries transient provider failures three times and records redacted failure state", async () => {
    // Given an enabled email channel and an enabled operations preference
    const fixture = createFixture()
    let attempts = 0
    const service = createNotificationService({
      repository: fixture.repository,
      cipher: fixture.cipher,
      providers: {
        email: async () => {
          attempts += 1
          throw new NotificationProviderError("timeout", "secret provider response")
        },
      },
      audit: async () => undefined,
      sleep: async () => undefined,
    })
    await service.saveSettings("admin-1", {
      accountScope: "personal",
      email: {
        enabled: true,
        host: "smtp.example.invalid",
        port: 465,
        secure: true,
        username: "admin@example.invalid",
        password: "opaque-smtp-fixture",
        from: "admin@example.invalid",
      },
      telegram: { enabled: false, botToken: "opaque-telegram-fixture", chatIds: ["12345"] },
    })
    await service.savePreferences("personal", {
      security: { email: false, telegram: false },
      delivery: { email: false, telegram: false },
      operations: { email: true, telegram: false },
    })

    // When the test send encounters a transient provider timeout
    const result = await service.sendTest("admin-1", "personal")

    // Then retries stop at the bound and only safe classification is persisted
    expect(result.email).toBe("failed")
    expect(attempts).toBe(3)
    expect(fixture.updates.at(-1)).toMatchObject({
      state: "failed",
      failureCode: "transient",
      failureDetail: "provider timeout",
    })
    expect(JSON.stringify(fixture.updates)).not.toContain("secret provider response")
  })

  it("does not retry permanent provider failures", async () => {
    // Given an enabled Telegram channel and an enabled operations preference
    const fixture = createFixture()
    let attempts = 0
    const service = createNotificationService({
      repository: fixture.repository,
      cipher: fixture.cipher,
      providers: {
        telegram: async () => {
          attempts += 1
          throw new NotificationProviderError("provider", "malformed response")
        },
      },
      audit: async () => undefined,
      sleep: async () => undefined,
    })
    await service.saveSettings("admin-1", {
      accountScope: "personal",
      email: {
        enabled: false,
        host: "smtp.example.invalid",
        port: 465,
        secure: true,
        username: "admin@example.invalid",
        password: "opaque-smtp-fixture",
        from: "admin@example.invalid",
      },
      telegram: { enabled: true, botToken: "opaque-telegram-fixture", chatIds: ["12345"] },
    })
    await service.savePreferences("personal", {
      security: { email: false, telegram: false },
      delivery: { email: false, telegram: false },
      operations: { email: false, telegram: true },
    })

    // When the test send receives a permanent provider rejection
    const result = await service.sendTest("admin-1", "personal")

    // Then it fails once without a retry or provider response leakage
    expect(result.telegram).toBe("failed")
    expect(attempts).toBe(1)
    expect(fixture.updates.at(-1)).toMatchObject({
      state: "failed",
      failureCode: "permanent",
      failureDetail: "provider rejected request",
    })
  })
})
