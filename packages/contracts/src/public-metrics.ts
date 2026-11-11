import { z } from 'zod';
import { publicLifeSlugSchema } from './saved-lives';
export const PUBLIC_METRICS_VERSION = 'public-metrics-1';
export const publicReadingSignals = [
  'depth_25',
  'depth_50',
  'depth_75',
  'end_reached',
  'share_clicked',
  'link_copied',
  'copy_failed',
] as const;
export const publicReadingStartSchema = z
  .object({ readingId: z.uuid() })
  .strict();
export const publicReadingSessionSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_METRICS_VERSION),
    readingId: z.uuid(),
    slug: publicLifeSlugSchema,
    expiresAt: z.iso.datetime(),
  })
  .strict();
export const publicReadingSignalSchema = z
  .object({ readingId: z.uuid(), signal: z.enum(publicReadingSignals) })
  .strict();
export const publicReadingReceiptSchema = z
  .object({ received: z.literal(true), duplicate: z.boolean() })
  .strict();
export type PublicReadingSignal = (typeof publicReadingSignals)[number];
export type PublicReadingSession = z.infer<typeof publicReadingSessionSchema>;
