import { describe, expect, it } from "vitest"

import { authorizeSessionAction } from "../apps/api/src/auth/authorization"

describe("session authorization", () => {
  it("denies an unauthenticated request", () => {
    // Given no authenticated principal
    // When a scoped read is authorized
    const result = authorizeSessionAction({
      principal: null,
      accountScope: "personal",
      sessionScope: "personal",
      hasGrant: false,
      action: "read",
      sessionActive: true,
    })

    // Then access is denied without revealing session data
    expect(result).toEqual({ allowed: false, reason: "unauthenticated" })
  })

  it("allows an Operator command only with a matching scoped grant", () => {
    // Given an Operator with a Personal role and grant
    // When the Operator performs a command in that Personal session
    const result = authorizeSessionAction({
      principal: { roles: ["operator"] },
      accountScope: "personal",
      sessionScope: "personal",
      hasGrant: true,
      action: "command",
      sessionActive: true,
    })

    // Then the command is allowed
    expect(result).toEqual({ allowed: true })
  })

  it("denies Viewer mutations and cross-scope access", () => {
    // Given a Viewer with a Personal grant
    const viewerMutation = authorizeSessionAction({
      principal: { roles: ["viewer"] },
      accountScope: "personal",
      sessionScope: "personal",
      hasGrant: true,
      action: "command",
      sessionActive: true,
    })
    const crossScopeRead = authorizeSessionAction({
      principal: { roles: ["viewer"] },
      accountScope: "business",
      sessionScope: "personal",
      hasGrant: true,
      action: "read",
      sessionActive: true,
    })

    // Then both attempts are denied
    expect(viewerMutation).toEqual({ allowed: false, reason: "role_denied" })
    expect(crossScopeRead).toEqual({ allowed: false, reason: "scope_denied" })
  })
})
