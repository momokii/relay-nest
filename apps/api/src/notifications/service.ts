import type { AccountScope } from "../db/schema/shared"
import {
  classifyNotificationFailure,
  type NotificationCategory,
  type NotificationChannel,
  retryDelayMs,
} from "./contracts"
import {
  NotificationProviderError,
  type SmtpSettings,
  sendSmtp,
  sendTelegram,
  type TelegramSettings,
} from "./providers"
import { createNotificationSettings, decryptSmtp, decryptTelegram } from "./settings"
import type {
  Cipher,
  NotificationProviders,
  NotificationRepository,
  NotificationSettingsInput,
  NotificationSettingsView,
} from "./types"

export class NotificationPersistenceError extends Error {
  readonly name = "NotificationPersistenceError"
}

export function createNotificationService(options: {
  readonly repository: NotificationRepository
  readonly cipher: Cipher
  readonly providers?: Partial<NotificationProviders>
  readonly audit: (input: {
    readonly actorUserId: string
    readonly action: string
    readonly subjectType: string
    readonly subjectId: string
    readonly accountScope: AccountScope
  }) => Promise<void>
  readonly now?: () => Date
  readonly sleep?: (milliseconds: number) => Promise<void>
}) {
  const now = options.now ?? (() => new Date())
  const sleep =
    options.sleep ??
    ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  const providers: NotificationProviders = {
    email: options.providers?.email ?? sendSmtp,
    telegram: options.providers?.telegram ?? sendTelegram,
  }
  const settings = createNotificationSettings({
    repository: options.repository,
    cipher: options.cipher,
    audit: options.audit,
  })

  async function sendTest(
    userId: string,
    accountScope: AccountScope,
    category: NotificationCategory = "operations",
  ): Promise<Readonly<Record<NotificationChannel, "sent" | "disabled" | "failed">>> {
    const [configured, preferences] = await Promise.all([
      options.repository.notificationProviderSettings.list(accountScope),
      options.repository.notificationPreferences.list(accountScope),
    ])
    const preference = preferences.find((item) => item.category === category)
    const outcomes: Record<NotificationChannel, "sent" | "disabled" | "failed"> = {
      email: "disabled",
      telegram: "disabled",
    }
    for (const channel of ["email", "telegram"] as const) {
      const setting = configured.find((item) => item.channel === channel)
      const preferenceEnabled =
        channel === "email" ? preference?.emailEnabled : preference?.telegramEnabled
      if (!setting?.enabled || preferenceEnabled !== true) continue
      const delivery =
        channel === "email"
          ? {
              channel: "email" as const,
              config: decryptSmtp(options.cipher, setting, accountScope),
            }
          : {
              channel: "telegram" as const,
              config: decryptTelegram(options.cipher, setting, accountScope),
            }
      const destination =
        delivery.channel === "email" ? delivery.config.from : delivery.config.chatIds.join(",")
      const encryptedDestination = options.cipher.encrypt(destination, { accountScope })
      const encryptedBody = options.cipher.encrypt("Waha Command Center notification test", {
        accountScope,
      })
      const notification = await options.repository.notifications.enqueue({
        userId,
        accountScope,
        channel,
        category,
        destinationCiphertext: encryptedDestination.ciphertext,
        destinationNonce: encryptedDestination.nonce,
        destinationAuthTag: encryptedDestination.authTag,
        bodyCiphertext: encryptedBody.ciphertext,
        bodyNonce: encryptedBody.nonce,
        bodyAuthTag: encryptedBody.authTag,
      })
      if (!notification) throw new NotificationPersistenceError("notification was not persisted")
      outcomes[channel] = (await deliver(notification.id, delivery, userId, accountScope))
        ? "sent"
        : "failed"
    }
    return outcomes
  }

  async function deliver(
    notificationId: string,
    delivery:
      | { readonly channel: "email"; readonly config: SmtpSettings }
      | { readonly channel: "telegram"; readonly config: TelegramSettings },
    actorUserId: string,
    accountScope: AccountScope,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await options.repository.notifications.updateAttempt(notificationId, {
        state: "attempting",
        attempts: attempt,
        lastAttemptAt: now(),
      })
      try {
        if (delivery.channel === "email") {
          await providers.email(
            delivery.config,
            "Notification test",
            "Waha Command Center notification test",
          )
        } else {
          await providers.telegram(delivery.config, "Waha Command Center notification test")
        }
        await options.repository.notifications.updateAttempt(notificationId, {
          state: "sent",
          failureCode: null,
          failureDetail: null,
          nextAttemptAt: null,
        })
        await options.audit({
          actorUserId,
          action: "notification.sent",
          subjectType: "notification",
          subjectId: notificationId,
          accountScope,
        })
        return true
      } catch (error) {
        const kind = error instanceof NotificationProviderError ? error.kind : "unknown"
        const failure = classifyNotificationFailure(error, kind)
        const retry = failure.retryable && attempt < 3
        await options.repository.notifications.updateAttempt(notificationId, {
          state: retry ? "queued" : "failed",
          failureCode: failure.code,
          failureDetail: failure.detail,
          nextAttemptAt: retry ? new Date(now().getTime() + retryDelayMs(attempt)) : null,
        })
        if (retry) {
          await sleep(retryDelayMs(attempt))
          continue
        }
        await options.audit({
          actorUserId,
          action: "notification.failed",
          subjectType: "notification",
          subjectId: notificationId,
          accountScope,
        })
        return false
      }
    }
    return false
  }

  return {
    readSettings: settings.read,
    saveSettings: (
      actorUserId: string,
      input: NotificationSettingsInput,
    ): Promise<NotificationSettingsView> => settings.save(actorUserId, input),
    savePreferences: settings.savePreferences,
    sendTest,
    listHistory: (accountScope: AccountScope, limit = 50) =>
      options.repository.notifications.list(accountScope, limit),
  }
}

export type NotificationService = ReturnType<typeof createNotificationService>
