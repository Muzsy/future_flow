CREATE TABLE aw_public_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES ff_users(id) ON DELETE CASCADE,
  community_publication_id uuid REFERENCES aw_publications(id) ON DELETE CASCADE,
  official_publication_id uuid REFERENCES aw_official_publications(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK(reason IN ('personal_data','harassment','hate','explicit_sexual_content','violence','illegal_content','scam','impersonation','spam')),
  details text NOT NULL CHECK(length(details)<=1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','resolved')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  decision jsonb,
  decision_hash text,
  resolved_at timestamptz,
  CHECK ((community_publication_id IS NOT NULL)::integer + (official_publication_id IS NOT NULL)::integer = 1),
  CHECK ((status='queued' AND decision IS NULL AND decision_hash IS NULL AND resolved_at IS NULL) OR (status='resolved' AND decision IS NOT NULL AND decision_hash IS NOT NULL AND decision_hash ~ '^[a-f0-9]{64}$' AND resolved_at IS NOT NULL)),
  UNIQUE(user_id,community_publication_id,reason),
  UNIQUE(user_id,official_publication_id,reason)
);
CREATE INDEX aw_public_reports_owner ON aw_public_reports(user_id,created_at);
CREATE INDEX aw_public_reports_queue ON aw_public_reports(created_at,id) WHERE status='queued';
CREATE TABLE aw_public_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES ff_users(id) ON DELETE CASCADE,
  report_id uuid UNIQUE REFERENCES aw_public_reports(id) ON DELETE SET NULL,
  slug text NOT NULL CHECK(slug ~ '^(life|official)-[a-f0-9]{32}$'),
  reason text NOT NULL CHECK(reason IN ('personal_data','harassment','hate','explicit_sexual_content','violence','illegal_content','scam','impersonation','spam')),
  action text NOT NULL CHECK(action IN ('warn','hide','remove')),
  actor_label text NOT NULL CHECK(length(actor_label) BETWEEN 3 AND 80),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE aw_publication_restrictions (
  user_id uuid PRIMARY KEY REFERENCES ff_users(id) ON DELETE CASCADE,
  active boolean NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  reason text NOT NULL CHECK(reason IN ('personal_data','harassment','hate','explicit_sexual_content','violence','illegal_content','scam','impersonation','spam')),
  actor_label text NOT NULL CHECK(length(actor_label) BETWEEN 3 AND 80),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE aw_publication_restriction_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES ff_users(id) ON DELETE CASCADE,
  active boolean NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  reason text NOT NULL CHECK(reason IN ('personal_data','harassment','hate','explicit_sexual_content','violence','illegal_content','scam','impersonation','spam')),
  actor_label text NOT NULL CHECK(length(actor_label) BETWEEN 3 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,revision)
);
CREATE FUNCTION aw_protect_public_report() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.user_id,NEW.community_publication_id,NEW.official_publication_id,NEW.reason,NEW.details,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.community_publication_id,OLD.official_publication_id,OLD.reason,OLD.details,OLD.created_at)
    OR OLD.status<>'queued' OR NEW.status<>'resolved' OR NEW.revision<>OLD.revision+1 THEN
    RAISE EXCEPTION 'Immutable public report';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_public_report_immutable BEFORE UPDATE ON aw_public_reports FOR EACH ROW EXECUTE FUNCTION aw_protect_public_report();
CREATE FUNCTION aw_protect_public_warning() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.user_id,NEW.slug,NEW.reason,NEW.action,NEW.actor_label,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.slug,OLD.reason,OLD.action,OLD.actor_label,OLD.created_at)
    OR NOT (OLD.report_id IS NOT NULL AND NEW.report_id IS NULL) THEN
    RAISE EXCEPTION 'Immutable public warning';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_public_warning_immutable BEFORE UPDATE ON aw_public_warnings FOR EACH ROW EXECUTE FUNCTION aw_protect_public_warning();
CREATE TRIGGER aw_public_restriction_action_immutable BEFORE UPDATE ON aw_publication_restriction_actions FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['aw_public_reports','aw_public_warnings','aw_publication_restrictions','aw_publication_restriction_actions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',item);
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',item); END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',item); END IF;
  END LOOP;
END $$;
