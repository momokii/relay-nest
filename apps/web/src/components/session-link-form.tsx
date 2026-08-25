import type * as React from "react"
import { type FormEvent, useState } from "react"

import type { SessionView } from "../dashboard-api"
import type { AccountScope } from "../dashboard-model"
import { createSessionSchema, type SessionCreateInput } from "../dashboard-session-api"
import type { ActionState } from "../dashboard-state"
import { StateNotice } from "./ui"

export function SessionLinkForm({
  scope,
  action,
  onSubmit,
}: Readonly<{
  scope: AccountScope
  action: ActionState<SessionView>
  onSubmit: (scope: AccountScope, input: SessionCreateInput) => Promise<void>
}>): React.JSX.Element {
  const [connectionId, setConnectionId] = useState("")
  const [name, setName] = useState("")
  const [wahaSessionName, setWahaSessionName] = useState("")
  const [validationError, setValidationError] = useState<string | undefined>()

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const parsed = createSessionSchema.safeParse({ connectionId, name, wahaSessionName })
    if (!parsed.success) {
      setValidationError("Enter a valid connection ID and both session names.")
      return
    }
    setValidationError(undefined)
    void onSubmit(scope, parsed.data)
  }

  return (
    <form className="operational-form" onSubmit={submit}>
      <label>
        <span>Connection ID</span>
        <input
          type="text"
          value={connectionId}
          onChange={(event) => setConnectionId(event.target.value)}
          required
        />
      </label>
      <label>
        <span>Session name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label>
        <span>WAHA session name</span>
        <input
          value={wahaSessionName}
          onChange={(event) => setWahaSessionName(event.target.value)}
          required
        />
      </label>
      <button
        className="button button-primary"
        type="submit"
        disabled={action.kind === "submitting"}
        aria-busy={action.kind === "submitting" ? "true" : "false"}
      >
        {action.kind === "submitting" ? "Linking…" : "Link session"}
      </button>
      {validationError ? (
        <StateNotice title="Invalid session details" message={validationError} tone="error" />
      ) : null}
    </form>
  )
}
