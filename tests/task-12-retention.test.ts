import { describe, expect, it } from "vitest"

import {
  RETENTION_CATEGORIES,
  retentionCutoff,
  retentionPolicySchema,
} from "../apps/api/src/retention/contracts"

describe("Todo 12 retention contracts", () => {
  it("uses deterministic content categories and rejects malformed policies", () => {
    // Given the fixed retention category contract
    // When a caller inspects the supported categories and parses policy input
    const parsed = retentionPolicySchema.parse({ category: "messages", retentionDays: 30 })

    // Then categories are stable and malformed durations do not enter the service
    expect(RETENTION_CATEGORIES).toEqual([
      "messages",
      "contacts",
      "events",
      "notifications",
      "audit",
    ])
    expect(parsed).toEqual({ category: "messages", retentionDays: 30 })
    expect(() => retentionPolicySchema.parse({ category: "messages", retentionDays: 0 })).toThrow()
    expect(() => retentionPolicySchema.parse({ category: "unknown", retentionDays: 30 })).toThrow()
  })

  it("calculates a UTC cutoff without mutating the policy date", () => {
    // Given a policy duration and an immutable reference time
    const now = new Date("2030-01-31T12:00:00.000Z")

    // When the service calculates the expiry boundary
    const cutoff = retentionCutoff(now, 30)

    // Then the boundary is deterministic and the input date is unchanged
    expect(cutoff).toEqual(new Date("2030-01-01T12:00:00.000Z"))
    expect(now).toEqual(new Date("2030-01-31T12:00:00.000Z"))
  })
})
