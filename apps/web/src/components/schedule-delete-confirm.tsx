import type * as React from "react"

import type { SentHistoryDetail } from "../dashboard-session-api"

export function ScheduleDeleteConfirm({
  job,
  busy,
  onConfirm,
  onDismiss,
}: Readonly<{
  job: SentHistoryDetail
  busy: boolean
  onConfirm: () => void
  onDismiss: () => void
}>): React.JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Confirm delete schedule ${job.id}`}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgb(15 20 18 / 0.6)",
        display: "grid",
        placeItems: "center",
        zIndex: 60,
        padding: "var(--space-4)",
      }}
      onClick={onDismiss}
      onKeyDown={(event) => {
        if (event.key === "Escape") onDismiss()
      }}
      tabIndex={-1}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only, no keyboard action needed */}
      <div
        role="document"
        style={{
          background: "var(--color-surface)",
          padding: "var(--space-6)",
          borderRadius: "var(--radius-panel)",
          maxWidth: "28rem",
          width: "100%",
          display: "grid",
          gap: "var(--space-3)",
          border: "1px solid var(--color-border)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <strong>Delete this schedule?</strong>
        <small style={{ color: "var(--color-muted)" }}>
          This removes the schedule record for {job.recipientPhone ?? "this recipient"}. Delivery
          evidence already recorded stays auditable. This cannot be undone.
        </small>
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
          <button type="button" className="button button-secondary" onClick={onDismiss}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-danger"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy ? "true" : "false"}
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  )
}
