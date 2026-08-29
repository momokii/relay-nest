import type * as React from "react"
import { type FormEvent, useEffect, useMemo, useState } from "react"

import { type ConnectionSummary, createDashboardAdminApi } from "../dashboard-admin-api"
import type { ApiResult, SessionView } from "../dashboard-api"
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
  const api = useMemo(() => createDashboardAdminApi(import.meta.env.VITE_API_BASE_URL), [])
  const [connections, setConnections] = useState<ApiResult<readonly ConnectionSummary[]> | null>(
    null,
  )
  const [connectionId, setConnectionId] = useState("")
  const [name, setName] = useState("")
  const [wahaSessionName, setWahaSessionName] = useState("")
  const [validationError, setValidationError] = useState<string | undefined>()

  useEffect(() => {
    let cancelled = false
    void api.listConnections().then((result) => {
      if (cancelled) return
      setConnections(result)
      if (result.kind === "ready" && result.data.length > 0)
        setConnectionId(result.data[0]?.id ?? "")
    })
    return () => {
      cancelled = true
    }
  }, [api])

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const parsed = createSessionSchema.safeParse({ connectionId, name, wahaSessionName })
    if (!parsed.success) {
      setValidationError("Select a provider connection and enter both session names.")
      return
    }
    setValidationError(undefined)
    void onSubmit(scope, parsed.data)
  }

  if (connections === null || connections.kind !== "ready") {
    return (
      <StateNotice
        title="Provider connections unavailable"
        message="The server did not provide its provider connections, so a session cannot be linked right now."
        tone="warning"
      />
    )
  }

  if (connections.data.length === 0) {
    return (
      <StateNotice
        title="No provider connections"
        message="The server has no active provider connections configured, so a session cannot be linked. In bundled mode the connection is provisioned automatically at startup."
        tone="warning"
      />
    )
  }

  return (
    <form className="operational-form" onSubmit={submit}>
      <label>
        <span>Provider connection</span>
        <select
          value={connectionId}
          onChange={(event) => setConnectionId(event.target.value)}
          required
        >
          {connections.data.map((connection) => (
            <option key={connection.id} value={connection.id}>
              {connection.name} — {connection.baseUrl}
            </option>
          ))}
        </select>
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
