import { z } from "zod"

import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationChannel,
} from "./contracts"
import type { SmtpSettings, TelegramSettings } from "./providers"
import type {
  Cipher,
  NotificationRepository,
  NotificationSettingsInput,
  NotificationSettingsView,
  ProviderSettingsRow,
} from "./types"

const smtpSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65_535),
  secure: z.literal(true),
  username: z.string().min(1),
  password: z.string().min(1),
  from: z.string().email(),
})
const telegramSchema = z.object({
  botToken: z.string().min(1),
  chatIds: z.array(z.string()).min(1),
})

export function createNotificationSettings(options: {
  readonly repository: NotificationRepository
  readonly cipher: Cipher
  readonly audit: (input: {
    readonly actorUserId: string
    readonly action: string
    readonly subjectType: string
    readonly subjectId: string
    readonly accountScope: "personal" | "business"
  }) => Promise<void>
}) {
  async function read(accountScope: "personal" | "business"): Promise<NotificationSettingsView> {
    const rows = await options.repository.notificationProviderSettings.list(accountScope)
    const email = rows.find((row) => row.channel === "email")
    const telegram = rows.find((row) => row.channel === "telegram")
    const emailConfig = email ? decryptSmtp(options.cipher, email, accountScope) : null
    const telegramConfig = telegram ? decryptTelegram(options.cipher, telegram, accountScope) : null
    return {
      accountScope,
      email: {
        enabled: email?.enabled ?? false,
        configured: emailConfig !== null,
        host: emailConfig?.host ?? null,
        port: emailConfig?.port ?? null,
        secure: emailConfig?.secure ?? false,
        username: emailConfig?.username ?? null,
        password: emailConfig ? mask(emailConfig.password) : mask(""),
        from: emailConfig?.from ?? null,
      },
      telegram: {
        enabled: telegram?.enabled ?? false,
        configured: telegramConfig !== null,
        botToken: telegramConfig ? mask(telegramConfig.botToken) : mask(""),
        chatIds: telegramConfig?.chatIds.map(mask) ?? [],
      },
    }
  }

  async function save(
    actorUserId: string,
    input: NotificationSettingsInput,
  ): Promise<NotificationSettingsView> {
    const existing = await options.repository.notificationProviderSettings.list(input.accountScope)
    await Promise.all([
      saveChannel(
        input.accountScope,
        "email",
        input.email.enabled,
        input.email,
        existing.find((row) => row.channel === "email"),
      ),
      saveChannel(
        input.accountScope,
        "telegram",
        input.telegram.enabled,
        input.telegram,
        existing.find((row) => row.channel === "telegram"),
      ),
    ])
    await options.audit({
      actorUserId,
      action: "notification.settings_updated",
      subjectType: "notification_settings",
      subjectId: input.accountScope,
      accountScope: input.accountScope,
    })
    return read(input.accountScope)
  }

  async function savePreferences(
    accountScope: "personal" | "business",
    preferences: Readonly<
      Record<NotificationCategory, { readonly email: boolean; readonly telegram: boolean }>
    >,
  ): Promise<void> {
    await Promise.all(
      NOTIFICATION_CATEGORIES.map((category) =>
        options.repository.notificationPreferences.upsert({
          accountScope,
          category,
          emailEnabled: preferences[category].email,
          telegramEnabled: preferences[category].telegram,
        }),
      ),
    )
  }

  async function saveChannel(
    accountScope: "personal" | "business",
    channel: NotificationChannel,
    enabled: boolean,
    config: SmtpSettings | TelegramSettings,
    existing: ProviderSettingsRow | undefined,
  ): Promise<void> {
    const resolved = resolveMasked(options.cipher, accountScope, config, existing)
    const envelope = options.cipher.encrypt(JSON.stringify(resolved), { accountScope })
    await options.repository.notificationProviderSettings.upsert({
      accountScope,
      channel,
      enabled,
      configCiphertext: envelope.ciphertext,
      configNonce: envelope.nonce,
      configAuthTag: envelope.authTag,
    })
  }

  return { read, save, savePreferences }
}

function resolveMasked(
  cipher: Cipher,
  accountScope: "personal" | "business",
  config: SmtpSettings | TelegramSettings,
  existing: ProviderSettingsRow | undefined,
): SmtpSettings | TelegramSettings {
  if (!existing) return config
  if ("password" in config && config.password.startsWith("••••••••")) {
    return { ...config, password: decryptSmtp(cipher, existing, accountScope).password }
  }
  if ("botToken" in config && config.botToken.startsWith("••••••••")) {
    const prior = decryptTelegram(cipher, existing, accountScope)
    const chatIds = config.chatIds.every((chatId) => chatId.startsWith("••••••••"))
      ? prior.chatIds
      : config.chatIds
    return { ...config, botToken: prior.botToken, chatIds }
  }
  return config
}

export function decryptSmtp(
  cipher: Cipher,
  row: ProviderSettingsRow,
  accountScope: "personal" | "business",
): SmtpSettings {
  return smtpSchema.parse(decryptJson(cipher, row, accountScope))
}

export function decryptTelegram(
  cipher: Cipher,
  row: ProviderSettingsRow,
  accountScope: "personal" | "business",
): TelegramSettings {
  return telegramSchema.parse(decryptJson(cipher, row, accountScope))
}

function decryptJson(
  cipher: Cipher,
  row: ProviderSettingsRow,
  accountScope: "personal" | "business",
): unknown {
  return JSON.parse(
    cipher.decrypt(
      {
        version: 1,
        algorithm: "aes-256-gcm",
        ciphertext: row.configCiphertext,
        nonce: row.configNonce,
        authTag: row.configAuthTag,
      },
      { accountScope },
    ),
  )
}

function mask(value: string): string {
  return `••••••••${value.length >= 4 ? value.slice(-4) : ""}`
}
