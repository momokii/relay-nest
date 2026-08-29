import { describe, expect, it } from "vitest"
import { authFailureMessage } from "../apps/web/src/dashboard-auth-api"

describe("auth failure messages", () => {
  it("maps a 409 login failure to an invalid-credentials message", () => {
    // Given a login attempt the server rejected as invalid credentials (HTTP 409)
    const result = {
      kind: "error",
      message: "The server could not complete this request.",
      status: 409,
    } as const

    // When the auth boundary derives the message to render
    const message = authFailureMessage("login", result)

    // Then the message names the credentials instead of a server fault
    expect(message).toBe("Invalid email or password.")
  })

  it("maps a 409 bootstrap failure to an already-configured message", () => {
    // Given a bootstrap attempt after the first Admin already exists (HTTP 409)
    const result = {
      kind: "error",
      message: "The server could not complete this request.",
      status: 409,
    } as const

    // When the auth boundary derives the message to render
    const message = authFailureMessage("bootstrap", result)

    // Then the message directs the operator to sign in instead
    expect(message).toBe("An Admin account already exists. Sign in instead.")
  })

  it("maps a 429 login failure to a retry-later message", () => {
    // Given a login attempt rejected by the rate limiter (HTTP 429)
    const result = {
      kind: "error",
      message: "The server could not complete this request.",
      status: 429,
    } as const

    // When the auth boundary derives the message to render
    const message = authFailureMessage("login", result)

    // Then the message explains the temporary lockout instead of a server fault
    expect(message).toBe("Too many attempts. Wait a moment and try again.")
  })

  it("keeps the generic message for unclassified errors", () => {
    // Given a genuine server fault without a specific status
    const result = {
      kind: "error",
      message: "The server could not complete this request.",
    } as const

    // When the auth boundary derives the message to render
    const message = authFailureMessage("login", result)

    // Then the existing generic message is preserved
    expect(message).toBe("The server could not complete this request.")
  })

  it("returns no override for a successful sign-in", () => {
    // Given a successful login result
    const result = {
      kind: "ready",
      data: {
        user: {
          id: "user-1",
          email: "operator@example.test",
          displayName: "Operator",
          rolesByScope: { personal: ["admin"], business: ["admin"] },
        },
      },
    } as const

    // When the auth boundary derives the message to render
    const message = authFailureMessage("login", result)

    // Then no failure message is produced
    expect(message).toBeNull()
  })
})
