export const NOTIFICATION_CHANNELS = ["email", "telegram"] as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

export const NOTIFICATION_CATEGORIES = ["security", "delivery", "operations"] as const
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]

export const NOTIFICATION_STATES = ["queued", "attempting", "sent", "failed"] as const
export type NotificationState = (typeof NOTIFICATION_STATES)[number]

export type NotificationFailure = {
  readonly code: "transient" | "permanent" | "unknown"
  readonly retryable: boolean
  readonly detail:
    | "provider timeout"
    | "provider temporarily unavailable"
    | "provider rejected request"
    | "provider failure"
}

export function maskSecret(value: string): string {
  const suffix = value.length >= 4 ? value.slice(-4) : ""
  return `••••••••${suffix}`
}

export function retryDelayMs(attempt: number): number {
  const normalizedAttempt = Math.max(1, Math.min(attempt, 4))
  return 250 * 2 ** (normalizedAttempt - 1)
}

export function classifyNotificationFailure(
  _error: unknown,
  kind: "timeout" | "transient" | "provider" | "unknown",
): NotificationFailure {
  switch (kind) {
    case "timeout":
      return { code: "transient", retryable: true, detail: "provider timeout" }
    case "transient":
      return { code: "transient", retryable: true, detail: "provider temporarily unavailable" }
    case "provider":
      return { code: "permanent", retryable: false, detail: "provider rejected request" }
    case "unknown":
      return { code: "unknown", retryable: false, detail: "provider failure" }
    default:
      return assertNever(kind)
  }
}

function assertNever(value: never): never {
  throw new Error(`unexpected notification failure kind: ${String(value)}`)
}
