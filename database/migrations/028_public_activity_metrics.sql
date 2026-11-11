-- Aggregate events have no reader/user/IP/referrer or story payload.
CREATE TABLE aw_public_metrics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_publication_id uuid REFERENCES aw_publications(id) ON DELETE CASCADE,
  official_publication_id uuid REFERENCES aw_official_publications(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  kind text NOT NULL CHECK(kind IN ('reading_started','depth_25','depth_50','depth_75','end_reached','share_clicked','link_copied','copy_failed','saved','unsaved','reported','published','owner_withdrawn','hidden','removed')),
  total integer NOT NULL DEFAULT 1 CHECK(total BETWEEN 1 AND 2147483647),
  CHECK ((community_publication_id IS NOT NULL)::integer + (official_publication_id IS NOT NULL)::integer = 1),
  UNIQUE(community_publication_id,day,kind),
  UNIQUE(official_publication_id,day,kind)
);
CREATE TABLE aw_public_reading_sessions (
  id uuid PRIMARY KEY,
  community_publication_id uuid REFERENCES aw_publications(id) ON DELETE CASCADE,
  official_publication_id uuid REFERENCES aw_official_publications(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '20 minutes',
  signals integer NOT NULL DEFAULT 0 CHECK(signals BETWEEN 0 AND 127),
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 minutes'),
  CHECK ((community_publication_id IS NOT NULL)::integer + (official_publication_id IS NOT NULL)::integer = 1)
);
CREATE INDEX aw_public_reading_expiry ON aw_public_reading_sessions(expires_at);
CREATE FUNCTION aw_protect_reading_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.community_publication_id,NEW.official_publication_id,NEW.created_at,NEW.expires_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.community_publication_id,OLD.official_publication_id,OLD.created_at,OLD.expires_at)
     OR (NEW.signals | OLD.signals)<>NEW.signals THEN RAISE EXCEPTION 'Immutable reading session binding'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_public_reading_session_immutable BEFORE UPDATE ON aw_public_reading_sessions FOR EACH ROW EXECUTE FUNCTION aw_protect_reading_session();
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['aw_public_metrics_daily','aw_public_reading_sessions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',item);
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',item); END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',item); END IF;
  END LOOP;
END $$;
