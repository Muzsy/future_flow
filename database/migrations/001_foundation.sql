CREATE TABLE ff_users (
  id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleting')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ff_questionnaires (
  version text PRIMARY KEY, definition jsonb NOT NULL, definition_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ff_profile_drafts (
  user_id uuid PRIMARY KEY REFERENCES ff_users ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  questionnaire_version text NOT NULL REFERENCES ff_questionnaires(version),
  answers jsonb NOT NULL DEFAULT '{}', relationships jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ff_profile_versions (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  version_no integer NOT NULL, draft_revision integer NOT NULL, schema_version text NOT NULL,
  questionnaire_version text NOT NULL REFERENCES ff_questionnaires(version), scoring_version text NOT NULL,
  snapshot jsonb NOT NULL, answers jsonb NOT NULL, snapshot_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, version_no), UNIQUE (user_id, draft_revision), UNIQUE (id, user_id)
);
CREATE TABLE ff_world_versions (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  version text NOT NULL, snapshot jsonb NOT NULL, snapshot_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (id, user_id)
);
CREATE TABLE ff_futures (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  profile_version_id uuid NOT NULL, world_version_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Új életág', horizon_start date NOT NULL, horizon_end date NOT NULL,
  simulation_version text NOT NULL, root_branch_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','completed','failed')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (id, user_id),
  FOREIGN KEY (profile_version_id,user_id) REFERENCES ff_profile_versions(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY (world_version_id,user_id) REFERENCES ff_world_versions(id,user_id) ON DELETE CASCADE,
  CHECK (horizon_end > horizon_start)
);
CREATE TABLE ff_branches (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  future_id uuid NOT NULL, parent_branch_id uuid, fork_event_id uuid,
  name text NOT NULL, seed bigint NOT NULL, status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','completed','failed')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (id,user_id), UNIQUE (id,future_id,user_id),
  FOREIGN KEY (future_id,user_id) REFERENCES ff_futures(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_branch_id,future_id,user_id) REFERENCES ff_branches(id,future_id,user_id),
  CHECK ((parent_branch_id IS NULL) = (fork_event_id IS NULL))
);
ALTER TABLE ff_futures ADD CONSTRAINT ff_root_branch FOREIGN KEY (root_branch_id,id,user_id) REFERENCES ff_branches(id,future_id,user_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE ff_life_states (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  branch_id uuid NOT NULL, sequence_no integer NOT NULL CHECK (sequence_no >= 0),
  effective_at date NOT NULL, state jsonb NOT NULL, state_hash text NOT NULL,
  UNIQUE (branch_id,sequence_no), UNIQUE (id,branch_id,user_id),
  FOREIGN KEY (branch_id,user_id) REFERENCES ff_branches(id,user_id) ON DELETE CASCADE
);
CREATE TABLE ff_events (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  branch_id uuid NOT NULL, sequence_no integer NOT NULL CHECK (sequence_no > 0),
  event_key text NOT NULL, effective_at date NOT NULL, canon jsonb NOT NULL,
  state_before_id uuid NOT NULL, state_after_id uuid NOT NULL,
  UNIQUE (branch_id,sequence_no), UNIQUE (branch_id,event_key), UNIQUE (id,branch_id,user_id),
  FOREIGN KEY (branch_id,user_id) REFERENCES ff_branches(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY (state_before_id,branch_id,user_id) REFERENCES ff_life_states(id,branch_id,user_id),
  FOREIGN KEY (state_after_id,branch_id,user_id) REFERENCES ff_life_states(id,branch_id,user_id)
);
ALTER TABLE ff_branches ADD CONSTRAINT ff_fork_event FOREIGN KEY (fork_event_id,parent_branch_id,user_id) REFERENCES ff_events(id,branch_id,user_id);
CREATE TABLE ff_decisions (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  branch_id uuid NOT NULL, event_id uuid NOT NULL, prompt text NOT NULL,
  UNIQUE (event_id), UNIQUE (id,user_id),
  FOREIGN KEY (event_id,branch_id,user_id) REFERENCES ff_events(id,branch_id,user_id) ON DELETE CASCADE
);
CREATE TABLE ff_decision_options (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  decision_id uuid NOT NULL, option_key text NOT NULL, payload jsonb NOT NULL,
  UNIQUE (decision_id,option_key), UNIQUE (id,decision_id,user_id),
  FOREIGN KEY (decision_id,user_id) REFERENCES ff_decisions(id,user_id) ON DELETE CASCADE
);
CREATE TABLE ff_decision_resolutions (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  decision_id uuid NOT NULL, option_id uuid NOT NULL, child_branch_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (child_branch_id),
  FOREIGN KEY (option_id,decision_id,user_id) REFERENCES ff_decision_options(id,decision_id,user_id),
  FOREIGN KEY (child_branch_id,user_id) REFERENCES ff_branches(id,user_id) ON DELETE CASCADE
);
CREATE TABLE ff_chapters (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  branch_id uuid NOT NULL, chapter_no integer NOT NULL, payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (branch_id,chapter_no), UNIQUE (id,user_id),
  FOREIGN KEY (branch_id,user_id) REFERENCES ff_branches(id,user_id) ON DELETE CASCADE
);
CREATE TABLE ff_chapter_events (
  chapter_id uuid NOT NULL REFERENCES ff_chapters ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES ff_events ON DELETE CASCADE,
  PRIMARY KEY (chapter_id,event_id)
);
CREATE TABLE ff_jobs (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  branch_id uuid NOT NULL, job_type text NOT NULL CHECK (job_type IN ('future','branch')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','validating','completed','failed','cancelled')),
  stage text NOT NULL DEFAULT 'QUEUED', payload jsonb NOT NULL, checkpoints jsonb NOT NULL DEFAULT '{}',
  attempt integer NOT NULL DEFAULT 0, lease_token uuid, lease_until timestamptz,
  error_code text, error_message_safe text,
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  FOREIGN KEY (branch_id,user_id) REFERENCES ff_branches(id,user_id) ON DELETE CASCADE
);
CREATE INDEX ff_job_claim ON ff_jobs(status,lease_until,created_at);
CREATE TABLE ff_idempotency (
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  scope text NOT NULL, key text NOT NULL, input_hash text NOT NULL, response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id,scope,key)
);
CREATE TABLE ff_ai_runs (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES ff_jobs ON DELETE CASCADE, metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ff_consents (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  policy_version text NOT NULL, consent_type text NOT NULL, accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id,policy_version,consent_type)
);
CREATE FUNCTION ff_prevent_canon_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Canonical data is immutable'; END; $$;
CREATE TRIGGER ff_profiles_immutable BEFORE UPDATE ON ff_profile_versions FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
CREATE TRIGGER ff_world_immutable BEFORE UPDATE ON ff_world_versions FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
CREATE TRIGGER ff_events_immutable BEFORE UPDATE ON ff_events FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
CREATE TRIGGER ff_states_immutable BEFORE UPDATE ON ff_life_states FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
CREATE TRIGGER ff_questionnaires_immutable BEFORE UPDATE ON ff_questionnaires FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();

-- Clients use NestJS. No browser gets direct access to canonical tables.
DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'ff_%' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', item.tablename);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',item.tablename); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',item.tablename); END IF;
  END LOOP;
END $$;
