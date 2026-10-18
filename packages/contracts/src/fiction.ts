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
          'life_fiction_plan.v4',
          'life_fiction_plan.v5',
          'life_fiction_plan.v6',
        ]),
        writer: z.enum([
          'life_fiction_author.v1',
          'life_fiction_author.v2',
          'life_fiction_author.v3',
          'life_fiction_author.v4',
          'life_fiction_author.v5',
          'life_fiction_author.v6',
        ]),
        planReviewer: z.enum([
          'life_fiction_plan_review.v1',
          'life_fiction_plan_review.v2',
          'life_fiction_plan_review.v3',
          'life_fiction_plan_review.v4',
          'life_fiction_plan_review.v5',
          'life_fiction_plan_review.v6',
        ]),
        fidelity: z.literal('life_fiction_fidelity.v1'),
        editor: z.enum([
          'life_fiction_editor.v1',
          'life_fiction_editor.v2',
          'life_fiction_editor.v3',
          'life_fiction_editor.v4',
          'life_fiction_editor.v5',
        ]),
      })
      .strict(),
    memoryVersion: z.literal('2.0.0'),
    qualityPolicyVersion: z.enum([
      '2.0.0',
      '2.1.0',
      '2.2.0',
      '2.3.0',
      '2.4.0',
      '2.5.0',
    ]),
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
        (v === 'v6'
          ? 'life_fiction_editor.v5'
          : v === 'v5'
            ? 'life_fiction_editor.v4'
            : v === 'v4'
              ? 'life_fiction_editor.v3'
              : v === 'v3'
                ? 'life_fiction_editor.v2'
                : 'life_fiction_editor.v1') ||
      (!(v === 'v6' && policy.qualityPolicyVersion === '2.5.0') &&
        policy.qualityPolicyVersion !==
          (v === 'v6'
            ? '2.4.0'
            : v === 'v5'
              ? '2.3.0'
              : v === 'v4'
                ? '2.2.0'
                : v === 'v3'
                  ? '2.1.0'
                  : '2.0.0'))
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
export function fictionV3Policy(): FictionPolicy {
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
// Select v4 only for newly queued jobs. Historical snapshots are immutable.
export function fictionV4Policy(): FictionPolicy {
  const previous = fictionV3Policy();
  return {
    ...previous,
    qualityPolicyVersion: '2.2.0',
    promptVersions: {
      ...previous.promptVersions,
      planner: 'life_fiction_plan.v4',
      writer: 'life_fiction_author.v4',
      planReviewer: 'life_fiction_plan_review.v4',
      editor: 'life_fiction_editor.v3',
    },
  };
}
// Preserve the measured v5 snapshot independently of the selected default.
export function fictionV5Policy(): FictionPolicy {
  const previous = fictionV4Policy();
  return {
    ...previous,
    qualityPolicyVersion: '2.3.0',
    promptVersions: {
      ...previous.promptVersions,
      planner: 'life_fiction_plan.v5',
      writer: 'life_fiction_author.v5',
      planReviewer: 'life_fiction_plan_review.v5',
      editor: 'life_fiction_editor.v4',
    },
  };
}
// Measured v6/quality2.4 retains sequential validation/repair behavior.
export function fictionV6Policy(): FictionPolicy {
  const previous = fictionV5Policy();
  return {
    ...previous,
    qualityPolicyVersion: '2.4.0',
    promptVersions: {
      ...previous.promptVersions,
      planner: 'life_fiction_plan.v6',
      writer: 'life_fiction_author.v6',
      planReviewer: 'life_fiction_plan_review.v6',
      editor: 'life_fiction_editor.v5',
    },
  };
}
// Newly queued jobs coordinate final-check feedback; all prompt bytes stay frozen.
export function fictionPolicy(): FictionPolicy {
  return { ...fictionV6Policy(), qualityPolicyVersion: '2.5.0' };
}
export const fictionSequenceSignatureSchema = z
  .object({
    version: z.literal('1.0.0'),
    periodId: z.uuid(),
    dramaticEngine: z.enum([
      'discovery',
      'negotiation',
      'failed_attempt',
      'social_friction',
      'material_experiment',
      'external_opportunity',
      'misunderstanding',
      'deadline_pressure',
      'role_reversal',
      'relationship_shift',
      'mixed',
      'other',
    ]),
    turningPointDriver: z.enum([
      'protagonist',
      'npc',
      'institution',
      'environment',
      'artifact',
      'chance',
      'shared',
      'mixed',
    ]),
    resolutionMode: z.enum([
      'partial_resolution',
      'unresolved',
      'reframe',
      'commitment',
      'withdrawal',
      'experiment',
      'external_response',
      'consequence',
      'mixed',
    ]),
    endingMode: z.enum([
      'open_choice',
      'tableau',
      'dialogue',
      'action_in_progress',
      'discovery',
      'consequence',
      'quiet_observation',
      'hard_stop',
      'other',
    ]),
    protagonistResponse: z.enum([
      'immediate_self_correction',
      'defend_then_change',
      'delayed_change',
      'persist',
      'misunderstand',
      'avoid',
      'act_without_resolution',
      'no_correction_arc',
      'mixed',
    ]),
    rhetoricalFlags: z
      .array(
        z.enum([
          'balanced_antithesis',
          'almost_then_stop',
          'explicit_moral',
          'object_tableau',
          'binary_option_briefing',
          'none',
        ]),
      )
      .min(1)
      .max(6),
    systemLeakageFlags: z
      .array(
        z.enum([
          'exact_boundary_date',
          'contractual_guardrail',
          'exit_clause_reassurance',
          'allocation_accounting',
          'none',
        ]),
      )
      .min(1)
      .max(5),
  })
  .strict()
  .superRefine((s, ctx) => {
    for (const key of ['rhetoricalFlags', 'systemLeakageFlags'] as const) {
      const values = s[key];
      if (
        new Set(values).size !== values.length ||
        (values.includes('none') && values.length !== 1)
      )
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message:
            'Flags must be unique; none cannot coexist with another flag.',
        });
    }
  });
export type FictionSequenceSignature = z.infer<
  typeof fictionSequenceSignatureSchema
>;
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
export const fictionHumanEditorialSchema = fictionSequenceEditorialSchema
  .extend({
    version: z.literal('1.2.0'),
    sequenceReview: fictionSequenceEditorialSchema.shape.sequenceReview
      .extend({
        comparedPeriodIds: z.array(z.uuid()).max(11),
        distinctRhetoricalShape: z.boolean(),
        systemMechanicsInvisible: z.boolean(),
        behavioralVariety: z.boolean(),
      })
      .strict(),
    sequenceSignature: fictionSequenceSignatureSchema,
  })
  .strict()
  .superRefine((report, ctx) => {
    const r = report.sequenceReview;
    const structural =
      !r.distinctDramaticStructure ||
      !r.independentProgression ||
      !r.characterAgency ||
      !r.behavioralVariety;
    const anyFailure =
      structural ||
      !r.distinctEnding ||
      !r.distinctRhetoricalShape ||
      !r.systemMechanicsInvisible;
    if (anyFailure && !report.issues.length)
      ctx.addIssue({
        code: 'custom',
        path: ['issues'],
        message: 'False sequence flags require repair evidence.',
      });
    if (structural && !report.issues.some((i) => i.repairScope === 'canon'))
      ctx.addIssue({
        code: 'custom',
        path: ['issues'],
        message:
          'Structural, agency and behavioral repetition require canon-scoped repair evidence.',
      });
  });
export const fictionEditorialReportSchema = z.union([
  narrativeEditorialReportSchema,
  fictionSequenceEditorialSchema,
  fictionHumanEditorialSchema,
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
    sequenceSignatureHistory: z
      .array(fictionSequenceSignatureSchema)
      .max(8)
      .optional(),
  })
  .strict()
  .refine(
    (c) =>
      !c.memory.withheld ||
      (c.storyFacts.length === 0 &&
        !c.sequenceHistory?.length &&
        !c.sequenceSignatureHistory?.length),
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
  .strict()
  .superRefine((artifact, ctx) => {
    const expected = ['2.2.0', '2.3.0', '2.4.0', '2.5.0'].includes(
      artifact.policy.qualityPolicyVersion,
    )
      ? '1.2.0'
      : artifact.policy.qualityPolicyVersion === '2.1.0'
        ? '1.1.0'
        : '1.0.0';
    if (artifact.editorialReport.version !== expected)
      ctx.addIssue({
        code: 'custom',
        path: ['editorialReport', 'version'],
        message: 'Artifact report version must match its frozen policy.',
      });
  });
export type FictionArtifact = z.infer<typeof fictionArtifactSchema>;
