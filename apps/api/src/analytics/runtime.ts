import { createEnvelopeCipher, EnvelopeEncryptionError } from "@waha-command-center/config"
import { and, eq, gte, inArray, lt, or } from "drizzle-orm"
import { z } from "zod"

import type { DatabaseHandle } from "../db/client"
import {
  contacts,
  dispatchAttempts,
  normalizedEvents,
  scheduledJobs,
  sessions as sessionsTable,
} from "../db/schema"
import type { AccountScope } from "../db/schema/shared"
import type { AnalyticsEvent, AnalyticsSession, AnalyticsSource, AnalyticsWindow } from "./types"

const statusPayloadSchema = z.object({ status: z.string().min(1) })

function attemptState(
  state: (typeof dispatchAttempts.$inferSelect)["state"],
): "attempting" | "submitted" | "acknowledged" | "failed" | "unknown" {
  switch (state) {
    case "attempting":
    case "submitted":
    case "acknowledged":
    case "failed":
    case "unknown":
      return state
    case "scheduled":
    case "queued":
    case "cancelled":
      return "unknown"
    default:
      return assertNever(state)
  }
}

function assertNever(value: never): never {
  throw new Error(`unexpected dispatch state: ${String(value)}`)
}

function decryptPayload(
  cipher: ReturnType<typeof createEnvelopeCipher>,
  event: {
    readonly payloadCiphertext: string
    readonly payloadNonce: string
    readonly payloadAuthTag: string
  },
  scope: AccountScope,
): unknown {
  try {
    return JSON.parse(
      cipher.decrypt(
        {
          version: 1,
          algorithm: "aes-256-gcm",
          ciphertext: event.payloadCiphertext,
          nonce: event.payloadNonce,
          authTag: event.payloadAuthTag,
        },
        { accountScope: scope },
      ),
    )
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof EnvelopeEncryptionError) return null
    throw error
  }
}

export function createAnalyticsSource(
  database: DatabaseHandle,
  masterKey: Buffer,
): AnalyticsSource {
  const cipher = createEnvelopeCipher(masterKey)
  return {
    listSessions: async (scope: AccountScope): Promise<readonly AnalyticsSession[]> =>
      database.db
        .select({
          id: sessionsTable.id,
          accountScope: sessionsTable.accountScope,
          status: sessionsTable.status,
        })
        .from(sessionsTable)
        .where(eq(sessionsTable.accountScope, scope)),
    read: async (scope: AccountScope, window: AnalyticsWindow, sessionIds: readonly string[]) => {
      if (sessionIds.length === 0) {
        return {
          sessions: [],
          events: [],
          dispatchAttempts: [],
          contacts: [],
          jobs: [],
          statusHistory: [],
        }
      }
      const [events, attempts, contactRows, jobs, sessions] = await Promise.all([
        database.db
          .select()
          .from(normalizedEvents)
          .where(
            and(
              eq(normalizedEvents.accountScope, scope),
              inArray(normalizedEvents.sessionId, sessionIds),
              lt(normalizedEvents.occurredAt, window.to),
            ),
          ),
        database.db
          .select()
          .from(dispatchAttempts)
          .where(
            and(
              eq(dispatchAttempts.accountScope, scope),
              inArray(dispatchAttempts.sessionId, sessionIds),
              gte(dispatchAttempts.attemptedAt, window.from),
              lt(dispatchAttempts.attemptedAt, window.to),
            ),
          ),
        database.db
          .select({
            sessionId: contacts.sessionId,
            accountScope: contacts.accountScope,
            createdAt: contacts.createdAt,
            updatedAt: contacts.updatedAt,
          })
          .from(contacts)
          .where(
            and(
              eq(contacts.accountScope, scope),
              inArray(contacts.sessionId, sessionIds),
              or(
                and(gte(contacts.createdAt, window.from), lt(contacts.createdAt, window.to)),
                and(gte(contacts.updatedAt, window.from), lt(contacts.updatedAt, window.to)),
              ),
            ),
          ),
        database.db
          .select({
            sessionId: scheduledJobs.sessionId,
            accountScope: scheduledJobs.accountScope,
            state: scheduledJobs.state,
            attempts: scheduledJobs.attempts,
            failureCode: scheduledJobs.failureCode,
            updatedAt: scheduledJobs.updatedAt,
          })
          .from(scheduledJobs)
          .where(
            and(
              eq(scheduledJobs.accountScope, scope),
              inArray(scheduledJobs.sessionId, sessionIds),
              gte(scheduledJobs.updatedAt, window.from),
              lt(scheduledJobs.updatedAt, window.to),
            ),
          ),
        database.db
          .select({
            id: sessionsTable.id,
            accountScope: sessionsTable.accountScope,
            status: sessionsTable.status,
          })
          .from(sessionsTable)
          .where(and(eq(sessionsTable.accountScope, scope), inArray(sessionsTable.id, sessionIds))),
      ])
      const analyticsEvents: readonly AnalyticsEvent[] = events.map((event) => ({
        sessionId: event.sessionId,
        accountScope: event.accountScope,
        eventType: event.eventType,
        providerEventId: event.providerEventId,
        occurredAt: event.occurredAt,
        payload: decryptPayload(cipher, event, scope),
      }))
      return {
        sessions,
        events: analyticsEvents,
        dispatchAttempts: attempts.map((attempt) => ({
          sessionId: attempt.sessionId,
          accountScope: attempt.accountScope,
          providerMessageId: attempt.providerMessageId,
          state: attemptState(attempt.state),
          attemptedAt: attempt.attemptedAt,
        })),
        contacts: contactRows,
        jobs,
        statusHistory: analyticsEvents.flatMap((event) => {
          if (event.eventType !== "session.status") return []
          const parsed = statusPayloadSchema.safeParse(event.payload)
          return parsed.success
            ? [
                {
                  sessionId: event.sessionId,
                  accountScope: event.accountScope,
                  status: parsed.data.status,
                  observedAt: event.occurredAt,
                },
              ]
            : []
        }),
      }
    },
  }
}
