import { describe, expect, it } from "vitest"

import { projectAnalytics } from "../apps/api/src/analytics/projection"
import { analyticsInput } from "./task-13-analytics-fixtures"

describe("analytics message projections", () => {
  it("reports acknowledged outbound volume and unknown direction without inferring delivery", () => {
    // Given one acknowledged outbound event and one event with no direction evidence
    // When the scoped analytics projection is built
    const result = projectAnalytics(analyticsInput())

    // Then direction and delivery evidence stay distinct and incomplete history is unknown
    expect(result.messageVolume).toEqual({ total: 2, inbound: 0, outbound: 1, unknownDirection: 1 })
    expect(result.acknowledgments).toEqual({
      submitted: 0,
      acknowledged: 1,
      failed: 0,
      unknown: 1,
    })
    expect(result.failureRate).toBeNull()
  })

  it("filters attempts and jobs to the requested half-open window", () => {
    // Given local records before and inside the analytics window
    const fixture = analyticsInput()
    const sessionId = fixture.sessions[0]?.id
    if (!sessionId) throw new Error("fixture session missing")
    const result = projectAnalytics({
      ...fixture,
      dispatchAttempts: [
        {
          sessionId,
          accountScope: "personal",
          providerMessageId: "message-1",
          state: "failed",
          attemptedAt: new Date("2025-12-31T23:59:59.000Z"),
        },
        {
          sessionId,
          accountScope: "personal",
          providerMessageId: "message-2",
          state: "failed",
          attemptedAt: new Date("2026-01-01T02:00:00.000Z"),
        },
      ],
      jobs: [
        {
          sessionId,
          accountScope: "personal",
          state: "failed",
          attempts: 4,
          failureCode: null,
          updatedAt: new Date("2025-12-31T23:59:59.000Z"),
        },
        {
          sessionId,
          accountScope: "personal",
          state: "submitted",
          attempts: 2,
          failureCode: null,
          updatedAt: new Date("2026-01-01T02:00:00.000Z"),
        },
      ],
    })

    // When the projection is built
    // Then records outside the window do not affect outcomes or retries
    expect(result.acknowledgments).toEqual({ submitted: 0, acknowledged: 0, failed: 1, unknown: 1 })
    expect(result.scheduledJobs).toMatchObject({ total: 1, submitted: 1, retries: 1 })
    expect(result.retryCount).toBe(1)
  })

  it("selects duplicate message events deterministically by timestamp", () => {
    // Given two duplicate provider events supplied in opposite input orders
    const fixture = analyticsInput()
    const duplicateEvents = [
      {
        sessionId: fixture.sessions[0]?.id ?? "",
        accountScope: "personal" as const,
        eventType: "message.waiting",
        providerEventId: "duplicate-message",
        occurredAt: new Date("2026-01-01T09:00:00.000Z"),
        payload: { fromMe: false },
      },
      {
        sessionId: fixture.sessions[0]?.id ?? "",
        accountScope: "personal" as const,
        eventType: "message.waiting",
        providerEventId: "duplicate-message",
        occurredAt: new Date("2026-01-01T08:00:00.000Z"),
        payload: { fromMe: "malformed" },
      },
    ]
    const forward = projectAnalytics({ ...fixture, events: duplicateEvents })
    const reverse = projectAnalytics({ ...fixture, events: [...duplicateEvents].reverse() })

    // When either input ordering is projected
    // Then the earliest timestamp is retained consistently as unknown direction
    expect(forward.messageVolume).toEqual({
      total: 1,
      inbound: 0,
      outbound: 0,
      unknownDirection: 1,
    })
    expect(reverse.messageVolume).toEqual(forward.messageVolume)
  })
})
