DO $$ BEGIN
  ALTER TYPE "public"."delivery_state" ADD VALUE IF NOT EXISTS 'queued';
END $$;--> statement-breakpoint
ALTER TABLE "scheduled_jobs"
  ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "lease_owner" text,
  ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "provider_message_id" text,
  ADD COLUMN IF NOT EXISTS "recovery_code" text,
  ADD COLUMN IF NOT EXISTS "failure_code" text,
  ADD COLUMN IF NOT EXISTS "edit_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "scheduled_jobs"
SET "next_attempt_at" = "scheduled_for"
WHERE "next_attempt_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dispatch_attempts_job_attempt_unique"
  ON "dispatch_attempts" ("job_id", "attempt_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_jobs_due_idx"
  ON "scheduled_jobs" ("state", "next_attempt_at", "scheduled_for");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_jobs_lease_idx"
  ON "scheduled_jobs" ("state", "lease_expires_at");
