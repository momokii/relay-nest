import { z } from "zod"

import { type ApiResult, requestJson } from "./dashboard-api"

const principalSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string(),
    rolesByScope: z.record(
      z.enum(["personal", "business"]),
      z.array(z.enum(["admin", "operator", "viewer"])),
    ),
  }),
})

export type AuthPrincipal = z.infer<typeof principalSchema>
export type AuthCredentials = Readonly<{ email: string; password: string }>
export type AuthBootstrapInput = AuthCredentials & Readonly<{ displayName: string }>

export type DashboardAuthApi = Readonly<{
  bootstrap: (input: AuthBootstrapInput) => Promise<ApiResult<AuthPrincipal>>
  login: (input: AuthCredentials) => Promise<ApiResult<AuthPrincipal>>
  me: () => Promise<ApiResult<AuthPrincipal>>
  logout: () => Promise<ApiResult<null>>
}>

export function createDashboardAuthApi(baseUrl = ""): DashboardAuthApi {
  const root = baseUrl.replace(/\/$/, "")
  const url = (path: string): string => `${root}${path}`
  const json = (body: object): string => JSON.stringify(body)

  return {
    bootstrap: (input) =>
      requestJson(url("/auth/bootstrap"), principalSchema, { method: "POST", body: json(input) }),
    login: (input) =>
      requestJson(url("/auth/login"), principalSchema, { method: "POST", body: json(input) }),
    me: () => requestJson(url("/auth/me"), principalSchema),
    logout: () => requestJson(url("/auth/logout"), z.null(), { method: "POST" }),
  }
}
