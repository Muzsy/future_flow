import {
  PUBLIC_ORIGIN_METRICS_VERSION,
  publicOriginMetricsQuerySchema,
  publicOriginMetricsReportSchema,
} from '@future-flow/contracts';
import type { Database } from './index';

// Trusted operator report over existing operational records. No writes, reader
// IDs, public endpoint, analytics tracking or source popularity ranking.
export async function publicOriginMetricsSummary(
  db: Database,
  raw: unknown = {},
) {
  const { windowDays } = publicOriginMetricsQuerySchema.parse(raw);
  const [result] = await db.query<{
    from_day: string;
    through_day: string;
    cohorts: unknown;
  }>(
    `WITH bounds AS (
      SELECT (now() AT TIME ZONE 'UTC')::date AS through_day,
      (now() AT TIME ZONE 'UTC')::date-($1::int-1) AS from_day
    ), origins AS (
      SELECT s.life_id,s.branch_id,s.user_id,s.created_at,
        CASE s.source_kind WHEN 'official' THEN 'official_public_checkpoint'
        ELSE 'community_public_checkpoint' END AS channel
      FROM aw_public_fork_starts s CROSS JOIN bounds b
      WHERE s.created_at>=b.from_day::timestamp AT TIME ZONE 'UTC'
        AND s.created_at<(b.through_day+1)::timestamp AT TIME ZONE 'UTC'
      UNION ALL
      SELECT s.life_id,s.branch_id,s.user_id,s.created_at,'official_personal_scenario'
      FROM aw_personal_scenario_starts s CROSS JOIN bounds b
      WHERE s.created_at>=b.from_day::timestamp AT TIME ZONE 'UTC'
        AND s.created_at<(b.through_day+1)::timestamp AT TIME ZONE 'UTC'
    ), progress AS (
      SELECT (o.created_at AT TIME ZONE 'UTC')::date AS day,o.channel,
        COALESCE((SELECT array_agg(DISTINCT h.position) FROM aw_history h
          JOIN aw_periods p ON p.id=h.period_id AND p.user_id=o.user_id
            AND p.life_id=o.life_id AND p.branch_id=o.branch_id
          WHERE h.branch_id=o.branch_id AND h.user_id=o.user_id
            AND h.life_id=o.life_id AND h.position BETWEEN 1 AND 3
            AND EXISTS(SELECT 1 FROM aw_jobs j WHERE j.user_id=o.user_id
              AND j.life_id=o.life_id AND j.branch_id=o.branch_id
              AND j.payload->>'periodId'=p.id::text AND j.status='completed')
        ),ARRAY[]::integer[]) AS positions
      FROM origins o JOIN ff_users u ON u.id=o.user_id AND u.status='active'
    ), daily AS (
      SELECT day::text AS day,channel,count(*)::int AS "createdLives",
        count(*) FILTER(WHERE positions @> ARRAY[1])::int AS "firstPeriodCompletedLives",
        count(*) FILTER(WHERE positions @> ARRAY[1,2])::int AS "secondPeriodCompletedLives",
        count(*) FILTER(WHERE positions @> ARRAY[1,2,3])::int AS "thirdPeriodCompletedLives"
      FROM progress GROUP BY day,channel
    ) SELECT b.from_day::text,b.through_day::text,
      COALESCE((SELECT json_agg(d ORDER BY d.day,d.channel) FROM daily d),'[]'::json) AS cohorts
    FROM bounds b`,
    [windowDays],
  );
  return publicOriginMetricsReportSchema.parse({
    schemaVersion: PUBLIC_ORIGIN_METRICS_VERSION,
    windowDays,
    fromDay: result?.from_day,
    throughDay: result?.through_day,
    scope: 'surviving_active_owner_lives_original_branch',
    cohorts: result?.cohorts,
  });
}
