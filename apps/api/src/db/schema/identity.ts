import { boolean, pgTable, text, unique, uuid } from "drizzle-orm/pg-core"

import { accountScopeEnum, createdAt, id, userRoleEnum } from "./shared"
import { sessions } from "./transport"

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
})

export const userRoles = pgTable(
  "user_roles",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    accountScope: accountScopeEnum("account_scope").notNull(),
    role: userRoleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("user_roles_scope_role_unique").on(table.userId, table.accountScope, table.role),
  ],
)

export const sessionGrants = pgTable(
  "session_grants",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    accountScope: accountScopeEnum("account_scope").notNull(),
    createdAt: createdAt(),
  },
  (table) => [unique("session_grants_user_session_unique").on(table.userId, table.sessionId)],
)
