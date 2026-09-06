import type * as React from "react"
import { type FormEvent, useEffect, useState } from "react"
import { createPortal } from "react-dom"

import type {
  AdminCreateUserInput,
  AdminGrantInput,
  AdminUser,
  AdminUserRecord,
} from "../dashboard-admin-api"
import type { SessionView } from "../dashboard-api"
import { ACCOUNT_SCOPES, type AccountScope, type DashboardRole, ROLES } from "../dashboard-model"
import type { ActionState, ResourceState } from "../dashboard-state"
import { StateNotice } from "./ui"

export type UsersModal =
  | { readonly kind: "create" }
  | { readonly kind: "grant"; readonly user: AdminUserRecord }
  | { readonly kind: "reset"; readonly user: AdminUserRecord }
  | { readonly kind: "disable"; readonly user: AdminUserRecord }

type ModalShellProps = Readonly<{
  title: string
  onClose: () => void
  children: React.ReactNode
}>

function ModalShell({ title, onClose, children }: ModalShellProps): React.JSX.Element {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])
  const overlay = (
    <div className="chat-history-backdrop">
      <div
        className="chat-history-panel user-access-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="chat-history-header">
          <strong>{title}</strong>
          <button className="button button-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  )
  if (typeof document === "undefined") return overlay
  return createPortal(overlay, document.body)
}

export function CreateUserModal({
  action,
  onSubmit,
  onClose,
}: Readonly<{
  action: ActionState<AdminUser>
  onSubmit: (input: AdminCreateUserInput) => Promise<void>
  onClose: () => void
}>): React.JSX.Element {
  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [password, setPassword] = useState("")
  const [scope, setScope] = useState<AccountScope>("personal")
  const [role, setRole] = useState<DashboardRole>("operator")
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void onSubmit({ email, displayName, password, roles: [{ accountScope: scope, role }] }).then(
      onClose,
    )
  }
  return (
    <ModalShell title="Create a user" onClose={onClose}>
      <form className="operational-form" onSubmit={submit}>
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
          <span>Display name</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        </label>
        <label>
          <span>Temporary password</span>
          <input
            type="password"
            minLength={12}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <small>Share it securely through a private channel.</small>
        </label>
        <div className="form-grid">
          <label>
            <span>Role scope</span>
            <select value={scope} onChange={(event) => updateScope(event.target.value, setScope)}>
              <option value="personal">Personal</option>
              <option value="business">Business</option>
            </select>
          </label>
          <label>
            <span>Role</span>
            <select value={role} onChange={(event) => updateRole(event.target.value, setRole)}>
              <option value="operator">Operator</option>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>
        <button
          className="button button-primary"
          type="submit"
          disabled={action.kind === "submitting"}
          aria-busy={action.kind === "submitting" ? "true" : "false"}
        >
          {action.kind === "submitting" ? "Creating…" : "Create user"}
        </button>
        <AdminModalFeedback action={action} />
      </form>
    </ModalShell>
  )
}

export function GrantSessionModal({
  user,
  sessions,
  action,
  onSubmit,
  onClose,
}: Readonly<{
  user: AdminUserRecord
  sessions: ResourceState<readonly SessionView[]>
  action: ActionState<null>
  onSubmit: (input: AdminGrantInput) => Promise<void>
  onClose: () => void
}>): React.JSX.Element {
  const [sessionId, setSessionId] = useState("")
  const [scope, setScope] = useState<AccountScope>("personal")
  const available = sessions.kind === "ready" ? sessions.data : []
  const scoped = available.filter((session) => session.accountScope === scope)
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void onSubmit({ userId: user.id, sessionId, accountScope: scope }).then(onClose)
  }
  return (
    <ModalShell title={`Grant a session · ${user.displayName}`} onClose={onClose}>
      <p className="panel-description">
        A session is one linked WhatsApp account created in the Sessions menu. Granting gives this
        user permission to operate that session inside one account scope. A role alone never grants
        session access.
      </p>
      <form className="operational-form" onSubmit={submit}>
        <label>
          <span>Account scope</span>
          <select value={scope} onChange={(event) => updateScope(event.target.value, setScope)}>
            <option value="personal">Personal</option>
            <option value="business">Business</option>
          </select>
        </label>
        <label>
          <span>Session</span>
          <select
            aria-label="Session"
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
            required
          >
            <option value="" disabled>
              {scoped.length === 0 ? "No sessions in this scope" : "Pick a session…"}
            </option>
            {scoped.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name} · {session.status} · {session.id.slice(0, 8)}…
              </option>
            ))}
          </select>
          <small>
            {available.length === 0
              ? "No sessions are linked yet — create one in the Sessions menu first."
              : "Session names come from the Sessions menu; the short ID is shown for reference."}
          </small>
        </label>
        <button
          className="button button-secondary"
          type="submit"
          disabled={action.kind === "submitting" || scoped.length === 0}
          aria-busy={action.kind === "submitting" ? "true" : "false"}
        >
          {action.kind === "submitting" ? "Granting…" : "Grant session access"}
        </button>
        <AdminModalFeedback action={action} />
      </form>
    </ModalShell>
  )
}

export function ResetPasswordModal({
  user,
  action,
  onSubmit,
  onClose,
}: Readonly<{
  user: AdminUserRecord
  action: ActionState<null>
  onSubmit: (userId: string, password: string) => Promise<void>
  onClose: () => void
}>): React.JSX.Element {
  const [password, setPassword] = useState("")
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void onSubmit(user.id, password).then(onClose)
  }
  return (
    <ModalShell title={`Reset password · ${user.displayName}`} onClose={onClose}>
      <StateNotice
        title="All sessions will be revoked"
        message="The user is signed out everywhere and must sign in again with the new password."
        tone="warning"
      />
      <form className="operational-form" onSubmit={submit}>
        <label>
          <span>New temporary password</span>
          <input
            type="password"
            minLength={12}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <small>Share it securely through a private channel.</small>
        </label>
        <button
          className="button button-secondary"
          type="submit"
          disabled={action.kind === "submitting"}
          aria-busy={action.kind === "submitting" ? "true" : "false"}
        >
          {action.kind === "submitting" ? "Resetting…" : "Reset password"}
        </button>
        <AdminModalFeedback action={action} />
      </form>
    </ModalShell>
  )
}

export function DisableUserModal({
  user,
  action,
  onSubmit,
  onClose,
}: Readonly<{
  user: AdminUserRecord
  action: ActionState<null>
  onSubmit: (userId: string) => Promise<void>
  onClose: () => void
}>): React.JSX.Element {
  return (
    <ModalShell title={`Disable ${user.displayName}?`} onClose={onClose}>
      <StateNotice
        title="Every session for this user will be revoked"
        message={`${user.email} can no longer sign in. Their history records stay in place. This cannot be undone from this menu.`}
        tone="warning"
      />
      <div className="form-actions">
        <button
          className="button button-danger"
          type="button"
          disabled={action.kind === "submitting"}
          aria-busy={action.kind === "submitting" ? "true" : "false"}
          onClick={() => void onSubmit(user.id).then(onClose)}
        >
          {action.kind === "submitting" ? "Disabling…" : "Disable user"}
        </button>
        <button className="button button-secondary" type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </ModalShell>
  )
}

function AdminModalFeedback({
  action,
}: Readonly<{ action: ActionState<unknown> }>): React.JSX.Element | null {
  if (action.kind === "unavailable" || action.kind === "denied" || action.kind === "error") {
    return (
      <StateNotice title="Could not complete" message={action.message} tone="error" live="polite" />
    )
  }
  return null
}

function updateScope(value: string, setScope: (scope: AccountScope) => void): void {
  const nextScope = ACCOUNT_SCOPES.find((candidate) => candidate === value)
  if (nextScope) setScope(nextScope)
}

function updateRole(value: string, setRole: (role: DashboardRole) => void): void {
  const nextRole = ROLES.find((candidate) => candidate === value)
  if (nextRole) setRole(nextRole)
}
