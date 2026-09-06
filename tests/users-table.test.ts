import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { UsersPage } from "../apps/web/src/components/user-access-page"
import type { AdminUserRecord } from "../apps/web/src/dashboard-admin-api"
import type { ResourceState } from "../apps/web/src/dashboard-state"

const IDLE_NOOP = () => Promise.resolve()

const USERS: readonly AdminUserRecord[] = [
  {
    id: "685d2eaf-8649-4ec7-85e9-69a12e7a5722",
    email: "operator@example.test",
    displayName: "Operator",
    active: true,
    createdAt: "2026-09-01T09:00:00.000Z",
    roles: [{ accountScope: "personal", role: "operator" }],
  },
  {
    id: "99999999-9999-4999-8999-999999999999",
    email: "former@example.test",
    displayName: "Former",
    active: false,
    createdAt: "2026-09-02T09:00:00.000Z",
    roles: [],
  },
]

function pageProps(users: ResourceState<readonly AdminUserRecord[]>) {
  return {
    role: "admin" as const,
    users,
    createUserAction: { kind: "idle" as const },
    grantAction: { kind: "idle" as const },
    disableAction: { kind: "idle" as const },
    onCreateUser: IDLE_NOOP,
    onCreateGrant: IDLE_NOOP,
    onDisableUser: IDLE_NOOP,
  }
}

describe("users access page", () => {
  it("lists users with status, roles, and hoverable ids like the history tables", () => {
    // Given two users, one active and one disabled
    const markup = renderToStaticMarkup(
      createElement(UsersPage, pageProps({ kind: "ready", data: USERS })),
    )

    // When the page renders
    // Then the table shows the records without any credential material
    expect(markup).toContain("users-page")
    expect(markup).toContain("users-table")
    expect(markup).toContain("operator@example.test")
    expect(markup).toContain("personal · operator")
    expect(markup).toContain(">active<")
    expect(markup).toContain(">disabled<")
    expect(markup).toContain('title="685d2eaf-8649-4ec7-85e9-69a12e7a5722"')
    expect(markup).toContain("685d2eaf-8649-4ec7-85…")
    expect(markup).not.toContain("passwordHash")
  })

  it("explains the disable lifecycle and where the user id comes from", () => {
    // Given an admin viewing the access lifecycle card
    const markup = renderToStaticMarkup(
      createElement(UsersPage, pageProps({ kind: "ready", data: USERS })),
    )

    // When the card renders
    // Then the disable action explains session revocation and the id source
    expect(markup).toContain("revokes every session")
    expect(markup).toContain("Users table below")
  })

  it("shows a friendly empty state when no users exist yet", () => {
    // Given a ready but empty users list
    const markup = renderToStaticMarkup(
      createElement(UsersPage, pageProps({ kind: "ready", data: [] })),
    )

    // When the page renders
    // Then the empty state guides the admin to create a user
    expect(markup).toContain("No users yet")
  })
})
