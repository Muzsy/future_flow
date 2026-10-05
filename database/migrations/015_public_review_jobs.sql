-- An explicit owner request queues exactly one paid attempt for an immutable copy.
ALTER TABLE aw_public_draft_reviews ADD CONSTRAINT aw_public_review_owner_draft UNIQUE(id,user_id,draft_id);
CREATE TABLE aw_public_review_jobs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  draft_id uuid NOT NULL,
  review_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','cancelled')),
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  FOREIGN KEY(draft_id,user_id) REFERENCES aw_publication_drafts(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(review_id,user_id,draft_id) REFERENCES aw_public_draft_reviews(id,user_id,draft_id) ON DELETE CASCADE,
  CHECK ((status='running' AND lease_token IS NOT NULL AND lease_until IS NOT NULL AND finished_at IS NULL) OR
         (status='queued' AND lease_token IS NULL AND lease_until IS NULL AND finished_at IS NULL) OR
         (status IN ('completed','failed','cancelled') AND lease_token IS NULL AND lease_until IS NULL AND finished_at IS NOT NULL))
);
CREATE INDEX aw_public_review_jobs_queue ON aw_public_review_jobs(created_at) WHERE status IN ('queued','running');
CREATE INDEX aw_public_review_jobs_user ON aw_public_review_jobs(user_id,created_at);
CREATE FUNCTION aw_protect_public_review_job() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.user_id,NEW.draft_id,NEW.review_id,NEW.created_at) IS DISTINCT FROM
     ROW(OLD.id,OLD.user_id,OLD.draft_id,OLD.review_id,OLD.created_at) OR
     OLD.status IN ('completed','failed','cancelled') OR
     (OLD.status='running' AND NEW.status='queued') OR
     (OLD.status='queued' AND NEW.status='completed') OR
     (OLD.status='running' AND NEW.status='running' AND NEW.lease_token IS DISTINCT FROM OLD.lease_token)
  THEN RAISE EXCEPTION 'Public review jobs cannot be rebound or restarted'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_public_review_job_immutable BEFORE UPDATE ON aw_public_review_jobs FOR EACH ROW EXECUTE FUNCTION aw_protect_public_review_job();
ALTER TABLE aw_public_review_jobs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON aw_public_review_jobs FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON aw_public_review_jobs FROM authenticated; END IF;
END $$;
