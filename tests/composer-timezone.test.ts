import { describe, expect, it } from "vitest"

import { resolvePreferredTimezone } from "../apps/web/src/components/view-support"

describe("composer timezone preference", () => {
  it("prefers the saved timezone, then the browser timezone, then UTC", () => {
    // Given combinations of a saved preference and the browser timezone
    // When the composer default is resolved
    // Then the saved choice wins, the browser zone is next, and UTC is the floor
    expect(resolvePreferredTimezone("Asia/Jakarta", "Europe/London")).toBe("Asia/Jakarta")
    expect(resolvePreferredTimezone(null, "Asia/Jakarta")).toBe("Asia/Jakarta")
    expect(resolvePreferredTimezone(null, null)).toBe("UTC")
    expect(resolvePreferredTimezone(null, undefined)).toBe("UTC")
  })
})
