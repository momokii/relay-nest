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
    displayNameCiphertext: text("display_name_ciphertext"),
    displayNameNonce: text("display_name_nonce"),
    displayNameAuthTag: text("display_name_auth_tag"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique("contacts_scope_phone_unique").on(table.accountScope, table.phoneBlindIndex)],
)
