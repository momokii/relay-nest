import type * as React from "react"

import type { ContactView } from "../dashboard-api"
import { assertNever } from "../dashboard-model"
import type { ActionState } from "../dashboard-state"
import { ChatDirectory } from "./chat-directory"
import {
  type RecipientSelectorController,
  type RecipientSelectorOptions,
  recipientSelectorError,
  useRecipientSelector,
} from "./recipient-selector-state"
import { StateNotice } from "./ui"

export type RecipientSelectorFieldsProps = Readonly<{
  controller: RecipientSelectorController
  action: ActionState<ContactView>
  consentAction: ActionState<{ readonly updated: boolean }>
  title?: string
  description?: string
  inputLabel?: string
  inputHint?: string
}>

export function RecipientSelectorFields({
  controller,
  action,
  consentAction,
  title = "Choose a contact",
  description = "Select one individual contact or enter a phone number to resolve.",
  inputLabel = "One recipient",
  inputHint = "Enter one E.164 number or choose an available individual contact below.",
}: RecipientSelectorFieldsProps): React.JSX.Element {
  const { selection } = controller
  const resolutionMessage = actionMessage(action)
  const consentMessage = actionMessage(consentAction)
  const error = recipientSelectorError(controller)

  return (
    <section className="recipient-selector" aria-label="Recipient selector">
      <div className="chat-directory-heading">
        <div>
          <p className="overline">Recipient selector</p>
          <h3>{title}</h3>
          <p className="chat-directory-copy">{description}</p>
          <p className="chat-directory-copy">
            Use a valid consent basis. The Server consent record is authoritative at send time.
          </p>
        </div>
      </div>
      <div className="form-grid">
        <label>
          <span>Authorized session</span>
          <select
            value={controller.sessionId}
            onChange={(event) => controller.onSessionChange(event.target.value)}
            disabled={!controller.canOperate || controller.sessions.kind === "loading"}
          >
            <option value="">
              {controller.sessions.kind === "loading" ? "Loading sessions…" : "Select a session"}
            </option>
            {controller.sessionOptions.map((session) => (
              <option value={session.id} key={session.id}>
                {session.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{inputLabel}</span>
          <input
            value={selection.recipient}
            onChange={(event) => controller.onRecipientChange(event.target.value)}
            placeholder="+15551234567"
            inputMode="tel"
            disabled={!controller.canOperate}
          />
          <small>{inputHint}</small>
        </label>
      </div>
      <ChatDirectory
        scope={controller.scope}
        sessionId={controller.sessionId}
        disabled={!controller.canOperate}
        selectedChatId={selection.selectedDirectoryPhone}
        onSelect={controller.onDirectorySelect}
      />
      <button
        className="button button-secondary"
        type="button"
        onClick={controller.onResolve}
        disabled={
          !controller.canOperate || controller.sessionId.length === 0 || selection.resolutionPending
        }
        aria-busy={selection.resolutionPending ? "true" : "false"}
      >
        {selection.resolutionPending ? "Resolving…" : "Resolve target"}
      </button>
      {selection.resolvedContact ? (
        <StateNotice
          title="Contact verified"
          message={`${selection.resolvedContact.displayName ?? "Unnamed contact"} · ${selection.resolvedContact.phone}`}
          live="polite"
        />
      ) : null}
      {selection.resolvedContact ? (
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={selection.consentCheckboxChecked}
            onChange={(event) => controller.onConsentChange(event.target.checked)}
            disabled={!controller.canOperate || selection.consentPending}
          />
          <span>
            I have a documented consent basis to message this contact. Sends stay blocked until the
            Server consent record is granted.
          </span>
        </label>
      ) : null}
      {selection.hasServerConsent ? (
        <StateNotice
          title="Consent recorded"
          message="The Server consent record allows this contact to receive messages through this session."
          live="polite"
        />
      ) : null}
      {selection.resolutionFailed ? (
        <StateNotice
          title="Contact verification failed"
          message={`${resolutionMessage ?? error ?? "The contact could not be verified."} Edit the recipient manually or choose another contact.`}
          tone="error"
          live="polite"
        />
      ) : null}
      {selection.consentDenied ? (
        <StateNotice
          title="Consent update failed"
          message={consentMessage ?? error ?? "The server did not record this consent change."}
          tone="error"
          live="polite"
        />
      ) : null}
    </section>
  )
}

export function RecipientSelector({
  options,
}: Readonly<{ options: RecipientSelectorOptions }>): React.JSX.Element {
  const controller = useRecipientSelector(options)
  return (
    <RecipientSelectorFields
      controller={controller}
      action={options.action}
      consentAction={options.consentAction}
    />
  )
}

function actionMessage<T>(action: ActionState<T>): string | undefined {
  switch (action.kind) {
    case "idle":
    case "submitting":
    case "ready":
      return undefined
    case "unavailable":
    case "denied":
    case "error":
      return action.message
    default:
      return assertNever(action)
  }
}

export {
  isContactConsentCurrent,
  isContactConsentMutationCurrent,
  isContactLookupResultCurrent,
  isContactResolutionCurrent,
  normalizedRecipient,
} from "./recipient-selector-state"
