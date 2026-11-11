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
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Bounded open admission: a monotone counter of accounts admitted through
  -- the open path (operator-created admissions never count). Deleting an
  -- account or revoking an admission never frees a slot. Open mode requires a
  -- remaining slot, so the policy cannot be left open once capacity is spent.
  admission_capacity bigint NOT NULL DEFAULT 0 CHECK(admission_capacity BETWEEN 0 AND 100000),
  admission_used bigint NOT NULL DEFAULT 0 CHECK(admission_used>=0),
  CHECK(admission_used<=admission_capacity),
  CHECK(mode<>'open' OR admission_used<admission_capacity)
);

CREATE TABLE aw_service_admissions (
  user_id uuid PRIMARY KEY REFERENCES ff_users(id) ON DELETE CASCADE,
  revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
  state text NOT NULL CHECK(state IN ('active','revoked')),
  -- Set once, in the same transaction as an open admission, when the account
  -- took one of the first ten open slots (admission_used <= 10). Operator
  -- admissions are never eligible. Revocation/deletion never moves it to
  -- another account. Billing reads it; nothing here grants or applies a price.
  launch_discount_eligible boolean NOT NULL DEFAULT false,
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
