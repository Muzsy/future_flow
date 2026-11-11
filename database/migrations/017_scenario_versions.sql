-- Owner-only executable templates. Publication and Official provenance are separate gates.
CREATE TABLE aw_scenarios (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  current_version integer NOT NULL CHECK(current_version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,user_id)
);
CREATE TABLE aw_scenario_versions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  scenario_id uuid NOT NULL,
  version integer NOT NULL CHECK(version>0),
  schema_version text NOT NULL CHECK(schema_version='scenario-1'),
  content_locale text NOT NULL CHECK(content_locale='en'),
  template jsonb NOT NULL CHECK(jsonb_typeof(template)='object' AND octet_length(template::text)<=65536),
  template_hash text NOT NULL CHECK(template_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'awaiting_review' CHECK(status='awaiting_review'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,user_id),
  UNIQUE(scenario_id,version),
  FOREIGN KEY(scenario_id,user_id) REFERENCES aw_scenarios(id,user_id) ON DELETE CASCADE
);
ALTER TABLE aw_scenarios ADD CONSTRAINT aw_scenarios_current_version_fk
  FOREIGN KEY(id,current_version) REFERENCES aw_scenario_versions(scenario_id,version)
  DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE aw_scenario_starts (
  life_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  scenario_version_id uuid NOT NULL,
  template_hash text NOT NULL CHECK(template_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(life_id,user_id) REFERENCES aw_lives(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(scenario_version_id,user_id) REFERENCES aw_scenario_versions(id,user_id) ON DELETE CASCADE
);
CREATE TRIGGER aw_scenario_versions_immutable BEFORE UPDATE ON aw_scenario_versions
  FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
CREATE TRIGGER aw_scenario_starts_immutable BEFORE UPDATE ON aw_scenario_starts
  FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
ALTER TABLE aw_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE aw_scenario_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE aw_scenario_starts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON aw_scenarios,aw_scenario_versions,aw_scenario_starts FROM anon;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON aw_scenarios,aw_scenario_versions,aw_scenario_starts FROM authenticated;
  END IF;
END $$;
