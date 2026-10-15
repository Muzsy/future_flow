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
