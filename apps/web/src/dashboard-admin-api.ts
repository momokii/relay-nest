import { z } from "zod"

import { type ApiResult, requestJson } from "./dashboard-api"
import type { AccountScope, DashboardRole } from "./dashboard-model"

const adminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
})

export type AdminUser = z.infer<typeof adminUserSchema>
export type AdminCreateUserInput = Readonly<{
  email: string
  password: string
  displayName: string
  roles: readonly { readonly accountScope: AccountScope; readonly role: DashboardRole }[]
}>
export type AdminGrantInput = Readonly<{
  userId: string
  sessionId: string
  accountScope: AccountScope
}>

const connectionSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string(),
})

export type ConnectionSummary = z.infer<typeof connectionSummarySchema>

export type DashboardAdminApi = Readonly<{
  createUser: (input: AdminCreateUserInput) => Promise<ApiResult<AdminUser>>
  createGrant: (input: AdminGrantInput) => Promise<ApiResult<null>>
  disableUser: (userId: string) => Promise<ApiResult<null>>
  listConnections: () => Promise<ApiResult<readonly ConnectionSummary[]>>
}>

export function createDashboardAdminApi(baseUrl = ""): DashboardAdminApi {
  const root = baseUrl.replace(/\/$/, "")
  const url = (path: string): string => `${root}${path}`
  const json = (body: object): string => JSON.stringify(body)

  return {
    createUser: (input) =>
      requestJson(url("/admin/users"), adminUserSchema, {
        method: "POST",
        body: json(input),
      }),
    createGrant: (input) =>
      requestJson(url("/admin/grants"), z.null(), {
        method: "POST",
        body: json(input),
      }),
    disableUser: (userId) =>
      requestJson(url(`/admin/users/${userId}/disable`), z.null(), { method: "POST" }),
    listConnections: async () => {
      const result = await requestJson(
        url("/admin/connections"),
        z.object({
          connections: z.array(connectionSummarySchema),
        }),
      )
      return result.kind === "ready" ? { kind: "ready", data: result.data.connections } : result
    },
  }
}
