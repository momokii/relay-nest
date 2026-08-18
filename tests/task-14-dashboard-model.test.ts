import { describe, expect, it } from "vitest"
import { classifyDashboardHttpStatus } from "../apps/web/src/dashboard-http"
import {
  buildScopedPath,
  canPerform,
  createAiApproval,
  validateMessageInput,
} from "../apps/web/src/dashboard-model"

describe("Todo 14 dashboard model", () => {
  it("keeps Personal and Business scope in every scoped query", () => {
    // Given a Personal dashboard request with a session filter
    // When the API path is built
    const path = buildScopedPath("/scoped/analytics", "personal", { sessionId: "session-1" })

    // Then the scope is explicit and the filter remains in the same request
    expect(path).toBe("/scoped/analytics?scope=personal&sessionId=session-1")
  })

  it("denies Viewer mutation while allowing Operator operations", () => {
    // Given product roles with the server-authoritative capability model
    // When each role is checked for an operational mutation
    const viewerCanOperate = canPerform("viewer", "operate")
    const operatorCanOperate = canPerform("operator", "operate")

    // Then the UI reflects least privilege without pretending to authorize the server
    expect(viewerCanOperate).toBe(false)
    expect(operatorCanOperate).toBe(true)
  })

  it("keeps an approved AI draft visibly separate from sending", () => {
    // Given an AI draft proposed by a provider-agnostic seam
    const suggestion = createAiApproval({
      id: "suggestion-1",
      kind: "draft",
      text: "A human-reviewed draft",
      provenance: "Provider unavailable; provenance unknown",
    })

    // When the human approves the suggestion
    const approved = suggestion.approve()

    // Then it is approved but still explicitly not sent
    expect(approved.status).toBe("approved")
    expect(approved.sendState).toBe("not_sent")
    expect(approved.canSendSeparately).toBe(true)
  })

  it("rejects media and recurrence at the text-only message boundary", () => {
    // Given a message request that attempts to add excluded MVP capabilities
    const result = validateMessageInput({
      recipient: "+15551234567",
      message: "Consent-first text",
      hasConsent: true,
      hasMedia: true,
      isRecurring: true,
    })

    // Then the UI refuses both features before any API call could be made
    expect(result).toEqual({
      valid: false,
      reason: "Text messages are individual, one-time sends; media and recurrence are unavailable.",
    })
  })

  it("treats a missing preview API route as unavailable rather than unauthenticated", () => {
    // Given the web preview has no same-origin API route configured
    // When an API request returns a missing-route response
    const classification = classifyDashboardHttpStatus(404)

    // Then the dashboard can show its explicit unavailable/demo state
    expect(classification).toBe("unavailable")
  })
})
