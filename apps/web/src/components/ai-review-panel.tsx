import type * as React from "react"

import { Panel, StateNotice, StatusBadge } from "./ui"

export function AiReviewPanel(): React.JSX.Element {
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
          message="No server-backed suggestion is available for this scope. Nothing is shown or approved locally."
          tone="warning"
        />
      </div>
    </Panel>
  )
}
