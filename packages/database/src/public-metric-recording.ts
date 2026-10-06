import type { Database } from './index';
export interface PublicMetricsConfig {
  enabled: boolean;
}
export function publicMetricsConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PublicMetricsConfig {
  const value = env.PUBLIC_METRICS_ENABLED ?? 'false';
  if (!['true', 'false'].includes(value))
    throw Error('Invalid public metrics flag');
  return { enabled: value === 'true' };
}
export type PublicMetricKind =
  | 'reading_started'
  | 'depth_25'
  | 'depth_50'
  | 'depth_75'
  | 'end_reached'
  | 'share_clicked'
  | 'link_copied'
  | 'copy_failed'
  | 'saved'
  | 'unsaved'
  | 'reported'
  | 'published'
  | 'owner_withdrawn'
  | 'hidden'
  | 'removed';
export type PublicMetricTarget = {
  id: string;
  classification: 'official' | 'community';
};
// Caller has already checked its real operation and locked the publication.
// Disabled analytics performs no query, and never changes an AI reservation.
export async function recordPublicMetric(
  tx: Database,
  target: PublicMetricTarget,
  kind: PublicMetricKind,
  config: PublicMetricsConfig,
) {
  if (!config.enabled) return;
  const column =
    target.classification === 'official'
      ? 'official_publication_id'
      : 'community_publication_id';
  await tx.query(
    `INSERT INTO aw_public_metrics_daily(${column},kind) VALUES($1,$2) ON CONFLICT(${column},day,kind) DO UPDATE SET total=LEAST(2147483646,aw_public_metrics_daily.total)+1`,
    [target.id, kind],
  );
}
