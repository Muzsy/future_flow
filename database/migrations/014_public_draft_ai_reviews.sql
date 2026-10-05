-- Private, trusted-operator AI pre-screen. Never grants publication or curator approval.
CREATE TABLE aw_public_draft_reviews (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  draft_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK(source_revision>=0),
  snapshot_hash text NOT NULL,
  input_hash text NOT NULL,
  policy_version text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed')),
  report jsonb,
  report_hash text,
  receipt jsonb,
  failure_code text CHECK(failure_code IN ('PUBLIC_REVIEW_FAILED','PUBLIC_REVIEW_INTERRUPTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(draft_id,policy_version),
  FOREIGN KEY(draft_id,user_id) REFERENCES aw_publication_drafts(id,user_id) ON DELETE CASCADE,
  CHECK (
    (status='running' AND report IS NULL AND report_hash IS NULL AND receipt IS NULL AND failure_code IS NULL AND finished_at IS NULL) OR
    (status='completed' AND report IS NOT NULL AND report_hash IS NOT NULL AND receipt IS NOT NULL AND failure_code IS NULL AND finished_at IS NOT NULL) OR
    (status='failed' AND report IS NULL AND report_hash IS NULL AND receipt IS NULL AND failure_code IS NOT NULL AND finished_at IS NOT NULL)
  )
);
CREATE FUNCTION aw_protect_public_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status<>'running' OR NEW.status='running' OR
     ROW(NEW.id,NEW.user_id,NEW.draft_id,NEW.source_revision,NEW.snapshot_hash,NEW.input_hash,NEW.policy_version,NEW.created_at)
       IS DISTINCT FROM
     ROW(OLD.id,OLD.user_id,OLD.draft_id,OLD.source_revision,OLD.snapshot_hash,OLD.input_hash,OLD.policy_version,OLD.created_at)
  THEN RAISE EXCEPTION 'Public review binding/result is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_public_review_immutable BEFORE UPDATE ON aw_public_draft_reviews FOR EACH ROW EXECUTE FUNCTION aw_protect_public_review();
ALTER TABLE aw_public_draft_reviews ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON aw_public_draft_reviews FROM anon;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON aw_public_draft_reviews FROM authenticated;
  END IF;
END $$;
