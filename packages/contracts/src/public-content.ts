import { z } from 'zod';
import { publicSnapshotDraftSchema } from './public-draft';
import { forkCheckpointSchema } from './public-fork';
import { publicReviewReportSchema } from './public-review';

export const PUBLIC_CONTENT_VERSION = 'public-content-1';
export const PUBLIC_CONTENT_REVIEW_VERSION = 'public-content-review-1';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const decisionKey = z.string().regex(/^decision-[1-9][0-9]{0,2}$/);
// The provider-facing content has symbolic references only, including its snapshot.
export const publicContentSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_CONTENT_VERSION),
    contentLocale: z.literal('en'),
    snapshot: publicSnapshotDraftSchema
      .omit({ snapshotKey: true })
      .extend({ locale: z.literal('en') }),
    checkpoints: z.array(forkCheckpointSchema).max(12),
    publicationApproved: z.literal(false),
  })
  .strict();
export type PublicContent = z.infer<typeof publicContentSchema>;
export const publicContentRequestSchema = z
  .object({
    snapshotHash: digest,
    sourceRevision: z.number().int().nonnegative(),
    selectedCheckpointIds: z.array(z.uuid()).max(12),
    acknowledged: z.literal(true),
  })
  .strict();
export const publicContentViewSchema = z
  .object({
    bundleId: z.uuid(),
    draftId: z.uuid(),
    snapshotHash: digest,
    sourceRevision: z.number().int().nonnegative(),
    contentHash: digest,
    selection: z
      .array(
        z
          .object({
            decisionKey,
            checkpointId: z.uuid(),
            checkpointHash: digest,
          })
          .strict(),
      )
      .max(12),
    content: publicContentSchema,
    status: z.literal('awaiting_review'),
    publicationApproved: z.literal(false),
  })
  .strict();
export type PublicContentView = z.infer<typeof publicContentViewSchema>;
export const publicContentWorkspaceSchema = z
  .object({
    enabled: z.boolean(),
    bundles: z.array(publicContentViewSchema).max(100),
  })
  .strict();
// Full typed content is included once; fields identify every scalar, including null.
export const publicContentReviewInputSchema = z
  .object({
    policyVersion: z.literal(PUBLIC_CONTENT_REVIEW_VERSION),
    content: publicContentSchema,
    fields: z
      .array(
        z
          .object({
            key: z.string().regex(/^field-[1-9][0-9]*$/),
            path: z
              .string()
              .regex(/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*$/)
              .max(200),
          })
          .strict(),
      )
      .min(3)
      .max(6000),
  })
  .strict();
export type PublicContentReviewInput = z.infer<
  typeof publicContentReviewInputSchema
>;
export const publicContentReviewReportSchema = publicReviewReportSchema
  .extend({
    policyVersion: z.literal(PUBLIC_CONTENT_REVIEW_VERSION),
    scope: z.literal('story_and_selected_checkpoints'),
    contentHash: digest,
    publicationApproved: z.literal(false),
    findings: z
      .array(
        publicReviewReportSchema.shape.findings.element
          .extend({
            category:
              publicReviewReportSchema.shape.findings.element.shape.category.or(
                z.enum(['meaning_mismatch', 'unverifiable_structure']),
              ),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type PublicContentReviewReport = z.infer<
  typeof publicContentReviewReportSchema
>;
