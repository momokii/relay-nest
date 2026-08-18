import type {
  AiApprovalInput,
  AiApprovalResult,
  AiApprovalService,
  AiSuggestionProvider,
} from "./types"

export function createAiApprovalService(
  options: { readonly provider?: AiSuggestionProvider } = {},
): AiApprovalService {
  return {
    approve: (principal, input): AiApprovalResult => {
      const canApprove = principal.rolesByScope[input.accountScope].some(
        (role) => role === "admin" || role === "operator",
      )
      if (!canApprove) throw new AiApprovalAuthorizationError()
      return {
        suggestionId: input.suggestionId,
        scope: input.accountScope,
        approved: true,
        sendState: "not_sent",
        providerState: options.provider?.state ?? "unavailable",
      }
    },
  }
}

export class AiApprovalAuthorizationError extends Error {
  readonly name = "AiApprovalAuthorizationError"

  constructor() {
    super("AI approval is not authorized for this scope")
  }
}

export type { AiApprovalInput }
