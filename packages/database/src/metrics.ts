import type { Database } from './index';
export async function privateMetricsSummary(db: Database) {
  const totals = (
    await db.query(`WITH first_lives AS (
    SELECT DISTINCT life_id FROM aw_metrics WHERE kind='first_period_completed'
  ),clicked AS (
    SELECT DISTINCT b.life_id FROM aw_interactions i JOIN aw_branches b ON b.id=i.branch_id
    JOIN first_lives f ON f.life_id=b.life_id WHERE i.kind='continuation_clicked'
  ),continued AS (
    SELECT DISTINCT m.life_id FROM aw_metrics m JOIN first_lives f ON f.life_id=m.life_id WHERE m.kind='continuation_completed'
  ),read_cohort AS (
    SELECT l.id AS life_id,l.user_id,l.root_branch_id,min(i.created_at) AS read_at
    FROM aw_lives l JOIN aw_history h ON h.branch_id=l.root_branch_id AND h.position=1
    JOIN aw_interactions i ON i.branch_id=h.branch_id AND i.period_id=h.period_id AND i.user_id=l.user_id
    WHERE i.kind='chapter_end_reached' AND i.activity_session_id IS NOT NULL GROUP BY l.id,l.user_id,l.root_branch_id
  ),successful_cohort AS (
    SELECT DISTINCT r.life_id FROM read_cohort r JOIN aw_jobs j ON j.branch_id=r.root_branch_id AND j.user_id=r.user_id
    WHERE j.status='completed' AND j.activity_session_id IS NOT NULL AND j.base_revision>0 AND j.created_at>=r.read_at
  ),first_sessions AS (
    SELECT b.life_id,i.user_id,min(s.started_at) AS first_at FROM aw_interactions i
    JOIN aw_branches b ON b.id=i.branch_id AND b.user_id=i.user_id
    JOIN aw_activity_sessions s ON s.id=i.activity_session_id AND s.user_id=i.user_id
    WHERE i.kind='life_opened' GROUP BY b.life_id,i.user_id
  ),successful_sessions AS (
    SELECT DISTINCT j.life_id,j.user_id,j.activity_session_id FROM aw_jobs j
    WHERE j.status='completed' AND j.activity_session_id IS NOT NULL AND j.base_revision>0
  ) SELECT (SELECT count(*)::int FROM first_lives) AS first_completed_lives,
    (SELECT count(*)::int FROM clicked) AS continuation_clicked_lives,
    (SELECT count(*)::int FROM continued) AS continued_lives,
    (SELECT count(*)::int FROM read_cohort) AS first_chapter_end_lives,
    (SELECT count(*)::int FROM successful_cohort) AS read_cohort_continued_lives,
    (SELECT count(*)::int FROM successful_sessions) AS continued_life_sessions,
    (SELECT count(*)::int FROM successful_sessions c JOIN first_sessions f ON f.life_id=c.life_id AND f.user_id=c.user_id JOIN aw_activity_sessions s ON s.id=c.activity_session_id AND s.user_id=c.user_id WHERE s.started_at>f.first_at) AS later_continued_life_sessions,
    (SELECT count(DISTINCT b.life_id)::int FROM aw_interactions i JOIN aw_branches b ON b.id=i.branch_id AND b.user_id=i.user_id JOIN first_sessions f ON f.life_id=b.life_id AND f.user_id=i.user_id JOIN aw_activity_sessions s ON s.id=i.activity_session_id AND s.user_id=i.user_id WHERE i.kind='life_opened' AND s.started_at>f.first_at) AS returned_lives,
    (SELECT count(*)::int FROM aw_jobs WHERE status='failed') AS failed_generations,
    (SELECT count(*)::int FROM aw_jobs WHERE activity_session_id IS NOT NULL AND status='failed') AS failed_session_continuations,
    (SELECT count(*)::int FROM aw_interactions WHERE kind='onboarding_started') AS onboarding_starts,
    (SELECT count(DISTINCT branch_id)::int FROM aw_interactions WHERE kind='chapter_end_reached') AS chapter_end_reached_branches`)
  )[0]!;
  return {
    ...totals,
    continuationClickRate: Number(totals.first_completed_lives)
      ? Number(totals.continuation_clicked_lives) /
        Number(totals.first_completed_lives)
      : null,
    continuationRate: Number(totals.first_chapter_end_lives)
      ? Number(totals.read_cohort_continued_lives) /
        Number(totals.first_chapter_end_lives)
      : null,
    continuedLifeSessions: Number(totals.continued_life_sessions),
    laterContinuedLifeSessions: Number(totals.later_continued_life_sessions),
    definition:
      'Beta measurement v1: sessions are user/browser-tab scoped, using server timestamps and a 30-minute inactivity boundary. Continuation Rate counts root lives with a first-chapter-end signal that subsequently complete an attributed root continuation. Continued Life Sessions counts distinct life/session pairs with a completed attributed continuation; later sessions start after the first recorded life-open session. Chapter-end visibility is not proof of reading. Historical unattributed requests are excluded from session metrics. No population retention or causal claim.',
  };
}
