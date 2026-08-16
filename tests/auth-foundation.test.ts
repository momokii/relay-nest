import { describe, expect, it } from "vitest"

import { hashPassword, verifyPassword } from "../apps/api/src/auth/password"
import { hashToken } from "../apps/api/src/auth/service"

describe("authentication foundations", () => {
  it("hashes passwords without retaining plaintext and verifies only the original", async () => {
    // Given a valid password
    const password = "correct horse battery staple"

    // When it is hashed
    const encoded = await hashPassword(password)

    // Then the encoded value is opaque and only the original verifies
    expect(encoded).not.toContain(password)
    await expect(verifyPassword(password, encoded)).resolves.toBe(true)
    await expect(verifyPassword("wrong password", encoded)).resolves.toBe(false)
  })

  it("rejects malformed password hashes without throwing", async () => {
    // Given malformed credential storage
    // When a login verifier receives it
    const result = await verifyPassword("password", "not-a-scrypt-hash")

    // Then it reports invalid credentials safely
    expect(result).toBe(false)
  })

  it("hashes session tokens before persistence", () => {
    // Given an opaque session token
    // When its persistence key is derived
    const tokenHash = hashToken("token-value")

    // Then the stored value is not the browser token
    expect(tokenHash).not.toBe("token-value")
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/)
  })
})
