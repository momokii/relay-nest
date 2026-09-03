import { z } from "zod"

import { type ApiResult, requestJson, type SessionView } from "./dashboard-api"
import type { AccountScope } from "./dashboard-model"

const sessionSchema = z.object({
  id: z.string(),
  accountScope: z.enum(["personal", "business"]),
  name: z.string(),
  status: z.string(),
  serviceHealth: z.string(),
  sendingReadiness: z.string(),
})
const historySchema = z.array(z.object({ status: z.string(), observedAt: z.string() }))
const metadataSchema = z.object({ id: z.string().optional(), pushname: z.string().optional() })
const qrSchema = z.object({ value: z.string() })
const acceptedSchema = z.object({ accepted: z.literal(true) })
const chatSchema = z.object({
  phone: z.string().nullable(),
  name: z.string().nullable(),
  isGroup: z.boolean(),
  lastActivity: z
    .object({
      preview: z.string().nullable(),
      at: z.string().nullable(),
      fromMe: z.boolean().nullable(),
    })
    .nullable(),
  ref: z.string().nullable().optional(),
})
const messageSchema = z.object({
  id: z.string().nullable(),
  at: z.string().nullable(),
  direction: z.enum(["in", "out", "unknown"]),
  preview: z.string().nullable(),
  hasMedia: z.boolean(),
  mimetype: z.string().nullable(),
})
export const createSessionSchema = z.object({
  connectionId: z.string().uuid(),
  name: z.string().min(1),
  wahaSessionName: z.string().min(1),
  status: z.string().optional(),
})

export const SESSION_LIFECYCLE_ACTIONS = ["start", "stop", "restart", "logout", "delete"] as const
export type SessionLifecycleAction = (typeof SESSION_LIFECYCLE_ACTIONS)[number]
export type SessionStatusHistory = z.infer<typeof historySchema>[number]
export type SessionQr = z.infer<typeof qrSchema>
export type SessionMetadata = z.infer<typeof metadataSchema>
export type SessionCreateInput = z.infer<typeof createSessionSchema>
export type SessionChat = z.infer<typeof chatSchema>
export type MessageView = z.infer<typeof messageSchema>

export type DashboardSessionApi = Readonly<{
  create: (scope: AccountScope, input: SessionCreateInput) => Promise<ApiResult<SessionView>>
  get: (scope: AccountScope, sessionId: string) => Promise<ApiResult<SessionView>>
  metadata: (scope: AccountScope, sessionId: string) => Promise<ApiResult<SessionMetadata>>
  qr: (scope: AccountScope, sessionId: string) => Promise<ApiResult<SessionQr>>
  pairingCode: (
    scope: AccountScope,
    sessionId: string,
    phoneNumber: string,
  ) => Promise<ApiResult<{ readonly accepted: true }>>
  lifecycle: (
    scope: AccountScope,
    sessionId: string,
    action: SessionLifecycleAction,
    confirmed: boolean,
  ) => Promise<ApiResult<SessionView | null>>
  getStatusHistory: (
    scope: AccountScope,
    sessionId: string,
  ) => Promise<ApiResult<readonly SessionStatusHistory[]>>
  chats: (scope: AccountScope, sessionId: string) => Promise<ApiResult<readonly SessionChat[]>>
  messages: (
    scope: AccountScope,
    sessionId: string,
    ref: string,
  ) => Promise<ApiResult<readonly MessageView[]>>
  messageMediaUrl: (
    scope: AccountScope,
    sessionId: string,
    ref: string,
    messageId: string,
  ) => string
}>

export function createDashboardSessionApi(baseUrl = ""): DashboardSessionApi {
  const root = baseUrl.replace(/\/$/, "")
  const url = (path: string): string => `${root}${path}`
  const scoped = (path: string, scope: AccountScope): string => `${url(path)}?scope=${scope}`

  return {
    create: (scope, input) =>
      requestJson(scoped("/scoped/sessions", scope), sessionSchema, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    get: (scope, sessionId) =>
      requestJson(scoped(`/scoped/sessions/${sessionId}`, scope), sessionSchema),
    metadata: (scope, sessionId) =>
      requestJson(scoped(`/scoped/sessions/${sessionId}/metadata`, scope), metadataSchema),
    qr: (scope, sessionId) =>
      requestJson(scoped(`/scoped/sessions/${sessionId}/qr`, scope), qrSchema),
    pairingCode: (scope, sessionId, phoneNumber) =>
      requestJson(scoped(`/scoped/sessions/${sessionId}/pairing-code`, scope), acceptedSchema, {
        method: "POST",
        body: JSON.stringify({ phoneNumber }),
      }),
    lifecycle: (scope, sessionId, action, confirmed) =>
      requestJson(
        scoped(`/scoped/sessions/${sessionId}/lifecycle`, scope),
        sessionSchema.nullable(),
        {
          method: "POST",
          body: JSON.stringify({ action, confirmed }),
        },
      ),
    getStatusHistory: async (scope, sessionId) => {
      const result = await requestJson(
        scoped(`/scoped/sessions/${sessionId}/status-history`, scope),
        historySchema,
      )
      return result.kind === "ready" ? { kind: "ready", data: result.data } : result
    },
    chats: async (scope, sessionId) => {
      const result = await requestJson(
        scoped(`/scoped/sessions/${sessionId}/chats`, scope),
        z.array(chatSchema),
      )
      return result.kind === "ready" ? { kind: "ready", data: result.data } : result
    },
    messages: async (scope, sessionId, ref) => {
      const result = await requestJson(
        scoped(`/scoped/sessions/${sessionId}/chats/${encodeURIComponent(ref)}/messages`, scope),
        z.array(messageSchema),
      )
      return result.kind === "ready" ? { kind: "ready", data: result.data } : result
    },
    messageMediaUrl: (scope, sessionId, ref, messageId) =>
      scoped(
        `/scoped/sessions/${sessionId}/chats/${encodeURIComponent(ref)}/messages/${encodeURIComponent(messageId)}/media`,
        scope,
      ),
  }
}
