import { z } from "zod"

import { type ApiResult, requestJson } from "./dashboard-api"
import type { AccountScope } from "./dashboard-model"

export const RETENTION_CATEGORIES = [
  "messages",
  "contacts",
  "events",
  "notifications",
  "audit",
] as const
const categorySchema = z.enum(RETENTION_CATEGORIES)
const policySchema = z.object({
  id: z.string().uuid(),
  accountScope: z.enum(["personal", "business"]),
  category: categorySchema,
  retentionDays: z.number().int().positive(),
})
const previewSchema = z.object({
  cutoff: z.string(),
  count: z.number().int().nonnegative(),
  previewToken: z.string().uuid(),
})
const purgeSchema = z.object({ deletedCount: z.number().int().nonnegative() })

export type RetentionCategory = z.infer<typeof categorySchema>
export type RetentionPolicy = z.infer<typeof policySchema>
export type RetentionPreview = z.infer<typeof previewSchema>
export type RetentionPolicyInput = Readonly<{
  category: RetentionCategory
  retentionDays: number
}>
export type RetentionPurgeInput = Readonly<{
  category: RetentionCategory
  cutoff: string
  previewCount: number
  previewToken: string
  confirmed: true
}>

export type DashboardRetentionApi = Readonly<{
  list: (scope: AccountScope) => Promise<ApiResult<readonly RetentionPolicy[]>>
  updatePolicy: (
    scope: AccountScope,
    input: RetentionPolicyInput,
  ) => Promise<ApiResult<RetentionPolicy>>
  preview: (
    scope: AccountScope,
    category: RetentionCategory,
  ) => Promise<ApiResult<RetentionPreview>>
  purge: (
    scope: AccountScope,
    input: RetentionPurgeInput,
  ) => Promise<ApiResult<{ readonly deletedCount: number }>>
}>

export function createDashboardRetentionApi(baseUrl = ""): DashboardRetentionApi {
  const root = baseUrl.replace(/\/$/, "")
  const url = (path: string): string => `${root}${path}`
  const path = (scope: AccountScope): string => url(`/admin/retention/${scope}`)

  return {
    list: (scope) => requestJson(path(scope), z.array(policySchema)),
    updatePolicy: (scope, input) =>
      requestJson(path(scope), policySchema, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    preview: (scope, category) =>
      requestJson(`${path(scope)}/preview`, previewSchema, {
        method: "POST",
        body: JSON.stringify({ category }),
      }),
    purge: (scope, input) =>
      requestJson(`${path(scope)}/purge`, purgeSchema, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  }
}
