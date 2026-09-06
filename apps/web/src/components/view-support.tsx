import type * as React from "react"

import type { SessionView } from "../dashboard-api"
import type { SentHistoryState } from "../dashboard-session-api"
import type { ResourceState } from "../dashboard-state"
import { LoadingRows, StateNotice, StatusBadge } from "./ui"

export type ScheduleStateTone = "success" | "warning" | "error" | "info"

export function formatScheduleDate(value: string): string {
  return new Date(value).toLocaleString()
}

export function scheduleStateTone(state: SentHistoryState): ScheduleStateTone {
  switch (state) {
    case "acknowledged":
      return "success"
    case "failed":
      return "error"
    case "scheduled":
    case "queued":
    case "attempting":
      return "warning"
    case "submitted":
    case "unknown":
    case "cancelled":
      return "info"
    default:
      return assertNeverState(state)
  }
}

function assertNeverState(value: never): never {
  throw new Error(`Unexpected schedule state: ${String(value)}`)
}

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
        <span>
          {session.accountScope} scope · {session.id.slice(0, 8)}…
        </span>
      </div>
      <div className="status-list">
        <StatusBadge
          label={`Session · ${session.status}`}
          info={`Current WAHA session status: ${session.status}. WORKING = ready to send, SCAN_QR_CODE = needs QR, etc.`}
        />
        <StatusBadge
          label={`Health · ${session.serviceHealth}`}
          tone={session.serviceHealth === "healthy" ? "success" : "warning"}
          info="Service health from WAHA: healthy = API reachable and authenticated, unknown/unhealthy = check WAHA logs."
        />
        <StatusBadge
          label={`Ready · ${session.sendingReadiness}`}
          tone={session.sendingReadiness === "ready" ? "success" : "warning"}
          info="Sending readiness: ready = can submit via this session, blocked = timelock/capping or not WORKING."
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
