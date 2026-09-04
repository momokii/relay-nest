import * as React from "react"
import { type FormEvent, type KeyboardEvent, useMemo, useRef, useState } from "react"

import type { AiApprovalResult } from "../dashboard-ai-api"
import { createDashboardAiApi } from "../dashboard-ai-api"
import type {
  ContactView,
  ScheduleInput,
  SendInput,
  SendResult,
  SessionView,
} from "../dashboard-api"
import {
  type AccountScope,
  type AiSuggestion,
  canPerform,
  type DashboardRole,
  validateMessageInput,
} from "../dashboard-model"
import { type ActionState, actionFromResult, type ResourceState } from "../dashboard-state"
import { renderPreview } from "../lib/whatsapp-format"
import { randomUuid } from "../random-uuid"
import { ActionFeedback } from "./action-feedback"
import { AiReviewPanel } from "./ai-review-panel"
import { RecipientSelectorFields } from "./recipient-selector"
import { canSubmitSelectedDirectoryContact, useRecipientSelector } from "./recipient-selector-state"
import { Panel, StateNotice } from "./ui"

export {
  canSubmitSelectedDirectoryContact,
  isContactResolutionCurrent,
} from "./recipient-selector-state"

function previewNode(node: ChildNode, key: number): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent
  if (node.nodeType !== Node.ELEMENT_NODE) return null

  const children = Array.from(node.childNodes).map((child, index) => previewNode(child, index))
  switch (node.nodeName.toLowerCase()) {
    case "strong":
      return React.createElement("strong", { key }, children)
    case "em":
      return React.createElement("em", { key }, children)
    case "s":
      return React.createElement("s", { key }, children)
    case "code":
      return React.createElement("code", { key }, children)
    case "ul":
      return React.createElement("ul", { key }, children)
    case "ol":
      return React.createElement("ol", { key }, children)
    case "li":
      return React.createElement("li", { key }, children)
    default:
      return null
  }
}

function renderPreviewNodes(text: string): readonly React.ReactNode[] {
  const document = new DOMParser().parseFromString(renderPreview(text), "text/html")
  return Array.from(document.body.childNodes).map((node, index) => previewNode(node, index))
}

export function MessageComposer({
  mode,
  scope,
  role,
  sessions,
  action,
  contactAction,
  consentAction,
  onResolve,
  onSetConsent,
  suggestion,
  onSend,
  onSchedule,
}: Readonly<{
  mode: "send" | "schedule"
  scope: AccountScope
  role: DashboardRole
  sessions: ResourceState<readonly SessionView[]>
  action: ActionState<SendResult>
  contactAction: ActionState<ContactView>
  consentAction: ActionState<{ readonly updated: boolean }>
  onResolve: (scope: AccountScope, sessionId: string, recipient: string) => Promise<void>
  onSetConsent: (
    scope: AccountScope,
    sessionId: string,
    contactId: string,
    input: { readonly consentGranted: boolean; readonly optedOut: boolean },
  ) => Promise<void>
  suggestion?: AiSuggestion | undefined
  onSend: (input: SendInput) => Promise<void>
  onSchedule: (input: ScheduleInput) => Promise<void>
}>): React.JSX.Element {
  const [message, setMessage] = useState("")
  const [scheduledFor, setScheduledFor] = useState("")
  const [timezone, setTimezone] = useState("UTC")
  const [validationError, setValidationError] = useState<string | undefined>()
  const [aiApproval, setAiApproval] = useState<ActionState<AiApprovalResult>>({ kind: "idle" })
  const messageInput = useRef<HTMLTextAreaElement>(null)
  const aiApi = useMemo(() => createDashboardAiApi(import.meta.env.VITE_API_BASE_URL), [])
  const recipientSelector = useRecipientSelector({
    scope,
    role,
    sessions,
    action: contactAction,
    consentAction,
    onResolve,
    onSetConsent,
  })
  const { selection } = recipientSelector
  const sessionId = recipientSelector.sessionId
  const canOperate = canPerform(role, "operate")
  const canSubmitDirectorySelection = canSubmitSelectedDirectoryContact({
    selectedChatId: selection.selectedDirectoryPhone,
    contactId: selection.contactId,
  })
  const preview = useMemo(() => renderPreviewNodes(message), [message])

  function replaceMessageSelection(prefix: string, suffix = prefix): void {
    const input = messageInput.current
    if (!input) return
    const start = input.selectionStart
    const end = input.selectionEnd
    const selected = message.slice(start, end)
    input.setRangeText(`${prefix}${selected}${suffix}`, start, end, "select")
    setMessage(input.value)
    input.setSelectionRange(start + prefix.length, start + prefix.length + selected.length)
    input.focus()
  }

  function handleMessageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter") {
      event.preventDefault()
      const input = event.currentTarget
      input.setRangeText("\n", input.selectionStart, input.selectionEnd, "end")
      setMessage(input.value)
      return
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return
    const shortcut = event.key.toLowerCase()
    if (shortcut !== "b" && shortcut !== "i") return
    event.preventDefault()
    replaceMessageSelection(shortcut === "b" ? "*" : "_")
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const validation = validateMessageInput({
      recipient: selection.recipient,
      message,
      hasConsent: selection.hasServerConsent,
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
    if (!canSubmitDirectorySelection) {
      setValidationError(
        selection.resolutionPending
          ? "The selected contact is still being verified. Wait for resolution to finish."
          : "The selected contact could not be verified. Edit the recipient manually or choose another contact.",
      )
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
      ...(selection.contactId ? { contactId: selection.contactId } : {}),
      message: validation.message,
      idempotencyKey: randomUuid(),
    }
    if (mode === "send") {
      void onSend(common)
      return
    }
    void onSchedule({ ...common, scheduledFor, timezone })
  }

  async function approveAi(suggestion: AiSuggestion): Promise<void> {
    setAiApproval({ kind: "submitting" })
    setAiApproval(
      actionFromResult(
        await aiApi.approve(scope, suggestion.id, suggestion.provider, suggestion.kind),
      ),
    )
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
          <RecipientSelectorFields
            controller={recipientSelector}
            action={contactAction}
            consentAction={consentAction}
          />
          <div className="message-composer">
            <div className="message-toolbar" role="toolbar" aria-label="Message formatting">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => replaceMessageSelection("*")}
                disabled={!canOperate}
                aria-label="Bold"
              >
                B
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => replaceMessageSelection("_")}
                disabled={!canOperate}
                aria-label="Italic"
              >
                I
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => replaceMessageSelection("~")}
                disabled={!canOperate}
                aria-label="Strikethrough"
              >
                S
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => replaceMessageSelection("```")}
                disabled={!canOperate}
                aria-label="Monospace"
              >
                M
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => replaceMessageSelection("- ", "")}
                disabled={!canOperate}
                aria-label="Bullet list"
              >
                •
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => replaceMessageSelection("1. ", "")}
                disabled={!canOperate}
                aria-label="Numbered list"
              >
                1.
              </button>
            </div>
            <label htmlFor="message-textarea">
              <span>Text message</span>
              <textarea
                id="message-textarea"
                ref={messageInput}
                aria-label="Text message"
                aria-describedby="message-textarea-help"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={handleMessageKeyDown}
                rows={4}
                maxLength={4096}
                placeholder="Text content is entered only at send time."
                disabled={!canOperate}
              />
              <small id="message-textarea-help">
                {message.length} / 4096 characters · no media or broadcast targets
              </small>
            </label>
            <section className="message-preview" aria-label="Message preview">
              <span className="message-preview-label">Preview</span>
              <div className="message-preview-content">
                {preview.length > 0 ? preview : "\u00a0"}
              </div>
            </section>
          </div>
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
                <select
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  disabled={!canOperate}
                >
                  <option value="UTC">UTC</option>
                  <option value="Asia/Jakarta">Asia/Jakarta</option>
                  <option value="Asia/Singapore">Asia/Singapore</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="America/Los_Angeles">America/Los_Angeles</option>
                </select>
                <small>Schedules are one-time only; recurrence is not available.</small>
              </label>
            </div>
          ) : null}
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
      <AiReviewPanel
        scope={scope}
        role={role}
        suggestion={suggestion}
        approval={aiApproval}
        onApprove={approveAi}
      />
    </div>
  )
}
