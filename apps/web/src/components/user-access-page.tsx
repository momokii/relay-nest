import { MoreVertical } from "lucide-react"
import type * as React from "react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
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
  EnableUserModal,
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

const MENU_WIDTH_PX = 176
const MENU_ITEM_HEIGHT_PX = 40

function RowActions({
  user,
  busy,
  isLast,
  onAction,
}: Readonly<{
  user: AdminUserRecord
  busy: boolean
  isLast: boolean
  onAction: (modal: UsersModal) => void
}>): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(false)
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      close()
    }
    window.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    document.addEventListener("pointerdown", onPointerDown)
    return () => {
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
      document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [open])

  const toggle = (): void => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const needed = user.active ? 3 * MENU_ITEM_HEIGHT_PX + 47 : 2 * MENU_ITEM_HEIGHT_PX + 32
    const shouldOpenUp = isLast || (window.innerHeight - rect.bottom < needed && rect.top > needed)
    const left = Math.min(
      Math.max(8, rect.right - MENU_WIDTH_PX),
      Math.max(8, window.innerWidth - MENU_WIDTH_PX - 8),
    )
    const top = shouldOpenUp ? Math.max(8, rect.top - needed - 4) : rect.bottom + 4
    setPosition({ top, left })
    setOpen(true)
  }

  const choose = (next: UsersModal): void => {
    setOpen(false)
    onAction(next)
  }

  const items = (
    <>
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
      ) : (
        <button
          type="button"
          role="menuitem"
          className="button button-primary row-menu-item"
          onClick={() => choose({ kind: "enable", user })}
        >
          Enable
        </button>
      )}
    </>
  )

  const trigger = (
    <button
      ref={buttonRef}
      type="button"
      className="button button-secondary"
      aria-label={`Actions for ${user.displayName}`}
      aria-haspopup="menu"
      aria-expanded={open}
      disabled={busy}
      onClick={toggle}
    >
      <MoreVertical size={16} aria-hidden="true" focusable="false" />
    </button>
  )

  // Server render cannot portal; the static menu stays hidden and is only used
  // by markup-level tests.
  if (typeof document === "undefined") {
    return (
      <div className="row-menu">
        {trigger}
        <div className="row-menu-list" role="menu" hidden>
          {items}
        </div>
      </div>
    )
  }
  return (
    <div className="row-menu">
      {trigger}
      {open && position
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="row-menu-list"
              style={{ top: position.top, left: position.left }}
            >
              {items}
            </div>,
            document.body,
          )
        : null}
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
            <th scope="col">Granted sessions</th>
            <th scope="col">User ID</th>
            <th scope="col">Created</th>
            <th scope="col">Last login</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, index) => (
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
                <span className="status-list">
                  {user.grants.length === 0 ? (
                    <small>no grants</small>
                  ) : (
                    user.grants.map((grant) => (
                      <StatusBadge
                        key={`${grant.sessionId}-${grant.accountScope}`}
                        label={`${grant.sessionName} · ${grant.accountScope}`}
                        info="Sessions this user is allowed to operate, granted by an Admin."
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
                <RowActions
                  user={user}
                  busy={busy}
                  isLast={index === users.length - 1}
                  onAction={onAction}
                />
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
  enableAction,
  resetPasswordAction,
  onCreateUser,
  onCreateGrant,
  onDisableUser,
  onEnableUser,
  onResetPassword,
}: Readonly<{
  role: DashboardRole
  users: ResourceState<readonly AdminUserRecord[]>
  sessions: ResourceState<readonly SessionView[]>
  createUserAction: ActionState<AdminUser>
  grantAction: ActionState<null>
  disableAction: ActionState<null>
  enableAction: ActionState<null>
  resetPasswordAction: ActionState<null>
  onCreateUser: (input: AdminCreateUserInput) => Promise<void>
  onCreateGrant: (input: AdminGrantInput) => Promise<void>
  onDisableUser: (userId: string) => Promise<void>
  onEnableUser: (userId: string) => Promise<void>
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
    if (
      needle &&
      !(
        user.email.toLowerCase().includes(needle) ||
        user.displayName.toLowerCase().includes(needle) ||
        user.id.toLowerCase().includes(needle)
      )
    )
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
    enableAction.kind === "submitting" ||
    resetPasswordAction.kind === "submitting"

  return (
    <div className="page-grid users-page">
      <Panel
        eyebrow="Access records"
        title="Users"
        description="Admin-created users and explicit session grants define access. Every row shows status, roles per scope, granted sessions, and last login. A user with no roles and no grants can sign in but sees no sessions and cannot send, schedule, or open Admin controls until an Admin grants a role and a session. Granting gives permission to operate one linked WAHA session (no secrets shown; revocation not available yet). Disabling revokes all sessions and blocks sign-ins — re-enable from the same menu to restore access (previous grants stay revoked)."
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
            <UsersTable users={paged} busy={busy} onAction={(next) => setModal(next)} />
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
      {modal?.kind === "enable" ? (
        <EnableUserModal
          user={modal.user}
          action={enableAction}
          onSubmit={onEnableUser}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  )
}
