import { describe, expect, it } from "vitest"

import { createSessionSchema } from "../apps/web/src/dashboard-session-api"

const connectionId = "33333333-3333-4333-8333-333333333333"

describe("session link form validation", () => {
  it("accepts WAHA session names inside the provider alphabet", () => {
    // Given names using only letters, numbers, hyphens, and underscores
    for (const wahaSessionName of ["personal", "my-session_1", "SELFIM3"]) {
      // When the link form validates
      const parsed = createSessionSchema.safeParse({ connectionId, name: "Test", wahaSessionName })

      // Then the input passes client-side validation
      expect(parsed.success).toBe(true)
    }
  })

  it("rejects WAHA session names the provider would refuse", () => {
    // Given names with spaces, slashes, or empty values that WAHA rejects with 400
    for (const wahaSessionName of ["test session", "a/b", "", " leading"]) {
      // When the link form validates
      const parsed = createSessionSchema.safeParse({ connectionId, name: "Test", wahaSessionName })

      // Then the input fails before any request leaves the browser
      expect(parsed.success).toBe(false)
    }
  })
})
