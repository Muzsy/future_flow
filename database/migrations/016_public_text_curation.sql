-- Owner-submitted text review only. No publication, Official badge or fork authority.
CREATE TABLE aw_public_text_curations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  draft_id uuid NOT NULL,
  review_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK(source_revision>=0),
  snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
  curation_version text NOT NULL CHECK(curation_version='text-curation-1'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','text_reviewed','changes_requested','rejected')),
  reason_code text CHECK(reason_code IN ('privacy','content','quality','story_consistency','other')),
  actor_label text CHECK(actor_label IS NULL OR char_length(btrim(actor_label)) BETWEEN 3 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE(draft_id,curation_version),
  FOREIGN KEY(draft_id,user_id) REFERENCES aw_publication_drafts(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(review_id,user_id,draft_id) REFERENCES aw_public_draft_reviews(id,user_id,draft_id) ON DELETE CASCADE,
  CHECK ((status='pending' AND reason_code IS NULL AND actor_label IS NULL AND decided_at IS NULL) OR
         (status='text_reviewed' AND reason_code IS NULL AND actor_label IS NOT NULL AND decided_at IS NOT NULL) OR
         (status IN ('changes_requested','rejected') AND reason_code IS NOT NULL AND actor_label IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE INDEX aw_public_text_curations_pending ON aw_public_text_curations(created_at) WHERE status='pending';
CREATE FUNCTION aw_protect_public_text_curation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status<>'pending' OR NEW.status='pending' OR
     ROW(NEW.id,NEW.user_id,NEW.draft_id,NEW.review_id,NEW.source_revision,NEW.snapshot_hash,NEW.curation_version,NEW.created_at)
       IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.draft_id,OLD.review_id,OLD.source_revision,OLD.snapshot_hash,OLD.curation_version,OLD.created_at)
  THEN RAISE EXCEPTION 'Text curation binding/result is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_public_text_curation_immutable BEFORE UPDATE ON aw_public_text_curations FOR EACH ROW EXECUTE FUNCTION aw_protect_public_text_curation();
ALTER TABLE aw_public_text_curations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON aw_public_text_curations FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON aw_public_text_curations FROM authenticated; END IF;
END $$;
