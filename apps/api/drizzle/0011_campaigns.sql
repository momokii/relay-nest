DO $$ BEGIN
  CREATE TYPE "campaign_state" AS ENUM ('scheduled', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_scope" "account_scope" NOT NULL,
  "session_id" uuid NOT NULL,
  "contact_group_id" uuid NOT NULL,
  "waha_group_id" text NOT NULL,
  "message_ciphertext" text NOT NULL,
  "message_nonce" text NOT NULL,
  "message_auth_tag" text NOT NULL,
  "follow_up_message_ciphertext" text,
  "follow_up_message_nonce" text,
  "follow_up_message_auth_tag" text,
  "trigger" jsonb NOT NULL,
  "scheduled_at" timestamp with time zone NOT NULL,
  "state" "campaign_state" DEFAULT 'scheduled' NOT NULL,
  "created_by" uuid NOT NULL,
  "scheduler_job_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_session_id_sessions_id_fk') THEN
    ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_contact_group_id_contact_groups_id_fk') THEN
    ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_contact_group_id_contact_groups_id_fk" FOREIGN KEY ("contact_group_id") REFERENCES "public"."contact_groups"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_created_by_users_id_fk') THEN
    ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_scheduler_job_id_scheduled_jobs_id_fk') THEN
    ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_scheduler_job_id_scheduled_jobs_id_fk" FOREIGN KEY ("scheduler_job_id") REFERENCES "public"."scheduled_jobs"("id");
  END IF;
END $$;
