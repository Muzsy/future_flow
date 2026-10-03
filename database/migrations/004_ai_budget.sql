CREATE TABLE aw_budget_accounts (
  id text PRIMARY KEY, user_id uuid REFERENCES ff_users ON DELETE CASCADE,
  limit_micro bigint NOT NULL CHECK(limit_micro>=0), accounted_micro bigint NOT NULL CHECK(accounted_micro>=0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE aw_budget_reservations (
  id uuid PRIMARY KEY, user_id uuid REFERENCES ff_users ON DELETE CASCADE,
  project_key text NOT NULL REFERENCES aw_budget_accounts,
  user_key text REFERENCES aw_budget_accounts ON DELETE SET NULL,
  job_id uuid NOT NULL, model text NOT NULL, task text NOT NULL,
  reserved_micro bigint NOT NULL CHECK(reserved_micro>=0), accounted_micro bigint NOT NULL CHECK(accounted_micro>=0),
  status text NOT NULL CHECK(status IN ('reserved','completed','unknown')),
  input_tokens integer, output_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz
);
ALTER TABLE aw_budget_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE aw_budget_reservations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON aw_budget_accounts,aw_budget_reservations FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON aw_budget_accounts,aw_budget_reservations FROM authenticated; END IF;
END $$;
