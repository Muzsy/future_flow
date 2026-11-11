import { z } from 'zod';

export const PUBLIC_CURATION_VERSION = 'text-curation-1';
const binding = {
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceRevision: z.number().int().nonnegative(),
  curationVersion: z.literal(PUBLIC_CURATION_VERSION),
};
export const publicCurationRequestSchema = z
  .object({ ...binding, acknowledged: z.literal(true) })
  .strict();
export const publicCurationViewSchema = z
  .object({
    ...binding,
    enabled: z.boolean(),
    scope: z.literal('text_only'),
    publicationApproved: z.literal(false),
    curation: z
      .object({
        id: z.uuid(),
        status: z.enum([
          'pending',
          'text_reviewed',
          'changes_requested',
          'rejected',
        ]),
        reasonCode: z
          .enum(['privacy', 'content', 'quality', 'story_consistency', 'other'])
          .nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type PublicCurationView = z.infer<typeof publicCurationViewSchema>;
export const publicCurationDecisionSchema = z
  .object({
    curationId: z.uuid(),
    snapshotHash: binding.snapshotHash,
    sourceRevision: binding.sourceRevision,
    status: z.enum(['text_reviewed', 'changes_requested', 'rejected']),
    reasonCode: z
      .enum(['privacy', 'content', 'quality', 'story_consistency', 'other'])
      .nullable(),
    actorLabel: z.string().trim().min(3).max(80),
    privacyChecked: z.literal(true),
    contentChecked: z.literal(true),
  })
  .strict()
  .superRefine((i, ctx) => {
    if ((i.status === 'text_reviewed') !== (i.reasonCode === null))
      ctx.addIssue({
        code: 'custom',
        path: ['reasonCode'],
        message:
          'Reviewed text has no rejection reason; other decisions require one.',
      });
  });
