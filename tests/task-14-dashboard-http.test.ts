import { describe, expect, it, vi } from "vitest"

import { createDashboardApi } from "../apps/web/src/dashboard-api"

describe("Todo 14 dashboard HTTP boundary", () => {
  it("returns an error result when a successful response cannot be decoded", async () => {
    // Given an authenticated API response whose JSON body throws unexpectedly
    const response = {
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new Error("invalid response stream")),
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))

    // When the dashboard parses the response
    const result = await createDashboardApi().getPrincipal()

    // Then the controller receives recoverable error state instead of a rejected promise
    expect(result).toEqual({
      kind: "error",
      message: "The API returned an unreadable response.",
    })
    vi.unstubAllGlobals()
  })
})
