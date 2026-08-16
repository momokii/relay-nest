import { describe, expect, it } from "vitest"

import {
  evaluateMessagingSafety,
  isQuietHoursActive,
  type MessagingSafetyInput,
} from "../apps/api/src/messaging-safety"

const base: MessagingSafetyInput = {
  accountScope: "personal",
  sessionStatus: "WORKING",
  consentGranted: true,
  optedOut: false,
  timelockLocked: false,
  cappingRemaining: 5,
  cooldownUntil: null,
  quietHoursActive: false,
  lastSentAt: null,
  pacingSeconds: 30,
  dailyCount: 0,
  dailyBudget: 20,
  burstCount: 0,
  burstLimit: 3,
  duplicateContent: false,
}

describe("messaging safety gates", () => {
  it.each([
    ["disconnected", { sessionStatus: "STOPPED" }, "session_disconnected"],
    ["opted out", { optedOut: true }, "consent_required"],
    ["timelocked", { timelockLocked: true }, "timelock_active"],
    ["capped", { cappingRemaining: 0 }, "capping_exhausted"],
    [
      "cooling down",
      { cooldownUntil: new Date("2030-01-01T00:01:01.000Z") },
      "new_session_cooldown",
    ],
    ["quiet hours", { quietHoursActive: true }, "quiet_hours_active"],
    ["pacing", { lastSentAt: new Date("2030-01-01T00:00:45.000Z") }, "pacing_active"],
    ["daily budget", { dailyCount: 20 }, "daily_budget_exhausted"],
    ["burst", { burstCount: 3 }, "burst_limit_exhausted"],
    ["duplicate", { duplicateContent: true }, "duplicate_content"],
  ] as const)("blocks %s before provider dispatch", (_name, patch, recoveryCode) => {
    // Given a session and contact that fail one specific safety gate
    // When the command is evaluated
    const result = evaluateMessagingSafety(
      { ...base, ...patch },
      new Date("2030-01-01T00:01:00.000Z"),
    )

    // Then that gate remains visible as a safe recovery state
    expect(result).toEqual({ allowed: false, recoveryCode })
  })

  it("allows only a ready, consented, budgeted session", () => {
    // Given every safety gate is clear
    // When the command is evaluated
    const result = evaluateMessagingSafety(base, new Date("2030-01-01T00:01:00.000Z"))

    // Then dispatch is allowed
    expect(result).toEqual({ allowed: true })
  })

  it("uses the explicit session timezone across DST boundaries", () => {
    // Given a quiet window expressed in the session timezone
    const jakarta = isQuietHoursActive(
      "09:00",
      "10:00",
      new Date("2030-01-01T02:30:00.000Z"),
      "Asia/Jakarta",
    )
    const beforeSpringForward = isQuietHoursActive(
      "01:00",
      "03:00",
      new Date("2030-03-10T06:30:00.000Z"),
      "America/New_York",
    )
    const afterSpringForward = isQuietHoursActive(
      "01:00",
      "03:00",
      new Date("2030-03-10T07:30:00.000Z"),
      "America/New_York",
    )

    // When the same instant is evaluated in each timezone
    // Then local wall-clock boundaries, including DST, determine the gate
    expect(jakarta).toBe(true)
    expect(beforeSpringForward).toBe(true)
    expect(afterSpringForward).toBe(false)
  })
})
