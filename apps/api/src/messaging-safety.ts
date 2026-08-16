import type { AccountScope } from "./db/schema/shared"
import type { MessagingFailureCode, SafetyDecision } from "./messaging"

export type MessagingSafetyInput = {
  readonly accountScope: AccountScope
  readonly sessionStatus: string
  readonly consentGranted: boolean
  readonly optedOut: boolean
  readonly timelockLocked: boolean
  readonly cappingRemaining: number | null
  readonly cooldownUntil: Date | null
  readonly quietHoursActive: boolean
  readonly lastSentAt: Date | null
  readonly pacingSeconds: number
  readonly dailyCount: number
  readonly dailyBudget: number
  readonly burstCount: number
  readonly burstLimit: number
  readonly duplicateContent: boolean
}

export function isQuietHoursActive(
  start: string | null | undefined,
  end: string | null | undefined,
  now: Date,
  timezone: string,
): boolean {
  if (!start && !end) return false
  if (!start || !end || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return true
  let current: string
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now)
    const hour = parts.find((part) => part.type === "hour")?.value
    const minute = parts.find((part) => part.type === "minute")?.value
    if (!hour || !minute) return true
    current = `${hour}:${minute}`
  } catch (error) {
    if (error instanceof RangeError) return true
    throw error
  }
  return start < end ? current >= start && current < end : current >= start || current < end
}

export function evaluateMessagingSafety(input: MessagingSafetyInput, now: Date): SafetyDecision {
  const failure = (recoveryCode: MessagingFailureCode): SafetyDecision => ({
    allowed: false,
    recoveryCode,
  })
  if (input.sessionStatus !== "WORKING") return failure("session_disconnected")
  if (!input.consentGranted || input.optedOut) return failure("consent_required")
  if (input.timelockLocked) return failure("timelock_active")
  if (input.cappingRemaining === 0) return failure("capping_exhausted")
  if (input.cooldownUntil && input.cooldownUntil > now) return failure("new_session_cooldown")
  if (input.quietHoursActive) return failure("quiet_hours_active")
  if (input.lastSentAt && input.lastSentAt.getTime() + input.pacingSeconds * 1000 > now.getTime())
    return failure("pacing_active")
  if (input.dailyCount >= input.dailyBudget) return failure("daily_budget_exhausted")
  if (input.burstCount >= input.burstLimit) return failure("burst_limit_exhausted")
  if (input.duplicateContent) return failure("duplicate_content")
  return { allowed: true }
}
