-- Preparation only. No public reads, permissions, tokens or active publication yet.
CREATE TABLE aw_publication_drafts (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  life_id uuid NOT NULL, branch_id uuid NOT NULL, source_revision integer NOT NULL CHECK(source_revision>=0),
  snapshot jsonb NOT NULL, snapshot_hash text NOT NULL, scan_version text NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_review' CHECK(status='awaiting_review'),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,user_id),
  FOREIGN KEY(branch_id,life_id,user_id) REFERENCES aw_branches(id,life_id,user_id) ON DELETE CASCADE
);
CREATE TABLE aw_scenario_drafts (
  id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  source_draft_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),
  content_locale text NOT NULL CHECK(content_locale IN ('en','hu')),
  template jsonb NOT NULL,template_hash text NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_review' CHECK(status='awaiting_review'),
  created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(source_draft_id,version),
  FOREIGN KEY(source_draft_id,user_id) REFERENCES aw_publication_drafts(id,user_id) ON DELETE CASCADE
);
CREATE TRIGGER aw_publication_drafts_immutable BEFORE UPDATE ON aw_publication_drafts FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
CREATE TRIGGER aw_scenario_drafts_immutable BEFORE UPDATE ON aw_scenario_drafts FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
ALTER TABLE aw_publication_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE aw_scenario_drafts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON aw_publication_drafts,aw_scenario_drafts FROM anon;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON aw_publication_drafts,aw_scenario_drafts FROM authenticated;
  END IF;
END $$;
