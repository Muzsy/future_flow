-- Private preparation only. A text review never authorizes these executable facts.
CREATE TABLE aw_public_fork_checkpoints (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  draft_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK(source_revision>=0),
  snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
  decision_key text NOT NULL CHECK(decision_key ~ '^decision-[1-9][0-9]{0,2}$'),
  checkpoint jsonb NOT NULL CHECK(jsonb_typeof(checkpoint)='object' AND octet_length(checkpoint::text)<=65536),
  checkpoint_hash text NOT NULL CHECK(checkpoint_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'awaiting_review' CHECK(status='awaiting_review'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,user_id),
  UNIQUE(draft_id,decision_key,checkpoint_hash),
  FOREIGN KEY(draft_id,user_id) REFERENCES aw_publication_drafts(id,user_id) ON DELETE CASCADE
);
CREATE TRIGGER aw_public_fork_checkpoints_immutable BEFORE UPDATE ON aw_public_fork_checkpoints
  FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
ALTER TABLE aw_public_fork_checkpoints ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON aw_public_fork_checkpoints FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON aw_public_fork_checkpoints FROM authenticated; END IF;
END $$;
