import { z } from 'zod';
import { periodCandidateV2Schema, type LifePeriodInput } from './life-v2';

export const NARRATIVE_CONTEXT_VERSION = '1.0.0';
export const NARRATIVE_MEMORY_BYTES = 12 * 1024;
export const NARRATIVE_WITHHELD_SUMMARY =
  'Recorded personal history. Narrative details are withheld; the current personal state remains authoritative and no past choice is inferred.';
const id = z.uuid();
const short = z.string().trim().min(1).max(80);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
export const narrativeThreadSchema = z
  .object({
    id,
    originPeriodId: id,
    originEventId: id,
    kind: z.enum(['goal', 'relationship', 'opportunity', 'conflict', 'motif']),
    summary: text(40, 300),
    status: z.enum(['open', 'progressed', 'resolved', 'dropped']),
    dueByPeriodOffset: z.union([z.literal(1), z.literal(2)]),
    lastTouchedPeriodId: id,
    eventRefs: z.array(id).min(1).max(4),
  })
  .strict();
export const fictionalActorMemorySchema = z
  .object({
    actorId: id,
    introducedByEventId: id,
    role: text(20, 120),
    desire: text(20, 200),
    resistance: text(20, 200),
    voiceCue: text(20, 120),
    lastSeenPeriodId: id,
  })
  .strict();
export type NarrativeThread = z.infer<typeof narrativeThreadSchema>;
export type FictionalActorMemory = z.infer<typeof fictionalActorMemorySchema>;
export const narrativeMemorySchema = z
  .object({
    version: z.literal(NARRATIVE_CONTEXT_VERSION),
    branchId: id,
    baseRevision: z.number().int().nonnegative(),
    history: z
      .array(
        z
          .object({
            periodId: id,
            startDate: z.iso.date(),
            endDate: z.iso.date(),
            position: z.number().int().positive(),
            summary: z.string().min(80).max(500),
            salientEventIds: z.array(id).max(3),
            excerpt: z.string().max(1200).nullable(),
          })
          .strict(),
      )
      .max(8),
    recentChoices: z
      .array(
        z
          .object({
            decisionId: id,
            optionId: id,
            acceptedAt: z.iso.datetime({ offset: true }),
            label: z.string().min(1).max(200),
            changesSummary: z.string().max(500),
          })
          .strict(),
      )
      .max(10),
    openThreads: z.array(narrativeThreadSchema).max(6),
    fictionalActors: z.array(fictionalActorMemorySchema).max(12),
    recentDecisionPatterns: z.array(short).max(4),
    withheld: z.boolean(),
  })
  .strict()
  .refine(
    (memory) =>
      !memory.withheld ||
      (memory.recentChoices.length === 0 &&
        memory.openThreads.length === 0 &&
        memory.fictionalActors.length === 0 &&
        memory.recentDecisionPatterns.length === 0 &&
        memory.history.every(
          (period) =>
            period.summary === NARRATIVE_WITHHELD_SUMMARY &&
            period.excerpt === null &&
            period.salientEventIds.length === 0,
        )),
    'Withheld narrative memory contains private text.',
  );
export type NarrativeMemory = z.infer<typeof narrativeMemorySchema>;
// Owned server reference inventory, persisted as plain JSON and never sent to AI.
export const narrativeReferenceSnapshotSchema = z
  .object({
    periodPositions: z
      .array(
        z
          .object({ periodId: id, position: z.number().int().positive() })
          .strict(),
      )
      .max(1000),
    historyEventIds: z.array(id).max(5000),
    usedCanonicalIds: z.array(id).max(25000),
    usedThreadIds: z.array(id).max(6000),
    forbiddenActorIds: z.array(id).max(1000),
    forbiddenActorLabels: z.array(z.string().min(1).max(160)).max(1000),
    fictionalActorOrigins: z
      .array(z.object({ actorId: id, introducedByEventId: id }).strict())
      .max(1000),
  })
  .strict();
export type NarrativeReferenceSnapshot = z.infer<
  typeof narrativeReferenceSnapshotSchema
>;
export const narrativeContextSchema = z
  .object({
    policy: z
      .object({
        version: z.literal(NARRATIVE_CONTEXT_VERSION),
        mode: z.literal('context'),
        promptVersions: z
          .object({
            planner: z.null(),
            writer: z.literal('life_chapter.v5.context'),
            fidelity: z.literal('life_fidelity.v4.context'),
            editor: z.null(),
          })
          .strict(),
        memoryVersion: z.literal(NARRATIVE_CONTEXT_VERSION),
        qualityPolicyVersion: z.null(),
        maxPhysicalRequests: z.null(),
        maxContentRepairs: z.literal(1),
        targetWords: z
          .object({ min: z.literal(250), max: z.literal(600) })
          .strict(),
      })
      .strict(),
    memory: narrativeMemorySchema.safeExtend({
      openThreads: z.array(narrativeThreadSchema).length(0),
      fictionalActors: z.array(fictionalActorMemorySchema).length(0),
    }),
  })
  .strict()
  .refine(
    (context) =>
      context.memory.openThreads.length === 0 &&
      context.memory.fictionalActors.length === 0,
    'Context mode has no narrative actor or thread artifacts.',
  );
export type NarrativeContext = z.infer<typeof narrativeContextSchema>;
export type NarrativePeriodInput = LifePeriodInput & {
  narrativeContext?: NarrativeContext | NarrativeV1Context;
  narrativeReferences?: NarrativeReferenceSnapshot;
};
export function contextNarrativePolicy(): NarrativeContext['policy'] {
  return {
    version: NARRATIVE_CONTEXT_VERSION,
    mode: 'context',
    promptVersions: {
      planner: null,
      writer: 'life_chapter.v5.context',
      fidelity: 'life_fidelity.v4.context',
      editor: null,
    },
    memoryVersion: NARRATIVE_CONTEXT_VERSION,
    qualityPolicyVersion: null,
    maxPhysicalRequests: null,
    maxContentRepairs: 1,
    targetWords: { min: 250, max: 600 },
  };
}

export const narrativeV1PolicySchema = z
  .object({
    version: z.literal('1.0.0'),
    mode: z.literal('narrative-v1'),
    promptVersions: z
      .object({
        planner: z.enum([
          'life_narrative_plan.v1',
          'life_narrative_plan.v2',
          'life_narrative_plan.v3',
          'life_narrative_plan.v4',
        ]),
        writer: z.enum([
          'life_narrative_chapter.v1',
          'life_narrative_chapter.v2',
          'life_narrative_chapter.v3',
          'life_narrative_chapter.v4',
        ]),
        planReviewer: z
          .enum([
            'life_narrative_plan_review.v1',
            'life_narrative_plan_review.v2',
          ])
          .optional(),
        fidelity: z.literal('life_fidelity.v4.narrative'),
        editor: z.literal('life_narrative_editor.v1'),
      })
      .strict(),
    memoryVersion: z.literal('1.0.0'),
    qualityPolicyVersion: z.literal('1.0.0'),
    maxPhysicalRequests: z.union([z.literal(7), z.literal(8)]),
    maxContentRepairs: z.literal(1),
    targetWords: z
      .object({ min: z.literal(650), max: z.literal(950) })
      .strict(),
  })
  .strict()
  .superRefine((policy, context) => {
    if (
      (policy.promptVersions.planner === 'life_narrative_plan.v4') !==
      (policy.promptVersions.planReviewer === 'life_narrative_plan_review.v2')
    )
      context.addIssue({
        code: 'custom',
        message:
          'Planner v4 requires the frozen readiness review v2, and vice versa.',
      });
    if (
      policy.maxPhysicalRequests !==
      (policy.promptVersions.planReviewer ? 8 : 7)
    )
      context.addIssue({
        code: 'custom',
        message:
          'The request ceiling must match the frozen planning-review policy.',
      });
  });
export type NarrativeV1Policy = z.infer<typeof narrativeV1PolicySchema>;
export function narrativeV1Policy(): NarrativeV1Policy {
  return {
    version: '1.0.0',
    mode: 'narrative-v1',
    promptVersions: {
      planner: 'life_narrative_plan.v3',
      writer: 'life_narrative_chapter.v2',
      fidelity: 'life_fidelity.v4.narrative',
      editor: 'life_narrative_editor.v1',
    },
    memoryVersion: '1.0.0',
    qualityPolicyVersion: '1.0.0',
    maxPhysicalRequests: 7,
    maxContentRepairs: 1,
    targetWords: { min: 650, max: 950 },
  };
}
// New queue policy; the original factory remains byte-compatible for old jobs.
export function reviewedNarrativePolicy(): NarrativeV1Policy {
  const previous = narrativeV1Policy();
  return {
    ...previous,
    promptVersions: {
      ...previous.promptVersions,
      writer: 'life_narrative_chapter.v3',
      planReviewer: 'life_narrative_plan_review.v1',
    },
    maxPhysicalRequests: 8,
  };
}
// Readiness-v2 baseline; this factory stays frozen for queued writer-v3 jobs.
export function readyNarrativePolicy(): NarrativeV1Policy {
  const previous = reviewedNarrativePolicy();
  return {
    ...previous,
    promptVersions: {
      ...previous.promptVersions,
      planner: 'life_narrative_plan.v4',
      planReviewer: 'life_narrative_plan_review.v2',
    },
  };
}
// Scene-execution candidate; readiness-v2/writer-v3 remains a frozen baseline.
export function sceneNarrativePolicy(): NarrativeV1Policy {
  const previous = readyNarrativePolicy();
  return {
    ...previous,
    promptVersions: {
      ...previous.promptVersions,
      writer: 'life_narrative_chapter.v4',
    },
  };
}
// Storage preparation only: queue configuration still rejects narrative-v1
// until the provider, worker and privacy-memory integration are complete.
export const narrativeV1ContextSchema = z
  .object({
    policy: narrativeV1PolicySchema,
    memory: narrativeMemorySchema,
  })
  .strict();
export type NarrativeV1Context = z.infer<typeof narrativeV1ContextSchema>;
export const narrativeMemoryDeltaSchema = z
  .object({
    periodSummary: text(80, 500),
    salientEventIds: z.array(id).min(1).max(3),
    threadUpdates: z.array(narrativeThreadSchema).max(6),
    actorUpdates: z.array(fictionalActorMemorySchema).max(2),
    decisionPattern: short,
  })
  .strict();
export type NarrativeMemoryDelta = z.infer<typeof narrativeMemoryDeltaSchema>;
export const narrativeSceneSchema = z
  .object({
    sceneId: id,
    eventIds: z.array(id).min(1).max(3),
    purpose: z.enum(['setup', 'pressure', 'payoff', 'turning_point']),
    locationRef: text(1, 200).nullable(),
    actorIds: z.array(id).max(4),
    visibleAction: text(40, 300),
    obstacle: text(40, 300),
    shift: text(40, 300),
    dialogueIntent: text(1, 200).nullable(),
  })
  .strict();
export const narrativePlanSchema = z
  .object({
    premise: text(80, 400),
    centralTension: text(80, 400),
    scenes: z.array(narrativeSceneSchema).min(2).max(3),
    turningPointEventId: id,
    choiceConsequences: z
      .array(
        z
          .object({
            decisionId: id,
            optionId: id,
            eventIds: z.array(id).min(1).max(3),
            disposition: z.enum(['paid_off', 'advanced', 'delayed']),
            explanation: text(40, 300),
            threadId: id.nullable(),
          })
          .strict(),
      )
      .max(3),
    decisionStakes: z
      .array(
        z
          .object({
            optionId: id,
            eventIds: z.array(id).min(1).max(3),
            cost: text(20, 200),
            possibleGain: text(20, 200),
            uncertainty: text(20, 200),
          })
          .strict(),
      )
      .min(2)
      .max(4),
    decisionPattern: short,
    memoryDelta: narrativeMemoryDeltaSchema,
  })
  .strict();
export type NarrativePlan = z.infer<typeof narrativePlanSchema>;
export const narrativePlanningResultSchema = z
  .object({
    version: z.literal('1.0.0'),
    candidate: periodCandidateV2Schema,
    plan: narrativePlanSchema,
  })
  .strict();
export type NarrativePlanningResult = z.infer<
  typeof narrativePlanningResultSchema
>;
export const narrativeDimensions = [
  'causality',
  'momentum',
  'sceneCraft',
  'character',
  'personalization',
  'choiceStakes',
  'novelty',
  'prose',
] as const;
export type NarrativeDimension = (typeof narrativeDimensions)[number];
const grade = z.number().int().min(1).max(5);
export const narrativeEditorialReportSchema = z
  .object({
    version: z.literal('1.0.0'),
    scores: z
      .object({
        causality: grade,
        momentum: grade,
        sceneCraft: grade,
        character: grade,
        personalization: grade,
        choiceStakes: grade,
        novelty: grade,
        prose: grade,
      })
      .strict(),
    issues: z
      .array(
        z
          .object({
            dimension: z.enum(narrativeDimensions),
            severity: z.enum(['minor', 'major']),
            repairScope: z.enum(['prose', 'canon']),
            paragraphIndex: z.number().int().positive().nullable(),
            eventIds: z.array(id).max(3),
            explanation: text(30, 350),
            suggestedFix: text(30, 350),
          })
          .strict(),
      )
      .max(8),
    verdict: z.enum(['pass', 'revise']),
  })
  .strict();
export type NarrativeEditorialReport = z.infer<
  typeof narrativeEditorialReportSchema
>;
export const narrativePlanReviewDimensions = [
  'causality',
  'agency',
  'novelty',
  'choiceStakes',
] as const;
export const narrativePlanReviewV1Schema = z
  .object({
    version: z.literal('1.0.0'),
    scores: z
      .object({
        causality: grade,
        agency: grade,
        novelty: grade,
        choiceStakes: grade,
      })
      .strict(),
    issues: z
      .array(
        z
          .object({
            dimension: z.enum(narrativePlanReviewDimensions),
            severity: z.enum(['minor', 'major']),
            eventIds: z.array(id).max(3),
            explanation: text(30, 350),
            suggestedFix: text(30, 350),
          })
          .strict(),
      )
      .max(6),
    verdict: z.enum(['pass', 'revise']),
  })
  .strict();
export const narrativePlanReadinessSchema = z
  .object({
    summariesComplete: z.boolean(),
    decisionPatternComplete: z.boolean(),
    periodDevelopmentSufficient: z.boolean(),
  })
  .strict();
export const narrativePlanReviewV2Schema = narrativePlanReviewV1Schema
  .extend({
    version: z.literal('1.1.0'),
    readiness: narrativePlanReadinessSchema,
  })
  .strict();
// Storage accepts history; the provider chooses one exact object schema.
export const narrativePlanReviewSchema = z.discriminatedUnion('version', [
  narrativePlanReviewV1Schema,
  narrativePlanReviewV2Schema,
]);
export type NarrativePlanReview = z.infer<typeof narrativePlanReviewSchema>;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const narrativeArtifactSchema = z
  .object({
    version: z.literal('1.0.0'),
    pipelineVersion: z.literal('narrative-v1'),
    policy: narrativeV1PolicySchema,
    validatedPlan: narrativePlanSchema,
    validatedMemoryDelta: narrativeMemoryDeltaSchema,
    editorialReport: narrativeEditorialReportSchema,
    planningReview: narrativePlanReviewSchema.optional(),
    bindings: z
      .object({
        policyHash: digest,
        memoryHash: digest,
        referenceHash: digest,
        candidateHash: digest,
        canonHash: digest,
        planHash: digest,
        planningOutputHash: digest,
        storyInputHash: digest,
        chapterHash: digest,
        fidelityInputHash: digest,
        fidelityOutputHash: digest,
        editorialInputHash: digest,
        planningReviewInputHash: digest.optional(),
        planningReviewOutputHash: digest.optional(),
      })
      .strict(),
    provenance: z
      .object({
        promptVersions: narrativeV1PolicySchema.shape.promptVersions,
        receiptRefs: z
          .array(
            z
              .object({
                task: z.enum([
                  'life_narrative_plan',
                  'life_narrative_plan_review',
                  'life_narrative_chapter',
                  'life_fidelity',
                  'life_narrative_editor',
                ]),
                ordinal: z.number().int().min(0).max(7),
                inputHash: digest,
                outputHash: digest,
                model: text(1, 200),
              })
              .strict(),
          )
          .min(4)
          .max(8),
      })
      .strict(),
  })
  .strict()
  .superRefine((artifact, context) => {
    const required = !!artifact.policy.promptVersions.planReviewer;
    const supplied = [
      artifact.planningReview,
      artifact.bindings.planningReviewInputHash,
      artifact.bindings.planningReviewOutputHash,
    ];
    if (supplied.some((value) => (value !== undefined) !== required))
      context.addIssue({
        code: 'custom',
        message:
          'Planning review and both bindings must match the frozen policy.',
      });
    if (
      required &&
      artifact.planningReview?.version !==
        (artifact.policy.promptVersions.planReviewer ===
        'life_narrative_plan_review.v2'
          ? '1.1.0'
          : '1.0.0')
    )
      context.addIssue({
        code: 'custom',
        message: 'Planning review version differs from its frozen policy.',
      });
    if (
      artifact.provenance.receiptRefs.length >
      artifact.policy.maxPhysicalRequests
    )
      context.addIssue({
        code: 'custom',
        message: 'Receipt count exceeds its frozen ceiling.',
      });
  });
export type NarrativeArtifact = z.infer<typeof narrativeArtifactSchema>;
export const NARRATIVE_ARTIFACT_BYTES = 32 * 1024;
