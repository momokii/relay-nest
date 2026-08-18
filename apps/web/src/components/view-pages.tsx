import type * as React from "react"
import { useEffect, useState } from "react"

import type {
  ContactView,
  ScheduleInput,
  SendInput,
  SendResult,
  SessionView,
} from "../dashboard-api"
import type { AccountScope, DashboardRole } from "../dashboard-model"
import type { ScheduleEditInput, ScheduleView } from "../dashboard-schedule-api"
import type { ActionState, ResourceState } from "../dashboard-state"
import { ContactLookup, MessageComposer } from "./send-forms"
import { Panel, StateNotice, StatusBadge } from "./ui"
import { ResourceStateBody } from "./view-support"

export { RetentionPage, SettingsPage } from "./admin-pages"
export { NotificationsPage } from "./notification-page"
export { AnalyticsPage, OverviewPage } from "./overview-pages"
export { SessionsPage } from "./session-page"
export { UsersPage } from "./user-access-page"

export function ContactsPage({
  scope,
  role,
  sessions,
  action,
  onResolve,
}: Readonly<{
  scope: AccountScope
  role: DashboardRole
  sessions: ResourceState<readonly SessionView[]>
  action: ActionState<ContactView>
  onResolve: (scope: AccountScope, sessionId: string, recipient: string) => Promise<void>
}>): React.JSX.Element {
  return (
    <div className="page-grid">
      <ContactLookup
        scope={scope}
        role={role}
        sessions={sessions}
        action={action}
        onResolve={onResolve}
      />
    </div>
  )
}

export function SendPage(
  props: Readonly<{
    scope: AccountScope
    role: DashboardRole
    sessions: ResourceState<readonly SessionView[]>
    action: ActionState<SendResult>
    onSend: (input: SendInput) => Promise<void>
    onSchedule: (input: ScheduleInput) => Promise<void>
  }>,
): React.JSX.Element {
  return <MessageComposer key={props.scope} mode="send" {...props} />
}

export function SchedulePage(
  props: Readonly<{
    scope: AccountScope
    role: DashboardRole
    sessions: ResourceState<readonly SessionView[]>
    selectedSessionId: string
    action: ActionState<SendResult>
    onSend: (input: SendInput) => Promise<void>
    onSchedule: (input: ScheduleInput) => Promise<void>
    schedules: ResourceState<readonly ScheduleView[]>
    selectedScheduleId: string
    detail: ResourceState<ScheduleView | undefined>
    editAction: ActionState<ScheduleView>
    cancelAction: ActionState<ScheduleView>
    selectSession: (sessionId: string) => void
    selectSchedule: (jobId: string) => void
    editSchedule: (
      scope: AccountScope,
      sessionId: string,
      jobId: string,
      input: ScheduleEditInput,
    ) => Promise<void>
    cancelSchedule: (scope: AccountScope, sessionId: string, jobId: string) => Promise<void>
  }>,
): React.JSX.Element {
  return (
    <div className="page-grid">
      <MessageComposer key={props.scope} mode="schedule" {...props} />
      <ScheduleJobsPanel {...props} />
    </div>
  )
}

function ScheduleJobsPanel({
  scope,
  sessions,
  selectedSessionId,
  schedules,
  selectedScheduleId,
  detail,
  editAction,
  cancelAction,
  selectSession,
  selectSchedule,
  editSchedule,
  cancelSchedule,
}: Readonly<{
  scope: AccountScope
  sessions: ResourceState<readonly SessionView[]>
  selectedSessionId: string
  schedules: ResourceState<readonly ScheduleView[]>
  selectedScheduleId: string
  detail: ResourceState<ScheduleView | undefined>
  editAction: ActionState<ScheduleView>
  cancelAction: ActionState<ScheduleView>
  selectSession: (sessionId: string) => void
  selectSchedule: (jobId: string) => void
  editSchedule: (
    scope: AccountScope,
    sessionId: string,
    jobId: string,
    input: ScheduleEditInput,
  ) => Promise<void>
  cancelSchedule: (scope: AccountScope, sessionId: string, jobId: string) => Promise<void>
}>): React.JSX.Element {
  const sessionId = selectedSessionId || undefined
  const sessionOptions =
    sessions.kind === "ready"
      ? sessions.data.filter((session) => session.accountScope === scope)
      : []
  const jobs = schedules.kind === "ready" ? schedules.data : []
  const selected = detail.kind === "ready" ? detail.data : undefined
  const canEdit = selected?.state === "scheduled" || selected?.state === "queued"
  const scheduleActionBusy = editAction.kind === "submitting" || cancelAction.kind === "submitting"
  const [scheduledFor, setScheduledFor] = useState(selected?.scheduledFor ?? "")
  const [timezone, setTimezone] = useState(selected?.timezone ?? "")

  useEffect(() => {
    setScheduledFor(selected?.scheduledFor ?? "")
    setTimezone(selected?.timezone ?? "")
  }, [selected])

  return (
    <Panel
      eyebrow="Durable jobs"
      title="Schedules"
      description="List, inspect, edit, or cancel one-time jobs in this scope."
    >
      {schedules.kind === "ready" ? (
        jobs.length === 0 ? (
          <StateNotice
            title="No schedules"
            message="No authenticated schedule records are available for this session."
          />
        ) : null
      ) : (
        <ResourceStateBody
          state={schedules}
          emptyTitle="No schedules"
          emptyMessage="No authenticated schedule records are available for this session."
        />
      )}
      <div className="operational-form">
        {sessionOptions.length > 0 ? (
          <label>
            <span>Schedule session</span>
            <select
              aria-label="Schedule session"
              value={selectedSessionId}
              onChange={(event) => selectSession(event.target.value)}
            >
              {sessionOptions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {jobs.length > 0 ? (
          <label>
            <span>Schedule</span>
            <select
              value={selectedScheduleId}
              onChange={(event) => selectSchedule(event.target.value)}
            >
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.state} · {new Date(job.scheduledFor).toLocaleString()}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {selected ? (
        <div className="schedule-detail">
          <StatusBadge label={`State · ${selected.state}`} />
          {selected.failureCode || selected.recoveryCode ? (
            <StateNotice
              title="Recovery state"
              message={[selected.failureCode, selected.recoveryCode].filter(Boolean).join(" · ")}
              tone="warning"
            />
          ) : null}
          {sessionId && canEdit ? (
            <div className="form-grid">
              <label>
                <span>Scheduled for</span>
                <input
                  value={scheduledFor}
                  onChange={(event) => setScheduledFor(event.target.value)}
                />
              </label>
              <label>
                <span>Timezone</span>
                <input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
              </label>
            </div>
          ) : null}
          {sessionId && canEdit ? (
            <div className="button-row">
              <button
                className="button button-secondary"
                type="button"
                onClick={() =>
                  void editSchedule(scope, sessionId, selected.id, {
                    scheduledFor,
                    timezone,
                  })
                }
                disabled={scheduleActionBusy}
                aria-busy={editAction.kind === "submitting" ? "true" : "false"}
              >
                {editAction.kind === "submitting" ? "Saving…" : "Save schedule"}
              </button>
              <button
                className="button button-danger"
                type="button"
                onClick={() => void cancelSchedule(scope, sessionId, selected.id)}
                disabled={scheduleActionBusy}
                aria-busy={cancelAction.kind === "submitting" ? "true" : "false"}
              >
                {cancelAction.kind === "submitting" ? "Cancelling…" : "Cancel schedule"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {detail.kind === "unavailable" || detail.kind === "denied" || detail.kind === "error" ? (
        <StateNotice
          title="Schedule detail unavailable"
          message={detail.message}
          tone="warning"
          live="polite"
        />
      ) : null}
      {editAction.kind === "denied" ||
      editAction.kind === "error" ||
      editAction.kind === "unavailable" ? (
        <StateNotice
          title="Schedule edit unavailable"
          message={editAction.message}
          tone="error"
          live="polite"
        />
      ) : null}
      {cancelAction.kind === "denied" ||
      cancelAction.kind === "error" ||
      cancelAction.kind === "unavailable" ? (
        <StateNotice
          title="Schedule cancellation unavailable"
          message={cancelAction.message}
          tone="error"
          live="polite"
        />
      ) : null}
    </Panel>
  )
}
