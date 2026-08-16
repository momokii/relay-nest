import { pgEnum, timestamp, uuid } from "drizzle-orm/pg-core"

export const accountScopeEnum = pgEnum("account_scope", ["personal", "business"])
export const userRoleEnum = pgEnum("user_role", ["admin", "operator", "viewer"])
export const deliveryStateEnum = pgEnum("delivery_state", [
  "scheduled",
  "queued",
  "attempting",
  "submitted",
  "acknowledged",
  "failed",
  "unknown",
  "cancelled",
])
export const notificationChannelEnum = pgEnum("notification_channel", ["email", "telegram"])
export const notificationStateEnum = pgEnum("notification_state", [
  "queued",
  "attempting",
  "sent",
  "failed",
])
export const id = () => uuid("id").defaultRandom().primaryKey()
export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
export type AccountScope = "personal" | "business"
