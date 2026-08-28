import { z } from "zod"

import type {
  AcknowledgmentBreakdown,
  AnalyticsEvent,
  AnalyticsInput,
  AnalyticsJob,
  AnalyticsJobState,
  MessageVolume,
  ScheduledJobOutcomes,
} from "./types"

const messageEvents = new Set(["message", "message.any", "message.waiting"])
const timelockEvents = new Set(["safety.timelock"])
const cappingEvents = new Set(["safety.capping"])
const directionSchema = z.object({ fromMe: z.boolean() })
const messageIdentitySchema = z.object({ id: z.string().min(1) })

export function inWindow(date: Date, input: AnalyticsInput): boolean {
  return date >= input.window.from && date < input.window.to
}

export function scoped<T extends { readonly accountScope: AnalyticsInput["scope"] }>(
  rows: readonly T[],
  input: AnalyticsInput,
): readonly T[] {
  return rows.filter((row) => row.accountScope === input.scope)
}

export function messageRows(input: AnalyticsInput, sessionId: string): readonly AnalyticsEvent[] {
  const seen = new Set<string>()
  return [...scoped(input.events, input)]
    .filter(
      (event) =>
        event.sessionId === sessionId &&
        inWindow(event.occurredAt, input) &&
        messageEvents.has(event.eventType),
    )
    .sort((left, right) => {
      const occurred = left.occurredAt.getTime() - right.occurredAt.getTime()
      if (occurred !== 0) return occurred
      const provider = left.providerEventId.localeCompare(right.providerEventId)
      if (provider !== 0) return provider
      const eventType = left.eventType.localeCompare(right.eventType)
      if (eventType !== 0) return eventType
      return (JSON.stringify(left.payload) ?? "").localeCompare(JSON.stringify(right.payload) ?? "")
    })
    .filter((event) => {
      const identity =
        messageIdentitySchema.safeParse(event.payload).data?.id ?? event.providerEventId
      if (seen.has(identity)) return false
      seen.add(identity)
      return true
    })
}

function messageIdentity(event: AnalyticsEvent): string {
  return messageIdentitySchema.safeParse(event.payload).data?.id ?? event.providerEventId
}

function direction(event: AnalyticsEvent): "inbound" | "outbound" | "unknown" {
  const parsed = directionSchema.safeParse(event.payload)
  if (!parsed.success) return "unknown"
  return parsed.data.fromMe ? "outbound" : "inbound"
}

export function messageVolume(events: readonly AnalyticsEvent[]): MessageVolume {
  let inbound = 0
  let outbound = 0
  for (const event of events) {
    const eventDirection = direction(event)
    switch (eventDirection) {
      case "inbound":
        inbound += 1
        break
      case "outbound":
        outbound += 1
        break
      case "unknown":
        break
      default:
        return assertNever(eventDirection)
    }
  }
  return {
    total: events.length,
    inbound,
    outbound,
    unknownDirection: events.length - inbound - outbound,
  }
}

export function acknowledgmentBreakdown(
  events: readonly AnalyticsEvent[],
  attempts: readonly AnalyticsInput["dispatchAttempts"][number][],
): AcknowledgmentBreakdown {
  const byMessage = new Map<string, AnalyticsInput["dispatchAttempts"][number]["state"]>()
  for (const attempt of [...attempts].sort(
    (left, right) => left.attemptedAt.getTime() - right.attemptedAt.getTime(),
  )) {
    if (attempt.providerMessageId) byMessage.set(attempt.providerMessageId, attempt.state)
  }
  let submitted = 0
  let acknowledged = 0
  let failed = 0
  let unknown = 0
  const matched = new Set<string>()
  for (const event of events) {
    const identity = messageIdentity(event)
    const state = byMessage.get(identity)
    if (state && identity !== event.providerEventId) matched.add(identity)
    switch (state) {
      case "submitted":
        submitted += 1
        break
      case "acknowledged":
        acknowledged += 1
        break
      case "failed":
        failed += 1
        break
      case "attempting":
      case "unknown":
      case undefined:
        unknown += 1
        break
      default:
        return assertNever(state)
    }
  }
  for (const attempt of attempts) {
    const identity = attempt.providerMessageId
    if (
      identity &&
      !matched.has(identity) &&
      !events.some((event) => messageIdentity(event) === identity)
    ) {
      switch (attempt.state) {
        case "submitted":
          submitted += 1
          break
        case "acknowledged":
          acknowledged += 1
          break
        case "failed":
          failed += 1
          break
        case "attempting":
        case "unknown":
          unknown += 1
          break
        default:
          return assertNever(attempt.state)
      }
    }
  }
  return { submitted, acknowledged, failed, unknown }
}

export function outcomes(jobs: readonly AnalyticsJob[]): ScheduledJobOutcomes {
  const counts: Record<AnalyticsJobState, number> = {
    scheduled: 0,
    queued: 0,
    attempting: 0,
    submitted: 0,
    acknowledged: 0,
    failed: 0,
    unknown: 0,
    cancelled: 0,
  }
  let retries = 0
  for (const job of jobs) {
    counts[job.state] += 1
    retries += Math.max(0, job.attempts - 1)
  }
  return { total: jobs.length, ...counts, retries }
}

export function mergeOutcomes(
  left: ScheduledJobOutcomes,
  right: ScheduledJobOutcomes,
): ScheduledJobOutcomes {
  return {
    total: left.total + right.total,
    scheduled: left.scheduled + right.scheduled,
    queued: left.queued + right.queued,
    attempting: left.attempting + right.attempting,
    submitted: left.submitted + right.submitted,
    acknowledged: left.acknowledged + right.acknowledged,
    failed: left.failed + right.failed,
    unknown: left.unknown + right.unknown,
    cancelled: left.cancelled + right.cancelled,
    retries: left.retries + right.retries,
  }
}

export function safetyIndicators(
  events: readonly AnalyticsEvent[],
  jobs: readonly AnalyticsJob[],
): { readonly timelock: number; readonly capping: number } {
  return {
    timelock:
      events.filter((event) => timelockEvents.has(event.eventType)).length +
      jobs.filter((job) => job.failureCode === "timelock_active").length,
    capping:
      events.filter((event) => cappingEvents.has(event.eventType)).length +
      jobs.filter((job) => job.failureCode === "capping_exhausted").length,
  }
}

function assertNever(value: never): never {
  throw new Error(`unexpected analytics variant: ${String(value)}`)
}
