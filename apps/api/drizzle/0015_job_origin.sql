CREATE TYPE "job_origin" AS ENUM ('immediate', 'scheduled');
ALTER TABLE "scheduled_jobs" ADD COLUMN "origin" "job_origin" DEFAULT 'scheduled' NOT NULL;
