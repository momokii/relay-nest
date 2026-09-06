import { describe, expect, it } from "vitest"

import { groupUserRows, mergeLastLogins, type UserWithRoleRow } from "../apps/api/src/auth/admin"
import { canListUsers } from "../apps/api/src/auth/http"

const baseUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "operator@example.test",
  displayName: "Operator",
  active: true,
  createdAt: new Date("2026-09-01T09:00:00.000Z"),
}

function row(
  role: UserWithRoleRow["role"],
  overrides: Partial<typeof baseUser> = {},
): UserWithRoleRow {
  return { user: { ...baseUser, ...overrides }, role }
}

describe("groupUserRows", () => {
  it("groups role rows per user and keeps users without roles", () => {
    // Given joined rows where one user holds two roles and another has none
    const rows = [
      row({ accountScope: "personal", role: "admin" }),
      row({ accountScope: "business", role: "operator" }),
      row(null, {
        id: "22222222-2222-4222-8222-222222222222",
        email: "viewer@example.test",
        displayName: "Viewer",
        active: false,
      }),
    ]

    // When the rows are grouped into user records
    const users = groupUserRows(rows)

    // Then each user appears once with all its roles, and never carries credentials
    expect(users).toHaveLength(2)
    expect(users[0]).toMatchObject({
      id: baseUser.id,
      email: baseUser.email,
      active: true,
      roles: [
        { accountScope: "personal", role: "admin" },
        { accountScope: "business", role: "operator" },
      ],
    })
    expect(users[1]).toMatchObject({ id: "22222222-2222-4222-8222-222222222222", active: false })
    expect(users[1]?.roles).toEqual([])
    expect(JSON.stringify(users)).not.toContain("passwordHash")
  })
})

describe("mergeLastLogins", () => {
  it("attaches each user's last login and defaults unknown users to never", () => {
    // Given two users where only one has a recorded login
    const users = groupUserRows([
      row({ accountScope: "personal", role: "operator" }),
      row(null, {
        id: "22222222-2222-4222-8222-222222222222",
        email: "fresh@example.test",
        displayName: "Fresh",
      }),
    ])
    const lastLogins = new Map([[baseUser.id, new Date("2026-09-06T02:00:00.000Z")]])

    // When the login audit map is merged
    const merged = mergeLastLogins(users, lastLogins)

    // Then the known login is attached and the other user is null
    expect(merged[0]?.lastLoginAt).toEqual(new Date("2026-09-06T02:00:00.000Z"))
    expect(merged[1]?.lastLoginAt).toBeNull()
  })
})

describe("canListUsers", () => {
  it("allows only a caller holding an admin role in some scope", () => {
    // Given principals with admin, non-admin, and empty role sets
    const admin = { personal: ["admin"] as const, business: [] as const }
    const operator = { personal: ["operator"] as const, business: [] as const }
    const empty = { personal: [] as const, business: [] as const }

    // When the list gate is evaluated
    // Then only the admin may list users
    expect(canListUsers(admin)).toBe(true)
    expect(canListUsers(operator)).toBe(false)
    expect(canListUsers(empty)).toBe(false)
  })
})
