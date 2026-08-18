import { z } from "zod"

import { type ApiResult, requestJson } from "./dashboard-api"
import type { AccountScope } from "./dashboard-model"

const channelSchema = z.object({
  enabled: z.boolean(),
  configured: z.boolean(),
  host: z.string().nullable().optional(),
  port: z.number().int().nullable().optional(),
  secure: z.boolean().optional(),
  username: z.string().nullable().optional(),
  password: z.string().optional(),
  from: z.string().nullable().optional(),
  botToken: z.string().optional(),
  chatIds: z.array(z.string()).optional(),
})

const settingsSchema = z.object({
  accountScope: z.enum(["personal", "business"]),
  email: channelSchema,
  telegram: channelSchema,
})

const preferencesSchema = z.object({
  security: z.object({ email: z.boolean(), telegram: z.boolean() }),
  delivery: z.object({ email: z.boolean(), telegram: z.boolean() }),
  operations: z.object({ email: z.boolean(), telegram: z.boolean() }),
})

const historyEntrySchema = z.object({
  id: z.string().uuid(),
  channel: z.enum(["email", "telegram"]),
  category: z.string(),
  state: z.enum(["queued", "attempting", "sent", "failed"]),
  attempts: z.number().int().nonnegative(),
  failureCode: z.string().nullable().optional(),
  nextAttemptAt: z.string().nullable().optional(),
  lastAttemptAt: z.string().nullable().optional(),
  createdAt: z.string(),
})

const testResultSchema = z.object({
  email: z.enum(["sent", "disabled", "failed"]),
  telegram: z.enum(["sent", "disabled", "failed"]),
})

export type NotificationSettings = z.infer<typeof settingsSchema>
export type NotificationPreferences = z.infer<typeof preferencesSchema>
export type NotificationHistoryEntry = z.infer<typeof historyEntrySchema>
export type NotificationSettingsInput = Readonly<{
  email: Readonly<{
    enabled: boolean
    host: string
    port: number
    secure: true
    username: string
    password: string
    from: string
  }>
  telegram: Readonly<{
    enabled: boolean
    botToken: string
    chatIds: readonly string[]
  }>
}>
export type NotificationTestResult = z.infer<typeof testResultSchema>

export type DashboardNotificationApi = Readonly<{
  getSettings: (scope: AccountScope) => Promise<ApiResult<NotificationSettings>>
  saveSettings: (
    scope: AccountScope,
    input: NotificationSettingsInput,
  ) => Promise<ApiResult<NotificationSettings>>
  savePreferences: (scope: AccountScope, input: NotificationPreferences) => Promise<ApiResult<null>>
  test: (
    scope: AccountScope,
    category: "security" | "delivery" | "operations",
  ) => Promise<ApiResult<NotificationTestResult>>
  history: (
    scope: AccountScope,
    limit?: number,
  ) => Promise<ApiResult<readonly NotificationHistoryEntry[]>>
}>

export function createDashboardNotificationApi(baseUrl = ""): DashboardNotificationApi {
  const root = baseUrl.replace(/\/$/, "")
  const url = (path: string): string => `${root}${path}`
  const path = (scope: AccountScope, suffix: string): string =>
    url(`/admin/notifications/${scope}/${suffix}`)

  return {
    getSettings: (scope) => requestJson(path(scope, "settings"), settingsSchema),
    saveSettings: (scope, input) =>
      requestJson(path(scope, "settings"), settingsSchema, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    savePreferences: (scope, input) =>
      requestJson(path(scope, "preferences"), z.null(), {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    test: (scope, category) =>
      requestJson(path(scope, "test"), testResultSchema, {
        method: "POST",
        body: JSON.stringify({ category }),
      }),
    history: (scope, limit = 50) =>
      requestJson(`${path(scope, "history")}?limit=${limit}`, z.array(historyEntrySchema)),
  }
}
