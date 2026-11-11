import { z } from 'zod';
import { PUBLIC_REVIEW_VERSION } from './public-review';

const binding = {
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceRevision: z.number().int().nonnegative(),
  policyVersion: z.literal(PUBLIC_REVIEW_VERSION),
};
export const publicReviewJobRequestSchema = z
  .object({
    ...binding,
    acknowledged: z.literal(true),
  })
  .strict();
export type PublicReviewJobRequest = z.infer<
  typeof publicReviewJobRequestSchema
>;
export const publicReviewJobViewSchema = z
  .object({
    ...binding,
    publicationApproved: z.literal(false),
    enabled: z.boolean(),
    job: z
      .object({
        id: z.uuid(),
        status: z.enum([
          'queued',
          'running',
          'completed',
          'failed',
          'cancelled',
        ]),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type PublicReviewJobView = z.infer<typeof publicReviewJobViewSchema>;
