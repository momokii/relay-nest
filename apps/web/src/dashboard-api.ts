import { z } from "zod"
import { classifyDashboardHttpStatus, type DashboardHttpFailure } from "./dashboard-http"
import type { AccountScope } from "./dashboard-model"

const roleSchema = z.enum(["admin", "operator", "viewer"])
const scopeSchema = z.enum(["personal", "business"])

const principalSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    displayName: z.string(),
    rolesByScope: z.record(scopeSchema, z.array(roleSchema)),
  }),
})

const sessionSchema = z.object({
  id: z.string(),
  accountScope: scopeSchema,
  name: z.string(),
  status: z.string(),
  serviceHealth: z.string(),
  sendingReadiness: z.string(),
})

const analyticsSchema = z.object({
  scope: scopeSchema,
  window: z.object({ from: z.string(), to: z.string() }),
  messageVolume: z.object({
    total: z.number(),
    inbound: z.number(),
    outbound: z.number(),
    unknownDirection: z.number(),
  }),
  acknowledgments: z.object({
    submitted: z.number(),
    acknowledged: z.number(),
    failed: z.number(),
    unknown: z.number(),
  }),
  failureRate: z.number().nullable(),
  uptimeMs: z.number().nullable(),
  retryCount: z.number(),
  timelockIndicators: z.number(),
  cappingIndicators: z.number(),
  contactActivity: z.number(),
  scheduledJobs: z.object({
    total: z.number(),
    scheduled: z.number(),
    queued: z.number(),
    attempting: z.number(),
    submitted: z.number(),
    acknowledged: z.number(),
    failed: z.number(),
    unknown: z.number(),
    cancelled: z.number(),
    retries: z.number(),
  }),
  sessions: z.array(z.unknown()),
})

const contactSchema = z.object({
  id: z.string(),
  phone: z.string(),
  displayName: z.string().nullable(),
})

const sendResultSchema = z.discriminatedUnion("state", [
  z.object({ state: z.enum(["submitted", "acknowledged"]), providerMessageId: z.string() }),
  z.object({ state: z.literal("scheduled"), jobId: z.string() }),
  z.object({ state: z.enum(["failed", "unknown"]), recoveryCode: z.string() }),
])

const retentionPolicySchema = z.object({
  id: z.string(),
  accountScope: scopeSchema,
  category: z.string(),
  retentionDays: z.number(),
})

const previewSchema = z.object({
  cutoff: z.string(),
  count: z.number(),
  previewToken: z.string(),
})

const notificationSettingsSchema = z.object({
  accountScope: scopeSchema,
  email: z.object({ enabled: z.boolean(), configured: z.boolean() }).passthrough(),
  telegram: z.object({ enabled: z.boolean(), configured: z.boolean() }).passthrough(),
})

export type Principal = z.infer<typeof principalSchema>
export type SessionView = z.infer<typeof sessionSchema>
export type AnalyticsView = z.infer<typeof analyticsSchema>
export type ContactView = z.infer<typeof contactSchema>
export type SendResult = z.infer<typeof sendResultSchema>
export type RetentionPolicy = z.infer<typeof retentionPolicySchema>
export type RetentionPreview = z.infer<typeof previewSchema>
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>

export type ApiResult<T> =
  | { readonly kind: "ready"; readonly data: T }
  | { readonly kind: "unavailable"; readonly message: string }
  | { readonly kind: "denied"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }

export type SendInput = Readonly<{
  scope: AccountScope
  sessionId: string
  recipient: string
  message: string
  idempotencyKey: string
}>

export type ScheduleInput = SendInput &
  Readonly<{
    scheduledFor: string
    timezone: string
  }>

export type DashboardApi = Readonly<{
  getPrincipal: () => Promise<ApiResult<Principal>>
  getSessions: (scope: AccountScope) => Promise<ApiResult<readonly SessionView[]>>
  getAnalytics: (scope: AccountScope) => Promise<ApiResult<AnalyticsView>>
  resolveContact: (
    scope: AccountScope,
    sessionId: string,
    recipient: string,
  ) => Promise<ApiResult<ContactView>>
  sendImmediate: (input: SendInput) => Promise<ApiResult<SendResult>>
  scheduleMessage: (input: ScheduleInput) => Promise<ApiResult<SendResult>>
  getNotifications: (scope: AccountScope) => Promise<ApiResult<NotificationSettings>>
  getRetention: (scope: AccountScope) => Promise<ApiResult<readonly RetentionPolicy[]>>
  previewPurge: (scope: AccountScope, category: string) => Promise<ApiResult<RetentionPreview>>
  purge: (
    scope: AccountScope,
    input: Readonly<{
      category: string
      cutoff: string
      previewCount: number
      previewToken: string
    }>,
  ) => Promise<ApiResult<{ readonly deletedCount: number }>>
}>

class DashboardApiError extends Error {
  readonly name = "DashboardApiError"

  constructor(
    readonly status: number,
    readonly classification: DashboardHttpFailure,
  ) {
    super("Dashboard request failed")
  }
}

function csrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined
  const csrfCookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("waha_csrf="))
  return csrfCookie?.slice("waha_csrf=".length)
}

export async function requestJson<T>(
  url: string,
  schema: z.ZodType<T>,
  init: Readonly<RequestInit> = {},
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        accept: "application/json",
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        ...(init.method === undefined || init.method === "GET"
          ? {}
          : { "x-csrf-token": csrfToken() ?? "" }),
        ...init.headers,
      },
    })
    if (!response.ok)
      throw new DashboardApiError(response.status, classifyDashboardHttpStatus(response.status))
    const payload: unknown = response.status === 204 ? null : await response.json()
    return { kind: "ready", data: schema.parse(payload) }
  } catch (error) {
    if (error instanceof DashboardApiError) {
      if (error.classification === "denied")
        return { kind: "denied", message: "The server denied this scoped request." }
      if (error.classification === "unavailable")
        return { kind: "unavailable", message: "WAHA or this capability is unavailable." }
      return { kind: "error", message: "The server could not complete this request." }
    }
    if (error instanceof TypeError)
      return { kind: "unavailable", message: "The API is unavailable." }
    if (error instanceof z.ZodError)
      return { kind: "error", message: "The API returned an unreadable response." }
    return { kind: "error", message: "The API returned an unreadable response." }
  }
}

export function createDashboardApi(baseUrl = ""): DashboardApi {
  const root = baseUrl.replace(/\/$/, "")
  const url = (path: string): string => `${root}${path}`
  const scoped = (path: string, scope: AccountScope): string => `${url(path)}?scope=${scope}`
  const json = (body: object): string => JSON.stringify(body)

  return {
    getPrincipal: () => requestJson(url("/auth/me"), principalSchema),
    getSessions: async (scope) => {
      const result = await requestJson(scoped("/scoped/sessions", scope), z.array(sessionSchema))
      return result.kind === "ready" ? { kind: "ready", data: result.data } : result
    },
    getAnalytics: (scope) => requestJson(scoped("/scoped/analytics", scope), analyticsSchema),
    resolveContact: (scope, sessionId, recipient) =>
      requestJson(`${url(`/scoped/sessions/${sessionId}/contact`)}?scope=${scope}`, contactSchema, {
        method: "POST",
        body: json({ phoneNumber: recipient }),
      }),
    sendImmediate: (input) =>
      requestJson(
        `${url(`/scoped/sessions/${input.sessionId}/messages/immediate`)}?scope=${input.scope}`,
        sendResultSchema,
        {
          method: "POST",
          body: json({
            phoneNumber: input.recipient,
            message: input.message,
            idempotencyKey: input.idempotencyKey,
          }),
        },
      ),
    scheduleMessage: (input) =>
      requestJson(
        `${url(`/scoped/sessions/${input.sessionId}/messages/schedule`)}?scope=${input.scope}`,
        sendResultSchema,
        {
          method: "POST",
          body: json({
            phoneNumber: input.recipient,
            message: input.message,
            idempotencyKey: input.idempotencyKey,
            scheduledFor: input.scheduledFor,
            timezone: input.timezone,
          }),
        },
      ),
    getNotifications: (scope) =>
      requestJson(url(`/admin/notifications/${scope}/settings`), notificationSettingsSchema),
    getRetention: async (scope) => {
      const result = await requestJson(
        url(`/admin/retention/${scope}`),
        z.array(retentionPolicySchema),
      )
      return result.kind === "ready" ? { kind: "ready", data: result.data } : result
    },
    previewPurge: (scope, category) =>
      requestJson(url(`/admin/retention/${scope}/preview`), previewSchema, {
        method: "POST",
        body: json({ category }),
      }),
    purge: (scope, input) =>
      requestJson(url(`/admin/retention/${scope}/purge`), z.object({ deletedCount: z.number() }), {
        method: "POST",
        body: json({ ...input, confirmed: true }),
      }),
  }
}
