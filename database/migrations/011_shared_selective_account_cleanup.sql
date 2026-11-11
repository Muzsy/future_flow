-- Additive correction: a former member's account cleanup must not invalidate
-- a newer generation which contains only the remaining members. Never rewrite 009.
CREATE OR REPLACE FUNCTION aw_shared_delete_user() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item uuid; had_live_membership boolean; invalidates_job boolean; revoked_invites integer;
BEGIN
  FOR item IN SELECT c.id FROM aw_shared_contexts c WHERE EXISTS(
    SELECT 1 FROM aw_shared_members m WHERE m.context_id=c.id AND m.user_id=OLD.id
  ) OR EXISTS(
    SELECT 1 FROM aw_shared_invites i WHERE i.context_id=c.id AND i.target_user_id=OLD.id AND i.status='pending'
  ) OR EXISTS(
    SELECT 1 FROM aw_shared_jobs j WHERE j.context_id=c.id AND j.requested_by_user_id=OLD.id
  ) ORDER BY c.id FOR UPDATE LOOP
    SELECT EXISTS(SELECT 1 FROM aw_shared_members WHERE context_id=item AND user_id=OLD.id
      AND status IN ('active','paused_entitlement')) INTO had_live_membership;
    SELECT EXISTS(SELECT 1 FROM aw_shared_jobs j WHERE j.context_id=item AND j.status IN ('queued','running') AND (
      had_live_membership OR j.requested_by_user_id=OLD.id OR EXISTS(
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(j.payload->'members')='array'
          THEN j.payload->'members' ELSE '[]'::jsonb END) p
        JOIN aw_shared_members m ON p->>'memberId'=m.id::text WHERE m.context_id=item AND m.user_id=OLD.id
      ))) INTO invalidates_job;
    -- Failed/completed snapshots are transient input too. Retain receipts and canon,
    -- while scrubbing only snapshots which actually involve this account.
    UPDATE aw_shared_jobs j SET status=CASE WHEN status IN ('queued','running') THEN 'cancelled' ELSE status END,
      lease_token=NULL,lease_until=NULL,payload='{}',checkpoints='{}'
      WHERE j.context_id=item AND (had_live_membership OR j.requested_by_user_id=OLD.id OR EXISTS(
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(j.payload->'members')='array'
          THEN j.payload->'members' ELSE '[]'::jsonb END) p
        JOIN aw_shared_members m ON p->>'memberId'=m.id::text WHERE m.context_id=item AND m.user_id=OLD.id
      ));
    UPDATE aw_shared_invites SET status='revoked',responded_at=now() WHERE context_id=item AND status='pending' AND
      (target_user_id=OLD.id OR inviter_member_id IN (SELECT id FROM aw_shared_members WHERE user_id=OLD.id));
    GET DIAGNOSTICS revoked_invites = ROW_COUNT;
    UPDATE aw_shared_impacts SET status='detached',target_branch_id=NULL
      WHERE context_id=item AND member_id IN (SELECT id FROM aw_shared_members WHERE user_id=OLD.id) AND status='pending';
    UPDATE aw_shared_members SET status='deleted',user_id=NULL,life_id=NULL,branch_id=NULL,left_at=now(),
      interaction_profile='{"displayName":"Former member","ageBand":null,"country":null,"occupationLabel":null,"sharedRole":null}',world_role=NULL,role_data='{}'
      WHERE context_id=item AND user_id=OLD.id;
    IF had_live_membership OR invalidates_job OR revoked_invites>0 THEN
      UPDATE aw_shared_contexts SET revision=revision+1,updated_at=now(),
        status=CASE WHEN had_live_membership AND status IN ('inviting','active','paused') THEN
          CASE WHEN (SELECT count(*) FROM aw_shared_members WHERE context_id=item AND status IN ('active','paused_entitlement'))=0 THEN 'ended'
               WHEN (SELECT count(*) FROM aw_shared_members WHERE context_id=item AND status IN ('active','paused_entitlement'))<2 THEN 'paused'
               ELSE status END ELSE status END
        WHERE id=item;
    END IF;
  END LOOP;
  RETURN OLD;
END $$;
