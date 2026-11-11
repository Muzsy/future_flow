CREATE TABLE aw_public_collections (
  collection_key text PRIMARY KEY CHECK(collection_key IN ('featured','community-picks','turning-points')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
  last_request_hash text CHECK(last_request_hash IS NULL OR last_request_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO aw_public_collections(collection_key) VALUES('featured'),('community-picks'),('turning-points');
CREATE TABLE aw_public_collection_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_key text NOT NULL REFERENCES aw_public_collections(collection_key),
  position integer NOT NULL CHECK(position BETWEEN 0 AND 23),
  community_publication_id uuid REFERENCES aw_publications(id) ON DELETE CASCADE,
  official_publication_id uuid REFERENCES aw_official_publications(id) ON DELETE CASCADE,
  CHECK ((community_publication_id IS NOT NULL)::integer + (official_publication_id IS NOT NULL)::integer = 1),
  UNIQUE(collection_key,position),
  UNIQUE(collection_key,community_publication_id),
  UNIQUE(collection_key,official_publication_id)
);
CREATE TABLE aw_public_collection_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_key text NOT NULL REFERENCES aw_public_collections(collection_key),
  revision integer NOT NULL CHECK(revision>=2),
  request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  actor_label text NOT NULL CHECK(length(actor_label) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(collection_key,revision)
);
CREATE TRIGGER aw_public_collection_actions_immutable BEFORE UPDATE ON aw_public_collection_actions FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['aw_public_collections','aw_public_collection_entries','aw_public_collection_actions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',item);
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',item); END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',item); END IF;
  END LOOP;
END $$;
