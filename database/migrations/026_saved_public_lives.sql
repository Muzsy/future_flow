-- Saves are private pointers, never a second copy of a public story.
CREATE TABLE aw_saved_lives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES ff_users(id) ON DELETE CASCADE,
  community_publication_id uuid REFERENCES aw_publications(id) ON DELETE CASCADE,
  official_publication_id uuid REFERENCES aw_official_publications(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((community_publication_id IS NOT NULL)::integer + (official_publication_id IS NOT NULL)::integer = 1),
  UNIQUE(user_id,community_publication_id),
  UNIQUE(user_id,official_publication_id)
);
CREATE INDEX aw_saved_lives_owner ON aw_saved_lives(user_id,created_at DESC,id);
ALTER TABLE aw_saved_lives ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON aw_saved_lives FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON aw_saved_lives FROM authenticated; END IF;
END $$;
