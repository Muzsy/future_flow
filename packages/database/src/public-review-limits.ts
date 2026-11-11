import type { Database } from './index';
import { deletedLifeAdmissionSql } from './life-deletion';

// Call with the owner locked. Text, full-content and scenario reviews share limits.
export async function publicReviewLimits(tx: Database, userId: string) {
  const [storage] = await tx.query(
    "SELECT to_regclass('public.aw_public_content_reviews') IS NOT NULL AS present",
  );
  const full = storage?.present === true;
  const [scenarioStorage] = await tx.query(
    "SELECT to_regclass('public.aw_scenario_reviews') IS NOT NULL AS present",
  );
  const scenarios = scenarioStorage?.present === true;
  if (scenarios)
    await tx.query(
      `UPDATE aw_scenario_reviews r SET status='failed',lease_token=NULL,lease_until=NULL,finished_at=now()
    FROM aw_scenario_versions v,aw_scenarios s WHERE r.user_id=$1 AND r.status='running' AND v.id=r.scenario_version_id AND s.id=v.scenario_id AND (r.lease_until<=now() OR s.current_version<>v.version)`,
      [userId],
    );
  const stale = await tx.query<{ review_id: string }>(
    `UPDATE aw_public_review_jobs j SET status='failed',lease_token=NULL,lease_until=NULL,finished_at=now()
    FROM aw_publication_drafts d,aw_branches b WHERE j.user_id=$1 AND d.id=j.draft_id AND b.id=d.branch_id AND
    ((j.status='running' AND j.lease_until<=now()) OR (j.status='queued' AND (d.expires_at<=now() OR d.source_revision<>b.revision))) RETURNING j.review_id`,
    [userId],
  );
  for (const job of stale)
    await tx.query(
      "UPDATE aw_public_draft_reviews SET status='failed',failure_code='PUBLIC_REVIEW_INTERRUPTED',finished_at=now() WHERE id=$1 AND status='running'",
      [job.review_id],
    );
  if (full) {
    await tx.query(
      `UPDATE aw_public_content_reviews j SET status='failed',lease_token=NULL,lease_until=NULL,finished_at=now(),failure_code='PUBLIC_CONTENT_REVIEW_INTERRUPTED'
      FROM aw_publication_drafts d,aw_branches b WHERE j.user_id=$1 AND d.id=j.draft_id AND b.id=d.branch_id AND
      ((j.status='running' AND j.lease_until<=now()) OR (j.status='queued' AND (d.expires_at<=now() OR d.source_revision<>b.revision)))`,
      [userId],
    );
  }
  const [limits] = await tx.query<{ daily: string; concurrent: string }>(
    `SELECT count(*) FILTER(WHERE created_at>now()-interval '24 hours')::text AS daily,
    count(*) FILTER(WHERE status IN ('queued','running'))::text AS concurrent FROM (
    SELECT created_at,status FROM aw_public_review_jobs WHERE user_id=$1
    ${full ? 'UNION ALL SELECT created_at,status FROM aw_public_content_reviews WHERE user_id=$1' : ''}
    ${scenarios ? 'UNION ALL SELECT created_at,status FROM aw_scenario_reviews WHERE user_id=$1' : ''} ${await deletedLifeAdmissionSql(tx, 'public_review')}) reviews`,
    [userId],
  );
  return limits!;
}
