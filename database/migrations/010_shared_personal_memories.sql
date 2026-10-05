-- Additive S3 personal projection. Existing canon and the nine applied migrations stay intact.
CREATE TABLE aw_shared_personal_memories (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  source_impact_id uuid NOT NULL REFERENCES aw_shared_impacts,
  event_id uuid NOT NULL REFERENCES aw_shared_events,
  known_at date NOT NULL,
  first_history_position integer NOT NULL CHECK(first_history_position>0),
  source_created_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id,event_id),
  FOREIGN KEY(branch_id,user_id) REFERENCES aw_branches(id,user_id) ON DELETE CASCADE,
  CHECK(payload->>'eventId'=event_id::text AND payload->>'knownAt'=known_at::text),
  CHECK((payload->>'effectiveAt')::date<=known_at)
);
CREATE INDEX aw_shared_personal_memory_history ON aw_shared_personal_memories(branch_id,first_history_position,known_at);
CREATE TRIGGER aw_shared_personal_memory_immutable BEFORE UPDATE ON aw_shared_personal_memories
  FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
ALTER TABLE aw_shared_personal_memories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON aw_shared_personal_memories FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON aw_shared_personal_memories FROM authenticated; END IF;
END $$;
