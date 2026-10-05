-- Privacy projection metadata is internal; immutable canon and existing contracts remain intact.
ALTER TABLE aw_jobs ADD COLUMN shared_privacy_event_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE aw_shared_jobs ADD COLUMN shared_privacy_event_ids uuid[] NOT NULL DEFAULT '{}';

CREATE FUNCTION aw_shared_invalidate_private_inputs() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_user uuid; event_ids uuid[]; item uuid; changed integer;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.status<>'deleting' OR OLD.status='deleting' THEN RETURN NEW; END IF;
    target_user:=NEW.id;
  ELSE target_user:=OLD.id; END IF;
  SELECT array_agg(DISTINCT p.event_id) INTO event_ids FROM aw_shared_event_participants p
    JOIN aw_shared_members m ON m.id=p.member_id WHERE m.user_id=target_user;
  IF event_ids IS NULL THEN
    IF TG_OP='UPDATE' THEN RETURN NEW; ELSE RETURN OLD; END IF;
  END IF;
  -- Existing global order: context UUID order, then transient jobs. A later delete
  -- preserves newly queued, already projected personal inputs after the first marker.
  FOR item IN SELECT c.id FROM aw_shared_contexts c WHERE EXISTS(
    SELECT 1 FROM aw_shared_events e WHERE e.context_id=c.id AND e.id=ANY(event_ids)
  ) ORDER BY c.id FOR UPDATE LOOP
    SELECT count(*) INTO changed FROM aw_shared_jobs j WHERE context_id=item AND status IN ('queued','running')
      AND EXISTS(SELECT 1 FROM unnest(event_ids) e WHERE NOT(e=ANY(j.shared_privacy_event_ids)));
    UPDATE aw_shared_jobs SET status=CASE WHEN status IN ('queued','running') THEN 'cancelled' ELSE status END,
      error_code=CASE WHEN status IN ('queued','running') THEN 'SHARED_PRIVACY_CHANGED' ELSE error_code END,
      lease_token=NULL,lease_until=NULL,payload='{}',checkpoints='{}' WHERE context_id=item AND (
        EXISTS(SELECT 1 FROM unnest(event_ids) e WHERE NOT(e=ANY(shared_privacy_event_ids)))
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(payload->'members')='array' THEN payload->'members' ELSE '[]'::jsonb END) p JOIN aw_shared_members m ON p->>'memberId'=m.id::text WHERE m.user_id=target_user)
      );
    IF changed>0 THEN UPDATE aw_shared_contexts SET revision=revision+1,updated_at=now() WHERE id=item; END IF;
  END LOOP;
  WITH invalidated AS (
    UPDATE aw_jobs j SET status=CASE WHEN j.status IN ('queued','running') THEN 'cancelled' ELSE j.status END,
      error_code=CASE WHEN j.status IN ('queued','running') THEN 'SHARED_PRIVACY_CHANGED' ELSE j.error_code END,
      lease_token=NULL,lease_until=NULL,payload='{}',checkpoints='{}'
    WHERE (j.status IN ('queued','running') OR j.payload<>'{}'::jsonb OR j.checkpoints<>'{}'::jsonb)
      AND EXISTS(SELECT 1 FROM aw_shared_personal_memories p WHERE p.user_id=j.user_id AND p.branch_id=j.branch_id
      AND p.event_id=ANY(event_ids) AND NOT(p.event_id=ANY(j.shared_privacy_event_ids))
      AND p.known_at<=coalesce(nullif(j.payload->>'startDate','')::date,'infinity'::date))
    RETURNING j.branch_id,j.status
  ) UPDATE aw_branches b SET status='failed' WHERE b.status='generating' AND b.id IN (
    SELECT branch_id FROM invalidated WHERE status='cancelled'
  );
  IF TG_OP='UPDATE' THEN RETURN NEW; ELSE RETURN OLD; END IF;
END $$;
CREATE TRIGGER aa_aw_shared_privacy_marker AFTER UPDATE OF status ON ff_users
  FOR EACH ROW EXECUTE FUNCTION aw_shared_invalidate_private_inputs();
CREATE TRIGGER aa_aw_shared_privacy_delete BEFORE DELETE ON ff_users
  FOR EACH ROW EXECUTE FUNCTION aw_shared_invalidate_private_inputs();
