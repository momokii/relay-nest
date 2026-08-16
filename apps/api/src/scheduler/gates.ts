import type { SchedulerGate } from "./types"

export type SafetyGateInput = {
  readonly consentGranted: boolean
  readonly sessionConnected: boolean
  readonly timelockLocked: boolean
  readonly cappingRemaining: number | null
  readonly newlyLinkedCooldown: boolean
}

export function evaluateSafetyGates(input: SafetyGateInput): SchedulerGate {
  if (!input.consentGranted) return { allowed: false, recoveryCode: "consent_required" }
  if (!input.sessionConnected) return { allowed: false, recoveryCode: "session_disconnected" }
  if (input.timelockLocked) return { allowed: false, recoveryCode: "timelock_active" }
  if (input.cappingRemaining === 0) return { allowed: false, recoveryCode: "capping_exhausted" }
  if (input.newlyLinkedCooldown) return { allowed: false, recoveryCode: "new_session_cooldown" }
  return { allowed: true }
}
