CREATE TABLE aw_publication_refreshes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES ff_users(id) ON DELETE CASCADE,
  classification text NOT NULL CHECK(classification IN ('community','official')),
  previous_community_id uuid UNIQUE,
  next_community_id uuid UNIQUE,
  previous_official_id uuid UNIQUE,
  next_official_id uuid UNIQUE,
  CHECK ((classification='community' AND previous_community_id IS NOT NULL AND next_community_id IS NOT NULL AND previous_official_id IS NULL AND next_official_id IS NULL AND previous_community_id<>next_community_id)
    OR (classification='official' AND previous_official_id IS NOT NULL AND next_official_id IS NOT NULL AND previous_community_id IS NULL AND next_community_id IS NULL AND previous_official_id<>next_official_id)),
  previous_revision integer NOT NULL CHECK(previous_revision>=1),
  previous_snapshot_hash text NOT NULL CHECK(previous_snapshot_hash ~ '^[a-f0-9]{64}$'),
  preview_id uuid NOT NULL,
  preview_hash text NOT NULL CHECK(preview_hash ~ '^[a-f0-9]{64}$'),
  request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(previous_community_id,user_id) REFERENCES aw_publications(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(next_community_id,user_id) REFERENCES aw_publications(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(previous_official_id,user_id) REFERENCES aw_official_publications(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(next_official_id,user_id) REFERENCES aw_official_publications(id,user_id) ON DELETE CASCADE
);
CREATE TRIGGER aw_publication_refreshes_immutable BEFORE UPDATE ON aw_publication_refreshes FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
ALTER TABLE aw_publication_refreshes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON aw_publication_refreshes FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON aw_publication_refreshes FROM authenticated; END IF;
END $$;
