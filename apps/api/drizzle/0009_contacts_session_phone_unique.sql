ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_scope_phone_unique";--> statement-breakpoint
ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_scope_session_phone_unique"
  UNIQUE ("account_scope", "session_id", "phone_blind_index");
