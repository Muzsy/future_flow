-- Explicit release of a reviewed copy. The source canon and earlier migrations are unchanged.
ALTER TABLE aw_public_content_curations ADD CONSTRAINT aw_full_curation_owner UNIQUE(id,user_id,bundle_id);
CREATE TABLE aw_publication_previews (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  bundle_id uuid NOT NULL, curation_id uuid NOT NULL,
  binding jsonb NOT NULL, settings jsonb NOT NULL, snapshot jsonb NOT NULL,
  snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
  preview_hash text NOT NULL CHECK(preview_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,user_id,bundle_id),
  FOREIGN KEY(curation_id,user_id,bundle_id) REFERENCES aw_public_content_curations(id,user_id,bundle_id) ON DELETE CASCADE
);
CREATE TABLE aw_publications (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  bundle_id uuid NOT NULL UNIQUE, preview_id uuid NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE CHECK(slug ~ '^life-[a-f0-9]{32}$'),
  visibility text NOT NULL CHECK(visibility IN ('public','unlisted')),
  author_mode text NOT NULL CHECK(author_mode IN ('anonymous','handle')),
  indexable boolean NOT NULL DEFAULT false CHECK(indexable=false),
  snapshot jsonb NOT NULL, snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','withdrawn','hidden','removed')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  token_hash text UNIQUE CHECK(token_hash IS NULL OR token_hash ~ '^[a-f0-9]{64}$'),
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,user_id),
  FOREIGN KEY(preview_id,user_id,bundle_id) REFERENCES aw_publication_previews(id,user_id,bundle_id) ON DELETE CASCADE,
  CHECK ((status='active' AND visibility='unlisted' AND token_hash IS NOT NULL) OR
         ((status<>'active' OR visibility='public') AND token_hash IS NULL))
);
CREATE TABLE aw_publication_actions (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  publication_id uuid NOT NULL,
  revision integer NOT NULL CHECK(revision>1),
  action text NOT NULL CHECK(action IN ('withdraw','rotate','hide','remove')),
  reason_code text CHECK(reason_code IN ('privacy','content','other','account_deletion')),
  actor_label text NOT NULL CHECK(char_length(btrim(actor_label)) BETWEEN 3 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(publication_id,revision),
  FOREIGN KEY(publication_id,user_id) REFERENCES aw_publications(id,user_id) ON DELETE CASCADE
);
CREATE FUNCTION aw_protect_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.user_id,NEW.bundle_id,NEW.preview_id,NEW.slug,NEW.visibility,NEW.author_mode,NEW.indexable,NEW.snapshot,NEW.snapshot_hash,NEW.published_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.bundle_id,OLD.preview_id,OLD.slug,OLD.visibility,OLD.author_mode,OLD.indexable,OLD.snapshot,OLD.snapshot_hash,OLD.published_at)
     OR NEW.revision<>OLD.revision+1 OR OLD.status IN ('withdrawn','removed')
     OR (OLD.status='hidden' AND NEW.status NOT IN ('withdrawn','removed'))
     OR (NEW.status='active' AND (OLD.status<>'active' OR OLD.visibility<>'unlisted' OR NEW.token_hash IS NOT DISTINCT FROM OLD.token_hash))
  THEN RAISE EXCEPTION 'Publication copy is immutable; invalid lifecycle transition'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_publication_immutable BEFORE UPDATE ON aw_publications FOR EACH ROW EXECUTE FUNCTION aw_protect_publication();
CREATE TRIGGER aw_publication_preview_immutable BEFORE UPDATE ON aw_publication_previews FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
CREATE TRIGGER aw_publication_action_immutable BEFORE UPDATE ON aw_publication_actions FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
CREATE INDEX aw_publications_owner ON aw_publications(user_id,published_at);
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['aw_publication_previews','aw_publications','aw_publication_actions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',item);
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',item); END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',item); END IF;
  END LOOP;
END $$;
