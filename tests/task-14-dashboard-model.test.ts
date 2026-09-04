import { describe, expect, it } from "vitest"
import { classifyDashboardHttpStatus } from "../apps/web/src/dashboard-http"
import {
  buildScopedPath,
  canPerform,
  createAiApproval,
  effectiveRole,
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

  it("resolves effective scoped role by strongest role", () => {
    // Given scoped role assignments in empty, mixed, and elevated combinations
    const cases = [
      { roles: [], expected: "viewer" },
      { roles: ["viewer", "operator"], expected: "operator" },
      { roles: ["operator", "viewer"], expected: "operator" },
      { roles: ["viewer", "admin"], expected: "admin" },
    ] as const

    // When each scoped role set is resolved
    const resolved = cases.map(({ roles }) => effectiveRole(roles))

    // Then the strongest available role wins and empty scopes fall back to Viewer
    expect(resolved).toEqual(cases.map(({ expected }) => expected))
  })

  it("keeps an approved AI draft visibly separate from sending", () => {
    // Given an AI draft proposed by a provider-agnostic seam
    const suggestion = createAiApproval({
      id: "suggestion-1",
      kind: "draft",
      provider: "provider-under-test",
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

  it("validates individual recipient targets", () => {
    // Given a manual country-code number entry with incidental spacing
    // When the submission boundary validates the single recipient target
    const contact = validateMessageInput({
      recipient: " +1 555 123 4567 ",
      message: "Consent-first text",
      hasConsent: true,
      hasMedia: false,
      isRecurring: false,
    })

    // Then exactly one normalized E.164 manual target passes validation
    expect(contact).toEqual({
      valid: true,
      recipient: "+15551234567",
      message: "Consent-first text",
    })
  })

  it("accepts formatted E.164 recipient input", () => {
    // Given a country-code number formatted for human entry
    const contact = validateMessageInput({
      recipient: "+1 (555) 123-4567",
      message: "Consent-first text",
      hasConsent: true,
      hasMedia: false,
      isRecurring: false,
    })

    // Then the submission boundary removes display punctuation before sending
    expect(contact).toEqual({
      valid: true,
      recipient: "+15551234567",
      message: "Consent-first text",
    })
  })

  it("rejects a message over WhatsApp's 4096-character limit", () => {
    // Given a valid consented recipient and a message one character over the provider limit
    const result = validateMessageInput({
      recipient: "+15551234567",
      message: "x".repeat(4097),
      hasConsent: true,
      hasMedia: false,
      isRecurring: false,
    })

    // Then client validation blocks the send before an API call
    expect(result).toEqual({
      valid: false,
      reason: "Enter a text message between 1 and 4096 characters.",
    })
  })

  it("rejects group chat addresses in submission validation", () => {
    // Given a raw provider group chat address that can never receive individual text
    const group = validateMessageInput({
      recipient: "120363162617804781@g.us",
      message: "Consent-first text",
      hasConsent: true,
      hasMedia: false,
      isRecurring: false,
    })

    // Then submission validation refuses the group address before any API call
    expect(group).toEqual({
      valid: false,
      reason:
        "Use a phone number with country code (+15551234567) or pick a chat from the directory.",
    })
  })

  it("requires a consent attestation before a send validates", () => {
    // Given an otherwise valid individual target without a consent attestation
    const unconsented = validateMessageInput({
      recipient: "+15551234567",
      message: "Consent-first text",
      hasConsent: false,
      hasMedia: false,
      isRecurring: false,
    })

    // Then the client gate blocks the send before authorization is attempted
    expect(unconsented).toEqual({
      valid: false,
      reason: "Recipient consent is required before a send.",
    })
  })

  it("rejects raw provider chat ids as manual submission targets", () => {
    // Given directory-only provider chat ids: a derivable individual @c.us
    // row and a non-derivable @lid row
    const derivable = validateMessageInput({
      recipient: "628123456789@c.us",
      message: "Consent-first text",
      hasConsent: true,
      hasMedia: false,
      isRecurring: false,
    })
    const nonDerivable = validateMessageInput({
      recipient: "239629714329822@lid",
      message: "Consent-first text",
      hasConsent: true,
      hasMedia: false,
      isRecurring: false,
    })

    // Then raw provider addresses are rejected before they can cross submission
    expect(derivable).toEqual({
      valid: false,
      reason:
        "Use a phone number with country code (+15551234567) or pick a chat from the directory.",
    })
    expect(nonDerivable).toEqual({
      valid: false,
      reason:
        "Use a phone number with country code (+15551234567) or pick a chat from the directory.",
    })
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
