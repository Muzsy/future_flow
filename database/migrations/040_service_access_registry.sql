-- Generated with Supabase CLI 2.122.0 migration new service_access_registry
-- (20261101184622), then normalized to this repository's numbered SQL ledger.
-- No initial policy/admissions: a migration must never grant service access.
CREATE TABLE aw_service_policy (
  id integer PRIMARY KEY CHECK(id=1),
  version integer NOT NULL CHECK(version=1),
  revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
  mode text NOT NULL CHECK(mode IN ('invitation','open')),
  generation_enabled boolean NOT NULL,
  checkout_enabled boolean NOT NULL,
  reconcile_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE aw_service_admissions (
  user_id uuid PRIMARY KEY REFERENCES ff_users(id) ON DELETE CASCADE,
  revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
  state text NOT NULL CHECK(state IN ('active','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['aw_service_policy','aw_service_admissions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',item);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',item);
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',item); END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',item); END IF;
  END LOOP;
END $$;
