ALTER TABLE "audit_entries" DROP CONSTRAINT IF EXISTS "audit_entries_session_id_sessions_id_fk";
ALTER TABLE "audit_entries"
  ADD CONSTRAINT "audit_entries_session_id_sessions_id_fk"
  FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
CREATE OR REPLACE FUNCTION prevent_audit_entry_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.session_id IS NOT NULL
    AND NEW.session_id IS NULL
    AND ROW(
      NEW.id,
      NEW.actor_user_id,
      NEW.account_scope,
      NEW.action,
      NEW.subject_type,
      NEW.subject_id,
      NEW.details_ciphertext,
      NEW.details_nonce,
      NEW.details_auth_tag,
      NEW.created_at
    ) IS NOT DISTINCT FROM ROW(
      OLD.id,
      OLD.actor_user_id,
      OLD.account_scope,
      OLD.action,
      OLD.subject_type,
      OLD.subject_id,
      OLD.details_ciphertext,
      OLD.details_nonce,
      OLD.details_auth_tag,
      OLD.created_at
    ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit entries are immutable';
END;
$$;
