import type { AccountScope } from "../db/schema/shared"

export const SCHEDULER_STATES = [
  "scheduled",
  "queued",
  "attempting",
  "submitted",
  "acknowledged",
  "failed",
  "unknown",
  "cancelled",
] as const
export type SchedulerState = (typeof SCHEDULER_STATES)[number]

export type SchedulerJob = {
  readonly id: string
  readonly sessionId: string
  readonly accountScope: AccountScope
  readonly recipientPhone: string
  readonly message: string
  readonly scheduledFor: Date
  readonly timezone: string
  readonly idempotencyKey: string
  readonly state: SchedulerState
  readonly attempts: number
  readonly nextAttemptAt: Date | null
  readonly leaseOwner: string | null
  readonly leaseExpiresAt: Date | null
  readonly providerMessageId?: string | null
  readonly recoveryCode: string | null
  readonly failureCode: string | null
}

export type DispatchResult =
  | { readonly state: "submitted" | "acknowledged"; readonly providerMessageId: string }
  | {
      readonly state: "failed" | "unknown"
      readonly failureCode: string
      readonly recoveryCode: string
      readonly retryable?: boolean
    }

export type SchedulerFailure = {
  readonly state: "failed" | "unknown" | "queued"
  readonly failureCode: string
  readonly recoveryCode: string
  readonly nextAttemptAt: Date | null
}

export type SchedulerRepository = {
  readonly create: (input: SchedulerJob) => Promise<SchedulerJob>
  readonly find: (id: string, accountScope: AccountScope) => Promise<SchedulerJob | null>
  readonly claimDue: (owner: string, now: Date, leaseMs: number) => Promise<SchedulerJob | null>
  readonly complete: (
    jobId: string,
    owner: string,
    result: Extract<DispatchResult, { readonly state: "submitted" | "acknowledged" }>,
  ) => Promise<SchedulerJob | null>
  readonly fail: (
    jobId: string,
    owner: string,
    failure: SchedulerFailure,
  ) => Promise<SchedulerJob | null>
  readonly cancel: (jobId: string, accountScope: AccountScope) => Promise<SchedulerJob | null>
  readonly edit: (
    jobId: string,
    accountScope: AccountScope,
    input: Pick<SchedulerJob, "scheduledFor" | "timezone" | "recipientPhone" | "message">,
  ) => Promise<SchedulerJob | null>
  readonly recoverExpiredLeases: (now: Date) => Promise<number>
  readonly markMissed?: (now: Date, graceMs: number) => Promise<number>
}

export type SchedulerGate =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly recoveryCode: string }

export type SchedulerServiceOptions = {
  readonly repository: SchedulerRepository
  readonly transport: (job: SchedulerJob) => Promise<DispatchResult>
  readonly gate?: (job: SchedulerJob) => Promise<SchedulerGate>
  readonly now?: () => Date
  readonly leaseMs?: number
  readonly maxAttempts?: number
  readonly backoffMs?: number
  readonly missedGraceMs?: number
}
