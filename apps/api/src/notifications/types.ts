import type { createEnvelopeCipher } from "@waha-command-center/config"

import type { AccountScope } from "../db/schema/shared"
import type { NotificationCategory, NotificationChannel } from "./contracts"
import type { SmtpSettings, TelegramSettings } from "./providers"

export type Cipher = ReturnType<typeof createEnvelopeCipher>

export type ProviderSettingsRow = {
  readonly accountScope: AccountScope
  readonly channel: NotificationChannel
  readonly enabled: boolean
  readonly configCiphertext: string
  readonly configNonce: string
  readonly configAuthTag: string
}

export type NotificationRepository = {
  readonly notificationProviderSettings: {
    readonly upsert: (input: {
      readonly accountScope: AccountScope
      readonly channel: NotificationChannel
      readonly enabled: boolean
      readonly configCiphertext: string
      readonly configNonce: string
      readonly configAuthTag: string
    }) => Promise<ProviderSettingsRow | undefined>
    readonly list: (scope: AccountScope) => Promise<readonly ProviderSettingsRow[]>
  }
  readonly notificationPreferences: {
    readonly upsert: (input: {
      readonly accountScope: AccountScope
      readonly category: NotificationCategory
      readonly emailEnabled: boolean
      readonly telegramEnabled: boolean
    }) => Promise<unknown>
    readonly list: (scope: AccountScope) => Promise<
      readonly {
        readonly category: string
        readonly emailEnabled: boolean
        readonly telegramEnabled: boolean
      }[]
    >
  }
  readonly notifications: {
    readonly enqueue: (input: {
      readonly userId: string
      readonly accountScope: AccountScope
      readonly channel: NotificationChannel
      readonly category: NotificationCategory
      readonly destinationCiphertext: string
      readonly destinationNonce: string
      readonly destinationAuthTag: string
      readonly bodyCiphertext: string
      readonly bodyNonce: string
      readonly bodyAuthTag: string
    }) => Promise<{ readonly id: string } | undefined>
    readonly updateAttempt: (
      id: string,
      patch: {
        readonly state?: "queued" | "attempting" | "sent" | "failed"
        readonly attempts?: number
        readonly failureCode?: string | null
        readonly failureDetail?: string | null
        readonly nextAttemptAt?: Date | null
        readonly lastAttemptAt?: Date | null
      },
    ) => Promise<unknown>
    readonly list: (accountScope: AccountScope, limit?: number) => Promise<readonly unknown[]>
  }
}

export type NotificationSettingsInput = {
  readonly accountScope: AccountScope
  readonly email: SmtpSettings & { readonly enabled: boolean }
  readonly telegram: TelegramSettings & { readonly enabled: boolean }
}

export type NotificationSettingsView = {
  readonly accountScope: AccountScope
  readonly email: {
    readonly enabled: boolean
    readonly configured: boolean
    readonly host: string | null
    readonly port: number | null
    readonly secure: boolean
    readonly username: string | null
    readonly password: string
    readonly from: string | null
  }
  readonly telegram: {
    readonly enabled: boolean
    readonly configured: boolean
    readonly botToken: string
    readonly chatIds: readonly string[]
  }
}

export type NotificationProviders = {
  readonly email: (settings: SmtpSettings, subject: string, body: string) => Promise<void>
  readonly telegram: (settings: TelegramSettings, text: string) => Promise<void>
}
