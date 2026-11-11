-- Full-scope curation is separate from text curation and never grants publication.
ALTER TABLE aw_public_content_reviews ADD CONSTRAINT aw_public_content_reviews_owner_bundle UNIQUE(id,user_id,draft_id,bundle_id);
CREATE TABLE aw_public_content_curations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  draft_id uuid NOT NULL,
  bundle_id uuid NOT NULL,
  review_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK(source_revision>=0),
  snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  review_hash text NOT NULL CHECK(review_hash ~ '^[a-f0-9]{64}$'),
  policy_version text NOT NULL CHECK(policy_version='public-content-review-1'),
  curation_version text NOT NULL CHECK(curation_version='public-content-curation-1'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','content_reviewed','changes_requested','rejected')),
  reason_code text CHECK(reason_code IN ('privacy','content','quality','story_consistency','other')),
  actor_label text CHECK(actor_label IS NULL OR char_length(btrim(actor_label)) BETWEEN 3 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE(bundle_id,curation_version),
  FOREIGN KEY(bundle_id,user_id,draft_id) REFERENCES aw_public_content_bundles(id,user_id,draft_id) ON DELETE CASCADE,
  FOREIGN KEY(review_id,user_id,draft_id,bundle_id) REFERENCES aw_public_content_reviews(id,user_id,draft_id,bundle_id) ON DELETE CASCADE,
  CHECK ((status='pending' AND reason_code IS NULL AND actor_label IS NULL AND decided_at IS NULL) OR
         (status='content_reviewed' AND reason_code IS NULL AND actor_label IS NOT NULL AND decided_at IS NOT NULL) OR
         (status IN ('changes_requested','rejected') AND reason_code IS NOT NULL AND actor_label IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE INDEX aw_public_content_curations_pending ON aw_public_content_curations(created_at,id) WHERE status='pending';
CREATE FUNCTION aw_protect_public_content_curation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status<>'pending' OR NEW.status='pending' OR
     ROW(NEW.id,NEW.user_id,NEW.draft_id,NEW.bundle_id,NEW.review_id,NEW.source_revision,NEW.snapshot_hash,NEW.content_hash,NEW.review_hash,NEW.policy_version,NEW.curation_version,NEW.created_at)
       IS DISTINCT FROM
     ROW(OLD.id,OLD.user_id,OLD.draft_id,OLD.bundle_id,OLD.review_id,OLD.source_revision,OLD.snapshot_hash,OLD.content_hash,OLD.review_hash,OLD.policy_version,OLD.curation_version,OLD.created_at)
  THEN RAISE EXCEPTION 'Full content curation binding/result is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_public_content_curation_immutable BEFORE UPDATE ON aw_public_content_curations FOR EACH ROW EXECUTE FUNCTION aw_protect_public_content_curation();
ALTER TABLE aw_public_content_curations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON aw_public_content_curations FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON aw_public_content_curations FROM authenticated; END IF;
END $$;
