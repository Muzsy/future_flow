-- Independent reader-owned lives. Source deletion detaches attribution only.
CREATE TABLE aw_public_fork_starts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES ff_users(id) ON DELETE CASCADE,
 life_id uuid NOT NULL UNIQUE, branch_id uuid NOT NULL,
 source_kind text NOT NULL CHECK(source_kind IN ('community','official')),
 community_publication_id uuid REFERENCES aw_publications(id) ON DELETE SET NULL,
 official_publication_id uuid REFERENCES aw_official_publications(id) ON DELETE SET NULL,
 CHECK((community_publication_id IS NOT NULL)::integer+(official_publication_id IS NOT NULL)::integer<=1),
 CHECK((source_kind='community' AND official_publication_id IS NULL) OR (source_kind='official' AND community_publication_id IS NULL)),
 capability_hash text NOT NULL CHECK(capability_hash ~ '^[a-f0-9]{64}$'),
 permission_revision integer NOT NULL CHECK(permission_revision>0),
 checkpoint_index integer NOT NULL CHECK(checkpoint_index BETWEEN 0 AND 11),
 checkpoint_hash text NOT NULL CHECK(checkpoint_hash ~ '^[a-f0-9]{64}$'),
 option_key text NOT NULL CHECK(option_key ~ '^option-[1-9][0-9]{0,2}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(life_id,user_id) REFERENCES aw_lives(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(branch_id,life_id,user_id) REFERENCES aw_branches(id,life_id,user_id) ON DELETE CASCADE
);
CREATE INDEX aw_public_fork_starts_community ON aw_public_fork_starts(community_publication_id) WHERE community_publication_id IS NOT NULL;
CREATE INDEX aw_public_fork_starts_official ON aw_public_fork_starts(official_publication_id) WHERE official_publication_id IS NOT NULL;
CREATE FUNCTION aw_protect_public_fork_start() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.user_id,NEW.life_id,NEW.branch_id,NEW.source_kind,NEW.capability_hash,NEW.permission_revision,NEW.checkpoint_index,NEW.checkpoint_hash,NEW.option_key,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.life_id,OLD.branch_id,OLD.source_kind,OLD.capability_hash,OLD.permission_revision,OLD.checkpoint_index,OLD.checkpoint_hash,OLD.option_key,OLD.created_at)
 OR (NEW.community_publication_id IS DISTINCT FROM OLD.community_publication_id AND NEW.community_publication_id IS NOT NULL)
 OR (NEW.official_publication_id IS DISTINCT FROM OLD.official_publication_id AND NEW.official_publication_id IS NOT NULL)
 THEN RAISE EXCEPTION 'Public fork start is immutable except source detachment'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aw_public_fork_start_immutable BEFORE UPDATE ON aw_public_fork_starts FOR EACH ROW EXECUTE FUNCTION aw_protect_public_fork_start();
CREATE TABLE aw_initial_choices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES ff_users(id) ON DELETE CASCADE,
 life_id uuid NOT NULL UNIQUE, branch_id uuid NOT NULL,
 decision_id uuid NOT NULL, option_id uuid NOT NULL,
 prompt text NOT NULL CHECK(length(prompt) BETWEEN 5 AND 400),
 payload jsonb NOT NULL, state_before jsonb NOT NULL, state_after jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(branch_id,life_id,user_id) REFERENCES aw_branches(id,life_id,user_id) ON DELETE CASCADE
);
CREATE TRIGGER aw_initial_choice_immutable BEFORE UPDATE ON aw_initial_choices FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
ALTER TABLE aw_public_fork_starts ENABLE ROW LEVEL SECURITY;
ALTER TABLE aw_initial_choices ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON aw_public_fork_starts,aw_initial_choices FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON aw_public_fork_starts,aw_initial_choices FROM authenticated; END IF;
END $$;
