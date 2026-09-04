CREATE TABLE IF NOT EXISTS "contact_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_scope" "account_scope" NOT NULL,
  "name" text NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "contact_groups_scope_name_unique" UNIQUE("account_scope", "name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_group_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL,
  "contact_id" uuid,
  "phone_ciphertext" text,
  "phone_nonce" text,
  "phone_auth_tag" text,
  "phone_blind_index" text,
  "account_scope" "account_scope" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "contact_group_members_group_contact_unique" UNIQUE("group_id", "contact_id"),
  CONSTRAINT "contact_group_members_group_phone_unique" UNIQUE("group_id", "phone_blind_index"),
  CONSTRAINT "contact_group_members_one_target_check" CHECK ((contact_id IS NOT NULL AND phone_ciphertext IS NULL AND phone_nonce IS NULL AND phone_auth_tag IS NULL AND phone_blind_index IS NULL) OR (contact_id IS NULL AND phone_ciphertext IS NOT NULL AND phone_nonce IS NOT NULL AND phone_auth_tag IS NOT NULL AND phone_blind_index IS NOT NULL))
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_groups_created_by_users_id_fk') THEN
    ALTER TABLE "contact_groups" ADD CONSTRAINT "contact_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_group_members_group_id_contact_groups_id_fk') THEN
    ALTER TABLE "contact_group_members" ADD CONSTRAINT "contact_group_members_group_id_contact_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."contact_groups"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_group_members_contact_id_contacts_id_fk') THEN
    ALTER TABLE "contact_group_members" ADD CONSTRAINT "contact_group_members_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
