import type * as React from "react"
import { useState } from "react"

import type { AiApprovalResult } from "../dashboard-ai-api"
import type { AccountScope, AiSuggestion, DashboardRole } from "../dashboard-model"
import { assertNever, canPerform } from "../dashboard-model"
import type { ActionState } from "../dashboard-state"
import { Panel, StateNotice, StatusBadge } from "./ui"

export type AiReviewPanelProps = Readonly<{
  scope: AccountScope
  role: DashboardRole
  suggestion?: AiSuggestion | undefined
  approval: ActionState<AiApprovalResult>
  onApprove: (suggestion: AiSuggestion) => Promise<void>
}>

export function AiReviewPanel({
  scope,
  role,
  suggestion,
  approval,
  onApprove,
}: AiReviewPanelProps): React.JSX.Element {
  const canApprove = canPerform(role, "operate")
  const [reviewedSuggestion, setReviewedSuggestion] = useState(suggestion)
  if (!suggestion)
    return (
      <Panel
        eyebrow="Human-approved AI seam"
        title="Review before use"
        description="Summaries, classifications, and drafts are suggestions only. No AI action can send a message."
      >
        <div className="ai-checkpoint">
          <StatusBadge label="Unavailable" tone="warning" />
          <StateNotice
            title="AI suggestions unavailable"
            message="No scoped suggestion is available for this dashboard. Nothing is shown or approved locally."
            tone="warning"
          />
        </div>
      </Panel>
    )

  const currentSuggestion = reviewedSuggestion ?? suggestion

  const displaySuggestion =
    approval.kind === "ready" ? currentSuggestion.approve() : currentSuggestion
  const status = suggestionStatusLabel(displaySuggestion.status)
  const providerState = approval.kind === "ready" ? approval.data.providerState : undefined
  return (
    <Panel
      eyebrow="Human-approved AI seam"
      title="Review before use"
      description="Summaries, classifications, and drafts are suggestions only. No AI action can send a message."
    >
      <div className="ai-checkpoint">
        <div className="ai-status-line">
          <StatusBadge label={status.label} tone={status.tone} />
          {providerState ? (
            <StatusBadge label={providerStateLabel(providerState)} tone="info" />
          ) : null}
          <span>Scope: {scope}</span>
        </div>
        <div className="ai-provenance">
          <span>Suggestion reference</span>
          <strong>{displaySuggestion.id}</strong>
          <span>{displaySuggestion.provenance}</span>
        </div>
        <p className="ai-copy">{displaySuggestion.text}</p>
        <output className="ai-status-line" aria-live="polite">
          Send state: Not sent
        </output>
        {approvalNotice(approval)}
        {!canApprove ? (
          <StateNotice
            title="Role denied"
            message="Viewer access is read-only. The server remains authoritative."
            tone="warning"
          />
        ) : null}
        <div className="button-row">
          <button
            className="button button-primary"
            type="button"
            disabled={
              !canApprove ||
              approval.kind === "submitting" ||
              displaySuggestion.status !== "proposed"
            }
            aria-busy={approval.kind === "submitting" ? "true" : "false"}
            onClick={() => void onApprove(displaySuggestion)}
          >
            {approval.kind === "submitting" ? "Approving…" : "Approve suggestion"}
          </button>
          <button
            className="button button-secondary"
            type="button"
            disabled={
              !canApprove ||
              approval.kind === "submitting" ||
              displaySuggestion.status !== "proposed"
            }
            onClick={() => setReviewedSuggestion(displaySuggestion.reject())}
          >
            Reject suggestion
          </button>
        </div>
      </div>
    </Panel>
  )
}

function suggestionStatusLabel(
  status: AiSuggestion["status"],
): Readonly<{ label: string; tone: "success" | "warning" | "error" }> {
  switch (status) {
    case "proposed":
      return { label: "Proposed", tone: "warning" }
    case "approved":
      return { label: "Approved", tone: "success" }
    case "rejected":
      return { label: "Rejected", tone: "error" }
    default:
      return assertNever(status)
  }
}

function providerStateLabel(state: AiApprovalResult["providerState"]): string {
  switch (state) {
    case "configured":
      return "Provider configured"
    case "unavailable":
      return "Provider unavailable"
    default:
      return assertNever(state)
  }
}

function approvalNotice(approval: ActionState<AiApprovalResult>): React.JSX.Element | null {
  switch (approval.kind) {
    case "idle":
      return null
    case "submitting":
      return <output aria-live="polite">Approval is being recorded for this scope.</output>
    case "ready":
      return (
        <StateNotice
          title="Approved, not sent"
          message="Human approval was recorded. Use the separate text action if a send is later justified."
          tone="inset"
          live="polite"
        />
      )
    case "unavailable":
      return (
        <StateNotice
          title="Approval unavailable"
          message={approval.message}
          tone="warning"
          live="polite"
        />
      )
    case "denied":
      return (
        <StateNotice
          title="Approval denied"
          message={approval.message}
          tone="warning"
          live="polite"
        />
      )
    case "error":
      return (
        <StateNotice
          title="Approval failed"
          message={approval.message}
          tone="error"
          live="polite"
        />
      )
    default:
      return assertNever(approval)
  }
}
