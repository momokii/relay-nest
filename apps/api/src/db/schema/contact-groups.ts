import { sql } from "drizzle-orm"
import { check, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"

import { users } from "./identity"
import { accountScopeEnum, createdAt, id } from "./shared"
import { contacts } from "./transport"

export const contactGroups = pgTable(
  "contact_groups",
  {
    id: id(),
    accountScope: accountScopeEnum("account_scope").notNull(),
    name: text("name").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [unique("contact_groups_scope_name_unique").on(table.accountScope, table.name)],
)

export const contactGroupMembers = pgTable(
  "contact_group_members",
  {
    id: id(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => contactGroups.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    phoneCiphertext: text("phone_ciphertext"),
    phoneNonce: text("phone_nonce"),
    phoneAuthTag: text("phone_auth_tag"),
    phoneBlindIndex: text("phone_blind_index"),
    accountScope: accountScopeEnum("account_scope").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("contact_group_members_group_contact_unique").on(table.groupId, table.contactId),
    unique("contact_group_members_group_phone_unique").on(table.groupId, table.phoneBlindIndex),
    check(
      "contact_group_members_one_target_check",
      sql`(contact_id IS NOT NULL AND phone_ciphertext IS NULL AND phone_nonce IS NULL AND phone_auth_tag IS NULL AND phone_blind_index IS NULL) OR (contact_id IS NULL AND phone_ciphertext IS NOT NULL AND phone_nonce IS NOT NULL AND phone_auth_tag IS NOT NULL AND phone_blind_index IS NOT NULL)`,
    ),
  ],
)
