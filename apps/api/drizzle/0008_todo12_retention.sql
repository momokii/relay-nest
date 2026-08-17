DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retention_policies_days_positive') THEN
    ALTER TABLE "retention_policies"
      ADD CONSTRAINT "retention_policies_days_positive" CHECK ("retention_days" BETWEEN 1 AND 3650);
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_jobs_retention_scope_created_idx"
  ON "scheduled_jobs" ("account_scope", "created_at", "id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_retention_scope_created_idx"
  ON "contacts" ("account_scope", "created_at", "id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "normalized_events_retention_scope_received_idx"
  ON "normalized_events" ("account_scope", "created_at", "id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_retention_scope_created_idx"
  ON "notifications" ("account_scope", "created_at", "id");
