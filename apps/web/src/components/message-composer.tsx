import type * as React from "react"
import { type FormEvent, useState } from "react"

import type { ScheduleInput, SendInput, SendResult, SessionView } from "../dashboard-api"
import {
  type AccountScope,
  canPerform,
  type DashboardRole,
  validateMessageInput,
} from "../dashboard-model"
import type { ActionState, ResourceState } from "../dashboard-state"
import { ActionFeedback } from "./action-feedback"
import { AiReviewPanel } from "./ai-review-panel"
import { LoadingRows, Panel, StateNotice } from "./ui"

export function MessageComposer({
  mode,
  scope,
  role,
  sessions,
  action,
  onSend,
  onSchedule,
}: Readonly<{
  mode: "send" | "schedule"
  scope: AccountScope
  role: DashboardRole
  sessions: ResourceState<readonly SessionView[]>
  action: ActionState<SendResult>
  onSend: (input: SendInput) => Promise<void>
  onSchedule: (input: ScheduleInput) => Promise<void>
}>): React.JSX.Element {
  const [recipient, setRecipient] = useState("")
  const [message, setMessage] = useState("")
  const [selectedSession, setSelectedSession] = useState("")
  const [hasConsent, setHasConsent] = useState(false)
  const [scheduledFor, setScheduledFor] = useState("")
  const [timezone, setTimezone] = useState("UTC")
  const [validationError, setValidationError] = useState<string | undefined>()
  const sessionOptions =
    sessions.kind === "ready"
      ? sessions.data.filter((session) => session.accountScope === scope)
      : []
  const selectedSessionIsCurrent = sessionOptions.some((session) => session.id === selectedSession)
  const sessionId = selectedSessionIsCurrent ? selectedSession : sessionOptions[0]?.id || ""
  const canOperate = canPerform(role, "operate")

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const validation = validateMessageInput({
      recipient,
      message,
      hasConsent,
      hasMedia: false,
      isRecurring: false,
    })
    if (!validation.valid) {
      setValidationError(validation.reason)
      return
    }
    if (!sessionId) {
      setValidationError("Select an authorized session before continuing.")
      return
    }
    if (mode === "schedule" && scheduledFor.length === 0) {
      setValidationError("Choose a one-time date and time before scheduling.")
      return
    }
    setValidationError(undefined)
    const common = {
      scope,
      sessionId,
      recipient: validation.recipient,
      message: validation.message,
      idempotencyKey: crypto.randomUUID(),
    }
    if (mode === "send") {
      void onSend(common)
      return
    }
    void onSchedule({ ...common, scheduledFor, timezone })
  }
  return (
    <div className="form-stack">
      <Panel
        eyebrow={mode === "send" ? "Operator action" : "Durable one-time job"}
        title={mode === "send" ? "Send an individual text" : "Schedule one text"}
        description="This surface is intentionally text-only, consent-first, and scoped to one authorized session."
      >
        {!canOperate ? (
          <StateNotice
            title="Role denied"
            message="Viewer access is read-only. The server remains authoritative."
            tone="warning"
          />
        ) : null}
        <form className="operational-form" onSubmit={submit}>
          <div className="form-grid">
            <label htmlFor="message-session">
              <span>Authorized session</span>
              <select
                id="message-session"
                value={sessionId}
                onChange={(event) => setSelectedSession(event.target.value)}
                disabled={!canOperate || sessions.kind === "loading"}
              >
                <option value="">
                  {sessions.kind === "loading" ? "Loading sessions…" : "Select a session"}
                </option>
                {sessionOptions.map((session) => (
                  <option value={session.id} key={session.id}>
                    {session.name}
                  </option>
                ))}
              </select>
              {sessions.kind === "loading" ? <LoadingRows count={1} /> : null}
            </label>
            <label>
              <span>Recipient phone number</span>
              <input
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="+15551234567"
                inputMode="tel"
                disabled={!canOperate}
              />
              <small>
                Country code required. The server performs final contact and consent checks.
              </small>
            </label>
          </div>
          <label>
            <span>Text message</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              maxLength={4096}
              placeholder="Text content is entered only at send time."
              disabled={!canOperate}
            />
            <small>{message.length} / 4096 characters · no media or broadcast targets</small>
          </label>
          {mode === "schedule" ? (
            <div className="form-grid">
              <label>
                <span>One-time dispatch time</span>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(event) => setScheduledFor(event.target.value)}
                  disabled={!canOperate}
                />
              </label>
              <label>
                <span>Timezone</span>
                <input
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  maxLength={80}
                  disabled={!canOperate}
                />
                <small>Schedules are one-time only; recurrence is not available.</small>
              </label>
            </div>
          ) : null}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={hasConsent}
              onChange={(event) => setHasConsent(event.target.checked)}
              disabled={!canOperate}
            />
            <span>I have a valid consent basis for this individual recipient.</span>
          </label>
          <div className="safety-callout">
            <strong>Safety checkpoint</strong>
            <span>
              Transport acceptance is not proof of recipient delivery. Pacing, quiet hours, consent,
              and WAHA state are checked server-side.
            </span>
          </div>
          {validationError ? (
            <p className="form-error" role="alert">
              {validationError}
            </p>
          ) : null}
          <div className="form-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={!canOperate || action.kind === "submitting"}
              aria-busy={action.kind === "submitting" ? "true" : "false"}
            >
              {action.kind === "submitting"
                ? "Submitting…"
                : mode === "send"
                  ? "Submit immediate text"
                  : "Create one-time schedule"}
            </button>
            <span className="idempotency-note">
              Each submission receives a fresh idempotency key.
            </span>
          </div>
          <ActionFeedback action={action} />
        </form>
      </Panel>
      <AiReviewPanel />
    </div>
  )
}
