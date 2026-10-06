import { z } from 'zod';
import {
  PUBLIC_CONTENT_REVIEW_VERSION,
  publicContentReviewInputSchema,
  publicContentReviewReportSchema,
} from './public-content';

export const publicContentReviewJobRequestSchema = z
  .object({
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    policyVersion: z.literal(PUBLIC_CONTENT_REVIEW_VERSION),
    acknowledged: z.literal(true),
  })
  .strict();
export const publicContentReviewJobViewSchema = z
  .object({
    bundleId: z.uuid(),
    draftId: z.uuid(),
    snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceRevision: z.number().int().nonnegative(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    policyVersion: z.literal(PUBLIC_CONTENT_REVIEW_VERSION),
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
    report: publicContentReviewReportSchema.nullable(),
    fields: publicContentReviewInputSchema.shape.fields,
  })
  .strict();
export type PublicContentReviewJobView = z.infer<
  typeof publicContentReviewJobViewSchema
>;
