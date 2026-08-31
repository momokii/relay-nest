import type * as React from "react"
import { useMemo, useState } from "react"

import type { ApiResult, Principal } from "../dashboard-api"
import {
  type AuthBootstrapInput,
  type AuthCredentials,
  type AuthPrincipal,
  authFailureMessage,
  createDashboardAuthApi,
} from "../dashboard-auth-api"
import type { ResourceState } from "../dashboard-state"
import { type ActionState, actionFromResult } from "../dashboard-state"

export function AuthBoundary({
  state,
}: Readonly<{ state: ResourceState<Principal> }>): React.JSX.Element {
  const api = useMemo(() => createDashboardAuthApi(import.meta.env.VITE_API_BASE_URL), [])
  const [mode, setMode] = useState<"login" | "bootstrap">("login")
  const [action, setAction] = useState<ActionState<AuthPrincipal>>({ kind: "idle" })
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const message =
    state.kind === "denied" || state.kind === "error"
      ? state.message
      : "Authentication is required to view this command center."
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setAction({ kind: "submitting" })
    const finish = (result: ApiResult<AuthPrincipal>): void => {
      const failureMessage = authFailureMessage(mode, result)
      const next = actionFromResult(result)
      if (next.kind === "ready") {
        setAction(next)
        window.location.reload()
        return
      }
      setAction(
        failureMessage !== null &&
          (next.kind === "error" || next.kind === "denied" || next.kind === "unavailable")
          ? { ...next, message: failureMessage }
          : next,
      )
    }
    if (mode === "bootstrap") {
      const input: AuthBootstrapInput = { email, password, displayName }
      void api.bootstrap(input).then(finish)
    } else {
      const input: AuthCredentials = { email, password }
      void api.login(input).then(finish)
    }
  }
  return (
    <main className="auth-boundary">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            RN
          </span>
          <span>RelayNest · WAHA command center</span>
        </div>
        <h1>{mode === "bootstrap" ? "Create the first Admin" : "Sign in to RelayNest"}</h1>
        <p>{message}</p>
        <form className="operational-form auth-form" onSubmit={submit}>
          {mode === "bootstrap" ? (
            <label>
              <span>Display name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
            </label>
          ) : null}
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button
            className="button button-primary"
            type="submit"
            disabled={action.kind === "submitting"}
          >
            {action.kind === "submitting"
              ? "Checking…"
              : mode === "bootstrap"
                ? "Create Admin"
                : "Sign in"}
          </button>
          {action.kind === "denied" || action.kind === "error" || action.kind === "unavailable" ? (
            <p role="alert">{action.message}</p>
          ) : null}
        </form>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => setMode(mode === "login" ? "bootstrap" : "login")}
        >
          {mode === "login" ? "First run? Create Admin" : "Already configured? Sign in"}
        </button>
      </div>
    </main>
  )
}
