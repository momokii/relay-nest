import { describe, expect, it } from "vitest"

import { createAnalyticsService } from "../apps/api/src/analytics/service"
import { analyticsInput, analyticsWindow } from "./task-13-analytics-fixtures"

describe("analytics authorization seam", () => {
  it("reads no records when the user has no session grants", async () => {
    // Given a source with a session that the authenticated Viewer cannot read
    let readSessionIds: readonly string[] = ["unexpected"]
    const service = createAnalyticsService({
      source: {
        listSessions: async () => analyticsInput().sessions,
        read: async (_scope, _window, sessionIds) => {
          readSessionIds = sessionIds
          return analyticsInput()
        },
      },
      authorize: async () => ({ allowed: false }),
    })

    // When the aggregate is requested for that scope
    const result = await service.read(
      {
        userId: "user-1",
        email: "viewer@example.invalid",
        displayName: "Viewer",
        roles: ["viewer"],
        rolesByScope: { personal: ["viewer"], business: [] },
        sessionId: "auth-session-1",
        sessionToken: "opaque-token",
        csrfToken: "opaque-csrf",
      },
      "personal",
      analyticsWindow,
    )

    // Then no aggregate or unauthorized source records cross the grant seam
    expect(result.sessions).toEqual([])
    expect(result.messageVolume.total).toBe(0)
    expect(result.uptimeMs).toBeNull()
    expect(readSessionIds).toEqual([])
  })

  it("rejects a specifically requested session without a grant", async () => {
    // Given a source with a session and a denied session grant
    const service = createAnalyticsService({
      source: {
        listSessions: async () => analyticsInput().sessions,
        read: async () => analyticsInput(),
      },
      authorize: async () => ({ allowed: false }),
    })

    // When that session is requested directly
    const read = service.read(
      {
        userId: "user-1",
        email: "viewer@example.invalid",
        displayName: "Viewer",
        roles: ["viewer"],
        rolesByScope: { personal: ["viewer"], business: [] },
        sessionId: "auth-session-1",
        sessionToken: "opaque-token",
        csrfToken: "opaque-csrf",
      },
      "personal",
      analyticsWindow,
      "11111111-1111-4111-8111-111111111111",
    )

    // Then the service fails closed without returning the session aggregate
    await expect(read).rejects.toMatchObject({ code: "forbidden" })
  })
})
