-- Owner-only immutable story + explicitly selected checkpoint preparations.
CREATE UNIQUE INDEX aw_public_fork_checkpoints_owner_draft ON aw_public_fork_checkpoints(id,user_id,draft_id);
CREATE TABLE aw_public_content_bundles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  draft_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK(source_revision>=0),
  snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  content jsonb NOT NULL CHECK(jsonb_typeof(content)='object' AND octet_length(content::text)<=1048576),
  status text NOT NULL DEFAULT 'awaiting_review' CHECK(status='awaiting_review'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,user_id,draft_id),
  UNIQUE(draft_id,content_hash),
  FOREIGN KEY(draft_id,user_id) REFERENCES aw_publication_drafts(id,user_id) ON DELETE CASCADE
);
CREATE TABLE aw_public_content_bundle_checkpoints (
  bundle_id uuid NOT NULL,
  checkpoint_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  draft_id uuid NOT NULL,
  decision_key text NOT NULL CHECK(decision_key ~ '^decision-[1-9][0-9]{0,2}$'),
  ordinal integer NOT NULL CHECK(ordinal>=0 AND ordinal<12),
  PRIMARY KEY(bundle_id,decision_key),
  UNIQUE(bundle_id,checkpoint_id),
  UNIQUE(bundle_id,ordinal),
  FOREIGN KEY(bundle_id,user_id,draft_id) REFERENCES aw_public_content_bundles(id,user_id,draft_id) ON DELETE CASCADE,
  FOREIGN KEY(checkpoint_id,user_id,draft_id) REFERENCES aw_public_fork_checkpoints(id,user_id,draft_id) ON DELETE CASCADE
);
CREATE TRIGGER aw_public_content_bundles_immutable BEFORE UPDATE ON aw_public_content_bundles
  FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
CREATE TRIGGER aw_public_content_bundle_checkpoints_immutable BEFORE UPDATE ON aw_public_content_bundle_checkpoints
  FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
ALTER TABLE aw_public_content_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE aw_public_content_bundle_checkpoints ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON aw_public_content_bundles,aw_public_content_bundle_checkpoints FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON aw_public_content_bundles,aw_public_content_bundle_checkpoints FROM authenticated; END IF;
END $$;
