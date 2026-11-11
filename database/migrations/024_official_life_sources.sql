-- Prospective trusted seed start and exact, revocable Official LIFE provenance.
-- No public reader, classification or publication right is created here.
ALTER TABLE aw_public_content_bundles ADD CONSTRAINT aw_official_bundle_owner UNIQUE(id,user_id);
CREATE TABLE aw_official_life_starts (
  life_id uuid PRIMARY KEY REFERENCES aw_scenario_starts(life_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  scenario_version_id uuid NOT NULL,
  scenario_grant_id uuid NOT NULL REFERENCES aw_official_scenario_sources(id) ON DELETE CASCADE,
  initial_job_id uuid NOT NULL REFERENCES aw_jobs(id) ON DELETE CASCADE,
  template_hash text NOT NULL CHECK(template_hash ~ '^[a-f0-9]{64}$'),
  initial_input_hash text NOT NULL CHECK(initial_input_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(life_id,user_id), UNIQUE(life_id,branch_id,user_id),
  FOREIGN KEY(branch_id,life_id,user_id) REFERENCES aw_branches(id,life_id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(scenario_version_id,user_id) REFERENCES aw_scenario_versions(id,user_id) ON DELETE CASCADE
);
CREATE TRIGGER aw_official_life_start_immutable BEFORE UPDATE ON aw_official_life_starts FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
CREATE TABLE aw_official_life_sources (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  life_id uuid NOT NULL, branch_id uuid NOT NULL,
  bundle_id uuid NOT NULL, curation_id uuid NOT NULL,
  source_version text NOT NULL CHECK(source_version='official-life-source-1'),
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object' AND octet_length(evidence::text)<=131072),
  evidence_hash text NOT NULL CHECK(evidence_hash ~ '^[a-f0-9]{64}$'),
  request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  actor_label text NOT NULL CHECK(char_length(btrim(actor_label)) BETWEEN 3 AND 80),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz, revoke_reason text CHECK(revoke_reason IN ('privacy','content','quality','meaning','origin','other','account_deletion')),
  revoke_actor text,
  UNIQUE(bundle_id,source_version), UNIQUE(id,user_id,bundle_id),
  FOREIGN KEY(life_id,branch_id,user_id) REFERENCES aw_official_life_starts(life_id,branch_id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(bundle_id,user_id) REFERENCES aw_public_content_bundles(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(curation_id,user_id,bundle_id) REFERENCES aw_public_content_curations(id,user_id,bundle_id) ON DELETE CASCADE,
  CHECK((status='active' AND revoked_at IS NULL AND revoke_reason IS NULL AND revoke_actor IS NULL) OR
    (status='revoked' AND revoked_at IS NOT NULL AND revoke_reason IS NOT NULL AND revoke_actor IS NOT NULL AND char_length(btrim(revoke_actor)) BETWEEN 3 AND 80))
);
CREATE FUNCTION aw_protect_official_life_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status<>'active' OR NEW.status<>'revoked' OR
    ROW(NEW.id,NEW.user_id,NEW.life_id,NEW.branch_id,NEW.bundle_id,NEW.curation_id,NEW.source_version,NEW.content_hash,NEW.evidence,NEW.evidence_hash,NEW.request_hash,NEW.actor_label,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.life_id,OLD.branch_id,OLD.bundle_id,OLD.curation_id,OLD.source_version,OLD.content_hash,OLD.evidence,OLD.evidence_hash,OLD.request_hash,OLD.actor_label,OLD.created_at)
  THEN RAISE EXCEPTION 'Official life source is immutable except terminal revocation'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_official_life_source_immutable BEFORE UPDATE ON aw_official_life_sources FOR EACH ROW EXECUTE FUNCTION aw_protect_official_life_source();
ALTER TABLE aw_official_life_starts ENABLE ROW LEVEL SECURITY;
ALTER TABLE aw_official_life_sources ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON aw_official_life_starts,aw_official_life_sources FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON aw_official_life_starts,aw_official_life_sources FROM authenticated; END IF;
END $$;
