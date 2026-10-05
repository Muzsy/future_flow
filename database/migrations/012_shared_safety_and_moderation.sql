ALTER TABLE aw_shared_contexts ADD COLUMN moderation_hold boolean NOT NULL DEFAULT false;
CREATE TABLE aw_shared_reports (
  id uuid PRIMARY KEY, context_id uuid NOT NULL REFERENCES aw_shared_contexts,
  reporter_user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  target_type text NOT NULL CHECK(target_type IN ('context','member','event','invite')),
  target_id uuid NOT NULL, reason text NOT NULL CHECK(reason IN ('harassment','privacy','unsafe_content','spam','other')),
  details text NOT NULL CHECK(length(details) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
  UNIQUE(reporter_user_id,context_id,target_type,target_id,reason)
);
CREATE INDEX aw_shared_report_queue ON aw_shared_reports(status,created_at,id);
CREATE INDEX aw_shared_report_rate ON aw_shared_reports(reporter_user_id,created_at);
CREATE TABLE aw_shared_moderation_audit (
  id uuid PRIMARY KEY, context_id uuid NOT NULL REFERENCES aw_shared_contexts,
  actor_label text NOT NULL CHECK(length(actor_label) BETWEEN 1 AND 80),
  action text NOT NULL CHECK(action IN ('hold','release','dismiss')),
  report_id uuid REFERENCES aw_shared_reports ON DELETE SET NULL,
  reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 2000), input_hash text NOT NULL,
  revision integer NOT NULL CHECK(revision>=0), created_at timestamptz NOT NULL DEFAULT now()
);
-- Only a deleted report reference may be detached; audit evidence is otherwise immutable.
CREATE FUNCTION aw_shared_moderation_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.context_id,NEW.actor_label,NEW.action,NEW.reason,NEW.input_hash,NEW.revision,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.context_id,OLD.actor_label,OLD.action,OLD.reason,OLD.input_hash,OLD.revision,OLD.created_at)
     OR (NEW.report_id IS DISTINCT FROM OLD.report_id AND NEW.report_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Shared moderation audit is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_shared_moderation_audit_immutable BEFORE UPDATE ON aw_shared_moderation_audit
  FOR EACH ROW EXECUTE FUNCTION aw_shared_moderation_audit_immutable();
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['aw_shared_reports','aw_shared_moderation_audit'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',item);
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',item); END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',item); END IF;
  END LOOP;
END $$;
