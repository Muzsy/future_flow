import { lstatSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ExperimentAiBudget } from '@future-flow/ai';
import { DatabaseAiBudget } from '@future-flow/database';
import { narrativeDimensions } from '@future-flow/contracts';
import { hash } from '@future-flow/core';
import {
  evaluationApprovedCumulativeBudgetUsd,
  parseEvaluationOptions,
  verifyEvaluationAuthorization,
} from '../scripts/lib/narrative-evaluation-options';
import {
  assessCreativeSequenceRatings,
  assessHumanRatings,
  buildCreativeSequenceBundles,
  creativeBaseWindowHumanQuestions,
  creativeSequenceHumanRatingSchema,
  type BlindPair,
  type CreativeSequenceHumanRating,
  type CreativeSequenceSampleInput,
  type HumanRating,
} from '../scripts/lib/narrative-evaluation-contract';
import {
  evaluationCostReport,
  evaluationNarrativeYield,
  type ExperimentalCall,
} from '../scripts/lib/narrative-evaluation-costs';
import { runNarrativeEvaluation } from '../scripts/lib/narrative-evaluation-runner';
import {
  assessEvaluationArtifacts,
  writeEvaluationArtifacts,
} from '../scripts/lib/narrative-evaluation-artifacts';
import {
  attemptTraceDir,
  attemptTracePath,
} from '../scripts/lib/narrative-evaluation-attempts';

const developmentEnv = {
  NARRATIVE_EVAL_API_KEY: 'sk-proj-synthetic-v6-config-test-only-123456',
  NARRATIVE_EVAL_PROJECT_ID: 'proj_synthetic_v6_test',
  NARRATIVE_EVAL_PROJECT_CONFIRMATION: 'dedicated-development',
};

function syntheticSample(
  fixtureId: string,
  periodIndex: number,
  kind: 'full' | 'fork' = 'full',
  prefix: { title: string; body: string }[] = [],
): CreativeSequenceSampleInput {
  return {
    id: `${kind}:${fixtureId}:narrative-v1:${periodIndex}`,
    fixtureId,
    mode: 'narrative-v1',
    kind,
    periodIndex,
    chapter: {
      title: `Chapter ${fixtureId} ${kind} ${periodIndex + 1}`,
      body: `First paragraph of ${fixtureId} ${kind} period ${periodIndex + 1}.\n\nSecond paragraph with concrete action and consequence.`,
    },
    prefix,
    choiceMappings:
      periodIndex > 0
        ? [
            {
              label:
                kind === 'fork'
                  ? 'Take the alternative community bench'
                  : 'Continue the current studio arrangement',
              description:
                kind === 'fork'
                  ? 'Test the work with a different circle and schedule.'
                  : 'Develop the existing sequence and observe the response.',
              reviewed: false,
              selection: 'diagnostic-index',
            },
          ]
        : [],
    errorCode: null,
  };
}

function buildSyntheticBundles(periods: 3 | 6 | 8) {
  const fixtures = ['creative-portfolio', 'career-transition'] as const;
  const samples: CreativeSequenceSampleInput[] = [];
  for (const fixtureId of fixtures) {
    const full: CreativeSequenceSampleInput[] = [];
    for (let i = 0; i < periods; i++) {
      const sample = syntheticSample(
        fixtureId,
        i,
        'full',
        full.map((s) => s.chapter),
      );
      full.push(sample);
      samples.push(sample);
    }
    samples.push(
      syntheticSample(
        fixtureId,
        2,
        'fork',
        full.slice(0, 2).map((s) => s.chapter),
      ),
    );
  }
  return buildCreativeSequenceBundles(
    samples,
    hash(`source-v6-${periods}`),
    'seed-v6',
  );
}

function baseSequenceScores(
  overrides: Partial<CreativeSequenceHumanRating['scores']> = {},
) {
  return {
    humanProse: 4,
    immersion: 4,
    continuationDesire: 4,
    npcAutonomy: 4,
    protagonistHumanity: 4,
    structuralVariety: 4,
    emotionalRange: 4,
    systemInvisibility: 4,
    continuity: 4,
    ...overrides,
  };
}

describe('v6 creative-only base-window evaluation options, budget authority, and cost accounting', () => {
  it('allows up to 8 periods in creative-only mode, keeps legacy/paired max 3, and restricts --no-forks to Stage A career-transition 3-period smoke', () => {
    expect(() => parseEvaluationOptions(['--periods', '4'])).toThrow(
      'one to three periods',
    );
    expect(() => parseEvaluationOptions(['--periods', '8'])).toThrow(
      'one to three periods',
    );
    expect(() =>
      parseEvaluationOptions(['--creative', '--periods', '4']),
    ).toThrow('one to three periods');
    expect(() =>
      parseEvaluationOptions(['--creative', '--periods', '8']),
    ).toThrow('one to three periods');
    expect(() =>
      parseEvaluationOptions(['--creative-only', '--periods', '0']),
    ).toThrow('one to eight periods');
    expect(() =>
      parseEvaluationOptions(['--creative-only', '--periods', '9']),
    ).toThrow('one to eight periods');

    for (const p of [1, 3, 6, 7, 8]) {
      const parsed = parseEvaluationOptions([
        '--creative-only',
        '--fixtures',
        'creative-portfolio,career-transition',
        '--periods',
        String(p),
      ]);
      expect(parsed.creative).toBe(true);
      expect(parsed.creativeOnly).toBe(true);
      expect(parsed.periods).toBe(p);
      expect(parsed.noForks).toBeUndefined();
      expect(() => verifyEvaluationAuthorization(parsed, {})).not.toThrow();
    }

    const stageA = parseEvaluationOptions([
      '--creative-only',
      '--no-forks',
      '--fixtures',
      'career-transition',
      '--periods',
      '3',
    ]);
    expect(stageA.noForks).toBe(true);
    expect(stageA.fixtureIds).toEqual(['career-transition']);
    expect(stageA.periods).toBe(3);
    expect(() => verifyEvaluationAuthorization(stageA, {})).not.toThrow();

    expect(() =>
      parseEvaluationOptions([
        '--creative-only',
        '--no-forks',
        '--no-fork',
        '--fixtures',
        'career-transition',
        '--periods',
        '3',
      ]),
    ).toThrow('Duplicate flag');

    // --no-forks is rejected outside Stage A career-transition 3-period creative-only
    for (const invalidNoForkArgs of [
      ['--no-forks'],
      ['--creative', '--no-forks', '--fixtures', 'career-transition'],
      [
        '--creative-only',
        '--no-forks',
        '--fixtures',
        'creative-portfolio',
        '--periods',
        '3',
      ],
      [
        '--creative-only',
        '--no-forks',
        '--fixtures',
        'creative-portfolio,career-transition',
        '--periods',
        '3',
      ],
      [
        '--creative-only',
        '--no-forks',
        '--fixtures',
        'career-transition',
        '--periods',
        '6',
      ],
      [
        '--creative-only',
        '--no-forks',
        '--fixtures',
        'career-transition',
        '--periods',
        '8',
      ],
    ]) {
      expect(() => parseEvaluationOptions(invalidNoForkArgs)).toThrow();
    }

    expect(() =>
      verifyEvaluationAuthorization({ ...stageA, periods: 8 }, {}),
    ).toThrow();
    expect(() =>
      verifyEvaluationAuthorization(
        { ...stageA, fixtureIds: ['creative-portfolio'] },
        {},
      ),
    ).toThrow();
  });

  it('sets reviewed cumulative ceiling to 33.732030 (baseline 10.732030 + 23.000000 without re-adding old 4.472505 headroom) while keeping generic ExperimentAiBudget default at 5', async () => {
    expect(evaluationApprovedCumulativeBudgetUsd).toBeCloseTo(33.73203, 6);
    expect(evaluationApprovedCumulativeBudgetUsd).toBeCloseTo(
      10.73203 + 23.0,
      6,
    );
    expect(evaluationApprovedCumulativeBudgetUsd).not.toBeCloseTo(
      15.204535 + 23.0,
      6,
    );

    const clock = vi
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-10-18T00:00:00Z'));
    const dir = await mkdtemp(join(tmpdir(), 'alterward-v6-budget-'));
    try {
      const stageAPaid = parseEvaluationOptions(
        [
          '--mode',
          'paid',
          '--allow-paid',
          '--creative-only',
          '--no-forks',
          '--fixtures',
          'career-transition',
          '--periods',
          '3',
          '--budget-usd',
          '12.23203',
          '--approval-id',
          'v6-stage-a-smoke',
          '--out',
          join(dir, 'stage-a'),
        ],
        developmentEnv,
      );
      expect(stageAPaid.budgetUsd).toBeCloseTo(12.23203, 6);

      const stageBPaid = parseEvaluationOptions(
        [
          '--mode',
          'paid',
          '--allow-paid',
          '--creative-only',
          '--fixtures',
          'creative-portfolio,career-transition',
          '--periods',
          '8',
          '--budget-usd',
          '33.73203',
          '--approval-id',
          'v6-stage-b-window',
          '--out',
          join(dir, 'stage-b'),
        ],
        developmentEnv,
      );
      expect(stageBPaid.budgetUsd).toBeCloseTo(33.73203, 6);

      expect(() =>
        parseEvaluationOptions(
          [
            '--mode',
            'paid',
            '--allow-paid',
            '--creative-only',
            '--fixtures',
            'creative-portfolio,career-transition',
            '--periods',
            '8',
            '--budget-usd',
            '33.732031',
            '--approval-id',
            'over-ceiling',
            '--out',
            join(dir, 'over'),
          ],
          developmentEnv,
        ),
      ).toThrow();

      // Verify cumulative ledger continuity across v5 baseline (305 calls / 10.732030 USD) -> Stage A -> Stage B
      const ledgerPath = join(dir, 'paid-usage.json');
      const baselineCalls = Array.from({ length: 305 }, (_, i) => ({
        id: `v5-call-${i + 1}`,
        reservedAt: '2026-10-17T12:00:00.000Z',
        settledAt: '2026-10-17T12:00:01.000Z',
        purpose: 'narrative-evaluation:v5',
        model: 'gpt-6.1-sol',
        maxOutputTokens: 12000,
        reservedUsd: 0.05,
        accountedUsd: i === 304 ? 10.73203 - 304 * 0.035 : 0.035,
        estimatedUsd: i === 304 ? 9.8234197 - 304 * 0.032 : 0.032,
        status: 'completed',
        usage: { input_tokens: 100, output_tokens: 100, cached_tokens: 0 },
      }));
      await writeFile(
        ledgerPath,
        JSON.stringify(
          {
            version: 1,
            budgetUsd: 15.204535,
            accountedUsd: 10.73203,
            estimatedUsd: 9.8234197,
            reservedOpenUsd: 0,
            unknownUsageCalls: 0,
            calls: baselineCalls,
          },
          null,
          2,
        ),
      );

      // Generic default ceiling (5 USD) still rejects >5 when no explicit approved ceiling is supplied
      expect(
        () => new ExperimentAiBudget(ledgerPath, 12.23203, 'no-explicit-cap'),
      ).toThrow();

      const stageAGuard = new ExperimentAiBudget(
        ledgerPath,
        12.23203,
        'narrative-evaluation:v6-stage-a',
        undefined,
        evaluationApprovedCumulativeBudgetUsd,
      );
      try {
        const callId = await stageAGuard.reserve({
          model: 'gpt-6.1-sol',
          max_output_tokens: 1000,
          input: 'Stage A smoke prompt',
        });
        await stageAGuard.settle(callId, {
          input_tokens: 200,
          output_tokens: 100,
        });
      } finally {
        stageAGuard.close();
      }

      const afterStageA = JSON.parse(await readFile(ledgerPath, 'utf8'));
      expect(afterStageA.calls).toHaveLength(306);
      expect(afterStageA.accountedUsd).toBeGreaterThan(10.73203);
      expect(afterStageA.budgetUsd).toBeCloseTo(12.23203, 6);

      const stageBGuard = new ExperimentAiBudget(
        ledgerPath,
        33.73203,
        'narrative-evaluation:v6-stage-b',
        undefined,
        evaluationApprovedCumulativeBudgetUsd,
      );
      try {
        const callId = await stageBGuard.reserve({
          model: 'gpt-6.1-sol',
          max_output_tokens: 1000,
          input: 'Stage B benchmark prompt',
        });
        await stageBGuard.settle(callId, {
          input_tokens: 200,
          output_tokens: 100,
        });
      } finally {
        stageBGuard.close();
      }

      const afterStageB = JSON.parse(await readFile(ledgerPath, 'utf8'));
      expect(afterStageB.calls).toHaveLength(307);
      expect(afterStageB.accountedUsd).toBeGreaterThan(
        afterStageA.accountedUsd,
      );
      expect(afterStageB.budgetUsd).toBeCloseTo(33.73203, 6);
    } finally {
      clock.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('includes period indexes 0-7 in narrativeYield and charges rejected seventh and eighth chapter attempts to accepted output', () => {
    const calls: ExperimentalCall[] = [
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `main-${i}`,
        accountedUsd: 0.25,
        estimatedUsd: 0.2,
        reservedUsd: 0.35,
        status: 'completed',
        usage: { input_tokens: 100, output_tokens: 200 },
      })),
      {
        id: 'fork-call',
        accountedUsd: 0.4,
        estimatedUsd: 0.3,
        reservedUsd: 0.5,
        status: 'completed',
        usage: { input_tokens: 100, output_tokens: 200 },
      },
      {
        id: 'prior-call',
        accountedUsd: 10.73203,
        estimatedUsd: 9.8234197,
        reservedUsd: 10.73203,
        status: 'completed',
        usage: { input_tokens: 1000, output_tokens: 2000 },
      },
    ];
    const bindings = {
      ...Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => [
          `main-${i}`,
          {
            sourceHash: 'v6-source',
            caseId: `creative-portfolio:narrative-v1:${i}`,
          },
        ]),
      ),
      'fork-call': {
        sourceHash: 'v6-source',
        caseId: 'fork:creative-portfolio:narrative-v1:2',
      },
      'prior-call': {
        sourceHash: 'v5-source',
        caseId: 'creative-portfolio:narrative-v1:0',
      },
    };

    const accounting = evaluationCostReport(calls, bindings, 'v6-source');
    expect(accounting.totalDevelopmentAccountedUsd).toBeCloseTo(
      10.73203 + 2.0 + 0.4,
      6,
    );
    expect(accounting.currentSourceAccountedUsd).toBeCloseTo(2.4, 6);

    const allEightAccepted = Array.from({ length: 8 }, (_, i) => ({
      fixtureId: 'creative-portfolio',
      mode: 'narrative-v1',
      kind: 'full',
      periodIndex: i,
    }));
    const fullYield = evaluationNarrativeYield(accounting, allEightAccepted)!;
    expect(fullYield.attemptedChapters).toBe(8);
    expect(fullYield.gateAcceptedChapters).toBe(8);
    expect(fullYield.acceptedCostCoverage).toBe(true);
    expect(fullYield.acceptanceRate).toBe(1);
    expect(fullYield.accountedUsd).toBeCloseTo(2.0, 6);
    expect(fullYield.unacceptedAttemptAccountedUsd).toBeCloseTo(0, 6);
    expect(fullYield.accountedUsdPerGateAcceptedChapter).toBeCloseTo(0.25, 6);

    // Reject 7th (periodIndex 6) and 8th (periodIndex 7) attempts: both must still be charged in yield
    const sixAcceptedTwoRejected = allEightAccepted.slice(0, 6);
    const partialYield = evaluationNarrativeYield(
      accounting,
      sixAcceptedTwoRejected,
    )!;
    expect(partialYield.attemptedChapters).toBe(8);
    expect(partialYield.gateAcceptedChapters).toBe(6);
    expect(partialYield.acceptedCostCoverage).toBe(true);
    expect(partialYield.acceptanceRate).toBeCloseTo(6 / 8, 6);
    expect(partialYield.accountedUsd).toBeCloseTo(2.0, 6);
    expect(partialYield.unacceptedAttemptAccountedUsd).toBeCloseTo(0.5, 6);
    expect(partialYield.accountedUsdPerGateAcceptedChapter).toBeCloseTo(
      2.0 / 6,
      6,
    );
  });

  it('preserves H1 (3-chapter), H2 (6-chapter), and 34-pair contracts while labelling 8-chapter base-window bundles as B8', () => {
    const h1Bundles = buildSyntheticBundles(3);
    const h2Bundles = buildSyntheticBundles(6);
    const b8Bundles = buildSyntheticBundles(8);

    expect(h1Bundles.every((b) => b.horizon === 'H1')).toBe(true);
    expect(
      h1Bundles.every(
        (b) => b.horizonLabel === 'H1-three-chapter-sequence-audit',
      ),
    ).toBe(true);
    expect(h1Bundles.every((b) => b.humanQuestions === undefined)).toBe(true);

    // Old 6-chapter H2 is NOT relabelled
    expect(h2Bundles.every((b) => b.horizon === 'H2')).toBe(true);
    expect(
      h2Bundles.every(
        (b) => b.horizonLabel === 'H2-six-chapter-long-horizon-audit',
      ),
    ).toBe(true);
    expect(h2Bundles.every((b) => b.humanQuestions === undefined)).toBe(true);

    // 8-chapter window gets B8 descriptive label and human evolution/renewal questions
    expect(b8Bundles.every((b) => b.horizon === 'B8')).toBe(true);
    expect(
      b8Bundles.every(
        (b) => b.horizonLabel === 'B8-eight-chapter-base-window-audit',
      ),
    ).toBe(true);
    expect(
      b8Bundles.every(
        (b) =>
          Array.isArray(b.humanQuestions) && b.humanQuestions.length === 17,
      ),
    ).toBe(true);

    // B8 ratings work both without and with optional evolutionAssessment, with no new release threshold
    const b8RatingsWithoutEvolution: CreativeSequenceHumanRating[] =
      b8Bundles.map((b) =>
        creativeSequenceHumanRatingSchema.parse({
          sequenceId: b.sequenceId,
          sequenceHash: b.sequenceHash,
          reviewerId: 'human-reader-b8',
          reviewerKind: 'human',
          scores: baseSequenceScores(
            b.kind === 'branch' ? { branchingValue: 5 } : {},
          ),
          aiSuspicion: 'unlikely',
          flags: [],
          evidence: [
            {
              sampleId:
                b.kind === 'main'
                  ? b.chapters[7]!.sampleId
                  : b.chapters[2]!.blindedSampleId,
              paragraphIndex: 2,
              reason:
                'By the eighth chapter the protagonist operates in a credibly widened social and professional context.',
            },
          ],
          overall: 'strong_beta',
          ...(b.kind === 'branch' ? { preferredBranch: 'A' } : {}),
          lateHorizonNote:
            'Chapters 4 to 8 show earned life evolution without mechanical chapter scheduling.',
        }),
      );

    const b8Assessed = assessCreativeSequenceRatings(
      b8Bundles,
      b8RatingsWithoutEvolution,
    );
    expect(b8Assessed.evidenceStage).toBe('B8');
    expect(b8Assessed.horizons.B8.minimumCoverageMet).toBe(true);
    expect(b8Assessed.horizons.B8.requiredPeriods).toBe(8);
    expect(b8Assessed.horizons.H2.minimumCoverageMet).toBe(false);
    expect(b8Assessed.horizons.H1.minimumCoverageMet).toBe(false);
    expect(b8Assessed.humanReleaseThreshold).toBeNull();
    expect(b8Assessed.qualityRelease).toBe(false);
    expect(b8Assessed.passed).toBe(false);

    // Optional evolutionAssessment is validated when supplied
    const withEvolution = structuredClone(b8RatingsWithoutEvolution);
    withEvolution[0]!.evolutionAssessment = {
      meaningfulLifeEvolution: 'clear',
      changeFeltEarned: 'yes',
      continuity: 'strong',
      scopeLock: 'none',
      temporalMetronome: 'none',
      decisionBoundaryLeakage: 'none',
      renewalDesire: 5,
      evidence: [
        {
          sampleId: b8Bundles[0]!.chapters[6]!.sampleId,
          paragraphIndex: 1,
          reason:
            'Chapter 7 grows naturally out of the earlier studio commitment and altered relationship.',
        },
      ],
    };
    expect(
      assessCreativeSequenceRatings(b8Bundles, withEvolution).evidenceStage,
    ).toBe('B8');

    // Out-of-bounds paragraph in optional evolutionAssessment.evidence fails closed
    const badEvolution = structuredClone(withEvolution);
    badEvolution[0]!.evolutionAssessment!.evidence![0]!.paragraphIndex = 99;
    expect(() =>
      assessCreativeSequenceRatings(b8Bundles, badEvolution),
    ).toThrow('beyond the saved chapter');

    // Historical 34-pair benchmark remains intact
    const pairScores = Object.fromEntries(
      narrativeDimensions.map((d) => [d, 4]),
    ) as HumanRating['scoresA'];
    const pairs: BlindPair[] = [
      ...Array.from({ length: 24 }, (_, i) => ({
        pairId: `full:fixture:${i}`,
        pairHash: hash(`full-${i}`),
        kind: 'full' as const,
        fixtureId: 'bounded-career',
        periodIndex: i % 3,
        modeA: 'narrative-v1' as const,
        modeB: 'legacy' as const,
        paragraphsA: 2,
        paragraphsB: 2,
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        pairId: `fixed-canon:fixture:${i}`,
        pairHash: hash(`fixed-${i}`),
        kind: 'fixed-canon' as const,
        fixtureId: 'bounded-career',
        periodIndex: 0,
        modeA: 'narrative-v1' as const,
        modeB: 'legacy' as const,
        paragraphsA: 2,
        paragraphsB: 2,
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        pairId: `fork:fixture:${i}`,
        pairHash: hash(`fork-${i}`),
        kind: 'fork' as const,
        fixtureId: 'bounded-career',
        periodIndex: 2,
        modeA: 'narrative-v1' as const,
        modeB: 'legacy' as const,
        paragraphsA: 2,
        paragraphsB: 2,
      })),
    ];
    const pairRatings: HumanRating[] = pairs.map((p) => ({
      pairId: p.pairId,
      pairHash: p.pairHash,
      reviewerId: 'reader-canonical',
      preferred: 'A',
      scoresA: { ...pairScores },
      scoresB: { ...pairScores },
      reasons: [
        {
          side: 'A',
          paragraphIndex: 1,
          reason:
            'The scene consequence and character response remain grounded in prior choices.',
        },
      ],
    }));
    const pairedResult = assessHumanRatings(pairs, pairRatings, true, {
      meanCostUsd: 0.25,
      p95Ms: 300000,
      maxMeanCostUsd: 0.5,
      maxP95Ms: 450000,
      hardFailures: 0,
      allChoiceMappingsReviewed: true,
    });
    expect(pairedResult.passed).toBe(true);
    expect(pairedResult.nonTies).toBe(24);
  });
});

describe('v6 offline evaluation integration: Stage A 3-period no-fork smoke and Stage B 2x8+fork base-window corpus', () => {
  it('runs Stage A career-transition 3-period no-fork (3 samples / 15 transports), preserves default fork when omitted, and prevents cross-fork resume tampering', async () => {
    const outNoFork = await mkdtemp(join(tmpdir(), 'alterward-v6-stage-a-'));
    const outDefaultFork = await mkdtemp(
      join(tmpdir(), 'alterward-v6-default-fork-'),
    );
    try {
      const noForkOptions = parseEvaluationOptions([
        '--mode',
        'offline',
        '--creative-only',
        '--no-forks',
        '--fixtures',
        'career-transition',
        '--periods',
        '3',
        '--out',
        outNoFork,
      ]);
      const run = await runNarrativeEvaluation(noForkOptions);
      expect(run.mock).toBe(true);
      expect(run.diagnosticOnly).toBe(true);
      expect(run.noForks).toBe(true);
      expect(run.complete).toBe(false);
      expect(run.failures).toEqual([]);
      expect(run.samples).toHaveLength(3);
      expect(run.samples.every((s) => s.kind === 'full')).toBe(true);
      expect(run.samples.map((s) => s.periodIndex)).toEqual([0, 1, 2]);
      expect(run.samples.reduce((sum, s) => sum + s.transportCalls, 0)).toBe(
        15,
      );
      expect(run.samples.every((s) => s.requestCount === 5)).toBe(true);
      expect(run.sequenceBundles).toHaveLength(1);
      expect(run.sequenceBundles![0]!.kind).toBe('main');
      expect(run.sequenceBundles![0]!.horizon).toBe('H1');
      expect(run.sequenceBundles![0]!.chapterCount).toBe(3);

      const summary = await writeEvaluationArtifacts(run, noForkOptions);
      expect(summary.samples).toBe(3);
      expect(summary.transportCalls).toBe(15);
      expect(summary.completedSampleAdmittedRequests).toBe(15);
      expect(summary.noForks).toBe(true);
      expect(summary.sequenceBundles).toBe(1);
      expect(summary.sequenceMainBundles).toBe(1);
      expect(summary.sequenceBranchBundles).toBe(0);
      expect(summary.qualityRelease).toBe(false);

      // Resuming with identical --no-forks options performs zero new transport calls
      const resumed = await runNarrativeEvaluation(noForkOptions);
      expect(resumed.samples).toHaveLength(3);
      const transportsAfterResume = JSON.parse(
        await readFile(join(outNoFork, 'transport-records.json'), 'utf8'),
      ) as unknown[];
      expect(transportsAfterResume).toHaveLength(15);

      // Resuming a --no-forks corpus WITHOUT --no-forks is rejected by manifest binding
      const withForkOptionsOnSameOut = parseEvaluationOptions([
        '--mode',
        'offline',
        '--creative-only',
        '--fixtures',
        'career-transition',
        '--periods',
        '3',
        '--out',
        outNoFork,
      ]);
      await expect(
        runNarrativeEvaluation(withForkOptionsOnSameOut),
      ).rejects.toMatchObject({
        code: 'EVAL_STATE_INVALID',
      });

      // Default fork behavior without --no-forks remains unchanged (3 main + 1 fork = 4 samples / 20 transports)
      const defaultForkOptions = parseEvaluationOptions([
        '--mode',
        'offline',
        '--creative-only',
        '--fixtures',
        'career-transition',
        '--periods',
        '3',
        '--out',
        outDefaultFork,
      ]);
      const defaultRun = await runNarrativeEvaluation(defaultForkOptions);
      expect(defaultRun.samples).toHaveLength(4);
      expect(defaultRun.samples.filter((s) => s.kind === 'full')).toHaveLength(
        3,
      );
      expect(defaultRun.samples.filter((s) => s.kind === 'fork')).toHaveLength(
        1,
      );
      expect(
        defaultRun.samples.reduce((sum, s) => sum + s.transportCalls, 0),
      ).toBe(20);

      // Resuming a with-fork corpus WITH --no-forks is also rejected
      const noForkOnDefaultOut = parseEvaluationOptions([
        '--mode',
        'offline',
        '--creative-only',
        '--no-forks',
        '--fixtures',
        'career-transition',
        '--periods',
        '3',
        '--out',
        outDefaultFork,
      ]);
      await expect(
        runNarrativeEvaluation(noForkOnDefaultOut),
      ).rejects.toMatchObject({
        code: 'EVAL_STATE_INVALID',
      });
    } finally {
      await rm(outNoFork, { recursive: true, force: true });
      await rm(outDefaultFork, { recursive: true, force: true });
    }
  }, 120000);

  it('runs Stage B two-profile 8-period + fork corpus (18 samples / 90 transports), isolates model inputs from billing/8-chapter metadata, includes blinded reader questions, and resumes cleanly', async () => {
    const outStageB = await mkdtemp(join(tmpdir(), 'alterward-v6-stage-b-'));
    const observedCaps: number[] = [];
    const originalReserve = DatabaseAiBudget.prototype.reserve;
    const capSpy = vi
      .spyOn(DatabaseAiBudget.prototype, 'reserve')
      .mockImplementation(function (this: DatabaseAiBudget, raw) {
        observedCaps.push(
          (this as unknown as { maxRequestBytes: number }).maxRequestBytes,
        );
        return originalReserve.call(this, raw);
      });
    try {
      const options = parseEvaluationOptions([
        '--mode',
        'offline',
        '--creative-only',
        '--fixtures',
        'creative-portfolio,career-transition',
        '--periods',
        '8',
        '--out',
        outStageB,
      ]);

      const capturedInputs: string[] = [];
      const capturedDurations: number[] = [];
      const run = await runNarrativeEvaluation(
        options,
        {},
        ({ parameters, job }) => {
          capturedInputs.push(JSON.stringify(parameters.input ?? null));
          const [startYear = 0, startMonth = 0] = job.payload.startDate
            .split('-')
            .map(Number);
          const [endYear = 0, endMonth = 0] = job.payload.endDate
            .split('-')
            .map(Number);
          capturedDurations.push(
            (endYear - startYear) * 12 + (endMonth - startMonth),
          );
          return undefined;
        },
      );

      // Every real main AND fork runner reservation must select the reviewed envelope.
      // The separate byte-boundary tests exercise actual admission, not this observation.
      expect(observedCaps).toHaveLength(90);
      expect(new Set(observedCaps)).toEqual(new Set([196608]));
      expect(run.mock).toBe(true);
      expect(run.diagnosticOnly).toBe(true);
      expect(run.complete).toBe(false);
      expect(run.failures).toEqual([]);
      expect(run.samples).toHaveLength(18);

      const fullSamples = run.samples.filter((s) => s.kind === 'full');
      const forkSamples = run.samples.filter((s) => s.kind === 'fork');
      expect(fullSamples).toHaveLength(16);
      expect(forkSamples).toHaveLength(2);
      expect(
        fullSamples
          .filter((s) => s.fixtureId === 'creative-portfolio')
          .map((s) => s.periodIndex),
      ).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(
        fullSamples
          .filter((s) => s.fixtureId === 'career-transition')
          .map((s) => s.periodIndex),
      ).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(forkSamples.map((s) => s.fixtureId)).toEqual([
        'creative-portfolio',
        'career-transition',
      ]);
      expect(run.samples.every((s) => s.requestCount === 5)).toBe(true);
      expect(run.samples.every((s) => s.transportCalls === 5)).toBe(true);
      expect(run.samples.reduce((sum, s) => sum + s.transportCalls, 0)).toBe(
        90,
      );
      expect(capturedInputs).toHaveLength(90);

      // T25 Billing and 8-chapter evaluation window isolation from model requests
      expect(capturedDurations.every((d) => d === 6)).toBe(true);
      for (const serializedInput of capturedInputs) {
        expect(serializedInput).not.toContain(
          'B8-eight-chapter-base-window-audit',
        );
        expect(serializedInput).not.toMatch(/\bchapter\s+[1-8]\s+of\s+8\b/i);
        expect(serializedInput).not.toContain('renewalDate');
        expect(serializedInput).not.toContain('monthlyAllowance');
        expect(serializedInput).not.toContain('rolloverBalance');
        expect(serializedInput).not.toContain('personalTier');
        expect(serializedInput).not.toContain('budgetUsd');
        expect(serializedInput).not.toContain('33.73203');
      }

      // Verify private trace integrity (18 cases, 0700 dir, 0600 files)
      expect(lstatSync(attemptTraceDir(outStageB)).mode & 0o777).toBe(0o700);
      for (const fixtureId of ['creative-portfolio', 'career-transition']) {
        for (let p = 0; p < 8; p++) {
          const tp = attemptTracePath(
            outStageB,
            `${fixtureId}:narrative-v1:${p}`,
          );
          expect(lstatSync(tp).mode & 0o777).toBe(0o600);
        }
        const forkTp = attemptTracePath(
          outStageB,
          `fork:${fixtureId}:narrative-v1:2`,
        );
        expect(lstatSync(forkTp).mode & 0o777).toBe(0o600);
      }

      const summary = await writeEvaluationArtifacts(run, options);
      expect(summary.samples).toBe(18);
      expect(summary.transportCalls).toBe(90);
      expect(summary.completedSampleAdmittedRequests).toBe(90);
      expect(summary.sequenceBundles).toBe(4);
      expect(summary.sequenceMainBundles).toBe(2);
      expect(summary.sequenceBranchBundles).toBe(2);
      expect(summary.sequenceHorizon).toBe('B8');
      expect(summary.qualityRelease).toBe(false);
      expect(summary.complete).toBe(false);

      // Verify B8 human-review bundles contain all 17 renewal/evolution questions and leak no internal metadata
      const files = run.sequenceBundleFiles!;
      const blindedBundles = JSON.parse(
        readFileSync(files.bundlesJson, 'utf8'),
      ) as {
        horizon: string;
        horizonLabel: string;
        humanQuestions?: string[];
      }[];
      expect(blindedBundles).toHaveLength(4);
      expect(
        blindedBundles.every(
          (b) =>
            b.horizon === 'B8' &&
            b.horizonLabel === 'B8-eight-chapter-base-window-audit' &&
            Array.isArray(b.humanQuestions) &&
            b.humanQuestions.length === 17,
        ),
      ).toBe(true);

      const templateEntries = JSON.parse(
        readFileSync(files.ratingsTemplateJson, 'utf8'),
      ) as {
        humanQuestions?: string[];
        questionResponses?: Record<string, null>;
      }[];
      expect(templateEntries).toHaveLength(4);
      for (const entry of templateEntries) {
        expect(entry.humanQuestions).toEqual([
          ...creativeBaseWindowHumanQuestions,
        ]);
        expect(
          Object.values(entry.questionResponses ?? {}).every((v) => v === null),
        ).toBe(true);
      }

      for (const pagePath of files.pages) {
        const html = readFileSync(pagePath, 'utf8');
        for (const question of creativeBaseWindowHumanQuestions) {
          expect(html).toContain(question);
        }
        expect(html).toContain(
          'Technical mock manuscripts: these cannot prove literary quality.',
        );
        expect(html).not.toContain('gpt-6.1-sol');
        expect(html).not.toContain('narrative-fiction-v2');
        expect(html).not.toContain('narrative-v1');
        expect(html).not.toContain('life_fiction_');
        expect(html).not.toContain('qualityPolicyVersion');
        expect(html).not.toContain('editorialReport');
        expect(html).not.toContain('sequenceSignature');
        expect(html).not.toContain('repairUsed');
        expect(html).not.toContain('accountedUsd');
      }

      // Resume and assess without additional transport calls
      const resumed = await runNarrativeEvaluation(options);
      expect(resumed.samples).toHaveLength(18);
      const transportsAfterResume = JSON.parse(
        await readFile(join(outStageB, 'transport-records.json'), 'utf8'),
      ) as unknown[];
      expect(transportsAfterResume).toHaveLength(90);

      const ratingsPath = join(outStageB, 'b8-ratings.json');
      const ratingsPayload: CreativeSequenceHumanRating[] =
        run.sequenceBundles!.map((b) => ({
          sequenceId: b.sequenceId,
          sequenceHash: b.sequenceHash,
          reviewerId: 'reader-b8-audit',
          reviewerKind: 'human',
          scores: baseSequenceScores(
            b.kind === 'branch' ? { branchingValue: 5 } : {},
          ),
          aiSuspicion: 'unlikely',
          flags: [],
          evidence: [
            {
              sampleId:
                b.kind === 'main'
                  ? b.chapters[7]!.blindedSampleId
                  : b.chapters[2]!.blindedSampleId,
              paragraphIndex: 1,
              reason:
                'The eighth chapter reflects cumulative choices and a credibly evolved situation.',
            },
          ],
          overall: 'strong_beta',
          ...(b.kind === 'branch' ? { preferredBranch: 'A' as const } : {}),
          lateHorizonNote:
            'Earned progression across the eight-chapter evaluation window.',
        }));
      await writeFile(ratingsPath, JSON.stringify(ratingsPayload, null, 2));

      const assessed = await assessEvaluationArtifacts({
        ...options,
        kind: 'assess',
        sequenceRatingsFile: ratingsPath,
      });
      expect(assessed.evidenceStage).toBe('B8');
      expect(assessed.horizons.B8.minimumCoverageMet).toBe(true);
      expect(assessed.qualityRelease).toBe(false);
      expect(assessed.passed).toBe(false);
    } finally {
      capSpy.mockRestore();
      await rm(outStageB, { recursive: true, force: true });
    }
  }, 240000);
});
