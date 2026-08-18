import { createEnvelopeCipher } from "../packages/config/src/encryption"

import type { DatabaseHandle } from "../apps/api/src/db/client"
import { contacts, dispatchAttempts, normalizedEvents, scheduledJobs } from "../apps/api/src/db/schema"

export async function seedAnalyticsRecords(
  database: DatabaseHandle,
  sessionId: string,
): Promise<void> {
  const cipher = createEnvelopeCipher(Buffer.alloc(32, 7))
  const eventTime = new Date("2026-01-01T01:00:00.000Z")
  const messagePayload = cipher.encrypt(JSON.stringify({ fromMe: true }), {
    accountScope: "personal",
  })
  const statusStarted = cipher.encrypt(JSON.stringify({ status: "WORKING" }), {
    accountScope: "personal",
  })
  const statusStopped = cipher.encrypt(JSON.stringify({ status: "STOPPED" }), {
    accountScope: "personal",
  })
  const safetyPayload = cipher.encrypt("{}", { accountScope: "personal" })
  await database.db.insert(normalizedEvents).values([
    {
      sessionId,
      accountScope: "personal",
      eventType: "message.waiting",
      providerEventId: "analytics-message",
      requestId: "analytics-message-request",
      payloadCiphertext: messagePayload.ciphertext,
      payloadNonce: messagePayload.nonce,
      payloadAuthTag: messagePayload.authTag,
      occurredAt: eventTime,
    },
    {
      sessionId,
      accountScope: "personal",
      eventType: "session.status",
      providerEventId: "analytics-status-started",
      requestId: "analytics-status-started-request",
      payloadCiphertext: statusStarted.ciphertext,
      payloadNonce: statusStarted.nonce,
      payloadAuthTag: statusStarted.authTag,
      occurredAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      sessionId,
      accountScope: "personal",
      eventType: "session.status",
      providerEventId: "analytics-status-stopped",
      requestId: "analytics-status-stopped-request",
      payloadCiphertext: statusStopped.ciphertext,
      payloadNonce: statusStopped.nonce,
      payloadAuthTag: statusStopped.authTag,
      occurredAt: new Date("2026-01-01T02:00:00.000Z"),
    },
    {
      sessionId,
      accountScope: "personal",
      eventType: "safety.timelock",
      providerEventId: "analytics-timelock",
      requestId: "analytics-timelock-request",
      payloadCiphertext: safetyPayload.ciphertext,
      payloadNonce: safetyPayload.nonce,
      payloadAuthTag: safetyPayload.authTag,
      occurredAt: eventTime,
    },
  ])
  const recipient = cipher.encrypt("opaque-recipient", { accountScope: "personal" })
  const message = cipher.encrypt("opaque-message", { accountScope: "personal" })
  const [job] = await database.db
    .insert(scheduledJobs)
    .values({
      sessionId,
      accountScope: "personal",
      recipientPhoneCiphertext: recipient.ciphertext,
      recipientPhoneNonce: recipient.nonce,
      recipientPhoneAuthTag: recipient.authTag,
      messageCiphertext: message.ciphertext,
      messageNonce: message.nonce,
      messageAuthTag: message.authTag,
      scheduledFor: eventTime,
      timezone: "UTC",
      idempotencyKey: "analytics-job-idempotency",
      state: "failed",
      attempts: 2,
      providerMessageId: "analytics-message",
      failureCode: "timelock_active",
      updatedAt: eventTime,
    })
    .returning({ id: scheduledJobs.id })
  if (!job) throw new Error("analytics job fixture missing")
  await database.db.insert(dispatchAttempts).values({
    jobId: job.id,
    sessionId,
    accountScope: "personal",
    attemptNumber: 2,
    state: "failed",
    providerMessageId: "analytics-message",
    attemptedAt: eventTime,
  })
  await database.db.insert(contacts).values({
    sessionId,
    accountScope: "personal",
    phoneCiphertext: "opaque-phone-ciphertext",
    phoneNonce: "opaque-phone-nonce",
    phoneAuthTag: "opaque-phone-tag",
    phoneBlindIndex: "opaque-phone-index",
    providerChatIdCiphertext: "opaque-chat-ciphertext",
    providerChatIdNonce: "opaque-chat-nonce",
    providerChatIdAuthTag: "opaque-chat-tag",
    createdAt: eventTime,
    updatedAt: eventTime,
  })
}
