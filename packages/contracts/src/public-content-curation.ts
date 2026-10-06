import { z } from 'zod';
import { PUBLIC_CONTENT_REVIEW_VERSION } from './public-content';

export const PUBLIC_CONTENT_CURATION_VERSION = 'public-content-curation-1';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const binding = {
  bundleId: z.uuid(),
  draftId: z.uuid(),
  snapshotHash: digest,
  sourceRevision: z.number().int().nonnegative(),
  contentHash: digest,
  policyVersion: z.literal(PUBLIC_CONTENT_REVIEW_VERSION),
  curationVersion: z.literal(PUBLIC_CONTENT_CURATION_VERSION),
};
const reasons = z.enum([
  'privacy',
  'content',
  'quality',
  'story_consistency',
  'other',
]);
export const publicContentCurationRequestSchema = z
  .object({
    contentHash: digest,
    reviewId: z.uuid(),
    reviewHash: digest,
    policyVersion: binding.policyVersion,
    curationVersion: binding.curationVersion,
    acknowledged: z.literal(true),
  })
  .strict();
export const publicContentCurationViewSchema = z
  .object({
    ...binding,
    scope: z.literal('story_and_selected_checkpoints'),
    publicationApproved: z.literal(false),
    enabled: z.boolean(),
    eligible: z.boolean(),
    reviewId: z.uuid().nullable(),
    reviewHash: digest.nullable(),
    curation: z
      .object({
        id: z.uuid(),
        status: z.enum([
          'pending',
          'content_reviewed',
          'changes_requested',
          'rejected',
        ]),
        reasonCode: reasons.nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type PublicContentCurationView = z.infer<
  typeof publicContentCurationViewSchema
>;
export const publicContentCurationDecisionSchema = z
  .object({
    ...binding,
    curationId: z.uuid(),
    reviewId: z.uuid(),
    reviewHash: digest,
    status: z.enum(['content_reviewed', 'changes_requested', 'rejected']),
    reasonCode: reasons.nullable(),
    actorLabel: z.string().trim().min(3).max(80),
    privacyChecked: z.literal(true),
    contentChecked: z.literal(true),
    consistencyChecked: z.literal(true),
  })
  .strict()
  .superRefine((input, ctx) => {
    if ((input.status === 'content_reviewed') !== (input.reasonCode === null))
      ctx.addIssue({
        code: 'custom',
        path: ['reasonCode'],
        message:
          'Reviewed content has no rejection reason; other decisions require one.',
      });
  });
