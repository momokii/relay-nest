ALTER TABLE "auth_rate_limits" ALTER COLUMN "failures" SET DATA TYPE integer USING "failures"::integer;
