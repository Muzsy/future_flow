-- Separate private aggregate. Personal life/branch ownership and existing canon are unchanged.
CREATE TABLE aw_shared_contexts (
  id uuid PRIMARY KEY,
  type text NOT NULL CHECK(type IN ('friend_group','romantic_relationship','work_project','hobby_group','sports_team')),
  status text NOT NULL DEFAULT 'inviting' CHECK(status IN ('inviting','active','paused','ended','archived')),
  content_locale text NOT NULL CHECK(content_locale='en'), title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  state jsonb NOT NULL CHECK(jsonb_typeof(state)='object' AND state->>'type'=type),
  revision integer NOT NULL DEFAULT 0 CHECK(revision>=0), simulation_at date NOT NULL,
  governance jsonb NOT NULL CHECK(jsonb_typeof(governance)='object'),
  pending_event_id uuid, origin_context_id uuid REFERENCES aw_shared_contexts, origin_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE aw_shared_members (
  id uuid PRIMARY KEY, context_id uuid NOT NULL REFERENCES aw_shared_contexts,
  context_type text NOT NULL, context_live boolean NOT NULL DEFAULT true,
  user_id uuid REFERENCES ff_users ON DELETE SET NULL,
  life_id uuid REFERENCES aw_lives ON DELETE SET NULL,
  branch_id uuid REFERENCES aw_branches ON DELETE SET NULL,
  status text NOT NULL CHECK(status IN ('active','paused_entitlement','left','removed','deleted')),
  admin_role text NOT NULL CHECK(admin_role IN ('owner','member')),
  interaction_profile jsonb NOT NULL CHECK(jsonb_typeof(interaction_profile)='object'),
  sharing_policy_version text NOT NULL CHECK(sharing_policy_version='shared-profile-v1'),
  world_role text, role_data jsonb NOT NULL DEFAULT '{}',
  joined_at timestamptz NOT NULL DEFAULT now(), left_at timestamptz,
  UNIQUE(id,context_id),
  CHECK(status NOT IN ('active','paused_entitlement') OR (user_id IS NOT NULL AND life_id IS NOT NULL AND branch_id IS NOT NULL))
);
CREATE UNIQUE INDEX aw_shared_one_live_membership ON aw_shared_members(context_id,user_id) WHERE status IN ('active','paused_entitlement');
CREATE UNIQUE INDEX aw_shared_one_live_owner ON aw_shared_members(context_id) WHERE admin_role='owner' AND status IN ('active','paused_entitlement');
CREATE UNIQUE INDEX aw_shared_one_romantic ON aw_shared_members(user_id) WHERE context_type='romantic_relationship' AND context_live AND status IN ('active','paused_entitlement');
CREATE INDEX aw_shared_member_user ON aw_shared_members(user_id,status);
CREATE INDEX aw_shared_member_context ON aw_shared_members(context_id,status);
CREATE FUNCTION aw_shared_validate_member() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_type text; parent_status text;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.user_id IS NULL OR NEW.branch_id IS NULL OR NEW.life_id IS NULL) THEN
    IF NEW.status IN ('active','paused_entitlement') THEN
      NEW.status := CASE WHEN NEW.user_id IS NULL THEN 'deleted' ELSE 'left' END;
      NEW.left_at := now();
    END IF;
    IF NEW.user_id IS NULL THEN
      NEW.interaction_profile := '{"displayName":"Former member","ageBand":null,"country":null,"occupationLabel":null,"sharedRole":null}';
      NEW.world_role := NULL; NEW.role_data := '{}';
      NEW.life_id := NULL; NEW.branch_id := NULL;
    END IF;
  END IF;
  SELECT type,status INTO parent_type,parent_status FROM aw_shared_contexts WHERE id=NEW.context_id;
  IF parent_type IS NULL OR parent_type<>NEW.context_type THEN
    RAISE EXCEPTION 'Shared membership context type mismatch';
  END IF;
  NEW.context_live := parent_status IN ('inviting','active','paused');
  IF NEW.status IN ('active','paused_entitlement')
    AND (TG_OP='INSERT' OR ROW(NEW.user_id,NEW.life_id,NEW.branch_id,NEW.status) IS DISTINCT FROM ROW(OLD.user_id,OLD.life_id,OLD.branch_id,OLD.status))
    AND NOT EXISTS(
    SELECT 1 FROM aw_branches b JOIN ff_users u ON u.id=b.user_id
    WHERE b.id=NEW.branch_id AND b.life_id=NEW.life_id AND b.user_id=NEW.user_id AND u.status='active'
  ) THEN RAISE EXCEPTION 'Shared membership ownership mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_shared_member_valid BEFORE INSERT OR UPDATE ON aw_shared_members FOR EACH ROW EXECUTE FUNCTION aw_shared_validate_member();
-- Leaving/deleting the creator must not strand the remaining members. This is
-- an administrative handover only, never an in-world role or a personal choice.
CREATE FUNCTION aw_shared_handover_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE successor uuid;
BEGIN
  IF OLD.admin_role='owner' AND OLD.status IN ('active','paused_entitlement')
    AND NEW.status NOT IN ('active','paused_entitlement') THEN
    SELECT m.id INTO successor FROM aw_shared_members m JOIN ff_users u ON u.id=m.user_id
      WHERE m.context_id=NEW.context_id AND m.status IN ('active','paused_entitlement') AND u.status='active'
      ORDER BY (m.status='active') DESC,m.joined_at,m.id LIMIT 1;
    IF successor IS NOT NULL THEN UPDATE aw_shared_members SET admin_role='owner' WHERE id=successor; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_shared_handover_owner AFTER UPDATE OF status ON aw_shared_members FOR EACH ROW EXECUTE FUNCTION aw_shared_handover_owner();
CREATE FUNCTION aw_shared_context_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type<>OLD.type OR NEW.content_locale<>OLD.content_locale THEN RAISE EXCEPTION 'Shared context identity is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_shared_context_identity BEFORE UPDATE ON aw_shared_contexts FOR EACH ROW EXECUTE FUNCTION aw_shared_context_identity();
-- The romantic partial unique index cannot join its parent. Keep its live-context
-- predicate synchronized so an ended relationship releases the slot while paused
-- relationships still reserve it, without deleting the members' history.
CREATE FUNCTION aw_shared_context_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE aw_shared_members SET context_live=NEW.status IN ('inviting','active','paused') WHERE context_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_shared_context_lifecycle AFTER UPDATE OF status ON aw_shared_contexts FOR EACH ROW EXECUTE FUNCTION aw_shared_context_lifecycle();
CREATE TABLE aw_shared_invites (
  id uuid PRIMARY KEY, context_id uuid NOT NULL REFERENCES aw_shared_contexts,
  inviter_member_id uuid NOT NULL,
  target_user_id uuid REFERENCES ff_users ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','revoked','expired')),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), responded_at timestamptz,
  FOREIGN KEY(inviter_member_id,context_id) REFERENCES aw_shared_members(id,context_id)
);
CREATE INDEX aw_shared_invite_context ON aw_shared_invites(context_id,status,expires_at);
CREATE INDEX aw_shared_invite_target ON aw_shared_invites(target_user_id,status);
CREATE TABLE aw_shared_events (
  id uuid PRIMARY KEY, context_id uuid NOT NULL REFERENCES aw_shared_contexts,
  sequence integer NOT NULL CHECK(sequence>0), base_revision integer NOT NULL CHECK(base_revision>=0),
  effective_at date NOT NULL, candidate jsonb NOT NULL, state_before jsonb NOT NULL, state_after_event jsonb NOT NULL,
  decision jsonb, canon_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(context_id,sequence), UNIQUE(id,context_id)
);
ALTER TABLE aw_shared_contexts ADD FOREIGN KEY(pending_event_id,id) REFERENCES aw_shared_events(id,context_id);
ALTER TABLE aw_shared_contexts ADD FOREIGN KEY(origin_event_id) REFERENCES aw_shared_events;
CREATE TABLE aw_shared_event_participants (
  event_id uuid NOT NULL, member_id uuid NOT NULL, context_id uuid NOT NULL,
  participation_role text, PRIMARY KEY(event_id,member_id),
  FOREIGN KEY(event_id,context_id) REFERENCES aw_shared_events(id,context_id),
  FOREIGN KEY(member_id,context_id) REFERENCES aw_shared_members(id,context_id)
);
CREATE TABLE aw_shared_intents (
  id uuid PRIMARY KEY, event_id uuid NOT NULL, member_id uuid NOT NULL,
  option_id uuid NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id,member_id), FOREIGN KEY(event_id,member_id) REFERENCES aw_shared_event_participants(event_id,member_id)
);
CREATE TABLE aw_shared_resolutions (
  id uuid PRIMARY KEY, event_id uuid NOT NULL UNIQUE, context_id uuid NOT NULL,
  policy jsonb NOT NULL, result jsonb NOT NULL, state_before jsonb NOT NULL, state_after jsonb NOT NULL,
  canon_hash text NOT NULL, resolved_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,event_id),
  FOREIGN KEY(event_id,context_id) REFERENCES aw_shared_events(id,context_id)
);
CREATE TABLE aw_shared_impacts (
  id uuid PRIMARY KEY, context_id uuid NOT NULL, event_id uuid NOT NULL, resolution_id uuid,
  member_id uuid NOT NULL, target_branch_id uuid REFERENCES aw_branches ON DELETE SET NULL,
  effective_at date NOT NULL, kind text NOT NULL CHECK(kind IN ('memory_only','relationship_projection')),
  payload jsonb NOT NULL, payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied','detached','expired')),
  applied_revision integer CHECK(applied_revision>=0), created_at timestamptz NOT NULL DEFAULT now(), applied_at timestamptz,
  UNIQUE(event_id,member_id,kind,payload_hash),
  FOREIGN KEY(event_id,member_id) REFERENCES aw_shared_event_participants(event_id,member_id),
  FOREIGN KEY(event_id,context_id) REFERENCES aw_shared_events(id,context_id),
  FOREIGN KEY(resolution_id,event_id) REFERENCES aw_shared_resolutions(id,event_id)
);
CREATE INDEX aw_shared_pending_impacts ON aw_shared_impacts(target_branch_id,effective_at,created_at) WHERE status='pending';
CREATE FUNCTION aw_shared_impact_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.context_id,NEW.event_id,NEW.resolution_id,NEW.member_id,NEW.effective_at,NEW.kind,NEW.payload,NEW.payload_hash)
    IS DISTINCT FROM ROW(OLD.context_id,OLD.event_id,OLD.resolution_id,OLD.member_id,OLD.effective_at,OLD.kind,OLD.payload,OLD.payload_hash)
  THEN RAISE EXCEPTION 'Shared impact payload is immutable'; END IF;
  IF NEW.target_branch_id IS NULL AND NEW.status='pending' THEN NEW.status:='detached'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aw_shared_impact_immutable BEFORE UPDATE ON aw_shared_impacts FOR EACH ROW EXECUTE FUNCTION aw_shared_impact_immutable();
CREATE TABLE aw_shared_jobs (
  id uuid PRIMARY KEY, context_id uuid NOT NULL REFERENCES aw_shared_contexts,
  requested_by_user_id uuid REFERENCES ff_users ON DELETE SET NULL,
  base_revision integer NOT NULL CHECK(base_revision>=0),
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','cancelled')),
  stage text NOT NULL DEFAULT 'QUEUED', payload jsonb NOT NULL, checkpoints jsonb NOT NULL DEFAULT '{}',
  attempt integer NOT NULL DEFAULT 0 CHECK(attempt>=0), lease_token uuid, lease_until timestamptz,
  error_code text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE UNIQUE INDEX aw_shared_one_active_job ON aw_shared_jobs(context_id) WHERE status IN ('queued','running');
CREATE INDEX aw_shared_job_claim ON aw_shared_jobs(status,lease_until,created_at);
CREATE TABLE aw_shared_ai_runs (
  id uuid PRIMARY KEY, shared_job_id uuid NOT NULL REFERENCES aw_shared_jobs,
  charged_user_id uuid REFERENCES ff_users ON DELETE SET NULL, metadata jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['aw_shared_events','aw_shared_event_participants','aw_shared_intents','aw_shared_resolutions'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update()',item||'_immutable',item);
  END LOOP;
  FOREACH item IN ARRAY ARRAY['aw_shared_contexts','aw_shared_members','aw_shared_invites','aw_shared_events','aw_shared_event_participants','aw_shared_intents','aw_shared_resolutions','aw_shared_impacts','aw_shared_jobs','aw_shared_ai_runs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',item);
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',item); END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',item); END IF;
  END LOOP;
END $$;
