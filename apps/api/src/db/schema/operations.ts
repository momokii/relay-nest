import { integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { users } from "./identity"
import {
  accountScopeEnum,
  createdAt,
  id,
  notificationChannelEnum,
  notificationStateEnum,
} from "./shared"
import { sessions } from "./transport"

export const normalizedEvents = pgTable(
  "normalized_events",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    accountScope: accountScopeEnum("account_scope").notNull(),
    eventType: text("event_type").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    requestId: text("request_id").notNull(),
    payloadCiphertext: text("payload_ciphertext").notNull(),
    payloadNonce: text("payload_nonce").notNull(),
    payloadAuthTag: text("payload_auth_tag").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: createdAt(),
  },
  (table) => [
    unique("normalized_events_scope_provider_event_unique").on(
      table.accountScope,
      table.providerEventId,
    ),
    unique("normalized_events_scope_request_unique").on(table.accountScope, table.requestId),
  ],
)

export const auditEntries = pgTable("audit_entries", {
  id: id(),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
  accountScope: accountScopeEnum("account_scope").notNull(),
  action: text("action").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  detailsCiphertext: text("details_ciphertext"),
  detailsNonce: text("details_nonce"),
  detailsAuthTag: text("details_auth_tag"),
  createdAt: createdAt(),
})

export const notifications = pgTable("notifications", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  accountScope: accountScopeEnum("account_scope").notNull(),
  channel: notificationChannelEnum("channel").notNull(),
  destinationCiphertext: text("destination_ciphertext").notNull(),
  destinationNonce: text("destination_nonce").notNull(),
  destinationAuthTag: text("destination_auth_tag").notNull(),
  bodyCiphertext: text("body_ciphertext").notNull(),
  bodyNonce: text("body_nonce").notNull(),
  bodyAuthTag: text("body_auth_tag").notNull(),
  state: notificationStateEnum("state").notNull().default("queued"),
  failureCode: text("failure_code"),
  createdAt: createdAt(),
})

export const retentionPolicies = pgTable(
  "retention_policies",
  {
    id: id(),
    accountScope: accountScopeEnum("account_scope").notNull(),
    category: text("category").notNull(),
    retentionDays: integer("retention_days").notNull(),
    updatedAt: createdAt(),
  },
  (table) => [
    unique("retention_policies_scope_category_unique").on(table.accountScope, table.category),
  ],
)
