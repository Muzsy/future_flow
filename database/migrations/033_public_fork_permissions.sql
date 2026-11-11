CREATE TABLE aw_public_fork_permissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 community_publication_id uuid UNIQUE REFERENCES aw_publications(id) ON DELETE CASCADE,
 official_publication_id uuid UNIQUE REFERENCES aw_official_publications(id) ON DELETE CASCADE,
 CHECK((community_publication_id IS NOT NULL)::integer+(official_publication_id IS NOT NULL)::integer=1),
 publication_revision integer NOT NULL CHECK(publication_revision>=1),
 snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
 permission_revision integer NOT NULL CHECK(permission_revision>=1),
 allowed boolean NOT NULL,
 last_request_hash text NOT NULL CHECK(last_request_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE aw_public_fork_permission_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 permission_id uuid NOT NULL REFERENCES aw_public_fork_permissions(id) ON DELETE CASCADE,
 permission_revision integer NOT NULL CHECK(permission_revision>=1),
 publication_revision integer NOT NULL CHECK(publication_revision>=1),
 snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
 allowed boolean NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 actor_label text NOT NULL CHECK(length(actor_label) BETWEEN 3 AND 120),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(permission_id,permission_revision)
);
CREATE TRIGGER aw_public_fork_permission_actions_immutable BEFORE UPDATE ON aw_public_fork_permission_actions FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
ALTER TABLE aw_public_fork_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE aw_public_fork_permission_actions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON aw_public_fork_permissions,aw_public_fork_permission_actions FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON aw_public_fork_permissions,aw_public_fork_permission_actions FROM authenticated; END IF;
END $$;
