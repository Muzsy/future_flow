-- Private full-template review and a separate trusted Official SCENARIO source grant.
-- Neither is publication approval or Official LIFE provenance.
CREATE TABLE aw_scenario_reviews (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  scenario_version_id uuid NOT NULL,
  template_hash text NOT NULL CHECK(template_hash ~ '^[a-f0-9]{64}$'),
  input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
  policy_version text NOT NULL CHECK(policy_version='scenario-review-1'),
  status text NOT NULL CHECK(status IN ('running','completed','failed','cancelled')),
  lease_token uuid,
  lease_until timestamptz,
  report jsonb, report_hash text CHECK(report_hash ~ '^[a-f0-9]{64}$'), receipt jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  UNIQUE(scenario_version_id,policy_version),
  UNIQUE(id,user_id,scenario_version_id),
  FOREIGN KEY(scenario_version_id,user_id) REFERENCES aw_scenario_versions(id,user_id) ON DELETE CASCADE,
  CHECK ((status='running' AND lease_token IS NOT NULL AND lease_until IS NOT NULL AND finished_at IS NULL AND report IS NULL AND report_hash IS NULL AND receipt IS NULL) OR
    (status='completed' AND lease_token IS NULL AND lease_until IS NULL AND finished_at IS NOT NULL AND jsonb_typeof(report)='object' AND report IS NOT NULL AND report_hash IS NOT NULL AND jsonb_typeof(receipt)='object' AND receipt IS NOT NULL) OR
    (status IN ('failed','cancelled') AND lease_token IS NULL AND lease_until IS NULL AND finished_at IS NOT NULL AND report IS NULL AND report_hash IS NULL AND receipt IS NULL))
);
CREATE FUNCTION aw_protect_scenario_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status<>'running' OR NEW.status='running' OR
    ROW(NEW.id,NEW.user_id,NEW.scenario_version_id,NEW.template_hash,NEW.input_hash,NEW.policy_version,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.scenario_version_id,OLD.template_hash,OLD.input_hash,OLD.policy_version,OLD.created_at)
  THEN RAISE EXCEPTION 'Scenario review binding/result is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_scenario_review_immutable BEFORE UPDATE ON aw_scenario_reviews FOR EACH ROW EXECUTE FUNCTION aw_protect_scenario_review();
CREATE TABLE aw_scenario_curations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  scenario_version_id uuid NOT NULL,
  review_id uuid NOT NULL,
  template_hash text NOT NULL CHECK(template_hash ~ '^[a-f0-9]{64}$'),
  report_hash text NOT NULL CHECK(report_hash ~ '^[a-f0-9]{64}$'),
  policy_version text NOT NULL CHECK(policy_version='scenario-review-1'),
  curation_version text NOT NULL CHECK(curation_version='scenario-curation-1'),
  status text NOT NULL CHECK(status IN ('scenario_reviewed','changes_requested','rejected')),
  reason_code text CHECK(reason_code IN ('privacy','content','quality','meaning','origin','other')),
  actor_label text NOT NULL CHECK(char_length(btrim(actor_label)) BETWEEN 3 AND 80),
  decision_hash text NOT NULL CHECK(decision_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scenario_version_id,curation_version),
  UNIQUE(id,user_id,scenario_version_id),
  FOREIGN KEY(review_id,user_id,scenario_version_id) REFERENCES aw_scenario_reviews(id,user_id,scenario_version_id) ON DELETE CASCADE,
  CHECK((status='scenario_reviewed' AND reason_code IS NULL) OR (status<>'scenario_reviewed' AND reason_code IS NOT NULL))
);
CREATE TRIGGER aw_scenario_curation_immutable BEFORE UPDATE ON aw_scenario_curations FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
CREATE TABLE aw_official_scenario_sources (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  scenario_version_id uuid NOT NULL,
  curation_id uuid NOT NULL,
  source_version text NOT NULL CHECK(source_version='official-scenario-source-1'),
  template_hash text NOT NULL CHECK(template_hash ~ '^[a-f0-9]{64}$'),
  request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  actor_label text NOT NULL CHECK(char_length(btrim(actor_label)) BETWEEN 3 AND 80),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  revoked_at timestamptz, revoke_reason text CHECK(revoke_reason IN ('privacy','content','quality','meaning','origin','other','account_deletion')),
  revoke_actor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scenario_version_id,source_version),
  FOREIGN KEY(curation_id,user_id,scenario_version_id) REFERENCES aw_scenario_curations(id,user_id,scenario_version_id) ON DELETE CASCADE,
  CHECK((status='active' AND revoked_at IS NULL AND revoke_reason IS NULL AND revoke_actor IS NULL) OR
    (status='revoked' AND revoked_at IS NOT NULL AND revoke_reason IS NOT NULL AND revoke_actor IS NOT NULL AND char_length(btrim(revoke_actor)) BETWEEN 3 AND 80))
);
CREATE FUNCTION aw_protect_official_scenario_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status<>'active' OR NEW.status<>'revoked' OR
    ROW(NEW.id,NEW.user_id,NEW.scenario_version_id,NEW.curation_id,NEW.source_version,NEW.template_hash,NEW.request_hash,NEW.actor_label,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.scenario_version_id,OLD.curation_id,OLD.source_version,OLD.template_hash,OLD.request_hash,OLD.actor_label,OLD.created_at)
  THEN RAISE EXCEPTION 'Official scenario source is immutable except terminal revocation'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_official_scenario_source_immutable BEFORE UPDATE ON aw_official_scenario_sources FOR EACH ROW EXECUTE FUNCTION aw_protect_official_scenario_source();
ALTER TABLE aw_scenario_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE aw_scenario_curations ENABLE ROW LEVEL SECURITY;
ALTER TABLE aw_official_scenario_sources ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON aw_scenario_reviews,aw_scenario_curations,aw_official_scenario_sources FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON aw_scenario_reviews,aw_scenario_curations,aw_official_scenario_sources FROM authenticated; END IF;
END $$;
