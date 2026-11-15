CREATE TABLE aw_political_start_history (
  user_id uuid NOT NULL REFERENCES ff_users(id) ON DELETE CASCADE,
  issue_key text NOT NULL,
  generated_subtype text,
  generated_premise text,
  CHECK (
    (issue_key ~ '^pol\.[a-z_]{3,40}$' AND generated_subtype IS NULL AND generated_premise IS NULL)
    OR (issue_key ~ '^generated:[0-9a-f]{64}$'
        AND generated_subtype IS NOT NULL
        AND generated_subtype IN ('local','organization','staff','civic')
        AND generated_premise IS NOT NULL AND char_length(generated_premise) BETWEEN 80 AND 400)
  ),
  PRIMARY KEY (user_id, issue_key)
);
ALTER TABLE aw_political_start_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE aw_political_start_history FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON TABLE aw_political_start_history FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON TABLE aw_political_start_history FROM authenticated;
  END IF;
END $$;

-- Only catalog identifiers are mapped. Free text and unknown legacy cases
-- have no reliable canonical issue identity.
INSERT INTO aw_political_start_history(user_id, issue_key)
SELECT user_id, input #>> '{story,startingSituation,id}'
FROM aw_lives
WHERE input #>> '{story,emphases,0,direction}' = 'politics'
  AND input #>> '{story,startingSituation,id}' IN (
    'pol.new_councillor','pol.local_cause','pol.party_branch','pol.union_or_chamber',
    'pol.succession','pol.campaign_staff','pol.adviser','pol.petition','pol.coalition',
    'pol.sensitive_information'
  )
ON CONFLICT DO NOTHING;
