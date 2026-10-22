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
import {
  fictionCharacterDeltaSchema,
  fictionCharacterIntentSchema,
  fictionContinuityDecisionSchema,
  FICTION_CHARACTER_CONTINUITY,
  fictionCharacterProjectionSchema,
  FICTION_CHARACTER_INTENTS,
} from './fiction-character';

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
          'life_fiction_plan.v7',
          'life_fiction_plan.v8',
          'life_fiction_plan.v9',
        ]),
        writer: z.enum([
          'life_fiction_author.v1',
          'life_fiction_author.v2',
          'life_fiction_author.v3',
          'life_fiction_author.v4',
          'life_fiction_author.v5',
          'life_fiction_author.v6',
          'life_fiction_author.v7',
          'life_fiction_author.v8',
          'life_fiction_author.v9',
        ]),
        planReviewer: z.enum([
          'life_fiction_plan_review.v1',
          'life_fiction_plan_review.v2',
          'life_fiction_plan_review.v3',
          'life_fiction_plan_review.v4',
          'life_fiction_plan_review.v5',
          'life_fiction_plan_review.v6',
          'life_fiction_plan_review.v7',
          'life_fiction_plan_review.v8',
          'life_fiction_plan_review.v9',
        ]),
        fidelity: z.literal('life_fiction_fidelity.v1'),
        editor: z.enum([
          'life_fiction_editor.v1',
          'life_fiction_editor.v2',
          'life_fiction_editor.v3',
          'life_fiction_editor.v4',
          'life_fiction_editor.v5',
          'life_fiction_editor.v6',
          'life_fiction_editor.v7',
          'life_fiction_editor.v8',
          'life_fiction_editor.v9',
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
      '2.6.0',
      '2.7.0',
      '2.8.0',
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
      !(v === 'v9'
        ? // A v9 snapshot made before the v9 editor prompt keeps the v8 editor
          // text and stays readable; new v9 jobs select the v9 editor.
          ['life_fiction_editor.v8', 'life_fiction_editor.v9'].includes(
            policy.promptVersions.editor,
          )
        : policy.promptVersions.editor ===
          (v === 'v8'
            ? 'life_fiction_editor.v7'
            : v === 'v7'
              ? 'life_fiction_editor.v6'
              : v === 'v6'
                ? 'life_fiction_editor.v5'
                : v === 'v5'
                  ? 'life_fiction_editor.v4'
                  : v === 'v4'
                    ? 'life_fiction_editor.v3'
                    : v === 'v3'
                      ? 'life_fiction_editor.v2'
                      : 'life_fiction_editor.v1')) ||
      (!(v === 'v6' && policy.qualityPolicyVersion === '2.5.0') &&
        policy.qualityPolicyVersion !==
          (v === 'v9'
            ? '2.8.0'
            : v === 'v8'
              ? '2.7.0'
              : v === 'v7'
                ? '2.6.0'
                : v === 'v6'
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
// Measured v6/quality2.5 coordinates final-check feedback; merged as the
// PR #50 checkpoint and kept explicit so its snapshot stays reproducible.
export function fictionV6Quality25Policy(): FictionPolicy {
  return { ...fictionV6Policy(), qualityPolicyVersion: '2.5.0' };
}
// v7/quality2.6 keeps the quality2.5 coordination and adds signature 1.1.0.
export function fictionV7Policy(): FictionPolicy {
  const previous = fictionV6Quality25Policy();
  return {
    ...previous,
    qualityPolicyVersion: '2.6.0',
    promptVersions: {
      ...previous.promptVersions,
      planner: 'life_fiction_plan.v7',
      writer: 'life_fiction_author.v7',
      planReviewer: 'life_fiction_plan_review.v7',
      editor: 'life_fiction_editor.v6',
    },
  };
}
// v8/quality2.7 adds deterministic series evidence (ledger, echo findings,
// casting palette); report 1.3.0, gates and repair budget stay unchanged.
export function fictionV8Policy(): FictionPolicy {
  const previous = fictionV7Policy();
  return {
    ...previous,
    qualityPolicyVersion: '2.7.0',
    promptVersions: {
      ...previous.promptVersions,
      planner: 'life_fiction_plan.v8',
      writer: 'life_fiction_author.v8',
      planReviewer: 'life_fiction_plan_review.v8',
      editor: 'life_fiction_editor.v7',
    },
  };
}
// v9/quality2.8 (living world, ADR-009) keeps every v8 mechanism and adds the
// recurring-character state: a server-built projection in the request and a
// character delta in the final package. v8 stays frozen; report 1.3.0, the
// gates, 9 physical requests and the single repair are unchanged.
export function fictionV9Policy(): FictionPolicy {
  const previous = fictionV8Policy();
  return {
    ...previous,
    qualityPolicyVersion: '2.8.0',
    promptVersions: {
      ...previous.promptVersions,
      planner: 'life_fiction_plan.v9',
      writer: 'life_fiction_author.v9',
      planReviewer: 'life_fiction_plan_review.v9',
      editor: 'life_fiction_editor.v9',
    },
  };
}
// Newly queued jobs select v8 unless a generation is chosen explicitly (the
// living-world generation is opt-in); every older snapshot stays byte-frozen.
export function fictionPolicy(): FictionPolicy {
  return fictionV8Policy();
}
// Quality policies that receive the deterministic series ledger.
export const fictionSeriesQualityVersions: readonly string[] = [
  '2.7.0',
  '2.8.0',
];
// Quality policies that carry the recurring-character state (ADR-009).
export const fictionCharacterQualityVersions: readonly string[] = ['2.8.0'];
// Quality policies whose fidelity failure goes straight to the repair, without
// the editor call that the coordinated policies make first (the editor passed
// on every measured package that failed fidelity, so that call only cost a
// request). The policy version stays 2.8.0: v9 is opt-in and not deployed, and
// the v9-6b to 6g measurements are documented as the earlier behaviour.
export const fictionFidelityFirstRepairQualityVersions: readonly string[] = [
  '2.8.0',
];
// Quality policies that may introduce up to three recurring actors a period.
export const fictionThreeActorQualityVersions: readonly string[] = [
  '2.6.0',
  '2.7.0',
  '2.8.0',
];
// Quality policies with editor report 1.3.0 and signature 1.1.0.
export const fictionReport13QualityVersions: readonly string[] = [
  '2.6.0',
  '2.7.0',
  '2.8.0',
];
// Quality policies that coordinate fidelity and editor feedback before repair.
export const fictionCoordinatedQualityVersions: readonly string[] = [
  '2.5.0',
  '2.6.0',
  '2.7.0',
  '2.8.0',
];
// Quality policies whose editor emits a human-likeness report (1.2.0+).
export const fictionHumanQualityVersions: readonly string[] = [
  '2.2.0',
  '2.3.0',
  '2.4.0',
  '2.5.0',
  '2.6.0',
  '2.7.0',
  '2.8.0',
];
export function fictionEditorialVersionFor(qualityPolicyVersion: string) {
  return fictionReport13QualityVersions.includes(qualityPolicyVersion)
    ? '1.3.0'
    : fictionHumanQualityVersions.includes(qualityPolicyVersion)
      ? '1.2.0'
      : qualityPolicyVersion === '2.1.0'
        ? '1.1.0'
        : '1.0.0';
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
  .superRefine(uniqueSignatureFlags);
function uniqueSignatureFlags(
  s: { rhetoricalFlags: string[]; systemLeakageFlags: string[] },
  ctx: z.RefinementCtx,
) {
  for (const key of ['rhetoricalFlags', 'systemLeakageFlags'] as const) {
    const values = s[key];
    if (
      new Set(values).size !== values.length ||
      (values.includes('none') && values.length !== 1)
    )
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: 'Flags must be unique; none cannot coexist with another flag.',
      });
  }
}
// Signature 1.1.0 (quality2.6 only) adds one series-level pattern signal.
// 1.0.0 above stays byte-identical for every frozen editor request schema.
export const fictionSequenceSignatureV11Schema = z
  .object({
    ...fictionSequenceSignatureSchema.shape,
    version: z.literal('1.1.0'),
    rhetoricalFlags: z
      .array(
        z.enum([
          'balanced_antithesis',
          'almost_then_stop',
          'explicit_moral',
          'object_tableau',
          'binary_option_briefing',
          'overexplain_while_other_busy',
          'none',
        ]),
      )
      .min(1)
      .max(7),
  })
  .strict()
  .superRefine(uniqueSignatureFlags);
export const fictionAnySequenceSignatureSchema = z.union([
  fictionSequenceSignatureSchema,
  fictionSequenceSignatureV11Schema,
]);
export type FictionSequenceSignature = z.infer<
  typeof fictionAnySequenceSignatureSchema
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
  .superRefine(humanReportEvidence);
function humanReportEvidence(
  report: {
    issues: { repairScope: string }[];
    sequenceReview: Record<
      | 'distinctDramaticStructure'
      | 'independentProgression'
      | 'characterAgency'
      | 'behavioralVariety'
      | 'distinctEnding'
      | 'distinctRhetoricalShape'
      | 'systemMechanicsInvisible',
      boolean
    >;
  },
  ctx: z.RefinementCtx,
) {
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
}
// Report 1.3.0 (editor v6 / quality2.6) differs from 1.2.0 only by carrying
// the 1.1.0 sequence signature; review flags and gates are unchanged.
export const fictionHumanEditorialV13Schema = z
  .object({
    ...fictionHumanEditorialSchema.shape,
    version: z.literal('1.3.0'),
    sequenceSignature: fictionSequenceSignatureV11Schema,
  })
  .strict()
  .superRefine(humanReportEvidence);
export const fictionEditorialReportSchema = z.union([
  narrativeEditorialReportSchema,
  fictionSequenceEditorialSchema,
  fictionHumanEditorialSchema,
  fictionHumanEditorialV13Schema,
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
// The central turn of a period, named by the planner from a fixed catalogue
// (v9 only). Snake_case labels, no numeric scale; `other` and null never count
// in the deterministic rotation. A planning note and a diagnostic, never a gate.
export const FICTION_TURN_TYPES = [
  'attempt_meets_resistance',
  'outsider_reads_the_work',
  'other_persons_aim_crosses',
  'old_matter_returns',
  'event_from_outside',
  'success_with_price',
  'relationship_shift',
  'protagonist_refuses_or_withdraws',
  'delayed_cost_of_earlier_choice',
  'quiet_persistence',
  'other',
] as const;
export const fictionTurnTypeSchema = z.enum(FICTION_TURN_TYPES);
export type FictionTurnType = z.infer<typeof fictionTurnTypeSchema>;
// Living-world draft: what the relevant people do for their own reasons. The
// provider output schema requires the turnType key (null when not labelled,
// strict provider schemas have no optional fields). Stored drafts of the first
// 2.8.0 runs carry no turnType and are still read with the lenient schema.
function livingDraft<T extends z.ZodType>(turnType: T) {
  return fictionCompactDraftSchema
    .extend({
      characterIntent: z
        .array(fictionCharacterIntentSchema)
        .max(FICTION_CHARACTER_INTENTS),
      continuityDecisions: z
        .array(fictionContinuityDecisionSchema)
        .max(FICTION_CHARACTER_CONTINUITY),
      turnType,
    })
    .strict()
    .refine(
      (draft) =>
        new Set(draft.characterIntent.map((i) => i.actorId)).size ===
        draft.characterIntent.length,
      'A person has one intent per draft.',
    )
    .refine(
      (draft) =>
        new Set(draft.continuityDecisions.map((d) => d.actorId)).size ===
        draft.continuityDecisions.length,
      'A person has one continuity decision per draft.',
    );
}
export const fictionCompactDraftV9Schema = livingDraft(
  fictionTurnTypeSchema.nullable(),
);
export const fictionStoredDraftV9Schema = livingDraft(
  fictionTurnTypeSchema.nullable().optional(),
);
export type FictionDraftV9 = z.infer<typeof fictionStoredDraftV9Schema>;
// Deterministic, server-computed evidence over this life's owned chapters
// (quality2.7). Counts are evidence, never quotas; see core fiction-series.
export const FICTION_SERIES_LEDGER_BYTES = 3 * 1024;
const seriesEchoSchema = z
  .object({
    text: z.string().min(1).max(80),
    count: z.number().int().min(1).max(100000),
    chapters: z.number().int().min(1).max(1000),
  })
  .strict();
const fictionSeriesLedgerObject = z
  .object({
    version: z.literal('1.0.0'),
    ownedChapters: z.number().int().min(0).max(1000),
    repeatedOpenings: z.array(seriesEchoSchema).max(6),
    repeatedPhrases: z.array(seriesEchoSchema).max(6),
    frictionBeat: z
      .object({
        chaptersWithMarkers: z.number().int().min(0).max(1000),
        recentRun: z.number().int().min(0).max(1000),
        recentMarkers: z.array(z.string().min(1).max(40)).max(8),
      })
      .strict(),
    recentClosings: z
      .array(
        z
          .object({ periodId: z.uuid(), sentence: z.string().max(200) })
          .strict(),
      )
      .max(6),
    privateLife: z
      .array(
        z
          .object({
            actorId: z.uuid(),
            relationship: z.enum(['partner', 'family', 'friend']),
            chaptersPresent: z.number().int().min(0).max(1000),
            chaptersSinceLast: z.number().int().min(0).max(1000).nullable(),
          })
          .strict(),
      )
      .max(12),
    goalActivity: z
      .array(
        z
          .object({
            goalId: z.uuid(),
            chaptersSinceProgressChange: z
              .number()
              .int()
              .min(0)
              .max(1000)
              .nullable(),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();
const ledgerBytes = (l: unknown) =>
  new TextEncoder().encode(JSON.stringify(l)).length;
export const fictionSeriesLedgerSchema = fictionSeriesLedgerObject.refine(
  (l) => ledgerBytes(l) <= FICTION_SERIES_LEDGER_BYTES,
  'Series ledger exceeds its byte bound.',
);
// Living-world generation only (ledger 1.1.0): the same evidence plus the
// recurring fictional cast and the turn rotation. Still deterministic,
// server-computed evidence, never a quota. v8 keeps 1.0.0 and its 3 KiB bound.
export const FICTION_SERIES_LEDGER_V11_BYTES = 4 * 1024;
export const FICTION_RECURRING_CAST_MAX = 6;
export const FICTION_RECENT_TURNS_MAX = 6;
export const FICTION_RESTING_TURNS_MAX = 2;
// The rotation catalogue: every type except `other`, which never counts.
const rotatingTurnTypeSchema = fictionTurnTypeSchema.exclude(['other']);
export const FICTION_ROTATING_TURN_TYPES = rotatingTurnTypeSchema.options;
export const fictionSeriesLedgerV11Schema = fictionSeriesLedgerObject
  .extend({
    version: z.literal('1.1.0'),
    recurringCast: z
      .array(
        z
          .object({
            actorId: z.uuid(),
            chaptersPresent: z.number().int().min(0).max(1000),
            chaptersSinceLast: z.number().int().min(0).max(1000).nullable(),
            openMatter: z.boolean(),
          })
          .strict(),
      )
      .max(FICTION_RECURRING_CAST_MAX),
    recentTurns: z
      .array(fictionTurnTypeSchema.nullable())
      .max(FICTION_RECENT_TURNS_MAX),
    turnQueue: z
      .array(rotatingTurnTypeSchema)
      .max(FICTION_ROTATING_TURN_TYPES.length),
    restingTurns: z
      .array(rotatingTurnTypeSchema)
      .max(FICTION_RESTING_TURNS_MAX),
  })
  .strict()
  .refine(
    (l) => ledgerBytes(l) <= FICTION_SERIES_LEDGER_V11_BYTES,
    'Series ledger exceeds its byte bound.',
  )
  .refine(
    (l) => new Set(l.turnQueue).size === l.turnQueue.length,
    'The turn queue lists a type once.',
  );
export const fictionAnySeriesLedgerSchema = z.union([
  fictionSeriesLedgerSchema,
  fictionSeriesLedgerV11Schema,
]);
export type FictionSeriesLedger = z.infer<typeof fictionAnySeriesLedgerSchema>;
export type FictionSeriesLedgerV11 = z.infer<
  typeof fictionSeriesLedgerV11Schema
>;
// The existing bounded memory remains strict and byte-compatible. New facts are
// a separately versioned projection, included in the SAME total input byte cap.
export const fictionContextSchema = z
  .object({
    policy: fictionPolicySchema,
    memory: narrativeMemorySchema,
    storyFacts: z.array(storyFactSchema).max(24),
    sequenceHistory: z.array(fictionSequenceEntrySchema).max(3).optional(),
    sequenceSignatureHistory: z
      .array(fictionAnySequenceSignatureSchema)
      .max(8)
      .optional(),
    seriesLedger: fictionAnySeriesLedgerSchema.optional(),
    // Living-world generation only: the bounded, deterministic view of the
    // recurring characters. Part of the request and therefore of its hash.
    characterProjection: fictionCharacterProjectionSchema.optional(),
  })
  .strict()
  .refine(
    (c) =>
      fictionReport13QualityVersions.includes(c.policy.qualityPolicyVersion) ||
      !c.sequenceSignatureHistory?.some((s) => s.version !== '1.0.0'),
    'Only quality2.6+ fiction context may carry signature 1.1.0 history.',
  )
  .refine(
    (c) =>
      !c.seriesLedger ||
      fictionSeriesQualityVersions.includes(c.policy.qualityPolicyVersion),
    'Only quality2.7 fiction context may carry a series ledger.',
  )
  .refine(
    (c) =>
      c.seriesLedger?.version !== '1.1.0' ||
      fictionCharacterQualityVersions.includes(c.policy.qualityPolicyVersion),
    'Only quality2.8 fiction context may carry series ledger 1.1.0.',
  )
  .refine(
    (c) =>
      Boolean(c.characterProjection) ===
      fictionCharacterQualityVersions.includes(c.policy.qualityPolicyVersion),
    'Only quality2.8 fiction context carries a character projection, and it must.',
  )
  .refine(
    (c) =>
      !c.memory.withheld ||
      (c.storyFacts.length === 0 &&
        !c.sequenceHistory?.length &&
        !c.sequenceSignatureHistory?.length &&
        !c.seriesLedger &&
        !c.characterProjection?.actors.length),
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
// Living-world final package: the v8 package plus this period's character delta.
// The key order is the generation order of a strict structured output: the
// chapter comes BEFORE the story facts, so the facts are a register of what the
// prose really contains (the model's own check in the same call), instead of a
// plan the prose then drifts from. Stored v9 packages parse by key, so their
// order does not matter.
export const fictionCompactAuthorV9Schema = z
  .object({
    version: z.literal('2.0.0'),
    candidate: periodCandidateV2Schema,
    plan: fictionCompactPlanSchema,
    chapter: periodChapterV2Schema,
    storyFacts: z.array(storyFactSchema).max(12),
    characterDelta: fictionCharacterDeltaSchema,
  })
  .strict();
export type FictionAuthorResultV9 = z.infer<
  typeof fictionCompactAuthorV9Schema
>;
// Output schemas are chosen by the frozen policy, never by the payload shape,
// so a v1-v8 output can never be read with the v9 meaning (plan section 23).
export function fictionDraftSchemaFor(policy: FictionPolicy) {
  return fictionCharacterQualityVersions.includes(policy.qualityPolicyVersion)
    ? fictionCompactDraftV9Schema
    : policy.promptVersions.planner !== 'life_fiction_plan.v1'
      ? fictionCompactDraftSchema
      : narrativePlanningResultSchema;
}
export function fictionAuthorSchemaFor(policy: FictionPolicy) {
  return fictionCharacterQualityVersions.includes(policy.qualityPolicyVersion)
    ? fictionCompactAuthorV9Schema
    : policy.promptVersions.writer !== 'life_fiction_author.v1'
      ? fictionCompactAuthorSchema
      : fictionAuthorResultSchema;
}
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
// Present only in the living-world generation (policy-gated below).
export const fictionCharacterBindingKeys = [
  'characterStateHash',
  'characterProjectionHash',
  'characterDeltaHash',
] as const;
const bindingsShape = {
  ...(Object.fromEntries(
    fictionBindingKeys.map((key) => [key, digest]),
  ) as Record<(typeof fictionBindingKeys)[number], typeof digest>),
  ...(Object.fromEntries(
    fictionCharacterBindingKeys.map((key) => [key, digest.optional()]),
  ) as Record<
    (typeof fictionCharacterBindingKeys)[number],
    z.ZodOptional<typeof digest>
  >),
};
export const fictionArtifactSchema = z
  .object({
    version: z.literal('2.0.0'),
    pipelineVersion: z.literal(FICTION_MODE),
    policy: fictionPolicySchema,
    validatedPlan: narrativePlanSchema,
    validatedMemoryDelta: narrativePlanSchema.shape.memoryDelta,
    storyFacts: z.array(storyFactSchema).max(12),
    // Living-world generation only; the fold of these deltas is the state.
    characterDelta: fictionCharacterDeltaSchema.optional(),
    // Living-world generation only: the planner's label of the central turn,
    // copied from the draft (diagnostic evidence; stored 2.8.0 artifacts that
    // predate it carry no key).
    turnType: fictionTurnTypeSchema.nullable().optional(),
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
    const expected = fictionEditorialVersionFor(
      artifact.policy.qualityPolicyVersion,
    );
    if (artifact.editorialReport.version !== expected)
      ctx.addIssue({
        code: 'custom',
        path: ['editorialReport', 'version'],
        message: 'Artifact report version must match its frozen policy.',
      });
    const living = fictionCharacterQualityVersions.includes(
      artifact.policy.qualityPolicyVersion,
    );
    if (
      living !== Boolean(artifact.characterDelta) ||
      fictionCharacterBindingKeys.some(
        (key) => living !== Boolean(artifact.bindings[key]),
      )
    )
      ctx.addIssue({
        code: 'custom',
        path: ['characterDelta'],
        message:
          'Only the living-world policy carries a character delta and its bindings, and it must.',
      });
    if (!living && artifact.turnType !== undefined)
      ctx.addIssue({
        code: 'custom',
        path: ['turnType'],
        message: 'Only the living-world policy carries a turn type.',
      });
  });
export type FictionArtifact = z.infer<typeof fictionArtifactSchema>;
