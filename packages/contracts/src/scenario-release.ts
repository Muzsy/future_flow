import { z } from 'zod';
import { scenarioTemplateSchema } from './public-scenarios';
import { publicContentReviewReportSchema } from './public-content';

export const SCENARIO_REVIEW_VERSION = 'scenario-review-1';
export const SCENARIO_CURATION_VERSION = 'scenario-curation-1';
export const OFFICIAL_SCENARIO_SOURCE_VERSION = 'official-scenario-source-1';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const binding = {
  scenarioVersionId: z.uuid(),
  templateHash: digest,
  policyVersion: z.literal(SCENARIO_REVIEW_VERSION),
};
export const scenarioReviewInputSchema = z
  .object({
    policyVersion: binding.policyVersion,
    template: scenarioTemplateSchema,
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
      .max(3000),
  })
  .strict();
export const scenarioReviewReportSchema = publicContentReviewReportSchema
  .omit({
    policyVersion: true,
    scope: true,
    contentHash: true,
  })
  .extend({
    policyVersion: binding.policyVersion,
    scope: z.literal('complete_scenario_template'),
    templateHash: digest,
  })
  .strict();
export const scenarioReviewReceiptSchema = z
  .object({
    task: z.literal('scenario_review'),
    promptVersion: z.literal('scenario_review.v1.en'),
    locale: z.literal('en'),
    model: z.string().min(1).max(120),
    requestId: z.string().min(1).max(200).nullable(),
    inputHash: digest,
    outputHash: digest,
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cachedInputTokens: z.number().int().nonnegative().optional(),
    cacheWriteTokens: z.number().int().nonnegative().optional(),
    reasoningTokens: z.number().int().nonnegative().optional(),
    latencyMs: z.number().nonnegative(),
  })
  .strict();
export const scenarioReviewRequestSchema = z
  .object({
    ...binding,
    acknowledged: z.literal(true),
  })
  .strict();
const reviewedBinding = {
  ...binding,
  reviewId: z.uuid(),
  reportHash: digest,
  curationVersion: z.literal(SCENARIO_CURATION_VERSION),
};
const reason = z.enum([
  'privacy',
  'content',
  'quality',
  'meaning',
  'origin',
  'other',
]);
const actor = z.string().trim().min(3).max(80);
export const scenarioCurationDecisionSchema = z
  .object({
    ...reviewedBinding,
    status: z.enum(['scenario_reviewed', 'changes_requested', 'rejected']),
    reasonCode: reason.nullable(),
    actorLabel: actor,
    privacyChecked: z.literal(true),
    contentChecked: z.literal(true),
    meaningChecked: z.literal(true),
    qualityChecked: z.literal(true),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.status === 'scenario_reviewed') !== (v.reasonCode === null))
      ctx.addIssue({
        code: 'custom',
        path: ['reasonCode'],
        message: 'Decision reason mismatch.',
      });
  });
export const officialScenarioSourceRequestSchema = z
  .object({
    ...reviewedBinding,
    curationId: z.uuid(),
    sourceVersion: z.literal(OFFICIAL_SCENARIO_SOURCE_VERSION),
    fictionalSourceChecked: z.literal(true),
    rightsChecked: z.literal(true),
    acknowledged: z.literal(true),
    actorLabel: actor,
  })
  .strict();
export const officialScenarioSourceRevokeSchema = z
  .object({
    grantId: z.uuid(),
    templateHash: digest,
    reasonCode: reason,
    actorLabel: actor,
    acknowledged: z.literal(true),
  })
  .strict();
export const scenarioReleaseViewSchema = z
  .object({
    ...binding,
    current: z.boolean(),
    publicationApproved: z.literal(false),
    officialLifeApproved: z.literal(false),
    review: z
      .object({
        id: z.uuid(),
        status: z.enum(['running', 'completed', 'failed', 'cancelled']),
        report: scenarioReviewReportSchema.nullable(),
        reportHash: digest.nullable(),
        providerEvidence: z.boolean(),
      })
      .strict()
      .nullable(),
    curation: z
      .object({
        id: z.uuid(),
        status: z.enum(['scenario_reviewed', 'changes_requested', 'rejected']),
        curationVersion: z.literal(SCENARIO_CURATION_VERSION),
        reasonCode: reason.nullable(),
      })
      .strict()
      .nullable(),
    sourceGrant: z
      .object({
        id: z.uuid(),
        sourceVersion: z.literal(OFFICIAL_SCENARIO_SOURCE_VERSION),
        status: z.enum(['active', 'revoked']),
        usable: z.boolean(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type ScenarioReviewInput = z.infer<typeof scenarioReviewInputSchema>;
export type ScenarioReviewReport = z.infer<typeof scenarioReviewReportSchema>;
