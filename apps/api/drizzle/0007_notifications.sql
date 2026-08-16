ALTER TYPE "notification_state" ADD VALUE IF NOT EXISTS 'attempting';

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "category" text DEFAULT 'operations' NOT NULL,
  ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "failure_detail" text,
  ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_attempt_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "notification_provider_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_scope" "account_scope" NOT NULL,
  "channel" "notification_channel" NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "config_ciphertext" text NOT NULL,
  "config_nonce" text NOT NULL,
  "config_auth_tag" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notification_provider_settings_scope_channel_unique" UNIQUE("account_scope", "channel")
);

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_scope" "account_scope" NOT NULL,
  "category" text NOT NULL,
  "email_enabled" boolean DEFAULT false NOT NULL,
  "telegram_enabled" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notification_preferences_scope_category_unique" UNIQUE("account_scope", "category")
);
