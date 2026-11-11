import type { Database } from './index';
// Independent of measurement flags: turning collection off must not keep old IDs.
// A bounded, indexed batch also lets concurrent workers skip each other's rows.
export async function cleanupExpiredPublicReadings(db: Database) {
  const [storage] = await db.query<{ present: boolean }>(
    "SELECT to_regclass('public.aw_public_reading_sessions') IS NOT NULL AS present",
  );
  if (!storage?.present) return { deleted: 0, batchFull: false };
  const rows = await db.query(
    `DELETE FROM aw_public_reading_sessions WHERE id IN
     (SELECT id FROM aw_public_reading_sessions WHERE expires_at<now()-interval '24 hours'
      ORDER BY expires_at LIMIT 10000 FOR UPDATE SKIP LOCKED) RETURNING id`,
  );
  return { deleted: rows.length, batchFull: rows.length === 10000 };
}
// Trusted aggregate report only: no raw reading IDs, story or reader identity.
export async function publicMetricsSummary(db: Database) {
  const [storage] = await db.query<{ present: boolean }>(
    "SELECT to_regclass('public.aw_public_metrics_daily') IS NOT NULL AS present",
  );
  const daily = storage?.present
    ? await db.query(
        `SELECT day::text AS day,kind,sum(total)::text AS total FROM aw_public_metrics_daily
     WHERE day>=(now() AT TIME ZONE 'UTC')::date-89 GROUP BY day,kind ORDER BY day,kind`,
      )
    : [];
  return { schemaVersion: 'public-metrics-1', windowDays: 90, daily };
}
