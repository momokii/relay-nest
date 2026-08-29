import type * as React from "react"
import { useState } from "react"

import type { ContactView, SessionView } from "../dashboard-api"
import { type AccountScope, canPerform, type DashboardRole } from "../dashboard-model"
import type { ActionState, ResourceState } from "../dashboard-state"
import { ChatDirectory } from "./chat-directory"
import { Panel, StateNotice } from "./ui"

export function ContactLookup({
  scope,
  role,
  sessions,
  action,
  consentAction,
  onResolve,
  onSetConsent,
}: Readonly<{
  scope: AccountScope
  role: DashboardRole
  sessions: ResourceState<readonly SessionView[]>
  action: ActionState<ContactView>
  consentAction: ActionState<{ readonly updated: boolean }>
  onResolve: (scope: AccountScope, sessionId: string, recipient: string) => Promise<void>
  onSetConsent: (
    scope: AccountScope,
    sessionId: string,
    contactId: string,
    input: { readonly consentGranted: boolean; optedOut: boolean },
  ) => Promise<void>
}>): React.JSX.Element {
  const [recipient, setRecipient] = useState("")
  const [sessionId, setSessionId] = useState("")
  const options =
    sessions.kind === "ready"
      ? sessions.data.filter((session) => session.accountScope === scope)
      : []
  const activeSession = sessionId || options[0]?.id || ""
  const canOperate = canPerform(role, "operate")
  const resolved = action.kind === "ready" ? action.data : null

  const grantConsent = (consentGranted: boolean): void => {
    if (!resolved) return
    void onSetConsent(scope, activeSession, resolved.id, {
      consentGranted,
      optedOut: !consentGranted,
    })
  }
  return (
    <Panel
      eyebrow="Scoped lookup"
      title="Resolve a contact"
      description="Only a validated individual target is returned; contact content is not stored in this view."
    >
      <form
        className="operational-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (activeSession && recipient.trim())
            void onResolve(scope, activeSession, recipient.trim())
        }}
      >
        <div className="form-grid">
          <label>
            <span>Session</span>
            <select
              value={activeSession}
              onChange={(event) => setSessionId(event.target.value)}
              disabled={!canOperate}
            >
              <option value="">Select a session</option>
              {options.map((session) => (
                <option value={session.id} key={session.id}>
                  {session.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Phone or saved contact reference</span>
            <input
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="+15551234567"
              disabled={!canOperate}
            />
          </label>
        </div>
        <button
          className="button button-secondary"
          type="submit"
          disabled={!canOperate || action.kind === "submitting"}
          aria-busy={action.kind === "submitting" ? "true" : "false"}
        >
          {action.kind === "submitting" ? "Resolving…" : "Resolve target"}
        </button>
        {action.kind === "ready" ? (
          <StateNotice
            title="Contact resolved"
            message={`${action.data.displayName ?? "Unnamed contact"} · ${action.data.phone}`}
            live="polite"
          />
        ) : null}
        {resolved ? (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={consentAction.kind === "ready" && consentAction.data.updated}
              onChange={(event) => grantConsent(event.target.checked)}
              disabled={!canOperate || consentAction.kind === "submitting"}
            />
            <span>
              I have a documented consent basis to message this contact. Sends stay blocked until
              this is granted.
            </span>
          </label>
        ) : null}
        {consentAction.kind === "ready" && consentAction.data.updated ? (
          <StateNotice
            title="Consent recorded"
            message="This contact can now receive messages through this session."
            live="polite"
          />
        ) : null}
        {consentAction.kind === "unavailable" || consentAction.kind === "error" ? (
          <StateNotice
            title="Consent update failed"
            message={consentAction.message}
            tone="error"
            live="polite"
          />
        ) : null}
        {action.kind === "unavailable" ? (
          <StateNotice
            title="WAHA unavailable"
            message={action.message}
            tone="warning"
            live="polite"
          />
        ) : null}
        {action.kind === "denied" || action.kind === "error" ? (
          <StateNotice
            title="Lookup unavailable"
            message={action.message}
            tone="error"
            live="polite"
          />
        ) : null}
      </form>
      <ChatDirectory
        scope={scope}
        sessionId={activeSession}
        disabled={!canOperate}
        onSelect={(chat) => setRecipient(chat.id)}
      />
    </Panel>
  )
}
