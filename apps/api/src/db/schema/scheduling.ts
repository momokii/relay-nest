import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { accountScopeEnum, createdAt, deliveryStateEnum, id, updatedAt } from "./shared"
import { sessions } from "./transport"

export const scheduledJobs = pgTable("scheduled_jobs", {
  id: id(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id),
  accountScope: accountScopeEnum("account_scope").notNull(),
  recipientPhoneCiphertext: text("recipient_phone_ciphertext").notNull(),
  recipientPhoneNonce: text("recipient_phone_nonce").notNull(),
  recipientPhoneAuthTag: text("recipient_phone_auth_tag").notNull(),
  messageCiphertext: text("message_ciphertext").notNull(),
  messageNonce: text("message_nonce").notNull(),
  messageAuthTag: text("message_auth_tag").notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  timezone: text("timezone").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  state: deliveryStateEnum("state").notNull().default("scheduled"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const dispatchAttempts = pgTable("dispatch_attempts", {
  id: id(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => scheduledJobs.id),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id),
  accountScope: accountScopeEnum("account_scope").notNull(),
  attemptNumber: integer("attempt_number").notNull(),
  state: deliveryStateEnum("state").notNull(),
  providerMessageId: text("provider_message_id"),
  failureCode: text("failure_code"),
  attemptedAt: createdAt(),
})
