import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { DisableUserModal, GrantSessionModal } from "../apps/web/src/components/user-access-modals"
import { UsersPage } from "../apps/web/src/components/user-access-page"
import type { AdminUserRecord } from "../apps/web/src/dashboard-admin-api"
import type { SessionView } from "../apps/web/src/dashboard-api"
import type { ResourceState } from "../apps/web/src/dashboard-state"

const IDLE_NOOP = () => Promise.resolve()
const IDLE_VOID = () => {}

const USERS: readonly AdminUserRecord[] = [
  {
    id: "685d2eaf-8649-4ec7-85e9-69a12e7a5722",
    email: "operator@example.test",
    displayName: "Operator",
    active: true,
    createdAt: "2026-09-01T09:00:00.000Z",
    lastLoginAt: null,
    roles: [{ accountScope: "personal", role: "operator" }],
    grants: [
      {
        sessionId: "aaaa1111-1111-4111-8111-111111111111",
        sessionName: "self im3",
        accountScope: "personal",
      },
    ],
  },
  {
    id: "99999999-9999-4999-8999-999999999999",
    email: "former@example.test",
    displayName: "Former",
    active: false,
    createdAt: "2026-09-02T09:00:00.000Z",
    lastLoginAt: "2026-09-06T02:00:00.000Z",
    roles: [],
    grants: [],
  },
]

const SESSIONS: ResourceState<readonly SessionView[]> = {
  kind: "ready",
  data: [
    {
      id: "aaaa1111-1111-4111-8111-111111111111",
      name: "self im3",
      accountScope: "personal",
      status: "working",
      serviceHealth: "healthy",
      sendingReadiness: "ready",
      linkedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
}

const IDLE = { kind: "idle" as const }

function pageProps(users: ResourceState<readonly AdminUserRecord[]>) {
  return {
    role: "admin" as const,
    users,
    sessions: SESSIONS,
    createUserAction: IDLE,
    grantAction: IDLE,
    disableAction: IDLE,
    resetPasswordAction: IDLE,
    onCreateUser: IDLE_NOOP,
    onCreateGrant: IDLE_NOOP,
    onDisableUser: IDLE_NOOP,
    onResetPassword: IDLE_NOOP,
  }
}

describe("users access page", () => {
  it("renders the command table with last login, search, pagination, and row actions", () => {
    // Given two users, one active with a recorded login and one disabled without
    const markup = renderToStaticMarkup(
      createElement(UsersPage, pageProps({ kind: "ready", data: USERS })),
    )

    // When the page renders
    // Then the table exposes lifecycle data, filters, and the kebab action menu
    expect(markup).toContain("operator@example.test")
    expect(markup).toContain("personal · operator")
    expect(markup).toContain("self im3 · personal")
    expect(markup).toContain("no grants")
    expect(markup).toContain(">active<")
    expect(markup).toContain(">disabled<")
    expect(markup).toContain("never")
    expect(markup).toContain('aria-label="Actions for Operator"')
    expect(markup).toContain("row-menu-up")
    expect(markup).toContain("Grant session")
    expect(markup).toContain("Reset password")
    expect(markup).toContain(">Disable<")
    expect(markup).toContain("Create user")
    expect(markup).toContain('placeholder="Email, name, or user ID…"')
    expect(markup).toContain('aria-label="Filter by status"')
    expect(markup).toContain('aria-label="Filter by role"')
    expect(markup).toContain("All statuses")
    expect(markup).toContain("All roles")
    expect(markup).toContain("Total: 2 users · showing 2 on this page")
    expect(markup).toContain('title="685d2eaf-8649-4ec7-85e9-69a12e7a5722"')
    expect(markup).not.toContain("passwordHash")
  })

  it("explains the disable lifecycle in its confirmation modal", () => {
    // Given an admin opening the disable action for an active user
    const markup = renderToStaticMarkup(
      createElement(DisableUserModal, {
        user: USERS[0] as AdminUserRecord,
        action: IDLE,
        onSubmit: IDLE_NOOP,
        onClose: IDLE_VOID,
      }),
    )

    // When the modal renders
    // Then it warns about session revocation before the destructive action
    expect(markup).toContain("Every session for this user will be revoked")
    expect(markup).toContain("Disable user")
    expect(markup).toContain("Cancel")
  })

  it("explains session grants and offers a session dropdown instead of a raw id", () => {
    // Given an admin opening the grant action for a user
    const markup = renderToStaticMarkup(
      createElement(GrantSessionModal, {
        user: USERS[0] as AdminUserRecord,
        sessions: SESSIONS,
        action: IDLE,
        onSubmit: IDLE_NOOP,
        onClose: IDLE_VOID,
      }),
    )

    // When the modal renders
    // Then the session is picked by name and the grant concept is explained
    expect(markup).toContain(
      "A session is one linked WhatsApp account created in the Sessions menu",
    )
    expect(markup).toContain("self im3 · working · aaaa1111…")
    expect(markup).toContain("Grant session access")
  })
})
