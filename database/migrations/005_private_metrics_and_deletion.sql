CREATE TABLE aw_interactions (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES ff_users ON DELETE CASCADE,
  branch_id uuid, session_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('onboarding_started','life_opened','chapter_end_reached','continuation_clicked','fork_clicked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(branch_id,user_id) REFERENCES aw_branches(id,user_id) ON DELETE CASCADE
);
CREATE TABLE aw_account_deletions (
  user_id uuid PRIMARY KEY REFERENCES ff_users ON DELETE CASCADE,
  status text NOT NULL CHECK(status IN ('awaiting_auth','auth_deleted')),
  requested_at timestamptz NOT NULL DEFAULT now(), auth_deleted_at timestamptz
);
ALTER TABLE aw_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE aw_account_deletions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON aw_interactions,aw_account_deletions FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON aw_interactions,aw_account_deletions FROM authenticated; END IF;
END $$;
