-- Keep only recent admission times, so deleting content cannot reset daily quotas.
CREATE TABLE aw_deleted_life_admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES ff_users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('generation','public_review')),
  admitted_at timestamptz NOT NULL
);
CREATE INDEX aw_deleted_life_admission_owner ON aw_deleted_life_admissions(user_id,kind,admitted_at);
CREATE INDEX aw_deleted_life_admission_expiry ON aw_deleted_life_admissions(admitted_at);
CREATE TRIGGER aw_deleted_life_admissions_immutable BEFORE UPDATE ON aw_deleted_life_admissions FOR EACH ROW EXECUTE FUNCTION ff_prevent_canon_update();
ALTER TABLE aw_deleted_life_admissions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON aw_deleted_life_admissions FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON aw_deleted_life_admissions FROM authenticated; END IF;
END $$;
