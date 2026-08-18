import type * as React from "react"
import { useState } from "react"

import type { SessionView } from "../dashboard-api"
import type { AccountScope } from "../dashboard-model"
import type { SessionLifecycleAction, SessionStatusHistory } from "../dashboard-session-api"
import type { ActionState, ResourceState } from "../dashboard-state"
import { Panel, StateNotice, StatusBadge } from "./ui"

function SessionActionFeedback<T>({
  action,
  readyMessage,
}: Readonly<{ action: ActionState<T>; readyMessage: string }>): React.JSX.Element | null {
  switch (action.kind) {
    case "idle":
    case "submitting":
      return null
    case "ready":
      return <StateNotice title="Command accepted" message={readyMessage} live="polite" />
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
    default:
      return null
  }
}

export function SessionsPage({
  scope,
  sessions,
  lifecycleAction,
  historyAction,
  onLifecycle,
  onLoadHistory,
}: Readonly<{
  scope: AccountScope
  sessions: ResourceState<readonly SessionView[]>
  lifecycleAction: ActionState<SessionView | null>
  historyAction: ActionState<readonly SessionStatusHistory[]>
  onLifecycle: (
    scope: AccountScope,
    sessionId: string,
    action: SessionLifecycleAction,
    confirmed: boolean,
  ) => Promise<void>
  onLoadHistory: (scope: AccountScope, sessionId: string) => Promise<void>
}>): React.JSX.Element {
  const sessionList = sessions.kind === "ready" ? sessions.data : []
  const [selectedSessionId, setSelectedSessionId] = useState(sessionList[0]?.id ?? "")
  const [confirmed, setConfirmed] = useState(false)
  const selectedSession =
    sessionList.find((session) => session.id === selectedSessionId) ?? sessionList[0]
  const activeSessionId = selectedSession?.id ?? ""
  const runLifecycle = (action: SessionLifecycleAction): void => {
    if (!selectedSession) return
    void onLifecycle(scope, selectedSession.id, action, confirmed)
  }

  return (
    <div className="page-grid">
      <Panel
        eyebrow="Scoped transport"
        title="Sessions"
        description="Service health and sending readiness are separate signals. Commands remain server-authorized."
      >
        {sessions.kind === "loading" ? <p>Loading sessions…</p> : null}
        {sessions.kind === "denied" ? (
          <StateNotice title="Scope denied" message={sessions.message} tone="error" />
        ) : null}
        {sessions.kind === "unavailable" || sessions.kind === "error" ? (
          <StateNotice title="Sessions unavailable" message={sessions.message} tone="warning" />
        ) : null}
        {sessionList.length === 0 && sessions.kind !== "loading" && sessions.kind !== "denied" ? (
          <StateNotice
            title="No sessions in scope"
            message="Link a session through an authorized server route before operational work can begin."
          />
        ) : null}
        {sessionList.length > 0 ? (
          <div className="operational-form">
            <label>
              <span>Authorized session</span>
              <select
                value={activeSessionId}
                onChange={(event) => setSelectedSessionId(event.target.value)}
              >
                {sessionList.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="status-list">
              <StatusBadge label={`Session · ${selectedSession?.status ?? "Unknown"}`} />
              <StatusBadge
                label={`Health · ${selectedSession?.serviceHealth ?? "Unknown"}`}
                tone="warning"
              />
              <StatusBadge
                label={`Ready · ${selectedSession?.sendingReadiness ?? "Unknown"}`}
                tone="warning"
              />
            </div>
            <div className="form-actions">
              {(["start", "stop", "restart"] as const).map((action) => (
                <button
                  className="button button-secondary"
                  type="button"
                  key={action}
                  onClick={() => runLifecycle(action)}
                  disabled={lifecycleAction.kind === "submitting"}
                  aria-busy={lifecycleAction.kind === "submitting" ? "true" : "false"}
                >
                  {action[0]?.toUpperCase()}
                  {action.slice(1)}
                </button>
              ))}
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>Confirm destructive logout or delete commands.</span>
            </label>
            <div className="form-actions">
              {(["logout", "delete"] as const).map((action) => (
                <button
                  className="button button-secondary"
                  type="button"
                  key={action}
                  onClick={() => runLifecycle(action)}
                  disabled={!confirmed || lifecycleAction.kind === "submitting"}
                  aria-busy={lifecycleAction.kind === "submitting" ? "true" : "false"}
                >
                  {action[0]?.toUpperCase()}
                  {action.slice(1)}
                </button>
              ))}
              <button
                className="button button-secondary"
                type="button"
                onClick={() => selectedSession && void onLoadHistory(scope, selectedSession.id)}
                disabled={!selectedSession || historyAction.kind === "submitting"}
                aria-busy={historyAction.kind === "submitting" ? "true" : "false"}
              >
                {historyAction.kind === "submitting" ? "Loading history…" : "Load status history"}
              </button>
            </div>
            <SessionActionFeedback
              action={lifecycleAction}
              readyMessage="The session command was accepted; provider state remains separately observable."
            />
            <SessionActionFeedback
              action={historyAction}
              readyMessage="Status history loaded below."
            />
            {historyAction.kind === "ready" ? <StatusHistory entries={historyAction.data} /> : null}
          </div>
        ) : null}
      </Panel>
      <Panel eyebrow="Linking floor" title="Session linking" tone="inset">
        <StateNotice
          title="Connection capability unavailable"
          message="The UI does not expose raw WAHA controls or credentials. Admin linking still requires the server-side connection route and capability result."
          tone="warning"
        />
      </Panel>
    </div>
  )
}

function StatusHistory({
  entries,
}: Readonly<{ entries: readonly SessionStatusHistory[] }>): React.JSX.Element {
  return entries.length === 0 ? (
    <StateNotice
      title="No status history"
      message="No persisted status observations are available for this session."
    />
  ) : (
    <ul className="plain-list">
      {entries.map((entry) => (
        <li key={`${entry.observedAt}-${entry.status}`}>
          {entry.observedAt} · {entry.status}
        </li>
      ))}
    </ul>
  )
}
