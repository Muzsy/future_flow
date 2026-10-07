-- Private, explicit reader-supplied profiles; no profile enters a public Scenario.
CREATE TABLE aw_personal_scenario_previews (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  publication_id uuid NOT NULL REFERENCES aw_scenario_publications ON DELETE CASCADE,
  source_slug text NOT NULL CHECK(source_slug ~ '^scenario-[a-f0-9]{32}$'),
  template_hash text NOT NULL CHECK(template_hash ~ '^[a-f0-9]{64}$'),
  profile_hash text NOT NULL CHECK(profile_hash ~ '^[a-f0-9]{64}$'),
  preview_hash text NOT NULL CHECK(preview_hash ~ '^[a-f0-9]{64}$'),
  profile jsonb NOT NULL CHECK(jsonb_typeof(profile)='object'),
  composition jsonb NOT NULL CHECK(jsonb_typeof(composition)='object'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,user_id),
  CHECK(expires_at>created_at)
);
CREATE INDEX aw_personal_scenario_preview_expiry ON aw_personal_scenario_previews(expires_at);
CREATE TRIGGER aw_personal_scenario_preview_immutable BEFORE UPDATE ON aw_personal_scenario_previews FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
CREATE TABLE aw_personal_scenario_starts (
  life_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  publication_id uuid REFERENCES aw_scenario_publications ON DELETE SET NULL,
  preview_id uuid UNIQUE,
  source_slug text NOT NULL CHECK(source_slug ~ '^scenario-[a-f0-9]{32}$'),
  template_hash text NOT NULL CHECK(template_hash ~ '^[a-f0-9]{64}$'),
  profile_hash text NOT NULL CHECK(profile_hash ~ '^[a-f0-9]{64}$'),
  preview_hash text NOT NULL CHECK(preview_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(preview_id,user_id) REFERENCES aw_personal_scenario_previews(id,user_id) ON DELETE SET NULL(preview_id),
  FOREIGN KEY(life_id,user_id) REFERENCES aw_lives(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(branch_id,life_id,user_id) REFERENCES aw_branches(id,life_id,user_id) ON DELETE CASCADE
);
CREATE INDEX aw_personal_scenario_start_source ON aw_personal_scenario_starts(publication_id) WHERE publication_id IS NOT NULL;
CREATE FUNCTION aw_protect_personal_scenario_start() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.life_id,NEW.user_id,NEW.branch_id,NEW.source_slug,NEW.template_hash,NEW.profile_hash,NEW.preview_hash,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.life_id,OLD.user_id,OLD.branch_id,OLD.source_slug,OLD.template_hash,OLD.profile_hash,OLD.preview_hash,OLD.created_at)
    OR (NEW.publication_id IS DISTINCT FROM OLD.publication_id AND NEW.publication_id IS NOT NULL)
    OR (NEW.preview_id IS DISTINCT FROM OLD.preview_id AND NEW.preview_id IS NOT NULL)
  THEN RAISE EXCEPTION 'Personal Scenario start is immutable except source/expired-preview detachment'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_personal_scenario_start_immutable BEFORE UPDATE ON aw_personal_scenario_starts FOR EACH ROW EXECUTE FUNCTION aw_protect_personal_scenario_start();
ALTER TABLE aw_personal_scenario_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE aw_personal_scenario_starts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON aw_personal_scenario_previews,aw_personal_scenario_starts FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON aw_personal_scenario_previews,aw_personal_scenario_starts FROM authenticated; END IF;
END $$;
