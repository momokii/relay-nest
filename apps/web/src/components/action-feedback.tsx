import type * as React from "react"

import type { SendResult } from "../dashboard-api"
import type { ActionState } from "../dashboard-state"
import { StateNotice } from "./ui"

export function ActionFeedback({
  action,
}: Readonly<{ action: ActionState<SendResult> }>): React.JSX.Element | null {
  switch (action.kind) {
    case "idle":
    case "submitting":
      return null
    case "unavailable":
      return (
        <StateNotice title="Unavailable" message={action.message} tone="warning" live="polite" />
      )
    case "denied":
      return (
        <StateNotice title="Server denied" message={action.message} tone="error" live="polite" />
      )
    case "error":
      return (
        <StateNotice
          title="Could not complete"
          message={action.message}
          tone="error"
          live="polite"
        />
      )
    case "ready":
      return <SendResultNotice result={action.data} />
    default:
      return null
  }
}

function SendResultNotice({ result }: Readonly<{ result: SendResult }>): React.JSX.Element {
  switch (result.state) {
    case "submitted":
      return (
        <StateNotice
          title="Submitted"
          message="The transport accepted the request; recipient delivery remains unconfirmed."
          live="polite"
        />
      )
    case "acknowledged":
      return (
        <StateNotice
          title="Acknowledged"
          message="The transport advanced the request; this is not proof the recipient saw it."
          live="polite"
        />
      )
    case "scheduled":
      return (
        <StateNotice
          title="Scheduled"
          message={`One-time job recorded with reference ${result.jobId}.`}
          live="polite"
        />
      )
    case "failed":
      return (
        <StateNotice
          title="Failed"
          message={`The server returned a recovery state: ${result.recoveryCode}.`}
          tone="error"
          live="polite"
        />
      )
    case "unknown":
      return (
        <StateNotice
          title="Unknown outcome"
          message={`Do not retry blindly. Recovery reference: ${result.recoveryCode}.`}
          tone="warning"
          live="polite"
        />
      )
    default:
      return (
        <StateNotice
          title="Unknown outcome"
          message="The delivery state is not classified."
          tone="warning"
          live="polite"
        />
      )
  }
}
