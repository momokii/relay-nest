import { describe, expect, it, vi } from "vitest"

import { createDashboardAiApi } from "../apps/web/src/dashboard-ai-api"
import { createDashboardAuthApi } from "../apps/web/src/dashboard-auth-api"
import { createDashboardNotificationApi } from "../apps/web/src/dashboard-notification-api"
import { createDashboardRetentionApi } from "../apps/web/src/dashboard-retention-api"
import { createDashboardScheduleApi } from "../apps/web/src/dashboard-schedule-api"
import { createDashboardSessionApi } from "../apps/web/src/dashboard-session-api"

const sessionId = "11111111-1111-4111-8111-111111111111"
const jobId = "22222222-2222-4222-8222-222222222222"
const userId = "33333333-3333-4333-8333-333333333333"

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

describe("Todo 14 authenticated dashboard adapters", () => {
  it("characterizes the existing scoped lifecycle adapter contract", async () => {
    // Given an authenticated lifecycle response for a scoped session
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        id: sessionId,
        accountScope: "personal",
        name: "Personal fixture",
        status: "WORKING",
        serviceHealth: "unknown",
        sendingReadiness: "unknown",
      }),
    )
    vi.stubGlobal("document", { cookie: "waha_csrf=csrf-token" })
    vi.stubGlobal("fetch", fetchMock)

    // When an operator starts the selected session
    const result = await createDashboardSessionApi().lifecycle(
      "personal",
      sessionId,
      "start",
      false,
    )

    // Then the existing same-origin contract remains unchanged
    expect(result.kind).toBe("ready")
    expect(fetchMock).toHaveBeenCalledWith(
      `/scoped/sessions/${sessionId}/lifecycle?scope=personal`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "start", confirmed: false }),
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" }),
      }),
    )
    vi.unstubAllGlobals()
  })

  it("characterizes the existing scoped session-create adapter contract", async () => {
    // Given an authenticated session-create response for the selected scope
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        id: sessionId,
        accountScope: "business",
        name: "Business fixture",
        status: "STARTING",
        serviceHealth: "unknown",
        sendingReadiness: "unknown",
      }),
    )
    vi.stubGlobal("document", { cookie: "waha_csrf=csrf-token" })
    vi.stubGlobal("fetch", fetchMock)

    // When the Admin creates a Business session
    const result = await createDashboardSessionApi().create("business", {
      connectionId: "44444444-4444-4444-8444-444444444444",
      name: "Business fixture",
      wahaSessionName: "business-fixture",
    })

    // Then the existing request stays scoped and CSRF-protected
    expect(result.kind).toBe("ready")
    expect(fetchMock).toHaveBeenCalledWith(
      "/scoped/sessions?scope=business",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          connectionId: "44444444-4444-4444-8444-444444444444",
          name: "Business fixture",
          wahaSessionName: "business-fixture",
        }),
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" }),
      }),
    )
    vi.unstubAllGlobals()
  })

  it("characterizes the existing notification settings response boundary", async () => {
    // Given an authenticated redacted Business notification settings response
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        accountScope: "business",
        email: { enabled: true, configured: true, host: null, port: null },
        telegram: { enabled: false, configured: false, chatIds: [] },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    // When settings are loaded for Business
    const result = await createDashboardNotificationApi().getSettings("business")

    // Then the response keeps its server-declared scope
    expect(result).toMatchObject({ kind: "ready", data: { accountScope: "business" } })
    expect(fetchMock).toHaveBeenCalledWith(
      "/admin/notifications/business/settings",
      expect.anything(),
    )
    vi.unstubAllGlobals()
  })

  it("lists scoped schedules through the backend contract", async () => {
    // Given an authenticated schedule response for one session
    const fetchMock = vi.fn().mockResolvedValue(
      response([
        {
          id: jobId,
          sessionId,
          accountScope: "personal",
          scheduledFor: "2026-08-18T10:00:00.000Z",
          timezone: "UTC",
          state: "scheduled",
          attempts: 0,
          nextAttemptAt: null,
          providerMessageId: null,
          recoveryCode: null,
          failureCode: null,
        },
      ]),
    )
    vi.stubGlobal("fetch", fetchMock)

    // When the Personal schedule list is loaded
    const result = await createDashboardScheduleApi().list("personal", sessionId)

    // Then the request is scoped and the job is parsed
    expect(result.kind).toBe("ready")
    expect(fetchMock).toHaveBeenCalledWith(
      `/scoped/sessions/${sessionId}/messages/schedules?scope=personal`,
      expect.objectContaining({ credentials: "include" }),
    )
    vi.unstubAllGlobals()
  })

  it("edits schedules with CSRF and only mutable fields", async () => {
    // Given the same-origin CSRF cookie and a mutable schedule
    vi.stubGlobal("document", { cookie: "waha_csrf=csrf-token" })
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        id: jobId,
        sessionId,
        accountScope: "business",
        scheduledFor: "2026-08-18T11:00:00.000Z",
        timezone: "Asia/Jakarta",
        state: "scheduled",
        attempts: 0,
        nextAttemptAt: null,
        providerMessageId: null,
        recoveryCode: null,
        failureCode: null,
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    // When the Business schedule is edited
    await createDashboardScheduleApi().edit("business", sessionId, jobId, {
      scheduledFor: "2026-08-18T11:00:00.000Z",
      timezone: "Asia/Jakarta",
    })

    // Then mutation metadata and the backend edit contract are preserved
    expect(fetchMock).toHaveBeenCalledWith(
      `/scoped/sessions/${sessionId}/messages/schedules/${jobId}?scope=business`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          scheduledFor: "2026-08-18T11:00:00.000Z",
          timezone: "Asia/Jakarta",
        }),
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" }),
      }),
    )
    vi.unstubAllGlobals()
  })

  it("reads notification history without exposing provider settings in the route", async () => {
    // Given an authenticated redacted notification history response
    const fetchMock = vi.fn().mockResolvedValue(response([]))
    vi.stubGlobal("fetch", fetchMock)

    // When Admin history is loaded for the selected scope
    const result = await createDashboardNotificationApi().history("personal", 25)

    // Then only the scoped history route is requested
    expect(result).toEqual({ kind: "ready", data: [] })
    expect(fetchMock).toHaveBeenCalledWith(
      "/admin/notifications/personal/history?limit=25",
      expect.anything(),
    )
    vi.unstubAllGlobals()
  })

  it("updates retention policy through the selected scoped Admin route", async () => {
    // Given an authenticated retention policy response
    vi.stubGlobal("document", { cookie: "waha_csrf=csrf-token" })
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        id: "44444444-4444-4444-8444-444444444444",
        accountScope: "business",
        category: "messages",
        retentionDays: 45,
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    // When the Business policy is updated
    const result = await createDashboardRetentionApi().updatePolicy("business", {
      category: "messages",
      retentionDays: 45,
    })

    // Then the mutation stays scoped and sends only the policy input
    expect(result.kind).toBe("ready")
    expect(fetchMock).toHaveBeenCalledWith(
      "/admin/retention/business",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ category: "messages", retentionDays: 45 }),
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" }),
      }),
    )
    vi.unstubAllGlobals()
  })

  it("preserves approved-not-sent AI results", async () => {
    // Given the backend provider contract returns an approval without dispatch
    vi.stubGlobal("document", { cookie: "waha_csrf=csrf-token" })
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        suggestionId: "suggestion-1",
        scope: "personal",
        approved: true,
        sendState: "not_sent",
        providerState: "unavailable",
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    // When the human approves a draft
    const result = await createDashboardAiApi().approve(
      "personal",
      "suggestion-1",
      "provider-disabled",
      "draft",
    )

    // Then approval is returned as not sent and no send route is involved
    expect(result.kind).toBe("ready")
    if (result.kind === "ready") expect(result.data.sendState).toBe("not_sent")
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/scoped/ai/suggestions/suggestion-1/approve?scope=personal",
    )
    vi.unstubAllGlobals()
  })

  it("uses authenticated login and leaves cookie storage to the browser", async () => {
    // Given a successful authenticated login response
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        user: {
          id: userId,
          email: "admin@example.com",
          displayName: "Admin",
          rolesByScope: { personal: ["admin"], business: ["admin"] },
        },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    // When credentials are submitted to the same-origin auth route
    const result = await createDashboardAuthApi().login({
      email: "admin@example.com",
      password: "long-enough-password",
    })

    // Then the principal is parsed without moving secrets into application state
    expect(result.kind).toBe("ready")
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/auth/login")
    vi.unstubAllGlobals()
  })
})
