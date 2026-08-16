import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { accountScopeEnum, createdAt, id, updatedAt } from "./shared"
import { sessions } from "./transport"

export const sessionMessagingSafety = pgTable("session_messaging_safety", {
  id: id(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id),
  accountScope: accountScopeEnum("account_scope").notNull(),
  dailyBudget: integer("daily_budget").notNull().default(20),
  pacingSeconds: integer("pacing_seconds").notNull().default(30),
  burstLimit: integer("burst_limit").notNull().default(3),
  burstWindowSeconds: integer("burst_window_seconds").notNull().default(300),
  duplicateWindowSeconds: integer("duplicate_window_seconds").notNull().default(3600),
  newlyLinkedCooldownUntil: timestamp("newly_linked_cooldown_until", { withTimezone: true }),
  quietHoursStart: text("quiet_hours_start"),
  quietHoursEnd: text("quiet_hours_end"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
