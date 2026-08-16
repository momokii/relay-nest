import { and, desc, eq } from "drizzle-orm"

import type { PersistenceDatabase } from "../client"
import { notificationPreferences, notificationProviderSettings, notifications } from "../schema"
import type { AccountScope } from "../schema/shared"

export function createNotificationRepositories(db: PersistenceDatabase) {
  return {
    notifications: {
      enqueue: (input: typeof notifications.$inferInsert) =>
        db
          .insert(notifications)
          .values(input)
          .returning()
          .then(([notification]) => notification),
      updateAttempt: async (
        id: string,
        patch: Partial<
          Pick<
            typeof notifications.$inferInsert,
            | "state"
            | "attempts"
            | "failureCode"
            | "failureDetail"
            | "nextAttemptAt"
            | "lastAttemptAt"
          >
        >,
      ) =>
        db
          .update(notifications)
          .set(patch)
          .where(eq(notifications.id, id))
          .returning()
          .then(([notification]) => notification),
      list: (accountScope: AccountScope, limit = 50) =>
        db
          .select({
            id: notifications.id,
            accountScope: notifications.accountScope,
            channel: notifications.channel,
            category: notifications.category,
            state: notifications.state,
            attempts: notifications.attempts,
            failureCode: notifications.failureCode,
            failureDetail: notifications.failureDetail,
            createdAt: notifications.createdAt,
            lastAttemptAt: notifications.lastAttemptAt,
          })
          .from(notifications)
          .where(eq(notifications.accountScope, accountScope))
          .orderBy(desc(notifications.createdAt))
          .limit(limit),
    },
    notificationProviderSettings: {
      upsert: (input: typeof notificationProviderSettings.$inferInsert) =>
        db
          .insert(notificationProviderSettings)
          .values(input)
          .onConflictDoUpdate({
            target: [
              notificationProviderSettings.accountScope,
              notificationProviderSettings.channel,
            ],
            set: {
              enabled: input.enabled,
              configCiphertext: input.configCiphertext,
              configNonce: input.configNonce,
              configAuthTag: input.configAuthTag,
              updatedAt: new Date(),
            },
          })
          .returning()
          .then(([setting]) => setting),
      find: async (accountScope: AccountScope, channel: "email" | "telegram") => {
        const [setting] = await db
          .select()
          .from(notificationProviderSettings)
          .where(
            and(
              eq(notificationProviderSettings.accountScope, accountScope),
              eq(notificationProviderSettings.channel, channel),
            ),
          )
          .limit(1)
        return setting ?? null
      },
      list: (accountScope: AccountScope) =>
        db
          .select()
          .from(notificationProviderSettings)
          .where(eq(notificationProviderSettings.accountScope, accountScope)),
    },
    notificationPreferences: {
      upsert: (input: typeof notificationPreferences.$inferInsert) =>
        db
          .insert(notificationPreferences)
          .values(input)
          .onConflictDoUpdate({
            target: [notificationPreferences.accountScope, notificationPreferences.category],
            set: {
              emailEnabled: input.emailEnabled,
              telegramEnabled: input.telegramEnabled,
              updatedAt: new Date(),
            },
          })
          .returning()
          .then(([preference]) => preference),
      list: (accountScope: AccountScope) =>
        db
          .select()
          .from(notificationPreferences)
          .where(eq(notificationPreferences.accountScope, accountScope)),
    },
  }
}
