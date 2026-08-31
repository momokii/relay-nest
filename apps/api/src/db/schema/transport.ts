import { boolean, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"

import { accountScopeEnum, createdAt, id, updatedAt } from "./shared"

export const wahaConnections = pgTable("waha_connections", {
  id: id(),
  name: text("name").notNull().unique(),
  baseUrl: text("base_url").notNull(),
  apiKeyCiphertext: text("api_key_ciphertext").notNull(),
  apiKeyNonce: text("api_key_nonce").notNull(),
  apiKeyAuthTag: text("api_key_auth_tag").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => wahaConnections.id),
    accountScope: accountScopeEnum("account_scope").notNull(),
    name: text("name").notNull(),
    wahaSessionName: text("waha_session_name").notNull(),
    status: text("status").notNull(),
    statusOccurredAt: timestamp("status_occurred_at", { withTimezone: true }),
    linkedAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique("sessions_scope_name_unique").on(table.accountScope, table.name)],
)

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    accountScope: accountScopeEnum("account_scope").notNull(),
    phoneCiphertext: text("phone_ciphertext").notNull(),
    phoneNonce: text("phone_nonce").notNull(),
    phoneAuthTag: text("phone_auth_tag").notNull(),
    phoneBlindIndex: text("phone_blind_index").notNull(),
    providerChatIdCiphertext: text("provider_chat_id_ciphertext").notNull(),
    providerChatIdNonce: text("provider_chat_id_nonce").notNull(),
    providerChatIdAuthTag: text("provider_chat_id_auth_tag").notNull(),
    displayNameCiphertext: text("display_name_ciphertext"),
    displayNameNonce: text("display_name_nonce"),
    displayNameAuthTag: text("display_name_auth_tag"),
    consentGranted: boolean("consent_granted").notNull().default(false),
    optedOut: boolean("opted_out").notNull().default(false),
    consentUpdatedAt: timestamp("consent_updated_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("contacts_scope_session_phone_unique").on(
      table.accountScope,
      table.sessionId,
      table.phoneBlindIndex,
    ),
  ],
)
