import type * as React from "react"

import type { SessionView } from "../dashboard-api"
import type { ResourceState } from "../dashboard-state"
import { LoadingRows, StateNotice, StatusBadge } from "./ui"

export function ResourceStateBody<T>({
  state,
  emptyTitle,
  emptyMessage,
}: Readonly<{
  state: ResourceState<T>
  emptyTitle: string
  emptyMessage: string
}>): React.JSX.Element | null {
  switch (state.kind) {
    case "loading":
      return <LoadingRows />
    case "denied":
      return <StateNotice title="Scope denied" message={state.message} tone="error" />
    case "unavailable":
      return <StateNotice title="Unavailable" message={state.message} tone="warning" />
    case "error":
      return <StateNotice title="Error" message={state.message} tone="error" />
    case "ready":
      return null
    default:
      return <StateNotice title={emptyTitle} message={emptyMessage} />
  }
}

export function SessionRow({ session }: Readonly<{ session: SessionView }>): React.JSX.Element {
  return (
    <div className="session-row">
      <div>
        <strong>{session.name}</strong>
        <span>{session.accountScope} scope</span>
      </div>
      <div className="status-list">
        <StatusBadge label={`Session · ${session.status}`} />
        <StatusBadge
          label={`Health · ${session.serviceHealth}`}
          tone={session.serviceHealth === "healthy" ? "success" : "warning"}
        />
        <StatusBadge
          label={`Ready · ${session.sendingReadiness}`}
          tone={session.sendingReadiness === "ready" ? "success" : "warning"}
        />
      </div>
    </div>
  )
}

export function SessionCard({ session }: Readonly<{ session: SessionView }>): React.JSX.Element {
  return (
    <div className="session-card">
      <div className="session-card-top">
        <span className="overline">{session.accountScope}</span>
        <StatusBadge label={session.status} />
      </div>
      <h3>{session.name}</h3>
      <div className="divider" aria-hidden="true" />
      <span>Service health: {session.serviceHealth}</span>
      <span>Sending readiness: {session.sendingReadiness}</span>
    </div>
  )
}

export function ChannelCard({
  label,
  enabled,
  configured,
}: Readonly<{ label: string; enabled: boolean; configured: boolean }>): React.JSX.Element {
  return (
    <div className="channel-card">
      <div className="session-card-top">
        <h3>{label}</h3>
        <StatusBadge
          label={enabled ? "Enabled" : "Disabled"}
          tone={enabled ? "success" : "warning"}
        />
      </div>
      <span>{configured ? "Configuration present (masked)" : "No configuration available"}</span>
    </div>
  )
}
