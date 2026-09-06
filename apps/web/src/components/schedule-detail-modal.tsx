import type * as React from "react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import type { AccountScope } from "../dashboard-model"
import type { ScheduleEditInput, ScheduleRemoval, ScheduleView } from "../dashboard-schedule-api"
import type { SentHistoryDetail } from "../dashboard-session-api"
import type { ActionState, ResourceState } from "../dashboard-state"
import { scheduleRowActions } from "../schedule-history-controller"
import { ScheduleDeleteConfirm } from "./schedule-delete-confirm"
import { LoadingRows, StateNotice, StatusBadge } from "./ui"
import { formatScheduleDate, scheduleStateTone } from "./view-support"

export function ScheduleDetailModal({
  detail,
  editAction,
  cancelAction,
  deleteAction,
  onEdit,
  onCancel,
  onDelete,
  onClose,
}: Readonly<{
  detail: ResourceState<SentHistoryDetail | undefined>
  editAction: ActionState<ScheduleView>
  cancelAction: ActionState<ScheduleView>
  deleteAction: ActionState<ScheduleRemoval>
  onEdit: (
    scope: AccountScope,
    sessionId: string,
    jobId: string,
    input: ScheduleEditInput,
  ) => Promise<void>
  onCancel: (scope: AccountScope, sessionId: string, jobId: string) => Promise<void>
  onDelete: (scope: AccountScope, sessionId: string, jobId: string) => Promise<void>
  onClose: () => void
}>): React.JSX.Element {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [confirming, setConfirming] = useState(false)
  const [scheduledFor, setScheduledFor] = useState("")
  const [timezone, setTimezone] = useState("")
  const job = detail.kind === "ready" ? detail.data : undefined
  const actions = job ? scheduleRowActions(job.state) : { canCancel: false, canDelete: false }
  const deleted = deleteAction.kind === "ready"
  const scheduleBusy = editAction.kind === "submitting" || cancelAction.kind === "submitting"

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    setScheduledFor(job?.scheduledFor ?? "")
    setTimezone(job?.timezone ?? "")
    setConfirming(false)
  }, [job])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return
      if (confirming) setConfirming(false)
      else onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [confirming, onClose])

  const overlay = (
    <div className="chat-history-backdrop">
      <div
        className="chat-history-panel schedule-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Schedule detail"
      >
        <div className="chat-history-header">
          <strong>Schedule detail</strong>
          <button
            className="button button-secondary"
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {deleted ? (
          <StateNotice
            title="Schedule deleted"
            message="The schedule record was removed from this scope."
          />
        ) : null}
        {!deleted && detail.kind === "loading" ? <LoadingRows count={3} /> : null}
        {!deleted &&
        (detail.kind === "unavailable" || detail.kind === "denied" || detail.kind === "error") ? (
          <StateNotice
            title="Schedule detail unavailable"
            message={detail.message}
            tone="warning"
            live="polite"
          />
        ) : null}
        {!deleted && job ? (
          <div className="schedule-detail">
            <StatusBadge label={`State · ${job.state}`} tone={scheduleStateTone(job.state)} />
            <dl className="schedule-detail-fields">
              <div>
                <dt>Recipient</dt>
                <dd>{job.recipientPhone ?? "Unavailable"}</dd>
              </div>
              <div>
                <dt>Scheduled for</dt>
                <dd>
                  {formatScheduleDate(job.scheduledFor)} · {job.timezone}
                </dd>
              </div>
              <div>
                <dt>Attempts</dt>
                <dd>{job.attempts}</dd>
              </div>
              <div>
                <dt>Next attempt</dt>
                <dd>{job.nextAttemptAt ? formatScheduleDate(job.nextAttemptAt) : "—"}</dd>
              </div>
              <div>
                <dt>Message</dt>
                <dd>{job.message ?? "—"}</dd>
              </div>
            </dl>
            {job.failureCode || job.recoveryCode ? (
              <StateNotice
                title="Recovery state"
                message={[job.failureCode, job.recoveryCode].filter(Boolean).join(" · ")}
                tone="warning"
              />
            ) : null}
            {!actions.canCancel && !actions.canDelete ? (
              <StateNotice
                title="Schedule actions locked"
                message="No cancel or delete actions are available while this job is in flight."
                tone="warning"
              />
            ) : null}
            {actions.canCancel ? (
              <>
                <div className="form-grid">
                  <label>
                    <span>Scheduled for</span>
                    <input
                      aria-label="Scheduled for"
                      value={scheduledFor}
                      onChange={(event) => setScheduledFor(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Timezone</span>
                    <input
                      aria-label="Timezone"
                      value={timezone}
                      onChange={(event) => setTimezone(event.target.value)}
                    />
                  </label>
                </div>
                <div className="button-row">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() =>
                      void onEdit(job.scope, job.sessionId, job.id, { scheduledFor, timezone })
                    }
                    disabled={scheduleBusy}
                    aria-busy={editAction.kind === "submitting" ? "true" : "false"}
                  >
                    {editAction.kind === "submitting" ? "Saving…" : "Save schedule"}
                  </button>
                  <button
                    className="button button-danger"
                    type="button"
                    onClick={() => void onCancel(job.scope, job.sessionId, job.id)}
                    disabled={scheduleBusy}
                    aria-busy={cancelAction.kind === "submitting" ? "true" : "false"}
                  >
                    {cancelAction.kind === "submitting" ? "Cancelling…" : "Cancel schedule"}
                  </button>
                </div>
              </>
            ) : null}
            {actions.canDelete ? (
              <div className="button-row">
                <button
                  className="button button-danger"
                  type="button"
                  aria-label="Delete schedule"
                  onClick={() => setConfirming(true)}
                  disabled={deleteAction.kind === "submitting"}
                >
                  Delete
                </button>
              </div>
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
            {deleteAction.kind === "denied" ||
            deleteAction.kind === "error" ||
            deleteAction.kind === "unavailable" ? (
              <StateNotice
                title="Schedule deletion unavailable"
                message={deleteAction.message}
                tone="error"
                live="polite"
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {confirming && job ? (
        <ScheduleDeleteConfirm
          job={job}
          busy={deleteAction.kind === "submitting"}
          onConfirm={() => void onDelete(job.scope, job.sessionId, job.id)}
          onDismiss={() => setConfirming(false)}
        />
      ) : null}
    </div>
  )

  if (typeof document === "undefined") return overlay
  return createPortal(overlay, document.body)
}
