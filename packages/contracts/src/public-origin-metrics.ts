import { z } from 'zod';

export const PUBLIC_ORIGIN_METRICS_VERSION = 'public-origin-metrics-1';
export const publicOriginMetricsQuerySchema = z
  .object({ windowDays: z.number().int().min(1).max(90).default(30) })
  .strict();
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const cohort = z
  .object({
    day: z.iso.date(),
    channel: z.enum([
      'official_public_checkpoint',
      'community_public_checkpoint',
      'official_personal_scenario',
    ]),
    createdLives: count,
    firstPeriodCompletedLives: count,
    secondPeriodCompletedLives: count,
    thirdPeriodCompletedLives: count,
  })
  .strict()
  .refine(
    (v) =>
      v.createdLives > 0 &&
      v.firstPeriodCompletedLives <= v.createdLives &&
      v.secondPeriodCompletedLives <= v.firstPeriodCompletedLives &&
      v.thirdPeriodCompletedLives <= v.secondPeriodCompletedLives,
    'Completion stages must be a subset of the creation cohort.',
  );
export const publicOriginMetricsReportSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_ORIGIN_METRICS_VERSION),
    windowDays: z.number().int().min(1).max(90),
    fromDay: z.iso.date(),
    throughDay: z.iso.date(),
    scope: z.literal('surviving_active_owner_lives_original_branch'),
    cohorts: z.array(cohort).max(270),
  })
  .strict()
  .superRefine((v, ctx) => {
    const days =
      (Date.parse(v.throughDay) - Date.parse(v.fromDay)) / 86400000 + 1;
    const seen = new Set<string>();
    let previous = '';
    if (days !== v.windowDays)
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid UTC reporting window.',
      });
    for (const row of v.cohorts) {
      const key = row.day + ':' + row.channel;
      if (
        row.day < v.fromDay ||
        row.day > v.throughDay ||
        seen.has(key) ||
        (previous && key < previous)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Invalid or duplicate cohort.',
        });
      seen.add(key);
      previous = key;
    }
  });
export type PublicOriginMetricsReport = z.infer<
  typeof publicOriginMetricsReportSchema
>;
