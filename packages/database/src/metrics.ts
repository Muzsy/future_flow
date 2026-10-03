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
  ) SELECT (SELECT count(*)::int FROM first_lives) AS first_completed_lives,
    (SELECT count(*)::int FROM clicked) AS continuation_clicked_lives,
    (SELECT count(*)::int FROM continued) AS continued_lives,
    (SELECT count(*)::int FROM aw_jobs WHERE status='failed') AS failed_generations,
    (SELECT count(*)::int FROM aw_interactions WHERE kind='onboarding_started') AS onboarding_starts,
    (SELECT count(DISTINCT branch_id)::int FROM aw_interactions WHERE kind='chapter_end_reached') AS chapter_end_reached_branches`)
  )[0]!;
  return {
    ...totals,
    continuationClickRate: Number(totals.first_completed_lives)
      ? Number(totals.continuation_clicked_lives) /
        Number(totals.first_completed_lives)
      : null,
    continuedLifeSessions: null,
    definition:
      'Technical proxies: continuationClickRate counts lives with an explicit Continue click among lives with a completed first generation; continued_lives counts lives with a successfully saved additional period. Later-session Continued Life Sessions and the read-completion cohort are not measured yet. Reaching a chapter end is a reading signal, not proof of reading.',
  };
}
