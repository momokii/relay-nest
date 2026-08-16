import { describe, expect, it } from "vitest"

import {
  createBlindIndex,
  createEnvelopeCipher,
  EnvelopeEncryptionError,
} from "../packages/config/src/encryption"

const key = Buffer.alloc(32, 7)

describe("envelope encryption", () => {
  it("decrypts ciphertext only with authenticated metadata", () => {
    // Given a master key and associated scope metadata
    const cipher = createEnvelopeCipher(key)

    // When sensitive content is encrypted and then decrypted
    const sealed = cipher.encrypt("opaque-fixture-1", { accountScope: "personal" })

    // Then the original content is recovered without exposing it in the envelope
    expect(sealed.ciphertext).not.toContain("opaque-fixture-1")
    expect(cipher.decrypt(sealed, { accountScope: "personal" })).toBe("opaque-fixture-1")
  })

  it("fails closed when ciphertext or metadata is tampered with", () => {
    // Given a valid envelope
    const cipher = createEnvelopeCipher(key)
    const sealed = cipher.encrypt("opaque-fixture-2", { accountScope: "business" })

    // When ciphertext and authenticated metadata are modified
    const tampered = { ...sealed, ciphertext: `${sealed.ciphertext}00` }

    // Then decryption returns a typed failure without plaintext
    expect(() => cipher.decrypt(tampered, { accountScope: "business" })).toThrow(
      EnvelopeEncryptionError,
    )
    expect(() => cipher.decrypt(sealed, { accountScope: "personal" })).toThrow(
      EnvelopeEncryptionError,
    )
    expect(() => cipher.decrypt({ ...sealed, nonce: "bad" }, { accountScope: "business" })).toThrow(
      EnvelopeEncryptionError,
    )
  })

  it("fails closed for a missing or wrong master key", () => {
    // Given encrypted content from a valid key
    const sealed = createEnvelopeCipher(key).encrypt("opaque-fixture-3", {
      accountScope: "personal",
    })

    // When a caller has no usable key or the wrong key
    expect(() => createEnvelopeCipher(undefined)).toThrow(EnvelopeEncryptionError)
    expect(() =>
      createEnvelopeCipher(Buffer.alloc(32, 8)).decrypt(sealed, { accountScope: "personal" }),
    ).toThrow(EnvelopeEncryptionError)
  })

  it("creates a stable blind index without exposing the exact lookup value", () => {
    // Given an infrastructure-managed master key
    // When an exact lookup value is indexed twice
    const first = createBlindIndex(key, "opaque-fixture-4")
    const second = createBlindIndex(key, "opaque-fixture-4")

    // Then the index is stable but does not contain the lookup value
    expect(first).toBe(second)
    expect(first).not.toContain("opaque-fixture-4")
  })
})
