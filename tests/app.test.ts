import { describe, expect, it } from "vitest"

import { resolveLoopbackWahaOption } from "../apps/api/src/app"

describe("API runtime options", () => {
  it("does not allow loopback WAHA in production composition", () => {
    // Given a production API composition that requests test-only loopback access
    const option = resolveLoopbackWahaOption(true, {
      APP_ENV: "production",
      NODE_ENV: "production",
    })

    // When the runtime option is resolved
    // Then the production composition receives no loopback permission
    expect(option).toEqual({})
  })

  it("allows loopback WAHA only for an explicit test composition", () => {
    // Given an explicit test API composition that requests loopback access
    const option = resolveLoopbackWahaOption(true, { APP_ENV: "test", NODE_ENV: "test" })

    // When the runtime option is resolved
    // Then only the test composition receives loopback permission
    expect(option).toEqual({ allowLoopbackWaha: true })
  })
})
