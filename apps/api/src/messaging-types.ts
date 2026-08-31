import type { AccountScope } from "./db/schema/shared"

export type MessagingPrincipal = {
  readonly userId: string
  readonly roles: readonly ("admin" | "operator" | "viewer")[]
}

export type MessagingSession = {
  readonly id: string
  readonly accountScope: AccountScope
  readonly wahaSessionName: string
  readonly status: string
  readonly linkedAt: Date
}

export type MessagingContact = {
  readonly id: string
  readonly phone: string
  readonly displayName: string | null
  readonly providerChatId: string
  readonly consentGranted: boolean
  readonly optedOut: boolean
  readonly accountScope?: AccountScope
  readonly sessionId?: string
}

export type ContactTarget = { readonly phoneNumber: string } | { readonly contactId: string }

export type MessagingFailureCode =
  | "unauthorized"
  | "scope_denied"
  | "session_unavailable"
  | "invalid_phone"
  | "contact_not_found"
  | "consent_required"
  | "session_disconnected"
  | "timelock_active"
  | "capping_exhausted"
  | "new_session_cooldown"
  | "quiet_hours_active"
  | "pacing_active"
  | "daily_budget_exhausted"
  | "burst_limit_exhausted"
  | "duplicate_content"

export type SafetyDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly recoveryCode: MessagingFailureCode }

export type MessagingWaha = {
  readonly checkExists: (
    name: string,
    phoneNumber: string,
  ) => Promise<{
    readonly numberExists: boolean
    readonly chatId?: string | undefined
  }>
  readonly contact: (
    name: string,
    contactId: string,
  ) => Promise<{
    readonly id: string
    readonly name?: string | undefined
    readonly pushname?: string | undefined
  }>
}

export type MessagingScheduler = {
  readonly schedule: (input: {
    readonly sessionId: string
    readonly accountScope: AccountScope
    readonly recipientPhone: string
    readonly message: string
    readonly scheduledFor: Date
    readonly timezone: string
    readonly idempotencyKey: string
  }) => Promise<{ readonly jobId: string; readonly duplicate: boolean }>
  readonly dispatch: (jobId: string) => Promise<{
    readonly state: "submitted" | "acknowledged" | "failed" | "unknown"
    readonly providerMessageId?: string
    readonly recoveryCode?: string
  }>
  readonly findByIdempotencyKey?: (idempotencyKey: string) => Promise<DurableDispatch | null>
}

export type DurableDispatch = {
  readonly jobId: string
  readonly sessionId: string
  readonly accountScope: AccountScope
  readonly state:
    | "scheduled"
    | "queued"
    | "attempting"
    | "submitted"
    | "acknowledged"
    | "failed"
    | "unknown"
    | "cancelled"
  readonly providerMessageId?: string
  readonly recoveryCode?: string
}

export type MessagingServiceOptions = {
  readonly authorize: (
    principal: MessagingPrincipal,
    sessionId: string,
    accountScope: AccountScope,
  ) => Promise<{ readonly allowed: true } | { readonly allowed: false; readonly reason: string }>
  readonly sessions: {
    readonly find: (
      sessionId: string,
      accountScope: AccountScope,
    ) => Promise<MessagingSession | null>
  }
  readonly contacts: {
    readonly find: (
      accountScope: AccountScope,
      sessionId: string,
      phone: string,
    ) => Promise<MessagingContact | null>
    readonly findById?: (accountScope: AccountScope, id: string) => Promise<MessagingContact | null>
    readonly save: (input: MessagingContact) => Promise<MessagingContact>
    readonly updateConsent?: (
      accountScope: AccountScope,
      sessionId: string,
      id: string,
      consentGranted: boolean,
      optedOut: boolean,
    ) => Promise<MessagingContact | null>
  }
  readonly safety: {
    readonly evaluate: (input: {
      readonly session: MessagingSession
      readonly contact: MessagingContact
      readonly message: string
      readonly now: Date
      readonly timezone: string
    }) => Promise<SafetyDecision>
  }
  readonly scheduler: MessagingScheduler
  readonly wahaForSession: (session: MessagingSession) => Promise<MessagingWaha>
  readonly audit: (input: {
    readonly actorUserId: string
    readonly action: string
    readonly subjectType: string
    readonly subjectId: string
    readonly accountScope: AccountScope
    readonly sessionId: string
  }) => Promise<void>
  readonly now?: () => Date
}

export type SendInput = ContactTarget & {
  readonly sessionId: string
  readonly accountScope: AccountScope
  readonly message: string
  readonly idempotencyKey: string
}

export type ScheduleInput = SendInput & {
  readonly scheduledFor: Date
  readonly timezone: string
}

export type SafeContact = {
  readonly id: string
  readonly phone: string
  readonly displayName: string | null
  readonly consentGranted: boolean
  readonly optedOut: boolean
}

export type SendResult =
  | { readonly state: "submitted" | "acknowledged"; readonly providerMessageId: string }
  | { readonly state: "scheduled"; readonly jobId: string }
  | { readonly state: "failed" | "unknown"; readonly recoveryCode: string }
