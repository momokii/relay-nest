import { describe, expect, it, vi } from "vitest"

import { type AutoLinkHooks, runAutoLink } from "../apps/web/src/session-auto-link"

function hooks(overrides: Partial<AutoLinkHooks> = {}): AutoLinkHooks & {
  readonly statuses: string[]
} {
  const statuses: string[] = []
  const base: AutoLinkHooks = {
    start: vi.fn(async () => undefined),
    fetchStatus: vi.fn(async () => "STOPPED"),
    onStatus: (status: string) => {
      statuses.push(status)
    },
    loadQr: vi.fn(() => undefined),
    delay: vi.fn(async () => undefined),
  }
  return { statuses, ...base, ...overrides }
}

describe("session auto-link orchestration", () => {
  it("starts the session, polls until the QR state, and loads the QR", async () => {
    // Given a provider that reaches the QR-scan state on the second poll
    const statuses = ["STARTING", "SCAN_QR_CODE"]
    const h = hooks({ fetchStatus: vi.fn(async () => statuses.shift() ?? "STOPPED") })

    // When the auto-link runs
    await runAutoLink(h)

    // Then the session is started, statuses are surfaced, and the QR loads exactly once
    expect(h.start).toHaveBeenCalledTimes(1)
    expect(h.loadQr).toHaveBeenCalledTimes(1)
    expect(h.statuses).toEqual(["starting", "scan_qr_code"])
    expect(h.delay).toHaveBeenCalledTimes(1)
  })

  it("stops without loading the QR when the session is already working", async () => {
    // Given a provider reporting a working session
    const h = hooks({ fetchStatus: vi.fn(async () => "WORKING") })

    // When the auto-link runs
    await runAutoLink(h)

    // Then linking ends without a QR fetch
    expect(h.loadQr).not.toHaveBeenCalled()
    expect(h.statuses).toEqual(["working"])
  })

  it("reports a failed start without polling", async () => {
    // Given a start command rejected by the server
    const h = hooks({ start: vi.fn(async () => Promise.reject(new Error("denied"))) })

    // When the auto-link runs
    await runAutoLink(h)

    // Then the failure surfaces and no polling or QR fetch happens
    expect(h.statuses).toEqual(["start_failed"])
    expect(h.fetchStatus).not.toHaveBeenCalled()
    expect(h.loadQr).not.toHaveBeenCalled()
  })

  it("gives up after the poll budget and reports the timeout", async () => {
    // Given a provider stuck outside the QR state
    const h = hooks({ fetchStatus: vi.fn(async () => "STARTING") })

    // When the auto-link exhausts its poll budget
    await runAutoLink(h)

    // Then the timeout status surfaces after the bounded poll count
    expect(h.delay).toHaveBeenCalledTimes(15)
    expect(h.statuses.at(-1)).toBe("linking_timeout")
    expect(h.loadQr).not.toHaveBeenCalled()
  })

  it("stops early when cancelled between polls", async () => {
    // Given cancellation is requested while linking
    let cancelled = false
    const h = hooks({
      fetchStatus: vi.fn(async () => "STARTING"),
      isCancelled: () => cancelled,
    })

    // When the first poll completes and cancellation flips on
    void (async () => {
      await Promise.resolve()
      cancelled = true
    })()
    await runAutoLink(h)

    // Then no further polling happens and no timeout is reported
    expect(h.delay).not.toHaveBeenCalled()
    expect(h.statuses.at(-1)).not.toBe("linking_timeout")
  })
})
