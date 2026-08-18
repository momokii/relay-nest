import type { UserRole } from "../auth/authorization"
import type { AccountScope } from "../db/schema/shared"

export type AiSuggestionKind = "summary" | "classification" | "draft"
export type AiProviderState = "configured" | "unavailable"

export type AiSuggestionProvider = {
  readonly state: "configured"
}

export type AiApprovalInput = {
  readonly suggestionId: string
  readonly accountScope: AccountScope
  readonly provider: string
  readonly kind: AiSuggestionKind
}

export type AiApprovalResult = {
  readonly suggestionId: string
  readonly scope: AccountScope
  readonly approved: true
  readonly sendState: "not_sent"
  readonly providerState: AiProviderState
}

export type AiApprovalService = {
  readonly approve: (
    principal: {
      readonly rolesByScope: Readonly<Record<AccountScope, readonly UserRole[]>>
    },
    input: AiApprovalInput,
  ) => AiApprovalResult
}
