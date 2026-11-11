import { z } from 'zod';
import { hash, DomainError } from '@future-flow/core';
import {
  narrativeDimensions,
  type NarrativeDimension,
} from '@future-flow/contracts';
import { narrativeProfiles } from '../../tests/narrative-fixtures';

export const evaluationVersion = 'narrative-evaluation-1';
export type EvaluationMode = 'legacy' | 'narrative-v1';
const scoreSchema = z
  .object(
    Object.fromEntries(
      narrativeDimensions.map((d) => [d, z.number().int().min(1).max(5)]),
    ) as Record<NarrativeDimension, z.ZodNumber>,
  )
  .strict();
export const humanRatingSchema = z
  .object({
    pairId: z.string().min(1).max(120),
    pairHash: z.string().regex(/^[a-f0-9]{64}$/),
    reviewerId: z.string().min(1).max(80),
    preferred: z.enum(['A', 'B', 'tie']),
    scoresA: scoreSchema,
    scoresB: scoreSchema,
    reasons: z
      .array(
        z
          .object({
            side: z.enum(['A', 'B']),
            paragraphIndex: z.number().int().positive(),
            reason: z.string().trim().min(30).max(600),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict();
export type HumanRating = z.infer<typeof humanRatingSchema>;
export const choiceOverrideSchema = z
  .object({
    fixtureId: z.enum(
      narrativeProfiles.map((p) => p.id) as [string, ...string[]],
    ),
    mode: z.enum(['legacy', 'narrative-v1']),
    periodIndex: z.number().int().min(0).max(2),
    branchKind: z.enum(['main', 'fork']),
    optionId: z.uuid(),
    decisionHash: z.string().regex(/^[a-f0-9]{64}$/),
    intent: z.enum(['bounded-follow-up', 'different-method']),
    rationale: z.string().trim().min(40).max(400),
    reviewed: z.literal(true),
  })
  .strict();
export type ChoiceOverride = z.infer<typeof choiceOverrideSchema>;
export type ChoiceOption = {
  id: string;
  label: string;
  description: string;
  changes: unknown[];
};

// These intents are frozen before generation. Matching is conservative: ambiguous
// text stops the experiment and needs an explicit, hash-bound semantic review.
export function choiceIntent(
  fixtureId: string,
  periodIndex: number,
  branchKind: 'main' | 'fork' = 'main',
): 'bounded-follow-up' | 'different-method' {
  if (branchKind === 'fork')
    return choiceIntent(fixtureId, periodIndex, 'main') === 'different-method'
      ? 'bounded-follow-up'
      : 'different-method';
  return fixtureId === 'career-transition' && periodIndex === 1
    ? ('different-method' as const)
    : ('bounded-follow-up' as const);
}
export function selectEvaluationChoice(
  options: ChoiceOption[],
  intent: ChoiceOverride['intent'],
  override?: ChoiceOverride,
) {
  const decisionHash = hash(options);
  if (override) {
    const parsed = choiceOverrideSchema.parse(override);
    if (
      parsed.intent !== intent ||
      parsed.decisionHash !== decisionHash ||
      !options.some((o) => o.id === parsed.optionId)
    )
      throw new DomainError(
        'EVAL_CHOICE_REVIEW_INVALID',
        'The reviewed choice does not match the saved decision.',
      );
    return {
      optionId: parsed.optionId,
      intent,
      decisionHash,
      selection: 'reviewed' as const,
      rationale: parsed.rationale,
    };
  }
  const bounded =
    /\b(smaller|bounded|limited|narrower|refine|internal trial|small pilot|reduce|focused follow-up)\b/i;
  const different =
    /\b(different|alternative method|switch|external portfolio|new method|another approach)\b/i;
  const candidates = options.filter((o) => {
    const text = `${o.label} ${o.description}`;
    return intent === 'bounded-follow-up'
      ? bounded.test(text) && !different.test(text)
      : different.test(text) && !bounded.test(text);
  });
  if (candidates.length !== 1)
    throw new DomainError(
      'EVAL_CHOICE_REVIEW_REQUIRED',
      'The frozen choice intent needs a reviewed semantic mapping.',
    );
  return {
    optionId: candidates[0]!.id,
    intent,
    decisionHash,
    selection: 'conservative-text-match' as const,
    rationale: `One option uniquely matches the frozen ${intent} vocabulary; this match still requires review before release evidence.`,
  };
}

export type BlindPair = {
  pairId: string;
  pairHash: string;
  kind: 'full' | 'fixed-canon' | 'fork';
  fixtureId: string;
  periodIndex: number;
  modeA: EvaluationMode;
  modeB: EvaluationMode;
  paragraphsA: number;
  paragraphsB: number;
};
export function blindOrder(
  seed: string,
  pairId: string,
): readonly [EvaluationMode, EvaluationMode] {
  return parseInt(hash({ seed, pairId }).slice(0, 2), 16) % 2
    ? ['legacy', 'narrative-v1']
    : ['narrative-v1', 'legacy'];
}
const critical: readonly NarrativeDimension[] = [
  'causality',
  'momentum',
  'sceneCraft',
  'choiceStakes',
  'prose',
];
export function assessHumanRatings(
  pairs: BlindPair[],
  raw: unknown,
  paidComplete: boolean,
  operations?: {
    meanCostUsd: number;
    p95Ms: number;
    maxMeanCostUsd: number;
    maxP95Ms: number;
    hardFailures: number;
    allChoiceMappingsReviewed: boolean;
  },
) {
  const ratings = z.array(humanRatingSchema).max(1000).parse(raw),
    keys = new Set<string>(),
    known = new Map(pairs.map((p) => [p.pairId, p]));
  for (const rating of ratings) {
    const pair = known.get(rating.pairId),
      key = `${rating.reviewerId}:${rating.pairId}`;
    if (!pair || pair.pairHash !== rating.pairHash || keys.has(key))
      throw new DomainError(
        'EVAL_RATING_INVALID',
        'Unknown or duplicate reviewed pair.',
      );
    keys.add(key);
    if (
      rating.reasons.some(
        (r) =>
          r.paragraphIndex >
          (r.side === 'A' ? pair.paragraphsA : pair.paragraphsB),
      )
    )
      throw new DomainError(
        'EVAL_RATING_INVALID',
        'A human reason refers beyond the saved chapter.',
      );
  }
  const full = pairs.filter((p) => p.kind === 'full');
  let wins = 0,
    ties = 0,
    nonTies = 0;
  const scores = Object.fromEntries(
    critical.map((d) => [d, [] as number[]]),
  ) as Record<(typeof critical)[number], number[]>;
  for (const pair of full) {
    const group = ratings.filter((r) => r.pairId === pair.pairId);
    if (!group.length) continue;
    let narrative = 0,
      legacy = 0,
      tiedVotes = 0;
    for (const rating of group) {
      const selected =
        rating.preferred === 'tie'
          ? null
          : rating.preferred === 'A'
            ? pair.modeA
            : pair.modeB;
      if (selected === 'narrative-v1') narrative++;
      else if (selected === 'legacy') legacy++;
      else tiedVotes++;
    }
    for (const d of critical)
      scores[d].push(
        group.reduce(
          (sum, rating) =>
            sum +
            (pair.modeA === 'narrative-v1'
              ? rating.scoresA[d]
              : rating.scoresB[d]),
          0,
        ) / group.length,
      );
    if (narrative === legacy || tiedVotes >= Math.max(narrative, legacy))
      ties++;
    else {
      nonTies++;
      if (narrative > legacy) wins++;
    }
  }
  const preference = nonTies ? wins / nonTies : null;
  const z95 = 1.96,
    denominator = 1 + (z95 * z95) / (nonTies || 1);
  const center =
    preference === null
      ? null
      : (preference + (z95 * z95) / (2 * nonTies)) / denominator;
  const radius =
    preference === null
      ? null
      : (z95 *
          Math.sqrt(
            (preference * (1 - preference)) / nonTies +
              (z95 * z95) / (4 * nonTies * nonTies),
          )) /
        denominator;
  const preferenceWilson95 =
    center === null || radius === null
      ? null
      : {
          low: Math.max(0, center - radius),
          high: Math.min(1, center + radius),
        };
  const means = Object.fromEntries(
    critical.map((d) => [
      d,
      scores[d].length
        ? scores[d].reduce((a, b) => a + b, 0) / scores[d].length
        : null,
    ]),
  );
  const eligible =
    paidComplete &&
    full.length >= 24 &&
    pairs.every((p) => ratings.some((r) => r.pairId === p.pairId));
  const operational =
    !!operations &&
    [
      operations.meanCostUsd,
      operations.p95Ms,
      operations.maxMeanCostUsd,
      operations.maxP95Ms,
    ].every((v) => Number.isFinite(v) && v >= 0) &&
    operations.hardFailures === 0 &&
    operations.allChoiceMappingsReviewed &&
    operations.maxMeanCostUsd > 0 &&
    operations.maxP95Ms > 0 &&
    operations.meanCostUsd <= operations.maxMeanCostUsd &&
    operations.p95Ms <= operations.maxP95Ms;
  // Number of pairs, not number of votes: duplicated raters cannot inflate n.
  return {
    ratings: ratings.length,
    reviewers: new Set(ratings.map((r) => r.reviewerId)).size,
    nonTies,
    ties,
    wins,
    preference,
    preferenceWilson95,
    criticalMeans: means,
    eligible,
    operationalPassed: operational,
    passed:
      eligible &&
      operational &&
      nonTies >= 20 &&
      preference !== null &&
      preference >= 0.7 &&
      critical.every((d) => (means[d] ?? 0) >= 4),
    limitation:
      'Mock/editor scores are not independent human evidence. Missing paid samples, semantic reviews or cost/time limits keep release closed.',
  };
}

export function percentile95(values: number[]) {
  if (!values.length || values.some((v) => !Number.isFinite(v) || v < 0))
    return null;
  return [...values].sort((a, b) => a - b)[
    Math.ceil(values.length * 0.95) - 1
  ]!;
}

export const creativeSequenceDimensions = [
  'humanProse',
  'immersion',
  'continuationDesire',
  'npcAutonomy',
  'protagonistHumanity',
  'structuralVariety',
  'emotionalRange',
  'systemInvisibility',
  'continuity',
] as const;
export type CreativeSequenceDimension =
  (typeof creativeSequenceDimensions)[number];

export const creativeSequencePrimaryDimensions = [
  'immersion',
  'continuationDesire',
  'protagonistHumanity',
  'npcAutonomy',
  'continuity',
] as const;
export type CreativeSequencePrimaryDimension =
  (typeof creativeSequencePrimaryDimensions)[number];

export const creativeSequenceFlags = [
  'boundary_date_leak',
  'guardrail_recital',
  'repeated_chapter_template',
  'repeated_self_correction',
  'repeated_tableau_ending',
  'over_articulated_npcs',
  'role_pun_name',
  'over_polished_antithesis',
  'other',
] as const;
export type CreativeSequenceFlag = (typeof creativeSequenceFlags)[number];

export const creativeSequenceAiSuspicionValues = [
  'unlikely',
  'possible',
  'likely',
] as const;
export type CreativeSequenceAiSuspicion =
  (typeof creativeSequenceAiSuspicionValues)[number];

export const creativeSequenceOverallValues = [
  'reject',
  'not_ready',
  'beta',
  'strong_beta',
] as const;
export type CreativeSequenceOverall =
  (typeof creativeSequenceOverallValues)[number];

const creativeSequenceScoreShape = Object.fromEntries(
  creativeSequenceDimensions.map((d) => [d, z.number().int().min(1).max(5)]),
) as Record<CreativeSequenceDimension, z.ZodNumber>;

export const creativeBaseWindowHumanQuestions = [
  'Does life feel meaningfully different at end vs beginning?',
  'What is the largest perceived change?',
  'What causal chain made it believable?',
  'Did any major change feel arbitrary/premature?',
  'Did any stretch feel stagnant too long?',
  'Did the story remain trapped in one micro-setting?',
  'Did recurring places/people feel like continuity or confinement?',
  'Did the world widen organically?',
  'Did six-month cadence become visible?',
  'Did endings reveal the decision interface?',
  'Did NPCs retain own lives?',
  'Did accepted choices materially alter later chapters?',
  'Did fork produce a genuinely different life?',
  'Would you read the next chapter?',
  'Would you renew to continue this life?',
  'Which scene most increased renewal desire?',
  'Which scene most reduced it?',
] as const;

export const creativeEvolutionAssessmentSchema = z
  .object({
    meaningfulLifeEvolution: z.enum(['clear', 'partial', 'not_felt']),
    changeFeltEarned: z.enum(['yes', 'mixed', 'no']),
    continuity: z.enum(['strong', 'mixed', 'broken']),
    scopeLock: z.enum(['none', 'noticeable', 'dominant']),
    temporalMetronome: z.enum(['none', 'noticeable', 'dominant']),
    decisionBoundaryLeakage: z.enum(['none', 'noticeable', 'dominant']),
    renewalDesire: z.number().int().min(1).max(5),
    evidence: z
      .array(
        z
          .object({
            sampleId: z.string().min(1).max(160),
            paragraphIndex: z.number().int().positive(),
            reason: z.string().trim().min(15).max(600),
          })
          .strict(),
      )
      .min(1)
      .max(12)
      .optional(),
  })
  .strict();
export type CreativeEvolutionAssessment = z.infer<
  typeof creativeEvolutionAssessmentSchema
>;

export const creativeSequenceHumanRatingSchema = z
  .object({
    sequenceId: z.string().min(1).max(160),
    sequenceHash: z.string().regex(/^[a-f0-9]{64}$/),
    reviewerId: z.string().min(1).max(80),
    reviewerKind: z.enum(['human', 'diagnostic-ai']),
    scores: z
      .object({
        ...creativeSequenceScoreShape,
        branchingValue: z.number().int().min(1).max(5).nullable().optional(),
      })
      .strict(),
    aiSuspicion: z.enum(creativeSequenceAiSuspicionValues),
    flags: z
      .array(z.enum(creativeSequenceFlags))
      .max(creativeSequenceFlags.length)
      .refine(
        (items) => new Set(items).size === items.length,
        'Sequence flags must be unique.',
      ),
    evidence: z
      .array(
        z
          .object({
            sampleId: z.string().min(1).max(160),
            paragraphIndex: z.number().int().positive(),
            reason: z.string().trim().min(15).max(600),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    overall: z.enum(creativeSequenceOverallValues),
    preferredBranch: z.enum(['A', 'B', 'tie']).nullable().optional(),
    lateHorizonNote: z.string().trim().min(10).max(1000).nullable().optional(),
    evolutionAssessment: creativeEvolutionAssessmentSchema
      .nullable()
      .optional(),
    humanQuestions: z.array(z.string().min(1).max(300)).max(30).optional(),
    questionResponses: z
      .record(z.string().min(1).max(300), z.string().max(2000).nullable())
      .nullable()
      .optional(),
  })
  .strict();
export type CreativeSequenceHumanRating = z.infer<
  typeof creativeSequenceHumanRatingSchema
>;

export type CreativeSequenceChapterRef = {
  sampleId: string;
  blindedSampleId: string;
  periodIndex: number;
  role: 'main' | 'prefix' | 'branch-A' | 'branch-B';
  title: string;
  paragraphs: number;
  acceptedChoice: { label: string; description: string } | null;
  editorGatePassed: boolean;
};

export type CreativeSequenceHorizon = 'H1' | 'H2' | 'B8';
export type CreativeSequenceHorizonLabel =
  | 'H1-three-chapter-sequence-audit'
  | 'H2-six-chapter-long-horizon-audit'
  | 'B8-eight-chapter-base-window-audit';

export type CreativeSequenceBundle = {
  sequenceId: string;
  sequenceHash: string;
  fixtureId: string;
  kind: 'main' | 'branch';
  horizon: CreativeSequenceHorizon;
  horizonLabel: CreativeSequenceHorizonLabel;
  chapterCount: number;
  chapters: CreativeSequenceChapterRef[];
  branchOrder?: readonly ['main' | 'fork', 'main' | 'fork'];
  humanQuestions?: readonly string[];
};

export type CreativeSequenceSampleInput = {
  id: string;
  fixtureId: string;
  mode: EvaluationMode;
  kind: 'full' | 'fixed-canon' | 'fork';
  periodIndex: number;
  chapter: { title: string; body: string };
  prefix: { title: string; body: string }[];
  choiceMappings: unknown[];
  errorCode?: string | null;
};

export function creativeBranchOrder(
  seed: string,
  sequenceId: string,
): readonly ['main' | 'fork', 'main' | 'fork'] {
  return parseInt(hash({ seed, sequenceId }).slice(0, 2), 16) % 2
    ? ['fork', 'main']
    : ['main', 'fork'];
}

function paragraphCount(body: string) {
  return body.split(/\n\s*\n/).filter((p) => p.trim()).length;
}

function acceptedChoiceFor(sample: CreativeSequenceSampleInput) {
  const last = sample.choiceMappings.at(-1) as
    { label?: string; description?: string } | undefined;
  if (!last?.label) return null;
  return {
    label: last.label,
    description: last.description ?? '',
  };
}

export function buildCreativeSequenceBundles(
  samples: CreativeSequenceSampleInput[],
  sourceHash: string,
  seed: string,
): CreativeSequenceBundle[] {
  const bundles: CreativeSequenceBundle[] = [];
  const profileOrder = narrativeProfiles.map((p) => p.id) as string[];
  const fixtureIds = [
    ...profileOrder.filter((id) => samples.some((s) => s.fixtureId === id)),
    ...new Set(
      samples
        .map((s) => s.fixtureId)
        .filter((id) => !profileOrder.includes(id)),
    ),
  ];
  for (const fixtureId of fixtureIds) {
    const fullSorted = samples
      .filter(
        (s) =>
          s.fixtureId === fixtureId &&
          s.mode === 'narrative-v1' &&
          s.kind === 'full',
      )
      .sort((a, b) => a.periodIndex - b.periodIndex);
    const contiguous: CreativeSequenceSampleInput[] = [];
    for (const sample of fullSorted) {
      if (sample.periodIndex !== contiguous.length) break;
      contiguous.push(sample);
    }
    if (contiguous.length < 3) continue;
    const horizon: CreativeSequenceHorizon =
      contiguous.length >= 8 ? 'B8' : contiguous.length >= 6 ? 'H2' : 'H1';
    const horizonLabel: CreativeSequenceHorizonLabel =
      horizon === 'B8'
        ? 'B8-eight-chapter-base-window-audit'
        : horizon === 'H2'
          ? 'H2-six-chapter-long-horizon-audit'
          : 'H1-three-chapter-sequence-audit';
    const mainSequenceId = `sequence:${fixtureId}:main:${contiguous.length}`;
    const mainChapters: CreativeSequenceChapterRef[] = contiguous.map((s) => ({
      sampleId: s.id,
      blindedSampleId: `main:${fixtureId}:${s.periodIndex}`,
      periodIndex: s.periodIndex,
      role: 'main',
      title: s.chapter.title,
      paragraphs: paragraphCount(s.chapter.body),
      acceptedChoice: s.periodIndex > 0 ? acceptedChoiceFor(s) : null,
      editorGatePassed: !s.errorCode,
    }));
    const mainHash = hash({
      sequenceId: mainSequenceId,
      kind: 'main',
      fixtureId,
      horizon,
      sourceHash,
      chapters: contiguous.map((s) => ({
        sampleId: s.id,
        periodIndex: s.periodIndex,
        title: s.chapter.title,
        body: s.chapter.body,
        acceptedChoice: s.periodIndex > 0 ? acceptedChoiceFor(s) : null,
      })),
    });
    bundles.push({
      sequenceId: mainSequenceId,
      sequenceHash: mainHash,
      fixtureId,
      kind: 'main',
      horizon,
      horizonLabel,
      chapterCount: contiguous.length,
      chapters: mainChapters,
      ...(horizon === 'B8'
        ? { humanQuestions: [...creativeBaseWindowHumanQuestions] }
        : {}),
    });

    const forkSample = samples.find(
      (s) =>
        s.fixtureId === fixtureId &&
        s.mode === 'narrative-v1' &&
        s.kind === 'fork' &&
        s.periodIndex === 2,
    );
    if (forkSample) {
      const prefixSamples = contiguous.slice(0, 2);
      const actualPrefix = forkSample.prefix.map((p) => ({
        title: p.title,
        body: p.body,
      }));
      const expectedPrefix = prefixSamples.map((s) => ({
        title: s.chapter.title,
        body: s.chapter.body,
      }));
      if (hash(actualPrefix) !== hash(expectedPrefix))
        throw new DomainError(
          'EVAL_STATE_INVALID',
          'Fork bundle prefix does not match the shared parent chapters.',
        );
      const mainContinuation = contiguous[2]!;
      const branchSequenceId = `sequence:${fixtureId}:branch`;
      const branchOrder = creativeBranchOrder(seed, branchSequenceId);
      const sampleA = branchOrder[0] === 'main' ? mainContinuation : forkSample;
      const sampleB = branchOrder[1] === 'main' ? mainContinuation : forkSample;
      const branchChapters: CreativeSequenceChapterRef[] = [
        ...prefixSamples.map((s) => ({
          sampleId: s.id,
          blindedSampleId: `prefix:${fixtureId}:${s.periodIndex}`,
          periodIndex: s.periodIndex,
          role: 'prefix' as const,
          title: s.chapter.title,
          paragraphs: paragraphCount(s.chapter.body),
          acceptedChoice: s.periodIndex > 0 ? acceptedChoiceFor(s) : null,
          editorGatePassed: !s.errorCode,
        })),
        {
          sampleId: sampleA.id,
          blindedSampleId: `branch:${fixtureId}:A`,
          periodIndex: sampleA.periodIndex,
          role: 'branch-A',
          title: sampleA.chapter.title,
          paragraphs: paragraphCount(sampleA.chapter.body),
          acceptedChoice: acceptedChoiceFor(sampleA),
          editorGatePassed: !sampleA.errorCode,
        },
        {
          sampleId: sampleB.id,
          blindedSampleId: `branch:${fixtureId}:B`,
          periodIndex: sampleB.periodIndex,
          role: 'branch-B',
          title: sampleB.chapter.title,
          paragraphs: paragraphCount(sampleB.chapter.body),
          acceptedChoice: acceptedChoiceFor(sampleB),
          editorGatePassed: !sampleB.errorCode,
        },
      ];
      const branchHash = hash({
        sequenceId: branchSequenceId,
        kind: 'branch',
        fixtureId,
        horizon,
        sourceHash,
        prefix: prefixSamples.map((s) => ({
          sampleId: s.id,
          periodIndex: s.periodIndex,
          title: s.chapter.title,
          body: s.chapter.body,
          acceptedChoice: s.periodIndex > 0 ? acceptedChoiceFor(s) : null,
        })),
        branchA: {
          sampleId: sampleA.id,
          periodIndex: sampleA.periodIndex,
          title: sampleA.chapter.title,
          body: sampleA.chapter.body,
          acceptedChoice: acceptedChoiceFor(sampleA),
        },
        branchB: {
          sampleId: sampleB.id,
          periodIndex: sampleB.periodIndex,
          title: sampleB.chapter.title,
          body: sampleB.chapter.body,
          acceptedChoice: acceptedChoiceFor(sampleB),
        },
      });
      bundles.push({
        sequenceId: branchSequenceId,
        sequenceHash: branchHash,
        fixtureId,
        kind: 'branch',
        horizon,
        horizonLabel,
        chapterCount: branchChapters.length,
        chapters: branchChapters,
        branchOrder,
        ...(horizon === 'B8'
          ? { humanQuestions: [...creativeBaseWindowHumanQuestions] }
          : {}),
      });
    }
  }
  return bundles;
}

function meanOf(values: number[]): number | null {
  return values.length
    ? values.reduce((sum, v) => sum + v, 0) / values.length
    : null;
}

export type CreativeSequenceGroupSummary = {
  ratings: number;
  reviewers: number;
  means: Record<CreativeSequenceDimension | 'branchingValue', number | null>;
  humanProseMean: number | null;
  immersionMean: number | null;
  continuationMean: number | null;
  continuationDesireMean: number | null;
  protagonistHumanityMean: number | null;
  npcAutonomyMean: number | null;
  structuralVarietyMean: number | null;
  emotionalRangeMean: number | null;
  systemInvisibilityMean: number | null;
  continuityMean: number | null;
  branchingValueMean: number | null;
  primaryProductGoals: {
    immersionMean: number | null;
    continuationDesireMean: number | null;
    protagonistHumanityMean: number | null;
    npcAutonomyMean: number | null;
    continuityMean: number | null;
    minimumPrimaryMean: number | null;
  };
  secondaryDiagnostics: {
    role: 'secondary-diagnostic-only';
    usedAsPassCriterion: false;
    aiSuspicionDistribution: Record<CreativeSequenceAiSuspicion, number>;
    flagFrequency: Record<CreativeSequenceFlag, number>;
    overallDistribution: Record<CreativeSequenceOverall, number>;
  };
  aiSuspicionDistribution: Record<CreativeSequenceAiSuspicion, number>;
  flagFrequency: Record<CreativeSequenceFlag, number>;
  overallDistribution: Record<CreativeSequenceOverall, number>;
  branchPreference: {
    ratedBranchBundles: number;
    mainPreferred: number;
    forkPreferred: number;
    ties: number;
    branchingValueMean: number | null;
  };
  chapterVsSequenceDivergence: {
    editorGateAcceptedChapters: number;
    sequencesWithContinuationOrImmersionBelowProse: number;
    sequencesWithRepetitionFlags: number;
    sequencesWithSystemLeakFlags: number;
    flaggedSampleIds: string[];
  };
};

export type CreativeSequenceHorizonSummary = {
  horizon: CreativeSequenceHorizon;
  label: CreativeSequenceHorizonLabel;
  requiredPeriods: 3 | 6 | 8;
  mainBundlesTotal: number;
  branchBundlesTotal: number;
  humanReviewedMainProfiles: number;
  humanReviewedBranchBundles: number;
  diagnosticAiReviewedMainProfiles: number;
  lateChapterEvidenceCount: number;
  mainSequencesWithLateChapterEvidence: number;
  minimumCoverageMet: boolean;
  human: CreativeSequenceGroupSummary;
  diagnosticAi: CreativeSequenceGroupSummary;
};

function summarizeRatingGroup(
  groupRatings: CreativeSequenceHumanRating[],
  bundlesById: ReadonlyMap<string, CreativeSequenceBundle>,
): CreativeSequenceGroupSummary {
  const means = Object.fromEntries(
    creativeSequenceDimensions.map((d) => [
      d,
      meanOf(groupRatings.map((r) => r.scores[d])),
    ]),
  ) as Record<CreativeSequenceDimension, number | null>;
  const branchingValues = groupRatings
    .map((r) => r.scores.branchingValue)
    .filter((v): v is number => typeof v === 'number');
  const branchingValueMean = meanOf(branchingValues);
  const allMeans = { ...means, branchingValue: branchingValueMean };
  const primaryValues = creativeSequencePrimaryDimensions.map((d) => means[d]);
  const minimumPrimaryMean = primaryValues.every((v): v is number => v !== null)
    ? Math.min(...primaryValues)
    : null;

  const aiSuspicionDistribution: Record<CreativeSequenceAiSuspicion, number> = {
    unlikely: 0,
    possible: 0,
    likely: 0,
  };
  const flagFrequency = Object.fromEntries(
    creativeSequenceFlags.map((f) => [f, 0]),
  ) as Record<CreativeSequenceFlag, number>;
  const overallDistribution: Record<CreativeSequenceOverall, number> = {
    reject: 0,
    not_ready: 0,
    beta: 0,
    strong_beta: 0,
  };
  for (const r of groupRatings) {
    aiSuspicionDistribution[r.aiSuspicion]++;
    overallDistribution[r.overall]++;
    for (const f of r.flags) flagFrequency[f]++;
  }

  const branchRatings = groupRatings.filter(
    (r) => bundlesById.get(r.sequenceId)?.kind === 'branch',
  );
  let mainPreferred = 0,
    forkPreferred = 0,
    ties = 0;
  for (const r of branchRatings) {
    const bundle = bundlesById.get(r.sequenceId)!;
    const order = bundle.branchOrder ?? ['main', 'fork'];
    if (!r.preferredBranch || r.preferredBranch === 'tie') ties++;
    else {
      const side = r.preferredBranch === 'A' ? order[0] : order[1];
      if (side === 'main') mainPreferred++;
      else forkPreferred++;
    }
  }

  const ratedBundles = [...new Set(groupRatings.map((r) => r.sequenceId))].map(
    (id) => bundlesById.get(id)!,
  );
  const editorGateAcceptedChapters = new Set(
    ratedBundles.flatMap((b) =>
      b.chapters.filter((c) => c.editorGatePassed).map((c) => c.sampleId),
    ),
  ).size;
  const repetitionSet = new Set<CreativeSequenceFlag>([
    'repeated_chapter_template',
    'repeated_self_correction',
    'repeated_tableau_ending',
    'over_polished_antithesis',
  ]);
  const leakSet = new Set<CreativeSequenceFlag>([
    'boundary_date_leak',
    'guardrail_recital',
  ]);
  let sequencesWithContinuationOrImmersionBelowProse = 0,
    sequencesWithRepetitionFlags = 0,
    sequencesWithSystemLeakFlags = 0;
  const flaggedSamples = new Set<string>();
  for (const r of groupRatings) {
    const bundle = bundlesById.get(r.sequenceId)!;
    const hasLowPrimary =
      r.scores.immersion < r.scores.humanProse ||
      r.scores.continuationDesire < r.scores.humanProse;
    if (hasLowPrimary) sequencesWithContinuationOrImmersionBelowProse++;
    if (r.flags.some((f) => repetitionSet.has(f)))
      sequencesWithRepetitionFlags++;
    if (r.flags.some((f) => leakSet.has(f))) sequencesWithSystemLeakFlags++;
    if (hasLowPrimary || r.flags.length > 0) {
      for (const ev of r.evidence) {
        const ch = bundle.chapters.find(
          (c) =>
            c.sampleId === ev.sampleId || c.blindedSampleId === ev.sampleId,
        );
        flaggedSamples.add(ch ? ch.sampleId : ev.sampleId);
      }
    }
  }

  return {
    ratings: groupRatings.length,
    reviewers: new Set(groupRatings.map((r) => r.reviewerId)).size,
    means: allMeans,
    humanProseMean: means.humanProse,
    immersionMean: means.immersion,
    continuationMean: means.continuationDesire,
    continuationDesireMean: means.continuationDesire,
    protagonistHumanityMean: means.protagonistHumanity,
    npcAutonomyMean: means.npcAutonomy,
    structuralVarietyMean: means.structuralVariety,
    emotionalRangeMean: means.emotionalRange,
    systemInvisibilityMean: means.systemInvisibility,
    continuityMean: means.continuity,
    branchingValueMean,
    primaryProductGoals: {
      immersionMean: means.immersion,
      continuationDesireMean: means.continuationDesire,
      protagonistHumanityMean: means.protagonistHumanity,
      npcAutonomyMean: means.npcAutonomy,
      continuityMean: means.continuity,
      minimumPrimaryMean,
    },
    secondaryDiagnostics: {
      role: 'secondary-diagnostic-only',
      usedAsPassCriterion: false,
      aiSuspicionDistribution,
      flagFrequency,
      overallDistribution,
    },
    aiSuspicionDistribution,
    flagFrequency,
    overallDistribution,
    branchPreference: {
      ratedBranchBundles: new Set(branchRatings.map((r) => r.sequenceId)).size,
      mainPreferred,
      forkPreferred,
      ties,
      branchingValueMean,
    },
    chapterVsSequenceDivergence: {
      editorGateAcceptedChapters,
      sequencesWithContinuationOrImmersionBelowProse,
      sequencesWithRepetitionFlags,
      sequencesWithSystemLeakFlags,
      flaggedSampleIds: [...flaggedSamples],
    },
  };
}

export function assessCreativeSequenceRatings(
  bundles: CreativeSequenceBundle[],
  raw: unknown,
) {
  if (!bundles.length)
    throw new DomainError(
      'EVAL_RATING_INVALID',
      'No creative sequence bundles exist to assess.',
    );
  const ratings = z
    .array(creativeSequenceHumanRatingSchema)
    .max(1000)
    .parse(raw);
  const known = new Map<string, CreativeSequenceBundle>();
  for (const bundle of bundles) {
    if (known.has(bundle.sequenceId))
      throw new DomainError(
        'EVAL_STATE_INVALID',
        'Duplicate sequence bundle identifier.',
      );
    known.set(bundle.sequenceId, bundle);
  }
  const keys = new Set<string>();
  const reviewerKinds = new Map<string, 'human' | 'diagnostic-ai'>();
  for (const rating of ratings) {
    const bundle = known.get(rating.sequenceId);
    const key = JSON.stringify([rating.reviewerId, rating.sequenceId]);
    if (!bundle || bundle.sequenceHash !== rating.sequenceHash || keys.has(key))
      throw new DomainError(
        'EVAL_RATING_INVALID',
        'Unknown, hash-mismatched or duplicate reviewed creative sequence.',
      );
    keys.add(key);
    const previousKind = reviewerKinds.get(rating.reviewerId);
    if (previousKind && previousKind !== rating.reviewerKind)
      throw new DomainError(
        'EVAL_RATING_INVALID',
        'A reviewerId cannot mix human and diagnostic-ai ratings.',
      );
    reviewerKinds.set(rating.reviewerId, rating.reviewerKind);
    if (
      bundle.kind === 'branch' &&
      typeof rating.scores.branchingValue !== 'number'
    )
      throw new DomainError(
        'EVAL_RATING_INVALID',
        'Branch sequence ratings require a branchingValue score.',
      );
    for (const ev of [
      ...rating.evidence,
      ...(rating.evolutionAssessment?.evidence ?? []),
    ]) {
      const chapter = bundle.chapters.find(
        (c) => c.sampleId === ev.sampleId || c.blindedSampleId === ev.sampleId,
      );
      if (!chapter)
        throw new DomainError(
          'EVAL_RATING_INVALID',
          'Evidence sampleId does not belong to the reviewed sequence.',
        );
      if (ev.paragraphIndex > chapter.paragraphs || ev.paragraphIndex < 1)
        throw new DomainError(
          'EVAL_RATING_INVALID',
          'A sequence reason refers beyond the saved chapter.',
        );
    }
  }

  const humanList = ratings.filter((r) => r.reviewerKind === 'human');
  const aiList = ratings.filter((r) => r.reviewerKind === 'diagnostic-ai');
  const humanSummary = summarizeRatingGroup(humanList, known);
  const aiSummary = summarizeRatingGroup(aiList, known);

  const summarizeHorizon = (
    horizon: CreativeSequenceHorizon,
  ): CreativeSequenceHorizonSummary => {
    const requiredPeriods = horizon === 'B8' ? 8 : horizon === 'H2' ? 6 : 3;
    const label: CreativeSequenceHorizonLabel =
      horizon === 'B8'
        ? 'B8-eight-chapter-base-window-audit'
        : horizon === 'H2'
          ? 'H2-six-chapter-long-horizon-audit'
          : 'H1-three-chapter-sequence-audit';
    const horizonBundles = bundles.filter((b) =>
      b.kind === 'main'
        ? horizon === 'B8'
          ? b.chapterCount >= 8
          : horizon === 'H2'
            ? b.chapterCount >= 6 && b.chapterCount < 8
            : b.chapterCount >= 3 && b.chapterCount < 6
        : b.horizon === horizon,
    );
    const horizonBundleIds = new Set(horizonBundles.map((b) => b.sequenceId));
    const hHuman = humanList.filter((r) => horizonBundleIds.has(r.sequenceId));
    const hAi = aiList.filter((r) => horizonBundleIds.has(r.sequenceId));
    const mainBundles = horizonBundles.filter((b) => b.kind === 'main');
    const branchBundles = horizonBundles.filter((b) => b.kind === 'branch');
    const humanReviewedMainProfiles = new Set(
      hHuman
        .map((r) => known.get(r.sequenceId)!)
        .filter((b) => b.kind === 'main')
        .map((b) => b.fixtureId),
    ).size;
    const humanReviewedBranchBundles = new Set(
      hHuman
        .map((r) => known.get(r.sequenceId)!)
        .filter((b) => b.kind === 'branch')
        .map((b) => b.sequenceId),
    ).size;
    const diagnosticAiReviewedMainProfiles = new Set(
      hAi
        .map((r) => known.get(r.sequenceId)!)
        .filter((b) => b.kind === 'main')
        .map((b) => b.fixtureId),
    ).size;
    let lateChapterEvidenceCount = 0;
    const mainWithLate = new Set<string>();
    for (const r of hHuman) {
      const bundle = known.get(r.sequenceId)!;
      for (const ev of r.evidence) {
        const ch = bundle.chapters.find(
          (c) =>
            c.sampleId === ev.sampleId || c.blindedSampleId === ev.sampleId,
        );
        if (ch && ch.periodIndex >= 3) {
          lateChapterEvidenceCount++;
          if (bundle.kind === 'main') mainWithLate.add(bundle.sequenceId);
        }
      }
    }
    const hHumanSummary = summarizeRatingGroup(hHuman, known);
    const hAiSummary = summarizeRatingGroup(hAi, known);
    const minimumCoverageMet =
      humanReviewedMainProfiles >= 2 &&
      humanReviewedBranchBundles >= 1 &&
      (horizon === 'H1' || mainWithLate.size >= humanReviewedMainProfiles);
    return {
      horizon,
      label,
      requiredPeriods,
      mainBundlesTotal: mainBundles.length,
      branchBundlesTotal: branchBundles.length,
      humanReviewedMainProfiles,
      humanReviewedBranchBundles,
      diagnosticAiReviewedMainProfiles,
      lateChapterEvidenceCount,
      mainSequencesWithLateChapterEvidence: mainWithLate.size,
      minimumCoverageMet,
      human: hHumanSummary,
      diagnosticAi: hAiSummary,
    };
  };

  const h1 = summarizeHorizon('H1');
  const h2 = summarizeHorizon('H2');
  const b8 = summarizeHorizon('B8');
  const evidenceStage:
    'B8' | 'H2' | 'H1' | 'diagnostic-ai-only' | 'incomplete' =
    b8.minimumCoverageMet
      ? 'B8'
      : h2.minimumCoverageMet
        ? 'H2'
        : h1.minimumCoverageMet
          ? 'H1'
          : humanList.length === 0 && aiList.length > 0
            ? 'diagnostic-ai-only'
            : 'incomplete';

  return {
    ratings: ratings.length,
    humanRatings: humanList.length,
    diagnosticAiRatings: aiList.length,
    reviewers: reviewerKinds.size,
    humanReviewers: humanSummary.reviewers,
    diagnosticAiReviewers: aiSummary.reviewers,
    evidenceStage,
    diagnosticAiCountsAsHumanEvidence: false as const,
    aiSuspicionIsPassCriterion: false as const,
    humanReleaseThreshold: null,
    ownerThresholdDecisionRequired: true as const,
    horizons: { H1: h1, H2: h2, B8: b8 },
    h1,
    h2,
    b8,
    human: humanSummary,
    diagnosticAi: aiSummary,
    means: humanSummary.means,
    primaryProductGoals: humanSummary.primaryProductGoals,
    secondaryDiagnostics: humanSummary.secondaryDiagnostics,
    aiSuspicionDistribution: humanSummary.aiSuspicionDistribution,
    flagFrequency: humanSummary.flagFrequency,
    overallDistribution: humanSummary.overallDistribution,
    branchPreference: humanSummary.branchPreference,
    chapterVsSequenceDivergence: humanSummary.chapterVsSequenceDivergence,
    qualityRelease: false as const,
    passed: false as const,
    limitation:
      'Creative sequence assessment is candidate quality evidence; diagnostic-ai ratings never count as human evidence, AI suspicion is a secondary diagnostic signal rather than a pass criterion, H1 three-chapter evidence never satisfies H2 six-chapter validation, B8 eight-chapter base-window validation remains descriptive without inventing a release threshold, and canonical release gates remain unchanged.',
  };
}
export type CreativeSequenceAssessment = ReturnType<
  typeof assessCreativeSequenceRatings
>;
