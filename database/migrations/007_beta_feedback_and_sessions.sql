-- Server-timed beta sessions and voluntary feedback. Historical canon is untouched.
CREATE TABLE aw_activity_sessions (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  client_id uuid NOT NULL, started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id)
);
CREATE INDEX aw_activity_session_lookup ON aw_activity_sessions(user_id,client_id,last_seen_at DESC);
ALTER TABLE aw_interactions ADD COLUMN activity_session_id uuid;
ALTER TABLE aw_interactions ADD COLUMN period_id uuid;
ALTER TABLE aw_interactions ADD FOREIGN KEY(activity_session_id,user_id) REFERENCES aw_activity_sessions(id,user_id) ON DELETE CASCADE;
ALTER TABLE aw_interactions ADD FOREIGN KEY(period_id,user_id) REFERENCES aw_periods(id,user_id) ON DELETE CASCADE;
ALTER TABLE aw_jobs ADD COLUMN activity_session_id uuid;
ALTER TABLE aw_jobs ADD FOREIGN KEY(activity_session_id,user_id) REFERENCES aw_activity_sessions(id,user_id);
CREATE INDEX aw_interaction_cohort ON aw_interactions(user_id,branch_id,kind,created_at);
CREATE TABLE aw_feedback (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  branch_id uuid, period_id uuid,
  category text NOT NULL CHECK(category IN ('experience','language','repetition','consistency','decision','technical')),
  would_continue text CHECK(would_continue IN ('yes','maybe','no')),
  message text CHECK(char_length(message) BETWEEN 3 AND 1200),
  payload_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(message IS NOT NULL OR would_continue IS NOT NULL),
  CHECK(period_id IS NULL OR branch_id IS NOT NULL),
  FOREIGN KEY(branch_id,user_id) REFERENCES aw_branches(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(period_id,user_id) REFERENCES aw_periods(id,user_id) ON DELETE CASCADE
);
CREATE INDEX aw_feedback_user_day ON aw_feedback(user_id,created_at);
CREATE TRIGGER aw_feedback_immutable BEFORE UPDATE ON aw_feedback FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
ALTER TABLE aw_activity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE aw_feedback ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON aw_activity_sessions,aw_feedback FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON aw_activity_sessions,aw_feedback FROM authenticated; END IF;
END $$;
