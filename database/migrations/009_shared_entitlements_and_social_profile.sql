CREATE TABLE aw_social_profiles (
  user_id uuid PRIMARY KEY REFERENCES ff_users ON DELETE CASCADE,
  handle text NOT NULL CHECK(handle ~ '^[a-z0-9][a-z0-9_]{2,29}$'),
  display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 80),
  discoverability text NOT NULL CHECK(discoverability IN ('private','link_only','searchable')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX aw_social_handle ON aw_social_profiles(lower(handle));
-- No client write path. Missing/expired row means Free; billing is a later integration.
CREATE TABLE aw_user_entitlements (
  user_id uuid PRIMARY KEY REFERENCES ff_users ON DELETE CASCADE,
  tier text NOT NULL CHECK(tier IN ('free','explorer','connected','world')),
  source text NOT NULL CHECK(length(source) BETWEEN 1 AND 80),
  valid_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE aw_user_blocks (
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,blocked_user_id),
  CHECK(user_id<>blocked_user_id)
);
CREATE FUNCTION aw_shared_delete_user() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item uuid; had_membership boolean;
BEGIN
  FOR item IN SELECT c.id FROM aw_shared_contexts c WHERE EXISTS(
    SELECT 1 FROM aw_shared_members m WHERE m.context_id=c.id AND m.user_id=OLD.id
  ) OR EXISTS(
    SELECT 1 FROM aw_shared_invites i WHERE i.context_id=c.id AND i.target_user_id=OLD.id AND i.status='pending'
  ) ORDER BY c.id FOR UPDATE LOOP
    SELECT EXISTS(SELECT 1 FROM aw_shared_members WHERE context_id=item AND user_id=OLD.id) INTO had_membership;
    UPDATE aw_shared_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL,payload='{}',checkpoints='{}'
      WHERE context_id=item AND status IN ('queued','running','cancelled') AND
        EXISTS(SELECT 1 FROM aw_shared_members WHERE context_id=item AND user_id=OLD.id);
    -- A targeted invitation must be revoked even if its recipient never joined.
    -- ON DELETE SET NULL alone would turn it into an unrestricted bearer link.
    UPDATE aw_shared_invites SET status='revoked',responded_at=now() WHERE context_id=item AND status='pending' AND
      (target_user_id=OLD.id OR inviter_member_id IN (SELECT id FROM aw_shared_members WHERE user_id=OLD.id));
    UPDATE aw_shared_impacts SET status='detached',target_branch_id=NULL
      WHERE context_id=item AND member_id IN (SELECT id FROM aw_shared_members WHERE user_id=OLD.id) AND status='pending';
    UPDATE aw_shared_members SET status='deleted',user_id=NULL,life_id=NULL,branch_id=NULL,left_at=now(),
      interaction_profile='{"displayName":"Former member","ageBand":null,"country":null,"occupationLabel":null,"sharedRole":null}',world_role=NULL,role_data='{}'
      WHERE context_id=item AND user_id=OLD.id;
    UPDATE aw_shared_contexts SET revision=revision+1,updated_at=now(),
      status=CASE WHEN had_membership AND status IN ('inviting','active','paused') THEN
        CASE WHEN (SELECT count(*) FROM aw_shared_members WHERE context_id=item AND status IN ('active','paused_entitlement'))=0 THEN 'ended'
             WHEN (SELECT count(*) FROM aw_shared_members WHERE context_id=item AND status IN ('active','paused_entitlement'))<2 THEN 'paused'
             ELSE status END ELSE status END
      WHERE id=item;
  END LOOP;
  RETURN OLD;
END $$;
CREATE TRIGGER aw_shared_delete_user BEFORE DELETE ON ff_users FOR EACH ROW EXECUTE FUNCTION aw_shared_delete_user();
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['aw_social_profiles','aw_user_entitlements','aw_user_blocks'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',item);
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',item); END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',item); END IF;
  END LOOP;
END $$;
