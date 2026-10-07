CREATE TABLE aw_public_exposures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_publication_id uuid UNIQUE REFERENCES aw_publications(id) ON DELETE CASCADE,
  official_publication_id uuid UNIQUE REFERENCES aw_official_publications(id) ON DELETE CASCADE,
  CHECK ((community_publication_id IS NOT NULL)::integer + (official_publication_id IS NOT NULL)::integer = 1),
  publication_revision integer NOT NULL CHECK(publication_revision>=1),
  snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
  permission_revision integer NOT NULL CHECK(permission_revision>=1),
  mode text NOT NULL CHECK(mode IN ('none','preview','index')),
  last_request_hash text NOT NULL CHECK(last_request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE aw_public_exposure_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exposure_id uuid NOT NULL REFERENCES aw_public_exposures(id) ON DELETE CASCADE,
  permission_revision integer NOT NULL CHECK(permission_revision>=1),
  publication_revision integer NOT NULL CHECK(publication_revision>=1),
  snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
  mode text NOT NULL CHECK(mode IN ('none','preview','index')),
  request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  actor_label text NOT NULL CHECK(length(actor_label) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(exposure_id,permission_revision)
);
CREATE TRIGGER aw_public_exposure_actions_immutable BEFORE UPDATE ON aw_public_exposure_actions FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
CREATE INDEX aw_public_exposures_indexed ON aw_public_exposures(id) WHERE mode='index';
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['aw_public_exposures','aw_public_exposure_actions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',item);
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',item); END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',item); END IF;
  END LOOP;
END $$;
