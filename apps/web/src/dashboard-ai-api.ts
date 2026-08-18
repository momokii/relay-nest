import { z } from "zod"

import { type ApiResult, requestJson } from "./dashboard-api"
import type { AccountScope } from "./dashboard-model"

const approvalSchema = z.object({
  suggestionId: z.string(),
  scope: z.enum(["personal", "business"]),
  approved: z.literal(true),
  sendState: z.literal("not_sent"),
  providerState: z.enum(["configured", "unavailable"]),
})

export type AiApprovalResult = z.infer<typeof approvalSchema>
export type DashboardAiApi = Readonly<{
  approve: (
    scope: AccountScope,
    suggestionId: string,
    provider: string,
    kind: "summary" | "classification" | "draft",
  ) => Promise<ApiResult<AiApprovalResult>>
}>

export function createDashboardAiApi(baseUrl = ""): DashboardAiApi {
  const root = baseUrl.replace(/\/$/, "")
  const url = (path: string): string => `${root}${path}`
  return {
    approve: (scope, suggestionId, provider, kind) =>
      requestJson(
        `${url(`/scoped/ai/suggestions/${suggestionId}/approve`)}?scope=${scope}`,
        approvalSchema,
        {
          method: "POST",
          body: JSON.stringify({ provider, kind, approved: true }),
        },
      ),
  }
}
