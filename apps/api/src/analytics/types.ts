import type { AccountScope } from "../db/schema/shared"

export type AnalyticsWindow = {
  readonly from: Date
  readonly to: Date
}

export type AnalyticsSession = {
  readonly id: string
  readonly accountScope: AccountScope
  readonly status: string
}

export type AnalyticsEvent = {
  readonly sessionId: string
  readonly accountScope: AccountScope
  readonly eventType: string
  readonly providerEventId: string
  readonly occurredAt: Date
  readonly payload: unknown
}

export type AnalyticsDispatchAttempt = {
  readonly sessionId: string
  readonly accountScope: AccountScope
  readonly providerMessageId: string | null
  readonly state: "attempting" | "submitted" | "acknowledged" | "failed" | "unknown"
  readonly attemptedAt: Date
}

export type AnalyticsContact = {
  readonly sessionId: string
  readonly accountScope: AccountScope
  readonly createdAt: Date
  readonly updatedAt: Date
}

export type AnalyticsJob = {
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
  readonly attempts: number
  readonly failureCode: string | null
  readonly updatedAt: Date
}

export type AnalyticsJobState = AnalyticsJob["state"]

export type AnalyticsStatusEntry = {
  readonly sessionId: string
  readonly accountScope: AccountScope
  readonly status: string
  readonly observedAt: Date
}

export type AnalyticsInput = {
  readonly scope: AccountScope
  readonly window: AnalyticsWindow
  readonly sessions: readonly AnalyticsSession[]
  readonly events: readonly AnalyticsEvent[]
  readonly dispatchAttempts: readonly AnalyticsDispatchAttempt[]
  readonly contacts: readonly AnalyticsContact[]
  readonly jobs: readonly AnalyticsJob[]
  readonly statusHistory: readonly AnalyticsStatusEntry[]
}

export type AnalyticsSource = {
  readonly listSessions: (scope: AccountScope) => Promise<readonly AnalyticsSession[]>
  readonly read: (
    scope: AccountScope,
    window: AnalyticsWindow,
    sessionIds: readonly string[],
  ) => Promise<Omit<AnalyticsInput, "scope" | "window">>
}

export type MessageVolume = {
  readonly total: number
  readonly inbound: number
  readonly outbound: number
  readonly unknownDirection: number
}

export type AcknowledgmentBreakdown = {
  readonly submitted: number
  readonly acknowledged: number
  readonly failed: number
  readonly unknown: number
}

export type SessionAnalytics = {
  readonly sessionId: string
  readonly status: string
  readonly messageVolume: MessageVolume
  readonly acknowledgments: AcknowledgmentBreakdown
  readonly retryCount: number
  readonly failureRate: number | null
  readonly uptimeMs: number | null
  readonly statusHistory: readonly { readonly status: string; readonly observedAt: string }[]
  readonly timelockIndicators: number
  readonly cappingIndicators: number
  readonly contactActivity: number
  readonly scheduledJobs: ScheduledJobOutcomes
}

export type ScheduledJobOutcomes = {
  readonly total: number
  readonly scheduled: number
  readonly queued: number
  readonly attempting: number
  readonly submitted: number
  readonly acknowledged: number
  readonly failed: number
  readonly unknown: number
  readonly cancelled: number
  readonly retries: number
}

export type AnalyticsProjection = {
  readonly scope: AccountScope
  readonly window: AnalyticsWindow
  readonly messageVolume: MessageVolume
  readonly acknowledgments: AcknowledgmentBreakdown
  readonly failureRate: number | null
  readonly uptimeMs: number | null
  readonly statusHistory: readonly {
    readonly sessionId: string
    readonly status: string
    readonly observedAt: string
  }[]
  readonly retryCount: number
  readonly timelockIndicators: number
  readonly cappingIndicators: number
  readonly contactActivity: number
  readonly scheduledJobs: ScheduledJobOutcomes
  readonly sessions: readonly SessionAnalytics[]
}
