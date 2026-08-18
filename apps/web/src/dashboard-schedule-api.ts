import { z } from "zod"

import { type ApiResult, requestJson } from "./dashboard-api"
import type { AccountScope } from "./dashboard-model"

const scheduleSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  accountScope: z.enum(["personal", "business"]),
  scheduledFor: z.string(),
  timezone: z.string(),
  state: z.enum([
    "scheduled",
    "queued",
    "attempting",
    "submitted",
    "acknowledged",
    "failed",
    "unknown",
    "cancelled",
  ]),
  attempts: z.number().int().nonnegative(),
  nextAttemptAt: z.string().nullable(),
  providerMessageId: z.string().nullable().optional(),
  recoveryCode: z.string().nullable(),
  failureCode: z.string().nullable(),
})

export type ScheduleView = z.infer<typeof scheduleSchema>
export type ScheduleEditInput = Readonly<{
  scheduledFor: string
  timezone: string
}>

export type DashboardScheduleApi = Readonly<{
  list: (scope: AccountScope, sessionId: string) => Promise<ApiResult<readonly ScheduleView[]>>
  get: (scope: AccountScope, sessionId: string, jobId: string) => Promise<ApiResult<ScheduleView>>
  edit: (
    scope: AccountScope,
    sessionId: string,
    jobId: string,
    input: ScheduleEditInput,
  ) => Promise<ApiResult<ScheduleView>>
  cancel: (
    scope: AccountScope,
    sessionId: string,
    jobId: string,
  ) => Promise<ApiResult<ScheduleView>>
}>

export function createDashboardScheduleApi(baseUrl = ""): DashboardScheduleApi {
  const root = baseUrl.replace(/\/$/, "")
  const url = (path: string): string => `${root}${path}`
  const scoped = (path: string, scope: AccountScope): string => `${url(path)}?scope=${scope}`
  const schedulePath = (sessionId: string, jobId?: string): string =>
    `/scoped/sessions/${sessionId}/messages/schedules${jobId ? `/${jobId}` : ""}`

  return {
    list: (scope, sessionId) =>
      requestJson(scoped(schedulePath(sessionId), scope), z.array(scheduleSchema)),
    get: (scope, sessionId, jobId) =>
      requestJson(scoped(schedulePath(sessionId, jobId), scope), scheduleSchema),
    edit: (scope, sessionId, jobId, input) =>
      requestJson(scoped(schedulePath(sessionId, jobId), scope), scheduleSchema, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    cancel: (scope, sessionId, jobId) =>
      requestJson(scoped(`${schedulePath(sessionId, jobId)}/cancel`, scope), scheduleSchema, {
        method: "POST",
      }),
  }
}
