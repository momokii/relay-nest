import type * as React from "react"
import { type FormEvent, useState } from "react"

import type { AdminCreateUserInput, AdminGrantInput, AdminUser } from "../dashboard-admin-api"
import { ACCOUNT_SCOPES, type AccountScope, type DashboardRole, ROLES } from "../dashboard-model"
import type { ActionState } from "../dashboard-state"
import { Panel, StateNotice, StatusBadge } from "./ui"

type AdminActionState = ActionState<AdminUser | null>

function AdminActionFeedback({
  action,
}: Readonly<{ action: AdminActionState }>): React.JSX.Element | null {
  switch (action.kind) {
    case "idle":
    case "submitting":
      return null
    case "ready":
      return (
        <StateNotice
          title="Admin action accepted"
          message="The server accepted the command."
          live="polite"
        />
      )
    case "unavailable":
      return (
        <StateNotice title="Unavailable" message={action.message} tone="warning" live="polite" />
      )
    case "denied":
      return (
        <StateNotice title="Server denied" message={action.message} tone="error" live="polite" />
      )
    case "error":
      return (
        <StateNotice
          title="Could not complete"
          message={action.message}
          tone="error"
          live="polite"
        />
      )
    default:
      return null
  }
}

export function UsersPage({
  role,
  createUserAction,
  grantAction,
  disableAction,
  onCreateUser,
  onCreateGrant,
  onDisableUser,
}: Readonly<{
  role: DashboardRole
  createUserAction: ActionState<AdminUser>
  grantAction: ActionState<null>
  disableAction: ActionState<null>
  onCreateUser: (input: AdminCreateUserInput) => Promise<void>
  onCreateGrant: (input: AdminGrantInput) => Promise<void>
  onDisableUser: (userId: string) => Promise<void>
}>): React.JSX.Element {
  if (role !== "admin")
    return (
      <Panel eyebrow="Restricted surface" title="Users and grants">
        <StateNotice
          title="Role denied"
          message="User creation and session grants are available only to an Admin in the selected scope."
          tone="warning"
        />
      </Panel>
    )

  return (
    <div className="page-grid">
      <Panel
        eyebrow="Admin controls"
        title="Create a user"
        description="User creation is server-authoritative; passwords are sent only through the authenticated command route."
      >
        <CreateUserForm action={createUserAction} onSubmit={onCreateUser} />
      </Panel>
      <Panel
        eyebrow="Explicit access grant"
        title="Grant a session"
        description="A user role does not grant session access. Grant one authorized session in one account scope."
      >
        <GrantForm action={grantAction} onSubmit={onCreateGrant} />
      </Panel>
      <Panel eyebrow="Access lifecycle" title="Disable a user" tone="inset">
        <DisableForm action={disableAction} onSubmit={onDisableUser} />
      </Panel>
      <Panel eyebrow="Access records" title="Listing and revocation unavailable" tone="inset">
        <StateNotice
          title="No safe list or revoke route"
          message="The backend exposes create, grant, and disable commands but no authenticated list or grant-revocation route. This UI does not invent access records."
          tone="warning"
        />
        <StatusBadge label="No credentials or grants displayed" />
      </Panel>
    </div>
  )
}

function CreateUserForm({
  action,
  onSubmit,
}: Readonly<{
  action: ActionState<AdminUser>
  onSubmit: (input: AdminCreateUserInput) => Promise<void>
}>): React.JSX.Element {
  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [password, setPassword] = useState("")
  const [scope, setScope] = useState<AccountScope>("personal")
  const [role, setRole] = useState<DashboardRole>("operator")
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void onSubmit({ email, displayName, password, roles: [{ accountScope: scope, role }] })
  }
  const updateScope = (value: string): void => {
    const nextScope = ACCOUNT_SCOPES.find((candidate) => candidate === value)
    if (nextScope) setScope(nextScope)
  }
  const updateRole = (value: string): void => {
    const nextRole = ROLES.find((candidate) => candidate === value)
    if (nextRole) setRole(nextRole)
  }
  return (
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
      </label>
      <div className="form-grid">
        <label>
          <span>Role scope</span>
          <select value={scope} onChange={(event) => updateScope(event.target.value)}>
            <option value="personal">Personal</option>
            <option value="business">Business</option>
          </select>
        </label>
        <label>
          <span>Role</span>
          <select value={role} onChange={(event) => updateRole(event.target.value)}>
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
      <AdminActionFeedback action={action} />
    </form>
  )
}

function GrantForm({
  action,
  onSubmit,
}: Readonly<{
  action: ActionState<null>
  onSubmit: (input: AdminGrantInput) => Promise<void>
}>): React.JSX.Element {
  const [userId, setUserId] = useState("")
  const [sessionId, setSessionId] = useState("")
  const [scope, setScope] = useState<AccountScope>("personal")
  const updateScope = (value: string): void => {
    const nextScope = ACCOUNT_SCOPES.find((candidate) => candidate === value)
    if (nextScope) setScope(nextScope)
  }
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void onSubmit({ userId, sessionId, accountScope: scope })
  }
  return (
    <form className="operational-form" onSubmit={submit}>
      <label>
        <span>User ID</span>
        <input value={userId} onChange={(event) => setUserId(event.target.value)} required />
      </label>
      <label>
        <span>Session ID</span>
        <input value={sessionId} onChange={(event) => setSessionId(event.target.value)} required />
      </label>
      <label>
        <span>Account scope</span>
        <select value={scope} onChange={(event) => updateScope(event.target.value)}>
          <option value="personal">Personal</option>
          <option value="business">Business</option>
        </select>
      </label>
      <button
        className="button button-secondary"
        type="submit"
        disabled={action.kind === "submitting"}
        aria-busy={action.kind === "submitting" ? "true" : "false"}
      >
        {action.kind === "submitting" ? "Granting…" : "Grant session access"}
      </button>
      <AdminActionFeedback action={action} />
    </form>
  )
}

function DisableForm({
  action,
  onSubmit,
}: Readonly<{
  action: ActionState<null>
  onSubmit: (userId: string) => Promise<void>
}>): React.JSX.Element {
  const [userId, setUserId] = useState("")
  return (
    <form
      className="operational-form"
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit(userId)
      }}
    >
      <label>
        <span>User ID</span>
        <input value={userId} onChange={(event) => setUserId(event.target.value)} required />
      </label>
      <button
        className="button button-secondary"
        type="submit"
        disabled={action.kind === "submitting"}
        aria-busy={action.kind === "submitting" ? "true" : "false"}
      >
        {action.kind === "submitting" ? "Disabling…" : "Disable user"}
      </button>
      <AdminActionFeedback action={action} />
    </form>
  )
}
