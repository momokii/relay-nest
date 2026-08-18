import { describe, expect, it } from "vitest"

import { authorizeSessionAction } from "../apps/api/src/auth/authorization"

describe("Todo 13 baseline read authorization", () => {
  it("keeps a granted Viewer read-only within the matching account scope", () => {
    // Given the existing authorization seam receives a granted Viewer and matching scope
    const result = authorizeSessionAction({
      principal: { roles: ["viewer"] },
      accountScope: "personal",
      sessionScope: "personal",
      hasGrant: true,
      action: "read",
      sessionActive: true,
    })

    // Then the established read surface remains available without command privileges
    expect(result).toEqual({ allowed: true })
  })

  it("denies a Viewer without a session grant without exposing session data", () => {
    // Given the existing authorization seam receives a Viewer without a grant
    const result = authorizeSessionAction({
      principal: { roles: ["viewer"] },
      accountScope: "personal",
      sessionScope: "personal",
      hasGrant: false,
      action: "read",
      sessionActive: true,
    })

    // Then access fails closed at the same seam analytics must reuse
    expect(result).toEqual({ allowed: false, reason: "grant_denied" })
  })
})
