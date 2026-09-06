import { describe, expect, it } from "vitest"

import {
  parseWallClockInstant,
  scheduleTimingSchema,
  type WallClockParse,
} from "../apps/api/src/wall-clock"

describe("parseWallClockInstant", () => {
  const instantOf = (wallClock: string, timeZone: string): WallClockParse =>
    parseWallClockInstant(wallClock, timeZone)

  it("converts an Asia/Jakarta wall clock to its true UTC instant", () => {
    // Given the composer's offset-less wall clock for 2026-09-06T17:38 Asia/Jakarta
    // When it is parsed against Asia/Jakarta
    // Then the instant is 2026-09-06T10:38:00.000Z
    const parsed = instantOf("2026-09-06T17:38", "Asia/Jakarta")
    expect(parsed).toEqual({ ok: true, instant: new Date("2026-09-06T10:38:00.000Z") })
  })

  it("resolves a repeated DST wall clock to the earlier instant", () => {
    // Given the America/New_York fall-back on 2026-11-01 where 01:30 occurs twice
    // When the wall clock is parsed
    // Then the earlier instant (EDT side, 05:30Z) is chosen deterministically
    const parsed = instantOf("2026-11-01T01:30", "America/New_York")
    expect(parsed).toEqual({ ok: true, instant: new Date("2026-11-01T05:30:00.000Z") })
  })

  it("rejects a nonexistent DST gap wall clock", () => {
    // Given the America/New_York spring-forward gap on 2026-03-08 at 02:30
    // When the wall clock is parsed
    // Then the parse fails as a nonexistent local time
    expect(instantOf("2026-03-08T02:30", "America/New_York")).toEqual({
      ok: false,
      reason: "nonexistent_local_time",
    })
  })

  it("rejects unsupported timezones", () => {
    expect(instantOf("2026-09-06T17:38", "Mars/Olympus")).toEqual({
      ok: false,
      reason: "unsupported_timezone",
    })
  })

  it("rejects malformed and non-datetime-local wall clocks", () => {
    // Given inputs that datetime-local fields can never emit
    // When they are parsed
    // Then every one is rejected as an invalid wall clock
    for (const wallClock of [
      "2026-09-06",
      "September 6 2026",
      "2026-02-30T10:00",
      "2026-13-01T00:00",
      "2026-09-06T24:00",
      "2026-09-06T17:38:60",
      "",
    ]) {
      expect(instantOf(wallClock, "Asia/Jakarta")).toEqual({
        ok: false,
        reason: "invalid_wall_clock",
      })
    }
  })

  it("keeps legacy offset instants absolute regardless of the submitted timezone", () => {
    // Given an ISO instant that already carries its own offset
    // When it is parsed with any timezone
    // Then the instant is preserved without wall-clock conversion
    const utc = instantOf("2099-01-02T00:00:00.000Z", "UTC")
    expect(utc).toEqual({ ok: true, instant: new Date("2099-01-02T00:00:00.000Z") })
    const offset = instantOf("2099-01-02T00:00:00+07:00", "Asia/Jakarta")
    expect(offset).toEqual({ ok: true, instant: new Date("2099-01-01T17:00:00.000Z") })
  })

  it("rejects offset instants whose components are out of range", () => {
    expect(instantOf("2026-02-30T00:00:00Z", "UTC")).toEqual({
      ok: false,
      reason: "invalid_wall_clock",
    })
  })
})

describe("scheduleTimingSchema", () => {
  it("transforms a valid wall clock and timezone into a persisted instant", () => {
    const parsed = scheduleTimingSchema.safeParse({
      scheduledFor: "2026-09-06T17:38",
      timezone: "Asia/Jakarta",
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.scheduledFor.toISOString()).toBe("2026-09-06T10:38:00.000Z")
      expect(parsed.data.timezone).toBe("Asia/Jakarta")
    }
  })

  it("reports a failure for any invalid timing input", () => {
    for (const input of [
      { scheduledFor: "2026-03-08T02:30", timezone: "America/New_York" },
      { scheduledFor: "2026-09-06T17:38", timezone: "Mars/Olympus" },
      { scheduledFor: "not-a-date", timezone: "UTC" },
      { scheduledFor: "2026-09-06T17:38", timezone: "" },
    ]) {
      expect(scheduleTimingSchema.safeParse(input).success).toBe(false)
    }
  })
})
