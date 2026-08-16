import type { AccountScope } from "../db/schema/shared"

export const USER_ROLES = ["admin", "operator", "viewer"] as const
export type UserRole = (typeof USER_ROLES)[number]
export type SessionAction = "read" | "command"

export type AuthorizationInput = {
  readonly principal: { readonly roles: readonly UserRole[] } | null
  readonly accountScope: AccountScope
  readonly sessionScope: AccountScope
  readonly hasGrant: boolean
  readonly action: SessionAction
  readonly sessionActive: boolean
}

export type AuthorizationResult =
  | { readonly allowed: true }
  | {
      readonly allowed: false
      readonly reason:
        | "unauthenticated"
        | "scope_denied"
        | "grant_denied"
        | "role_denied"
        | "session_disabled"
    }

export function authorizeSessionAction(input: AuthorizationInput): AuthorizationResult {
  if (!input.principal) return { allowed: false, reason: "unauthenticated" }
  if (input.accountScope !== input.sessionScope) return { allowed: false, reason: "scope_denied" }
  if (!input.sessionActive) return { allowed: false, reason: "session_disabled" }
  if (!input.hasGrant) return { allowed: false, reason: "grant_denied" }
  if (input.action === "read") return { allowed: true }
  if (input.principal.roles.includes("admin") || input.principal.roles.includes("operator")) {
    return { allowed: true }
  }
  return { allowed: false, reason: "role_denied" }
}
