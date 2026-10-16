import { z } from 'zod';
import { periodCandidateV2Schema, periodChapterV2Schema } from './life-v2';
import {
  narrativeMemorySchema,
  narrativePlanSchema,
  narrativeMemoryDeltaSchema,
  narrativePlanningResultSchema,
  narrativePlanReviewV2Schema,
  narrativeEditorialReportSchema,
} from './narrative';

export const FICTION_MODE = 'narrative-fiction-v2' as const;
export const FICTION_FACT_BYTES = 6 * 1024;
export const storyFactSchema = z
  .object({
    id: z.uuid(),
    introducedByEventId: z.uuid(),
    aboutActorIds: z.array(z.uuid()).max(4),
    kind: z.enum([
      'encounter',
      'artifact',
      'setting',
      'relationship_detail',
      'promise',
      'outcome',
      'observation',
    ]),
    assertion: z.string().trim().min(10).max(300),
    supersedesFactId: z.uuid().nullable(),
    relevance: z.enum(['scene', 'continuity']),
  })
  .strict();
export type StoryFact = z.infer<typeof storyFactSchema>;
export const fictionPolicySchema = z
  .object({
    version: z.literal('2.0.0'),
    mode: z.literal(FICTION_MODE),
    promptVersions: z
      .object({
        planner: z.enum([
          'life_fiction_plan.v1',
          'life_fiction_plan.v2',
          'life_fiction_plan.v3',
        ]),
        writer: z.enum([
          'life_fiction_author.v1',
          'life_fiction_author.v2',
          'life_fiction_author.v3',
        ]),
        planReviewer: z.enum([
          'life_fiction_plan_review.v1',
          'life_fiction_plan_review.v2',
          'life_fiction_plan_review.v3',
        ]),
        fidelity: z.literal('life_fiction_fidelity.v1'),
        editor: z.enum(['life_fiction_editor.v1', 'life_fiction_editor.v2']),
      })
      .strict(),
    memoryVersion: z.literal('2.0.0'),
    qualityPolicyVersion: z.enum(['2.0.0', '2.1.0']),
    maxPhysicalRequests: z.literal(9),
    maxContentRepairs: z.literal(1),
    targetWords: z
      .object({ min: z.literal(650), max: z.literal(950) })
      .strict(),
  })
  .strict()
  .superRefine((policy, ctx) => {
    const v = policy.promptVersions.writer.split('.').at(-1);
    if (
      policy.promptVersions.planner !== `life_fiction_plan.${v}` ||
      policy.promptVersions.planReviewer !== `life_fiction_plan_review.${v}` ||
      policy.promptVersions.editor !==
        (v === 'v3' ? 'life_fiction_editor.v2' : 'life_fiction_editor.v1') ||
      policy.qualityPolicyVersion !== (v === 'v3' ? '2.1.0' : '2.0.0')
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Creative policies must freeze matching generation, review and quality versions.',
      });
  });
export type FictionPolicy = z.infer<typeof fictionPolicySchema>;
export function fictionV1Policy(): FictionPolicy {
  return {
    version: '2.0.0',
    mode: FICTION_MODE,
    promptVersions: {
      planner: 'life_fiction_plan.v1',
      writer: 'life_fiction_author.v1',
      planReviewer: 'life_fiction_plan_review.v1',
      fidelity: 'life_fiction_fidelity.v1',
      editor: 'life_fiction_editor.v1',
    },
    memoryVersion: '2.0.0',
    qualityPolicyVersion: '2.0.0',
    maxPhysicalRequests: 9,
    maxContentRepairs: 1,
    targetWords: { min: 650, max: 950 },
  };
}
// Select only for newly queued jobs; v1 remains readable and byte-frozen.
export function fictionV2Policy(): FictionPolicy {
  const previous = fictionV1Policy();
  return {
    ...previous,
    promptVersions: {
      ...previous.promptVersions,
      planner: 'life_fiction_plan.v2',
      writer: 'life_fiction_author.v2',
      planReviewer: 'life_fiction_plan_review.v2',
    },
  };
}
// New sequence-aware policy never rewrites a queued v1/v2 snapshot.
export function fictionPolicy(): FictionPolicy {
  const previous = fictionV2Policy();
  return {
    ...previous,
    qualityPolicyVersion: '2.1.0',
    promptVersions: {
      ...previous.promptVersions,
      planner: 'life_fiction_plan.v3',
      writer: 'life_fiction_author.v3',
      planReviewer: 'life_fiction_plan_review.v3',
      editor: 'life_fiction_editor.v2',
    },
  };
}
export const fictionSequenceEntrySchema = z
  .object({
    periodId: z.uuid(),
    scenes: z.array(z.string().max(300)).max(3),
    opening: z.string().max(400),
    ending: z.string().max(500),
  })
  .strict();
export type FictionSequenceEntry = z.infer<typeof fictionSequenceEntrySchema>;
export const fictionSequenceEditorialSchema = narrativeEditorialReportSchema
  .extend({
    version: z.literal('1.1.0'),
    sequenceReview: z
      .object({
        comparedPeriodIds: z.array(z.uuid()).max(3),
        distinctDramaticStructure: z.boolean(),
        distinctEnding: z.boolean(),
        independentProgression: z.boolean(),
        characterAgency: z.boolean(),
        evidence: z.string().min(40).max(700),
      })
      .strict(),
  })
  .strict();
export const fictionEditorialReportSchema = z.union([
  narrativeEditorialReportSchema,
  fictionSequenceEditorialSchema,
]);
export type FictionEditorialReport = z.infer<
  typeof fictionEditorialReportSchema
>;
// A technical pattern is a compact semantic label, not a clipped sentence.
export const fictionDecisionPatternSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+){1,9}$/);
export const fictionCompactPlanSchema = narrativePlanSchema
  .extend({
    decisionPattern: fictionDecisionPatternSchema,
    memoryDelta: narrativeMemoryDeltaSchema
      .extend({ decisionPattern: fictionDecisionPatternSchema })
      .strict(),
  })
  .strict();
export const fictionCompactDraftSchema = narrativePlanningResultSchema
  .extend({ plan: fictionCompactPlanSchema })
  .strict();
// The existing bounded memory remains strict and byte-compatible. New facts are
// a separately versioned projection, included in the SAME total input byte cap.
export const fictionContextSchema = z
  .object({
    policy: fictionPolicySchema,
    memory: narrativeMemorySchema,
    storyFacts: z.array(storyFactSchema).max(24),
    sequenceHistory: z.array(fictionSequenceEntrySchema).max(3).optional(),
  })
  .strict()
  .refine(
    (c) =>
      !c.memory.withheld ||
      (c.storyFacts.length === 0 && !c.sequenceHistory?.length),
    'Withheld fiction context cannot contain historical facts.',
  );
export type FictionContext = z.infer<typeof fictionContextSchema>;
export const fictionAuthorResultSchema = z
  .object({
    version: z.literal('2.0.0'),
    candidate: periodCandidateV2Schema,
    plan: narrativePlanSchema,
    storyFacts: z.array(storyFactSchema).max(12),
    chapter: periodChapterV2Schema,
  })
  .strict();
export const fictionCompactAuthorSchema = fictionAuthorResultSchema
  .extend({ plan: fictionCompactPlanSchema })
  .strict();
export type FictionAuthorResult = z.infer<typeof fictionAuthorResultSchema>;
// Metadata-only, server-owned full-prefix inventory. Never model input.
export const fictionReferencesSchema = z
  .object({
    facts: z
      .array(z.object({ id: z.uuid(), eventId: z.uuid() }).strict())
      .max(12000),
  })
  .strict();
export type FictionReferences = z.infer<typeof fictionReferencesSchema>;
export const fictionBindingKeys = [
  'policyHash',
  'memoryHash',
  'referenceHash',
  'fictionReferenceHash',
  'draftInputHash',
  'draftOutputHash',
  'authorInputHash',
  'authorOutputHash',
  'candidateHash',
  'canonHash',
  'planHash',
  'storyFactsHash',
  'chapterHash',
  'reviewInputHash',
  'reviewOutputHash',
  'fidelityInputHash',
  'fidelityOutputHash',
  'editorialInputHash',
  'editorialOutputHash',
] as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const bindingsShape = Object.fromEntries(
  fictionBindingKeys.map((key) => [key, digest]),
) as Record<(typeof fictionBindingKeys)[number], typeof digest>;
export const fictionArtifactSchema = z
  .object({
    version: z.literal('2.0.0'),
    pipelineVersion: z.literal(FICTION_MODE),
    policy: fictionPolicySchema,
    validatedPlan: narrativePlanSchema,
    validatedMemoryDelta: narrativePlanSchema.shape.memoryDelta,
    storyFacts: z.array(storyFactSchema).max(12),
    planningReview: narrativePlanReviewV2Schema,
    editorialReport: fictionEditorialReportSchema,
    bindings: z.object(bindingsShape).strict(),
    provenance: z
      .object({
        receiptRefs: z
          .array(
            z
              .object({
                task: z.enum([
                  'life_narrative_plan',
                  'life_narrative_chapter',
                  'life_narrative_plan_review',
                  'life_fidelity',
                  'life_narrative_editor',
                ]),
                ordinal: z.number().int().min(0).max(8),
                model: z.string().min(1).max(200),
                inputHash: digest,
                outputHash: digest,
              })
              .strict(),
          )
          .min(5)
          .max(9),
      })
      .strict(),
  })
  .strict();
export type FictionArtifact = z.infer<typeof fictionArtifactSchema>;
