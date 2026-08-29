import { describe, expect, it, vi } from "vitest"

import { randomUuid } from "../apps/web/src/random-uuid"

describe("randomUuid", () => {
  it("returns a version-4 UUID shape", () => {
    // Given the platform crypto available in the browser
    // When a key is generated
    const value = randomUuid()

    // Then it matches the canonical UUID v4 shape
    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it("generates distinct keys across calls", () => {
    // Given two consecutive generations
    const first = randomUuid()
    const second = randomUuid()

    // Then the keys differ
    expect(first).not.toBe(second)
  })

  it("falls back when crypto.randomUUID is unavailable on insecure origins", () => {
    // Given an insecure origin exposing only getRandomValues
    const realCrypto = globalThis.crypto
    vi.stubGlobal("crypto", {
      getRandomValues: (array: Uint8Array) => realCrypto.getRandomValues(array),
    })

    // When a key is generated
    const value = randomUuid()

    // Then the fallback still produces a version-4 UUID
    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    vi.unstubAllGlobals()
  })
})
