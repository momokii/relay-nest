import type { AnalyticsInput } from "../apps/api/src/analytics/types"

export const analyticsWindow = {
  from: new Date("2026-01-01T00:00:00.000Z"),
  to: new Date("2026-01-02T00:00:00.000Z"),
}

export const personalSessionId = "11111111-1111-4111-8111-111111111111"

export function analyticsInput(): AnalyticsInput {
  return {
    scope: "personal",
    window: analyticsWindow,
    sessions: [{ id: personalSessionId, accountScope: "personal", status: "WORKING" }],
    events: [
      {
        sessionId: personalSessionId,
        accountScope: "personal",
        eventType: "message.waiting",
        providerEventId: "message-1",
        occurredAt: new Date("2026-01-01T01:00:00.000Z"),
        payload: { id: "message-1", fromMe: true },
      },
      {
        sessionId: personalSessionId,
        accountScope: "personal",
        eventType: "message.waiting",
        providerEventId: "message-2",
        occurredAt: new Date("2026-01-01T02:00:00.000Z"),
        payload: { id: "message-2" },
      },
    ],
    dispatchAttempts: [
      {
        sessionId: personalSessionId,
        accountScope: "personal",
        providerMessageId: "message-1",
        state: "acknowledged",
        attemptedAt: new Date("2026-01-01T01:00:00.000Z"),
      },
    ],
    contacts: [],
    jobs: [],
    statusHistory: [
      {
        sessionId: personalSessionId,
        accountScope: "personal",
        status: "WORKING",
        observedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
  }
}
