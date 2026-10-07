-- Reviewed fictional Scenario snapshots require a separate owner confirmation.
-- No personal profile or private life can be stored in this public projection.
ALTER TABLE aw_official_scenario_sources ADD CONSTRAINT aw_scenario_source_owner_binding UNIQUE(id,user_id,scenario_version_id);
CREATE TABLE aw_public_scenario_previews (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  scenario_version_id uuid NOT NULL,
  source_grant_id uuid NOT NULL,
  template_hash text NOT NULL CHECK(template_hash ~ '^[a-f0-9]{64}$'),
  preview_hash text NOT NULL CHECK(preview_hash ~ '^[a-f0-9]{64}$'),
  template jsonb NOT NULL CHECK(jsonb_typeof(template)='object'),
  allow_personalization boolean NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,user_id),
  FOREIGN KEY(scenario_version_id,user_id) REFERENCES aw_scenario_versions(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(source_grant_id,user_id,scenario_version_id) REFERENCES aw_official_scenario_sources(id,user_id,scenario_version_id) ON DELETE CASCADE,
  CHECK(expires_at>created_at)
);
CREATE TRIGGER aw_public_scenario_preview_immutable BEFORE UPDATE ON aw_public_scenario_previews FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
CREATE TABLE aw_scenario_publications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  preview_id uuid NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE CHECK(slug ~ '^scenario-[a-f0-9]{32}$'),
  scenario_version_id uuid NOT NULL,
  source_grant_id uuid NOT NULL,
  template_hash text NOT NULL CHECK(template_hash ~ '^[a-f0-9]{64}$'),
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
  allow_personalization boolean NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','withdrawn','hidden','removed')),
  published_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  UNIQUE(id,user_id),
  FOREIGN KEY(preview_id,user_id) REFERENCES aw_public_scenario_previews(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(scenario_version_id,user_id) REFERENCES aw_scenario_versions(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(source_grant_id,user_id,scenario_version_id) REFERENCES aw_official_scenario_sources(id,user_id,scenario_version_id) ON DELETE CASCADE,
  CHECK((status='active' AND stopped_at IS NULL) OR (status<>'active' AND stopped_at IS NOT NULL))
);
CREATE UNIQUE INDEX aw_one_active_scenario_publication ON aw_scenario_publications(scenario_version_id) WHERE status='active';
CREATE FUNCTION aw_protect_scenario_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.user_id,NEW.preview_id,NEW.slug,NEW.scenario_version_id,NEW.source_grant_id,NEW.template_hash,NEW.snapshot,NEW.allow_personalization,NEW.published_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.preview_id,OLD.slug,OLD.scenario_version_id,OLD.source_grant_id,OLD.template_hash,OLD.snapshot,OLD.allow_personalization,OLD.published_at)
    OR NOT ((OLD.status='active' AND NEW.status IN ('withdrawn','hidden','removed')) OR (OLD.status='hidden' AND NEW.status='removed'))
    OR (OLD.stopped_at IS NOT NULL AND NEW.stopped_at IS DISTINCT FROM OLD.stopped_at)
  THEN RAISE EXCEPTION 'Scenario snapshot/permission is immutable except terminal withdrawal/moderation'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_scenario_publication_immutable BEFORE UPDATE ON aw_scenario_publications FOR EACH ROW EXECUTE FUNCTION aw_protect_scenario_publication();
CREATE TABLE aw_scenario_publication_moderation (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  publication_id uuid NOT NULL,
  status text NOT NULL CHECK(status IN ('hidden','removed')),
  reason text NOT NULL CHECK(reason IN ('privacy','content','quality','meaning','origin','other')),
  actor_label text NOT NULL CHECK(char_length(btrim(actor_label)) BETWEEN 3 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(publication_id,user_id) REFERENCES aw_scenario_publications(id,user_id) ON DELETE CASCADE
);
CREATE TRIGGER aw_scenario_publication_moderation_immutable BEFORE UPDATE ON aw_scenario_publication_moderation FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
ALTER TABLE aw_public_scenario_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE aw_scenario_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE aw_scenario_publication_moderation ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON aw_public_scenario_previews,aw_scenario_publications,aw_scenario_publication_moderation FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON aw_public_scenario_previews,aw_scenario_publications,aw_scenario_publication_moderation FROM authenticated; END IF;
END $$;
