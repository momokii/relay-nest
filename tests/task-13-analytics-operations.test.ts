import { describe, expect, it } from "vitest"

import { projectAnalytics } from "../apps/api/src/analytics/projection"
import { analyticsInput } from "./task-13-analytics-fixtures"

describe("analytics operational projections", () => {
  it("keeps retries, safety indicators, contacts, and status history observable", () => {
    // Given out-of-order status evidence, retrying jobs, safety failures, and contacts
    const fixture = analyticsInput()
    const sessionId = fixture.sessions[0]?.id
    if (!sessionId) throw new Error("fixture session missing")
    const result = projectAnalytics({
      ...fixture,
      events: [
        ...fixture.events,
        {
          sessionId,
          accountScope: "personal",
          eventType: "session.status",
          providerEventId: "status-2",
          occurredAt: new Date("2026-01-01T04:00:00.000Z"),
          payload: { status: "STOPPED" },
        },
        {
          sessionId,
          accountScope: "personal",
          eventType: "session.status",
          providerEventId: "status-1",
          occurredAt: new Date("2026-01-01T03:00:00.000Z"),
          payload: { status: "WORKING" },
        },
        {
          sessionId,
          accountScope: "personal",
          eventType: "safety.timelock",
          providerEventId: "timelock-1",
          occurredAt: new Date("2026-01-01T05:00:00.000Z"),
          payload: null,
        },
        {
          sessionId,
          accountScope: "personal",
          eventType: "safety.capping",
          providerEventId: "capping-1",
          occurredAt: new Date("2026-01-01T06:00:00.000Z"),
          payload: null,
        },
      ],
      dispatchAttempts: [
        ...fixture.dispatchAttempts,
        {
          sessionId,
          accountScope: "personal",
          providerMessageId: "message-2",
          state: "failed",
          attemptedAt: new Date("2026-01-01T02:00:00.000Z"),
        },
      ],
      contacts: [
        {
          sessionId,
          accountScope: "personal",
          createdAt: new Date("2026-01-01T07:00:00.000Z"),
          updatedAt: new Date("2026-01-01T07:00:00.000Z"),
        },
      ],
      jobs: [
        {
          sessionId,
          accountScope: "personal",
          state: "failed",
          attempts: 3,
          failureCode: "timelock_active",
          updatedAt: new Date("2026-01-01T05:00:00.000Z"),
        },
        {
          sessionId,
          accountScope: "personal",
          state: "unknown",
          attempts: 1,
          failureCode: "capping_exhausted",
          updatedAt: new Date("2026-01-01T06:00:00.000Z"),
        },
      ],
      statusHistory: [
        {
          sessionId,
          accountScope: "personal",
          status: "STOPPED",
          observedAt: new Date("2026-01-01T04:00:00.000Z"),
        },
        {
          sessionId,
          accountScope: "personal",
          status: "WORKING",
          observedAt: new Date("2026-01-01T03:00:00.000Z"),
        },
      ],
    })

    // When the projection is built
    // Then operational indicators do not become delivery proof
    expect(result.retryCount).toBe(2)
    expect(result.failureRate).toBe(0.5)
    expect(result.timelockIndicators).toBe(2)
    expect(result.cappingIndicators).toBe(2)
    expect(result.contactActivity).toBe(1)
    expect(result.scheduledJobs).toMatchObject({ failed: 1, unknown: 1, retries: 2 })
    expect(result.sessions[0]?.statusHistory.map((entry) => entry.status)).toEqual([
      "WORKING",
      "STOPPED",
    ])
    expect(result.sessions[0]?.uptimeMs).toBe(3_600_000)
  })

  it("exposes aggregate status history and uptime across sessions", () => {
    // Given one session with a complete active interval
    const fixture = analyticsInput()
    const sessionId = fixture.sessions[0]?.id
    if (!sessionId) throw new Error("fixture session missing")
    const result = projectAnalytics({
      ...fixture,
      statusHistory: [
        {
          sessionId,
          accountScope: "personal",
          status: "WORKING",
          observedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          sessionId,
          accountScope: "personal",
          status: "STOPPED",
          observedAt: new Date("2026-01-01T01:00:00.000Z"),
        },
      ],
    })

    // When the aggregate is built
    // Then uptime and status history remain available at aggregate level
    expect(result.uptimeMs).toBe(3_600_000)
    expect(result.statusHistory).toHaveLength(2)
    expect(result.statusHistory[0]?.sessionId).toBe(sessionId)
  })

  it("counts contact refresh activity once and isolates Business records", () => {
    // Given a refreshed Personal contact and unrelated Business records
    const fixture = analyticsInput()
    const sessionId = fixture.sessions[0]?.id
    if (!sessionId) throw new Error("fixture session missing")
    const result = projectAnalytics({
      ...fixture,
      contacts: [
        {
          sessionId,
          accountScope: "personal",
          createdAt: new Date("2025-12-31T23:00:00.000Z"),
          updatedAt: new Date("2026-01-01T01:00:00.000Z"),
        },
      ],
      sessions: [
        ...fixture.sessions,
        {
          id: "22222222-2222-4222-8222-222222222222",
          accountScope: "business",
          status: "WORKING",
        },
      ],
      events: [
        ...fixture.events,
        {
          sessionId: "22222222-2222-4222-8222-222222222222",
          accountScope: "business",
          eventType: "message.waiting",
          providerEventId: "business-message",
          occurredAt: new Date("2026-01-01T01:00:00.000Z"),
          payload: { fromMe: false },
        },
      ],
    })

    // When the Personal projection is requested
    // Then contact activity is counted once and Business data is absent
    expect(result.contactActivity).toBe(1)
    expect(result.messageVolume.total).toBe(2)
    expect(result.sessions).toHaveLength(1)
  })

  it("counts every scheduled state and preserves unknown outcomes", () => {
    // Given every scheduled-job state with independent retry counts
    const fixture = analyticsInput()
    const sessionId = fixture.sessions[0]?.id
    if (!sessionId) throw new Error("fixture session missing")
    const states = [
      "scheduled",
      "queued",
      "attempting",
      "submitted",
      "acknowledged",
      "failed",
      "unknown",
      "cancelled",
    ] as const
    const result = projectAnalytics({
      ...fixture,
      jobs: states.map((state, index) => ({
        sessionId,
        accountScope: "personal" as const,
        state,
        attempts: index === 7 ? 0 : index + 1,
        failureCode: null,
        updatedAt: new Date(`2026-01-01T${String(index + 10).padStart(2, "0")}:00:00.000Z`),
      })),
    })

    // When the projection is built
    // Then all states and retries remain visible
    expect(result.scheduledJobs).toMatchObject({
      total: states.length,
      scheduled: 1,
      queued: 1,
      attempting: 1,
      submitted: 1,
      acknowledged: 1,
      failed: 1,
      unknown: 1,
      cancelled: 1,
      retries: 21,
    })
  })
})
