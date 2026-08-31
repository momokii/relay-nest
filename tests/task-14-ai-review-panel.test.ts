import { describe, expect, it, vi } from "vitest"
import * as React from "../apps/web/node_modules/react"
import { renderToStaticMarkup } from "../apps/web/node_modules/react-dom/server"

import { AiReviewPanel } from "../apps/web/src/components/ai-review-panel"
import { MessageComposer } from "../apps/web/src/components/message-composer"
import { createAiApproval } from "../apps/web/src/dashboard-model"

describe("Todo 14 AI review panel", () => {
  it("renders an available opaque suggestion with an approval action", () => {
    // Given an explicit provider-agnostic suggestion in the active Personal scope
    const suggestion = createAiApproval({
      id: "suggestion-opaque",
      kind: "draft",
      provider: "provider-under-test",
      text: "A provider-agnostic draft is available for human review.",
      provenance: "Provider-agnostic fixture; no prompt content is displayed.",
    })

    // When the dashboard review panel renders the available suggestion
    const markup = renderToStaticMarkup(
      React.createElement(AiReviewPanel, {
        scope: "personal",
        role: "operator",
        suggestion,
        approval: { kind: "idle" },
        onApprove: async () => undefined,
      }),
    )

    // Then the suggestion and explicit approval boundary are accessible in the HTML
    expect(markup).toContain("A provider-agnostic draft is available for human review.")
    expect(markup).toContain("Approve suggestion")
    expect(markup).toContain("Send state: Not sent")
  })

  it("keeps the unavailable state explicit when no suggestion is supplied", () => {
    // Given no server-backed suggestion for the active scope
    const markup = renderToStaticMarkup(
      React.createElement(AiReviewPanel, {
        scope: "personal",
        role: "operator",
        approval: { kind: "idle" },
        onApprove: async () => undefined,
      }),
    )

    // Then no local approval action is exposed
    expect(markup).toContain("AI suggestions unavailable")
    expect(markup).not.toContain("Approve suggestion")
  })

  it("shows the configured provider state without changing send state", () => {
    // Given an approved suggestion response from a configured provider state
    const suggestion = createAiApproval({
      id: "suggestion-opaque",
      kind: "draft",
      provider: "provider-under-test",
      text: "A provider-agnostic draft is available for human review.",
      provenance: "Provider-agnostic fixture; no prompt content is displayed.",
    })

    // When the panel receives the scoped approval result
    const markup = renderToStaticMarkup(
      React.createElement(AiReviewPanel, {
        scope: "personal",
        role: "operator",
        suggestion,
        approval: {
          kind: "ready",
          data: {
            suggestionId: "suggestion-opaque",
            scope: "personal",
            approved: true,
            sendState: "not_sent",
            providerState: "configured",
          },
        },
        onApprove: async () => undefined,
      }),
    )

    // Then provider configuration is explicit while sending remains separate
    expect(markup).toContain("Provider configured")
    expect(markup).toContain("Approved, not sent")
    expect(markup).toContain("Send state: Not sent")
  })

  it("does not fabricate a suggestion from a local suggestion ID", () => {
    // Given the legacy local suggestion ID configuration without a server suggestion
    vi.stubEnv("VITE_AI_SUGGESTION_ID", "local-only-suggestion")

    // When the message composer renders without an available server-backed suggestion
    const markup = renderToStaticMarkup(
      React.createElement(MessageComposer, {
        mode: "send",
        scope: "personal",
        role: "operator",
        sessions: {
          kind: "ready",
          data: [
            {
              id: "session-1",
              accountScope: "personal",
              name: "Personal session",
              status: "WORKING",
              serviceHealth: "unknown",
              sendingReadiness: "unknown",
            },
          ],
        },
        action: { kind: "idle" },
        contactAction: { kind: "idle" },
        consentAction: { kind: "idle" },
        onResolve: async () => undefined,
        onSetConsent: async () => undefined,
        onSend: async () => undefined,
        onSchedule: async () => undefined,
      }),
    )
    vi.unstubAllEnvs()

    // Then the UI stays explicitly unavailable and exposes no local approval action
    expect(markup).toContain("AI suggestions unavailable")
    expect(markup).not.toContain("local-only-suggestion")
    expect(markup).not.toContain("Approve suggestion")
  })
})
