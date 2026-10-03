-- Additive v2 storage. Existing v1 canon and job semantics are untouched.
CREATE TABLE aw_lives (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  title text NOT NULL, content_locale text NOT NULL CHECK(content_locale IN ('en','hu')),
  input jsonb NOT NULL, root_branch_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id)
);
CREATE TABLE aw_branches (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  life_id uuid NOT NULL, parent_branch_id uuid, fork_period_id uuid,
  name text NOT NULL, revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
  state jsonb NOT NULL, accepted_decision_ids jsonb NOT NULL DEFAULT '[]',
  pending_decision jsonb,
  status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','generating','decision','failed')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id), UNIQUE(id,life_id,user_id),
  FOREIGN KEY(life_id,user_id) REFERENCES aw_lives(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(parent_branch_id,life_id,user_id) REFERENCES aw_branches(id,life_id,user_id)
);
CREATE TABLE aw_periods (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  life_id uuid NOT NULL, branch_id uuid NOT NULL, period_no integer NOT NULL CHECK(period_no>0),
  base_revision integer NOT NULL, candidate jsonb NOT NULL, events jsonb NOT NULL,
  start_state jsonb NOT NULL, end_state jsonb NOT NULL, accepted_before jsonb NOT NULL,
  chapter jsonb NOT NULL, canon_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id), UNIQUE(id,life_id,user_id),
  UNIQUE(branch_id,period_no),
  FOREIGN KEY(branch_id,life_id,user_id) REFERENCES aw_branches(id,life_id,user_id) ON DELETE CASCADE
);
ALTER TABLE aw_branches ADD FOREIGN KEY(fork_period_id,life_id,user_id) REFERENCES aw_periods(id,life_id,user_id);
ALTER TABLE aw_lives ADD FOREIGN KEY(root_branch_id,user_id) REFERENCES aw_branches(id,user_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE aw_history (
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  life_id uuid NOT NULL, branch_id uuid NOT NULL, period_id uuid NOT NULL,
  position integer NOT NULL CHECK(position>0), PRIMARY KEY(branch_id,position), UNIQUE(branch_id,period_id),
  FOREIGN KEY(branch_id,life_id,user_id) REFERENCES aw_branches(id,life_id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(period_id,life_id,user_id) REFERENCES aw_periods(id,life_id,user_id) ON DELETE CASCADE
);
CREATE TABLE aw_choices (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  life_id uuid NOT NULL, branch_id uuid NOT NULL, period_id uuid NOT NULL,
  decision_id uuid NOT NULL, option_id uuid NOT NULL, payload jsonb NOT NULL, state_after jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(branch_id,decision_id),
  FOREIGN KEY(branch_id,life_id,user_id) REFERENCES aw_branches(id,life_id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(period_id,life_id,user_id) REFERENCES aw_periods(id,life_id,user_id) ON DELETE CASCADE
);
CREATE TABLE aw_jobs (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  life_id uuid NOT NULL, branch_id uuid NOT NULL, base_revision integer NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','cancelled')),
  stage text NOT NULL DEFAULT 'QUEUED', payload jsonb NOT NULL, checkpoints jsonb NOT NULL DEFAULT '{}',
  attempt integer NOT NULL DEFAULT 0, lease_token uuid, lease_until timestamptz,
  error_code text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  FOREIGN KEY(branch_id,life_id,user_id) REFERENCES aw_branches(id,life_id,user_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX aw_one_active_job ON aw_jobs(branch_id) WHERE status IN ('queued','running');
CREATE INDEX aw_job_claim ON aw_jobs(status,lease_until,created_at);
CREATE TABLE aw_ai_runs (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES aw_jobs ON DELETE CASCADE, metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE aw_drafts (
  user_id uuid PRIMARY KEY REFERENCES ff_users ON DELETE CASCADE,
  revision integer NOT NULL CHECK(revision>0), payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE aw_metrics (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  life_id uuid NOT NULL, branch_id uuid NOT NULL, kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(branch_id,life_id,user_id) REFERENCES aw_branches(id,life_id,user_id) ON DELETE CASCADE
);
CREATE TRIGGER aw_lives_immutable BEFORE UPDATE ON aw_lives FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
CREATE TRIGGER aw_periods_immutable BEFORE UPDATE ON aw_periods FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
CREATE TRIGGER aw_choices_immutable BEFORE UPDATE ON aw_choices FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
CREATE TRIGGER aw_history_immutable BEFORE UPDATE ON aw_history FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'aw_%' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',item.tablename);
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',item.tablename); END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',item.tablename); END IF;
  END LOOP;
END $$;
