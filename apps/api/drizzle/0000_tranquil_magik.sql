DO $$ BEGIN CREATE TYPE "public"."account_scope" AS ENUM('personal', 'business'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."delivery_state" AS ENUM('scheduled', 'attempting', 'submitted', 'acknowledged', 'failed', 'unknown', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."notification_channel" AS ENUM('email', 'telegram'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."notification_state" AS ENUM('queued', 'sent', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."user_role" AS ENUM('admin', 'operator', 'viewer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"account_scope" "account_scope" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_grants_user_session_unique" UNIQUE("user_id","session_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_scope" "account_scope" NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_scope_role_unique" UNIQUE("user_id","account_scope","role")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"session_id" uuid,
	"account_scope" "account_scope" NOT NULL,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"details_ciphertext" text,
	"details_nonce" text,
	"details_auth_tag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "normalized_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"account_scope" "account_scope" NOT NULL,
	"event_type" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"request_id" text NOT NULL,
	"payload_ciphertext" text NOT NULL,
	"payload_nonce" text NOT NULL,
	"payload_auth_tag" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
	,CONSTRAINT "normalized_events_scope_provider_event_unique" UNIQUE("account_scope","provider_event_id")
	,CONSTRAINT "normalized_events_scope_request_unique" UNIQUE("account_scope","request_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_scope" "account_scope" NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"destination_ciphertext" text NOT NULL,
	"destination_nonce" text NOT NULL,
	"destination_auth_tag" text NOT NULL,
	"body_ciphertext" text NOT NULL,
	"body_nonce" text NOT NULL,
	"body_auth_tag" text NOT NULL,
	"state" "notification_state" DEFAULT 'queued' NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "retention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_scope" "account_scope" NOT NULL,
	"category" text NOT NULL,
	"retention_days" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retention_policies_scope_category_unique" UNIQUE("account_scope","category")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dispatch_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"account_scope" "account_scope" NOT NULL,
	"attempt_number" integer NOT NULL,
	"state" "delivery_state" NOT NULL,
	"provider_message_id" text,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"account_scope" "account_scope" NOT NULL,
	"recipient_phone_ciphertext" text NOT NULL,
	"recipient_phone_nonce" text NOT NULL,
	"recipient_phone_auth_tag" text NOT NULL,
	"message_ciphertext" text NOT NULL,
	"message_nonce" text NOT NULL,
	"message_auth_tag" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"state" "delivery_state" DEFAULT 'scheduled' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_jobs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"account_scope" "account_scope" NOT NULL,
	"phone_ciphertext" text NOT NULL,
	"phone_nonce" text NOT NULL,
	"phone_auth_tag" text NOT NULL,
	"phone_blind_index" text NOT NULL,
	"display_name_ciphertext" text,
	"display_name_nonce" text,
	"display_name_auth_tag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_scope_phone_unique" UNIQUE("account_scope","phone_blind_index")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"account_scope" "account_scope" NOT NULL,
	"name" text NOT NULL,
	"waha_session_name" text NOT NULL,
	"status" text NOT NULL,
	"status_occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_scope_name_unique" UNIQUE("account_scope","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "waha_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"api_key_ciphertext" text NOT NULL,
	"api_key_nonce" text NOT NULL,
	"api_key_auth_tag" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waha_connections_name_unique" UNIQUE("name")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_grants_user_id_users_id_fk') THEN
    ALTER TABLE "session_grants" ADD CONSTRAINT "session_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_grants_session_id_sessions_id_fk') THEN
    ALTER TABLE "session_grants" ADD CONSTRAINT "session_grants_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_id_users_id_fk') THEN
    ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_entries_actor_user_id_users_id_fk') THEN
    ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_entries_session_id_sessions_id_fk') THEN
    ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'normalized_events_session_id_sessions_id_fk') THEN
    ALTER TABLE "normalized_events" ADD CONSTRAINT "normalized_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_id_users_id_fk') THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dispatch_attempts_job_id_scheduled_jobs_id_fk') THEN
    ALTER TABLE "dispatch_attempts" ADD CONSTRAINT "dispatch_attempts_job_id_scheduled_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."scheduled_jobs"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dispatch_attempts_session_id_sessions_id_fk') THEN
    ALTER TABLE "dispatch_attempts" ADD CONSTRAINT "dispatch_attempts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_jobs_session_id_sessions_id_fk') THEN
    ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_session_id_sessions_id_fk') THEN
    ALTER TABLE "contacts" ADD CONSTRAINT "contacts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_connection_id_waha_connections_id_fk') THEN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_connection_id_waha_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."waha_connections"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_entries_encrypted_details_pair_check') THEN
    ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_encrypted_details_pair_check" CHECK ("details_ciphertext" IS NULL AND "details_nonce" IS NULL AND "details_auth_tag" IS NULL OR "details_ciphertext" IS NOT NULL AND "details_nonce" IS NOT NULL AND "details_auth_tag" IS NOT NULL);
  END IF;
END $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_audit_entry_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.session_id IS NOT NULL
    AND NEW.session_id IS NULL
    AND ROW(NEW.id, NEW.actor_user_id, NEW.account_scope, NEW.action, NEW.subject_type, NEW.subject_id, NEW.details_ciphertext, NEW.details_nonce, NEW.details_auth_tag, NEW.created_at)
      IS NOT DISTINCT FROM ROW(OLD.id, OLD.actor_user_id, OLD.account_scope, OLD.action, OLD.subject_type, OLD.subject_id, OLD.details_ciphertext, OLD.details_nonce, OLD.details_auth_tag, OLD.created_at) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit entries are immutable';
END;
$$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_entries_immutable') THEN
    CREATE TRIGGER audit_entries_immutable BEFORE UPDATE OR DELETE ON "audit_entries" FOR EACH ROW EXECUTE FUNCTION prevent_audit_entry_mutation();
  END IF;
END $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_session_account_scope() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE session_scope account_scope; BEGIN SELECT account_scope INTO session_scope FROM sessions WHERE id = NEW.session_id; IF session_scope IS NULL OR session_scope <> NEW.account_scope THEN RAISE EXCEPTION 'account scope does not match session'; END IF; RETURN NEW; END; $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'contacts_scope_guard') THEN CREATE TRIGGER contacts_scope_guard BEFORE INSERT OR UPDATE ON "contacts" FOR EACH ROW EXECUTE FUNCTION enforce_session_account_scope(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'scheduled_jobs_scope_guard') THEN CREATE TRIGGER scheduled_jobs_scope_guard BEFORE INSERT OR UPDATE ON "scheduled_jobs" FOR EACH ROW EXECUTE FUNCTION enforce_session_account_scope(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'dispatch_attempts_scope_guard') THEN CREATE TRIGGER dispatch_attempts_scope_guard BEFORE INSERT OR UPDATE ON "dispatch_attempts" FOR EACH ROW EXECUTE FUNCTION enforce_session_account_scope(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'normalized_events_scope_guard') THEN CREATE TRIGGER normalized_events_scope_guard BEFORE INSERT OR UPDATE ON "normalized_events" FOR EACH ROW EXECUTE FUNCTION enforce_session_account_scope(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'session_grants_scope_guard') THEN CREATE TRIGGER session_grants_scope_guard BEFORE INSERT OR UPDATE ON "session_grants" FOR EACH ROW EXECUTE FUNCTION enforce_session_account_scope(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_entries_scope_guard') THEN CREATE TRIGGER audit_entries_scope_guard BEFORE INSERT OR UPDATE ON "audit_entries" FOR EACH ROW WHEN (NEW.session_id IS NOT NULL) EXECUTE FUNCTION enforce_session_account_scope(); END IF;
END $$;
