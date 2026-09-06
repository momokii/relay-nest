import { z } from "zod"

// A datetime-local wall clock as produced by <input type="datetime-local">:
// a calendar date plus a clock time, never carrying a UTC offset. It must be
// interpreted in the schedule's submitted IANA timezone, not the API's local zone.
const DATETIME_LOCAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/
// An absolute ISO-8601 instant that already carries its own UTC offset; legacy
// API callers may still submit this form and it needs no timezone conversion.
const OFFSET_INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/
const DAY_MS = 86_400_000

export type WallClockFailure =
  | "invalid_wall_clock"
  | "unsupported_timezone"
  | "nonexistent_local_time"

export type WallClockParse =
  | { readonly ok: true; readonly instant: Date }
  | { readonly ok: false; readonly reason: WallClockFailure }

type WallParts = {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
  readonly millisecond: number
}

function isSupportedTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
    return true
  } catch (error) {
    // Intl signals an unsupported IANA timezone with RangeError; anything else
    // is an unexpected failure and must propagate.
    if (error instanceof RangeError) return false
    throw error
  }
}

function wallPartsInZone(instant: Date, timeZone: string): WallParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  }).formatToParts(instant)
  const values = new Map(parts.map((part) => [part.type, part.value] as const))
  const read = (type: Intl.DateTimeFormatPartTypes): number => Number(values.get(type) ?? "")
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
    millisecond: read("fractionalSecond"),
  }
}

function wallPartsEqual(left: WallParts, right: WallParts): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second &&
    left.millisecond === right.millisecond
  )
}

function offsetMs(instant: Date, timeZone: string): number {
  const parts = wallPartsInZone(instant, timeZone)
  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ) - instant.getTime()
  )
}

function parseLocalWallClock(match: RegExpMatchArray, timeZone: string): WallClockParse {
  const expected: WallParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: match[6] === undefined ? 0 : Number(match[6]),
    millisecond: match[7] === undefined ? 0 : Number(match[7].padEnd(3, "0")),
  }
  if (
    expected.year < 1000 ||
    expected.month < 1 ||
    expected.month > 12 ||
    expected.hour > 23 ||
    expected.minute > 59 ||
    expected.second > 59
  ) {
    return { ok: false, reason: "invalid_wall_clock" }
  }
  const wallUtc = Date.UTC(
    expected.year,
    expected.month - 1,
    expected.day,
    expected.hour,
    expected.minute,
    expected.second,
    expected.millisecond,
  )
  const calendar = new Date(wallUtc)
  if (calendar.getUTCMonth() !== expected.month - 1 || calendar.getUTCDate() !== expected.day) {
    return { ok: false, reason: "invalid_wall_clock" }
  }
  // Probe 24h behind the wall clock so both offsets adjacent to a DST transition
  // are observed: every repeated wall clock sits within 24h of its transition.
  const guess = new Date(wallUtc)
  const dayBefore = new Date(wallUtc - DAY_MS)
  const offsets = [...new Set([offsetMs(guess, timeZone), offsetMs(dayBefore, timeZone)])]
  const candidates = offsets
    .map((offset) => wallUtc - offset)
    .filter((candidate) => wallPartsEqual(wallPartsInZone(new Date(candidate), timeZone), expected))
  if (candidates.length === 0) return { ok: false, reason: "nonexistent_local_time" }
  // Repeated wall clocks resolve to the earlier instant, deterministically.
  return { ok: true, instant: new Date(Math.min(...candidates)) }
}

function parseOffsetInstant(match: RegExpMatchArray): WallClockParse {
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const rawSecond = match[6]
  const second = rawSecond === undefined ? 0 : Number(rawSecond)
  if (year < 1000 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return { ok: false, reason: "invalid_wall_clock" }
  }
  const calendar = new Date(Date.UTC(year, month - 1, day))
  if (calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) {
    return { ok: false, reason: "invalid_wall_clock" }
  }
  const instant = new Date(match[0].replace(" ", "T"))
  return Number.isNaN(instant.getTime())
    ? { ok: false, reason: "invalid_wall_clock" }
    : { ok: true, instant }
}

export function parseWallClockInstant(wallClock: string, timeZone: string): WallClockParse {
  if (!isSupportedTimeZone(timeZone)) return { ok: false, reason: "unsupported_timezone" }
  const local = wallClock.match(DATETIME_LOCAL_PATTERN)
  if (local) return parseLocalWallClock(local, timeZone)
  const offset = wallClock.match(OFFSET_INSTANT_PATTERN)
  if (!offset) return { ok: false, reason: "invalid_wall_clock" }
  return parseOffsetInstant(offset)
}

// Shared schedule timing contract for the create and edit HTTP boundaries:
// accepts the composer's offset-less wall clock (interpreted in the submitted
// timezone) or a legacy offset instant, and emits a durable UTC instant.
export const scheduleTimingSchema = z
  .object({
    scheduledFor: z.string(),
    timezone: z.string().min(1).max(80),
  })
  .superRefine((value, ctx) => {
    const parsed = parseWallClockInstant(value.scheduledFor, value.timezone)
    if (!parsed.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledFor"],
        message: "invalid schedule time",
      })
    }
  })
  .transform((value) => {
    const parsed = parseWallClockInstant(value.scheduledFor, value.timezone)
    if (!parsed.ok) {
      throw new Error("unreachable: superRefine already rejected the invalid schedule timing")
    }
    return { scheduledFor: parsed.instant, timezone: value.timezone }
  })
