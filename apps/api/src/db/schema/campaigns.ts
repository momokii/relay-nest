import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { contactGroups } from "./contact-groups"
import { users } from "./identity"
import { scheduledJobs } from "./scheduling"
import { accountScopeEnum, createdAt, id } from "./shared"
import { sessions } from "./transport"

export const campaignStateEnum = pgEnum("campaign_state", ["scheduled", "sent", "failed"])

export const campaigns = pgTable("campaigns", {
  id: id(),
  accountScope: accountScopeEnum("account_scope").notNull(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id),
  contactGroupId: uuid("contact_group_id")
    .notNull()
    .references(() => contactGroups.id),
  wahaGroupId: text("waha_group_id"),
  messageCiphertext: text("message_ciphertext").notNull(),
  messageNonce: text("message_nonce").notNull(),
  messageAuthTag: text("message_auth_tag").notNull(),
  followUpMessageCiphertext: text("follow_up_message_ciphertext"),
  followUpMessageNonce: text("follow_up_message_nonce"),
  followUpMessageAuthTag: text("follow_up_message_auth_tag"),
  trigger: jsonb("trigger").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  state: campaignStateEnum("state").notNull().default("scheduled"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  schedulerJobId: uuid("scheduler_job_id").references(() => scheduledJobs.id),
  createdAt: createdAt(),
})
