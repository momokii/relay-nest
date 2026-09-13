import { describe, expect, it } from "vitest"

import { bootstrapPasswordsMatch } from "../apps/web/src/components/auth-boundary"

describe("admin bootstrap password confirmation", () => {
  it("accepts matching non-empty passwords", () => {
    // Given the same password typed twice during first-admin creation
    // When the confirmation rule runs
    // Then bootstrap may proceed
    expect(bootstrapPasswordsMatch("correct-horse-12", "correct-horse-12")).toBe(true)
  })

  it("rejects mismatched or empty passwords", () => {
    // Given typos or untouched confirmation fields
    // When the confirmation rule runs
    // Then bootstrap stays blocked before any request leaves the browser
    expect(bootstrapPasswordsMatch("correct-horse-12", "correct-horse-13")).toBe(false)
    expect(bootstrapPasswordsMatch("correct-horse-12", "")).toBe(false)
    expect(bootstrapPasswordsMatch("", "")).toBe(false)
  })
})
