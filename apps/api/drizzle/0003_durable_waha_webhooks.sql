ALTER TABLE "normalized_events" ADD COLUMN IF NOT EXISTS "request_id" text;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "status_occurred_at" timestamp with time zone;
UPDATE "normalized_events" SET "request_id" = 'legacy-' || "id"::text WHERE "request_id" IS NULL;
ALTER TABLE "normalized_events" ALTER COLUMN "request_id" SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'normalized_events_scope_provider_event_unique') THEN
    ALTER TABLE "normalized_events" ADD CONSTRAINT "normalized_events_scope_provider_event_unique" UNIQUE("account_scope", "provider_event_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'normalized_events_scope_request_unique') THEN
    ALTER TABLE "normalized_events" ADD CONSTRAINT "normalized_events_scope_request_unique" UNIQUE("account_scope", "request_id");
  END IF;
END $$;
