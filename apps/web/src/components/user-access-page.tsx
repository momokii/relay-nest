import type * as React from "react"
import { useEffect, useRef, useState } from "react"
import { MoreVertical } from "lucide-react"
import type {
  AdminCreateUserInput,
  AdminGrantInput,
  AdminUser,
  AdminUserRecord,
} from "../dashboard-admin-api"
import type { SessionView } from "../dashboard-api"
import { type DashboardRole, ROLES } from "../dashboard-model"
import type { ActionState, ResourceState } from "../dashboard-state"
import { Panel, StateNotice, StatusBadge } from "./ui"
import {
  CreateUserModal,
  DisableUserModal,
  GrantSessionModal,
  ResetPasswordModal,
  type UsersModal,
} from "./user-access-modals"

const PAGE_SIZES = [10, 20, 50] as const

type StatusFilter = "" | "active" | "disabled"

function truncatedId(value: string): string {
  return value.length > 24 ? `${value.slice(0, 21)}…` : value
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString()
}

function RowActions({
  user,
  busy,
  onAction,
}: Readonly<{
  user: AdminUserRecord
  busy: boolean
  onAction: (modal: UsersModal) => void
}>): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node))
        setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])
  const choose = (next: UsersModal): void => {
    setOpen(false)
    onAction(next)
  }
  return (
    <div className="row-menu" ref={containerRef}>
      <button
        type="button"
        className="button button-secondary"
        aria-label={`Actions for ${user.displayName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreVertical size={16} aria-hidden="true" focusable="false" />
      </button>
      <div className="row-menu-list" role="menu" hidden={!open}>
        <button
          type="button"
          role="menuitem"
          className="button button-secondary row-menu-item"
          onClick={() => choose({ kind: "grant", user })}
        >
          Grant session
        </button>
        <button
          type="button"
          role="menuitem"
          className="button button-secondary row-menu-item"
          onClick={() => choose({ kind: "reset", user })}
        >
          Reset password
        </button>
        {user.active ? (
          <button
            type="button"
            role="menuitem"
            className="button button-danger row-menu-item"
            onClick={() => choose({ kind: "disable", user })}
          >
            Disable
          </button>
        ) : null}
      </div>
    </div>
  )
}

function UsersTable({
  users,
  busy,
  onAction,
}: Readonly<{
  users: readonly AdminUserRecord[]
  busy: boolean
  onAction: (modal: UsersModal) => void
}>): React.JSX.Element {
  return (
    <div className="sent-history-table-wrap">
      <table className="sent-history-table users-table" aria-label="Users">
        <thead>
          <tr>
            <th scope="col">Email</th>
            <th scope="col">Display name</th>
            <th scope="col">Status</th>
            <th scope="col">Roles</th>
            <th scope="col">User ID</th>
            <th scope="col">Created</th>
            <th scope="col">Last login</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.email}</td>
              <td>{user.displayName}</td>
              <td>
                <StatusBadge
                  label={user.active ? "active" : "disabled"}
                  tone={user.active ? "success" : "warning"}
                  info={
                    user.active
                      ? "The user can sign in."
                      : "The user is disabled and all their sessions were revoked."
                  }
                />
              </td>
              <td>
                <span className="status-list">
                  {user.roles.length === 0 ? (
                    <small>no roles</small>
                  ) : (
                    user.roles.map((role) => (
                      <StatusBadge
                        key={`${role.accountScope}-${role.role}`}
                        label={`${role.accountScope} · ${role.role}`}
                      />
                    ))
                  )}
                </span>
              </td>
              <td>
                <code title={user.id}>{truncatedId(user.id)}</code>
              </td>
              <td>{formatTimestamp(user.createdAt)}</td>
              <td>{user.lastLoginAt ? formatTimestamp(user.lastLoginAt) : <small>never</small>}</td>
              <td>
                <RowActions user={user} busy={busy} onAction={onAction} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function UsersPage({
  role,
  users,
  sessions,
  createUserAction,
  grantAction,
  disableAction,
  resetPasswordAction,
  onCreateUser,
  onCreateGrant,
  onDisableUser,
  onResetPassword,
}: Readonly<{
  role: DashboardRole
  users: ResourceState<readonly AdminUserRecord[]>
  sessions: ResourceState<readonly SessionView[]>
  createUserAction: ActionState<AdminUser>
  grantAction: ActionState<null>
  disableAction: ActionState<null>
  resetPasswordAction: ActionState<null>
  onCreateUser: (input: AdminCreateUserInput) => Promise<void>
  onCreateGrant: (input: AdminGrantInput) => Promise<void>
  onDisableUser: (userId: string) => Promise<void>
  onResetPassword: (userId: string, password: string) => Promise<void>
}>): React.JSX.Element {
  const [modal, setModal] = useState<UsersModal | null>(null)
  const [q, setQ] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(10)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("")
  const [roleFilter, setRoleFilter] = useState<DashboardRole | "">("")
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

  const allUsers = users.kind === "ready" ? users.data : []
  const needle = q.trim().toLowerCase()
  const filtered = allUsers.filter((user) => {
    if (needle && !(
      user.email.toLowerCase().includes(needle) ||
      user.displayName.toLowerCase().includes(needle) ||
      user.id.toLowerCase().includes(needle)
    ))
      return false
    if (statusFilter === "active" && !user.active) return false
    if (statusFilter === "disabled" && user.active) return false
    if (roleFilter && !user.roles.some((role) => role.role === roleFilter)) return false
    return true
  })
  const filtersActive = q.trim() !== "" || statusFilter !== "" || roleFilter !== ""
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  const busy =
    createUserAction.kind === "submitting" ||
    grantAction.kind === "submitting" ||
    disableAction.kind === "submitting" ||
    resetPasswordAction.kind === "submitting"

  return (
    <div className="page-grid users-page">
      <Panel
        eyebrow="Access records"
        title="Users"
        description="Every user with roles per scope, last login, and their lifecycle actions. Granting gives a user permission to operate one linked WhatsApp session; no credentials are shown. Grant revocation is not available yet."
      >
        <div className="schedule-filters">
          <label className="schedule-filter-field schedule-filter-search">
            <span>Search</span>
            <input
              aria-label="Search users"
              placeholder="Email, name, or user ID…"
              value={q}
              onChange={(event) => {
                setQ(event.target.value)
                setPage(1)
              }}
            />
          </label>
          <label className="schedule-filter-field schedule-filter-size">
            <span>Rows</span>
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value))
                setPage(1)
              }}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <label className="schedule-filter-field">
            <span>Status</span>
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as StatusFilter)
                setPage(1)
              }}
            >
              <option value="">All statuses</option>
              <option value="active">active</option>
              <option value="disabled">disabled</option>
            </select>
          </label>
          <label className="schedule-filter-field">
            <span>Role</span>
            <select
              aria-label="Filter by role"
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value as DashboardRole | "")
                setPage(1)
              }}
            >
              <option value="">All roles</option>
              {ROLES.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {candidate}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setModal({ kind: "create" })}
          >
            Create user
          </button>
        </div>
        {users.kind === "loading" ? <p className="panel-description">Loading users…</p> : null}
        {users.kind === "unavailable" || users.kind === "denied" || users.kind === "error" ? (
          <StateNotice title="Users unavailable" message={users.message} tone="warning" />
        ) : null}
        {users.kind === "ready" && filtered.length === 0 ? (
          <StateNotice
            title={q ? "No matching users" : "No users yet"}
            message={
              q
                ? "No user matches the current search."
                : "Create the first user with the button above."
            }
          />
        ) : null}
        {users.kind === "ready" && filtered.length > 0 ? (
          <>
            <UsersTable
              users={paged}
              busy={busy}
              onAction={(next) => setModal(next)}
            />
            <nav className="sent-history-pagination" aria-label="Users pagination">
              <span>
                Total: {allUsers.length} {allUsers.length === 1 ? "user" : "users"}
                {filtersActive
                  ? ` · ${filtered.length} ${filtered.length === 1 ? "match" : "matches"}`
                  : ""}{" "}
                · showing {paged.length} on this page
              </span>
              <div className="form-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setPage(Math.max(1, safePage - 1))}
                  disabled={safePage === 1}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setPage(Math.min(pageCount, safePage + 1))}
                  disabled={safePage === pageCount}
                >
                  Next
                </button>
              </div>
            </nav>
          </>
        ) : null}
      </Panel>
      {modal?.kind === "create" ? (
        <CreateUserModal
          action={createUserAction}
          onSubmit={onCreateUser}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal?.kind === "grant" ? (
        <GrantSessionModal
          user={modal.user}
          sessions={sessions}
          action={grantAction}
          onSubmit={onCreateGrant}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal?.kind === "reset" ? (
        <ResetPasswordModal
          user={modal.user}
          action={resetPasswordAction}
          onSubmit={onResetPassword}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal?.kind === "disable" ? (
        <DisableUserModal
          user={modal.user}
          action={disableAction}
          onSubmit={onDisableUser}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  )
}
