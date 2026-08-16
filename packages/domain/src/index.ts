export const ACCOUNT_SCOPES = ["personal", "business"] as const
export type AccountScope = (typeof ACCOUNT_SCOPES)[number]

export const USER_ROLES = ["admin", "operator", "viewer"] as const
export type UserRole = (typeof USER_ROLES)[number]

export type SessionId = string & { readonly __brand: "SessionId" }
