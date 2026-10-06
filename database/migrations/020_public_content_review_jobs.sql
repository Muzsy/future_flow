-- A distinct, once-per-bundle full-scope review. Legacy text-only records are unchanged.
CREATE TABLE aw_public_content_reviews (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  draft_id uuid NOT NULL,
  bundle_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK(source_revision>=0),
  snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
  policy_version text NOT NULL CHECK(policy_version='public-content-review-1'),
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','cancelled')),
  lease_token uuid,
  lease_until timestamptz,
  report jsonb,
  report_hash text CHECK(report_hash ~ '^[a-f0-9]{64}$'),
  receipt jsonb,
  failure_code text CHECK(failure_code='PUBLIC_CONTENT_REVIEW_INTERRUPTED'),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(bundle_id,policy_version),
  FOREIGN KEY(bundle_id,user_id,draft_id) REFERENCES aw_public_content_bundles(id,user_id,draft_id) ON DELETE CASCADE,
  CHECK (
    (status='queued' AND lease_token IS NULL AND lease_until IS NULL AND finished_at IS NULL AND report IS NULL AND report_hash IS NULL AND receipt IS NULL AND failure_code IS NULL) OR
    (status='running' AND lease_token IS NOT NULL AND lease_until IS NOT NULL AND finished_at IS NULL AND report IS NULL AND report_hash IS NULL AND receipt IS NULL AND failure_code IS NULL) OR
    (status='completed' AND lease_token IS NULL AND lease_until IS NULL AND finished_at IS NOT NULL AND report IS NOT NULL AND report_hash IS NOT NULL AND receipt IS NOT NULL AND failure_code IS NULL) OR
    (status IN ('failed','cancelled') AND lease_token IS NULL AND lease_until IS NULL AND finished_at IS NOT NULL AND report IS NULL AND report_hash IS NULL AND receipt IS NULL AND failure_code IS NOT NULL)
  )
);
CREATE INDEX aw_public_content_reviews_queue ON aw_public_content_reviews(created_at,id) WHERE status IN ('queued','running');
CREATE INDEX aw_public_content_reviews_user ON aw_public_content_reviews(user_id,created_at);
CREATE FUNCTION aw_protect_public_content_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('completed','failed','cancelled') OR NEW.status='queued' OR
     (OLD.status='queued' AND NEW.status='completed') OR
     (OLD.status='running' AND NEW.status='running' AND NEW.lease_token IS DISTINCT FROM OLD.lease_token) OR
     ROW(NEW.id,NEW.user_id,NEW.draft_id,NEW.bundle_id,NEW.source_revision,NEW.snapshot_hash,NEW.content_hash,NEW.input_hash,NEW.policy_version,NEW.created_at)
       IS DISTINCT FROM
     ROW(OLD.id,OLD.user_id,OLD.draft_id,OLD.bundle_id,OLD.source_revision,OLD.snapshot_hash,OLD.content_hash,OLD.input_hash,OLD.policy_version,OLD.created_at)
  THEN RAISE EXCEPTION 'Full content review binding/result is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_public_content_review_immutable BEFORE UPDATE ON aw_public_content_reviews FOR EACH ROW EXECUTE FUNCTION aw_protect_public_content_review();
ALTER TABLE aw_public_content_reviews ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON aw_public_content_reviews FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON aw_public_content_reviews FROM authenticated; END IF;
END $$;
