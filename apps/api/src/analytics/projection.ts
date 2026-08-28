import {
  acknowledgmentBreakdown,
  inWindow,
  mergeOutcomes,
  messageRows,
  messageVolume,
  outcomes,
  safetyIndicators,
  scoped,
} from "./projection-metrics"
import { statusHistory, uptimeMs } from "./status-history"
import type {
  AnalyticsInput,
  AnalyticsProjection,
  AnalyticsSession,
  SessionAnalytics,
} from "./types"

function sessionProjection(input: AnalyticsInput, session: AnalyticsSession): SessionAnalytics {
  const events = messageRows(input, session.id)
  const attempts = scoped(input.dispatchAttempts, input).filter(
    (attempt) => attempt.sessionId === session.id && inWindow(attempt.attemptedAt, input),
  )
  const jobs = scoped(input.jobs, input).filter(
    (job) => job.sessionId === session.id && inWindow(job.updatedAt, input),
  )
  const history = statusHistory(input, session)
  const acknowledgments = acknowledgmentBreakdown(events, attempts)
  const completed =
    acknowledgments.submitted + acknowledgments.acknowledged + acknowledgments.failed
  const failures = acknowledgments.failed
  const eventTypes = scoped(input.events, input).filter(
    (event) => event.sessionId === session.id && inWindow(event.occurredAt, input),
  )
  const safety = safetyIndicators(eventTypes, jobs)
  const contacts = scoped(input.contacts, input).filter(
    (contact) =>
      contact.sessionId === session.id &&
      (inWindow(contact.createdAt, input) || inWindow(contact.updatedAt, input)),
  )
  return {
    sessionId: session.id,
    status: session.status,
    messageVolume: messageVolume(events),
    acknowledgments,
    retryCount: jobs.reduce((total, job) => total + Math.max(0, job.attempts - 1), 0),
    failureRate: acknowledgments.unknown > 0 || completed === 0 ? null : failures / completed,
    uptimeMs: uptimeMs(history, input.window),
    statusHistory: history
      .filter((entry) => inWindow(entry.observedAt, input))
      .map((entry) => ({
        status: entry.status,
        observedAt: entry.observedAt.toISOString(),
      })),
    timelockIndicators: safety.timelock,
    cappingIndicators: safety.capping,
    contactActivity: contacts.length,
    scheduledJobs: outcomes(jobs),
  }
}

export function projectAnalytics(input: AnalyticsInput): AnalyticsProjection {
  const sessions = scoped(input.sessions, input)
    .filter((session) => session.accountScope === input.scope)
    .map((session) => sessionProjection(input, session))
  const aggregate = sessions.reduce(
    (total, session) => ({
      messageVolume: {
        total: total.messageVolume.total + session.messageVolume.total,
        inbound: total.messageVolume.inbound + session.messageVolume.inbound,
        outbound: total.messageVolume.outbound + session.messageVolume.outbound,
        unknownDirection:
          total.messageVolume.unknownDirection + session.messageVolume.unknownDirection,
      },
      acknowledgments: {
        submitted: total.acknowledgments.submitted + session.acknowledgments.submitted,
        acknowledged: total.acknowledgments.acknowledged + session.acknowledgments.acknowledged,
        failed: total.acknowledgments.failed + session.acknowledgments.failed,
        unknown: total.acknowledgments.unknown + session.acknowledgments.unknown,
      },
      retryCount: total.retryCount + session.retryCount,
      timelockIndicators: total.timelockIndicators + session.timelockIndicators,
      cappingIndicators: total.cappingIndicators + session.cappingIndicators,
      contactActivity: total.contactActivity + session.contactActivity,
      scheduledJobs: mergeOutcomes(total.scheduledJobs, session.scheduledJobs),
    }),
    {
      messageVolume: { total: 0, inbound: 0, outbound: 0, unknownDirection: 0 },
      acknowledgments: { submitted: 0, acknowledged: 0, failed: 0, unknown: 0 },
      retryCount: 0,
      timelockIndicators: 0,
      cappingIndicators: 0,
      contactActivity: 0,
      scheduledJobs: outcomes([]),
    },
  )
  const completed =
    aggregate.acknowledgments.submitted +
    aggregate.acknowledgments.acknowledged +
    aggregate.acknowledgments.failed
  return {
    scope: input.scope,
    window: input.window,
    ...aggregate,
    failureRate:
      aggregate.acknowledgments.unknown > 0 || completed === 0
        ? null
        : aggregate.acknowledgments.failed / completed,
    uptimeMs:
      sessions.length === 0
        ? null
        : sessions.every((session) => session.uptimeMs !== null)
          ? sessions.reduce((total, session) => total + (session.uptimeMs ?? 0), 0)
          : null,
    statusHistory: sessions
      .flatMap((session) =>
        session.statusHistory.map((entry) => ({ sessionId: session.sessionId, ...entry })),
      )
      .sort((left, right) => {
        const observed = left.observedAt.localeCompare(right.observedAt)
        return observed === 0 ? left.sessionId.localeCompare(right.sessionId) : observed
      }),
    sessions,
  }
}
