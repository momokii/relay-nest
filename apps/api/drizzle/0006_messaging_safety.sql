ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "provider_chat_id_ciphertext" text,
  ADD COLUMN IF NOT EXISTS "provider_chat_id_nonce" text,
  ADD COLUMN IF NOT EXISTS "provider_chat_id_auth_tag" text,
  ADD COLUMN IF NOT EXISTS "consent_granted" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "opted_out" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "consent_updated_at" timestamp with time zone;

UPDATE "contacts"
SET
  "provider_chat_id_ciphertext" = COALESCE("provider_chat_id_ciphertext", "phone_ciphertext"),
  "provider_chat_id_nonce" = COALESCE("provider_chat_id_nonce", "phone_nonce"),
  "provider_chat_id_auth_tag" = COALESCE("provider_chat_id_auth_tag", "phone_auth_tag")
WHERE "provider_chat_id_ciphertext" IS NULL;

ALTER TABLE "contacts"
  ALTER COLUMN "provider_chat_id_ciphertext" SET NOT NULL,
  ALTER COLUMN "provider_chat_id_nonce" SET NOT NULL,
  ALTER COLUMN "provider_chat_id_auth_tag" SET NOT NULL;

ALTER TABLE "scheduled_jobs"
  ADD COLUMN IF NOT EXISTS "message_blind_index" text;

CREATE TABLE IF NOT EXISTS "session_messaging_safety" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "sessions"("id"),
  "account_scope" "account_scope" NOT NULL,
  "daily_budget" integer DEFAULT 20 NOT NULL,
  "pacing_seconds" integer DEFAULT 30 NOT NULL,
  "burst_limit" integer DEFAULT 3 NOT NULL,
  "burst_window_seconds" integer DEFAULT 300 NOT NULL,
  "duplicate_window_seconds" integer DEFAULT 3600 NOT NULL,
  "newly_linked_cooldown_until" timestamp with time zone,
  "quiet_hours_start" text,
  "quiet_hours_end" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "session_messaging_safety_session_unique" UNIQUE("session_id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'session_messaging_safety_scope_guard') THEN
    CREATE TRIGGER session_messaging_safety_scope_guard BEFORE INSERT OR UPDATE ON "session_messaging_safety" FOR EACH ROW EXECUTE FUNCTION enforce_session_account_scope();
  END IF;
END $$;
