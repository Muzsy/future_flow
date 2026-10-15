import { describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { LifeRepository, type Database } from '@future-flow/database';
import { hash } from '@future-flow/core';
import { narrativeDimensions } from '@future-flow/contracts';
import {
  parseEvaluationOptions,
  verifyEvaluationAuthorization,
} from '../scripts/lib/narrative-evaluation-options';
import {
  assessHumanRatings,
  blindOrder,
  selectEvaluationChoice,
  choiceIntent,
  type BlindPair,
  type HumanRating,
} from '../scripts/lib/narrative-evaluation-contract';
import {
  evaluationCostReport,
  evaluationNarrativeYield,
} from '../scripts/lib/narrative-evaluation-costs';
import {
  narrativePeriod,
  narrativeInput,
  narrativeProfiles,
  narrativeFixtureId,
} from './narrative-fixtures';
const development = {
  NARRATIVE_EVAL_API_KEY: 'sk-proj-synthetic-config-test-only-123456',
  NARRATIVE_EVAL_PROJECT_ID: 'proj_synthetic_test',
  NARRATIVE_EVAL_PROJECT_CONFIRMATION: 'dedicated-development',
};
const paid = [
  '--mode',
  'paid',
  '--allow-paid',
  '--budget-usd',
  '5',
  '--approval-id',
  'synthetic-approval',
  '--out',
  '.local/narrative-evaluation/test',
];
function ratings() {
  const scores = Object.fromEntries(
    narrativeDimensions.map((d) => [d, 4]),
  ) as HumanRating['scoresA'];
  const pairs: BlindPair[] = Array.from({ length: 24 }, (_, i) => ({
    pairId: `full:fixture:${i}`,
    pairHash: hash(i),
    kind: 'full',
    fixtureId: 'bounded-career',
    periodIndex: i % 3,
    modeA: 'narrative-v1',
    modeB: 'legacy',
    paragraphsA: 2,
    paragraphsB: 2,
  }));
  const rows: HumanRating[] = pairs.map((p) => ({
    pairId: p.pairId,
    pairHash: p.pairHash,
    reviewerId: 'reader-one',
    preferred: 'A',
    scoresA: { ...scores },
    scoresB: { ...scores },
    reasons: [
      {
        side: 'A',
        paragraphIndex: 1,
        reason:
          'The concrete consequence creates a clearer scene and a credible next decision.',
      },
    ],
  }));
  return { pairs, rows };
}
const operations = {
  meanCostUsd: 0.08,
  p95Ms: 15000,
  maxMeanCostUsd: 0.1,
  maxP95Ms: 30000,
  hardFailures: 0,
  allChoiceMappingsReviewed: true,
};
describe('bounded and independently assessed narrative experiment', () => {
  it('defaults to eight fictional offline profiles and never adopts the application credential', () => {
    const options = parseEvaluationOptions([], {
      OPENAI_API_KEY: 'application-secret-must-not-be-used',
    });
    expect(options.kind).toBe('offline');
    expect(options.allowPaid).toBe(false);
    expect(options.fixtureIds).toHaveLength(8);
    expect(options.periods).toBe(3);
    expect(JSON.stringify(options)).not.toContain('application-secret');
  });
  it('requires explicit payment scope, a dedicated development project and a cap at most five USD', () => {
    expect(() =>
      parseEvaluationOptions(
        paid.filter((v) => v !== '--allow-paid'),
        development,
      ),
    ).toThrow();
    expect(() =>
      parseEvaluationOptions(paid, {
        OPENAI_API_KEY: development.NARRATIVE_EVAL_API_KEY,
      }),
    ).toThrow();
    expect(() =>
      parseEvaluationOptions(
        [...paid.slice(0, 4), '6', ...paid.slice(5)],
        development,
      ),
    ).toThrow();
    expect(() =>
      parseEvaluationOptions(paid, {
        ...development,
        NARRATIVE_EVAL_API_KEY: 'other-vendor-sensitive-credential',
      }),
    ).toThrow();
    const clock = vi
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-10-15T12:00:00Z'));
    try {
      const options = parseEvaluationOptions(paid, development);
      expect(options.budgetUsd).toBe(5);
      expect(JSON.stringify(options)).not.toContain(
        development.NARRATIVE_EVAL_API_KEY,
      );
      expect(() =>
        verifyEvaluationAuthorization(
          { ...options, allowPaid: false },
          development,
        ),
      ).toThrow();
      clock.mockReturnValue(Date.parse('2026-10-30T12:00:00Z'));
      expect(() => parseEvaluationOptions(paid, development)).toThrow();
    } finally {
      clock.mockRestore();
    }
  });
  it('rejects accidental or unsupported CLI requests before any provider work', () => {
    for (const args of [
      ['--allow-paid'],
      ['--mode', 'unknown'],
      ['--fixtures', 'real-person'],
      ['--periods', '4'],
      ['--event-model', 'unpriced-model'],
      ['--mode', 'assess'],
      ['--out'],
      ['--seed', 'a', '--seed', 'b'],
    ])
      expect(() => parseEvaluationOptions(args)).toThrow();
  });
  it('freezes semantic choice intent and stops ambiguous options rather than pairing raw indices', () => {
    const decision = narrativePeriod(
      narrativeInput(narrativeProfiles[0]),
    ).events.at(-1)!.decision!;
    expect(
      selectEvaluationChoice(decision.options, 'bounded-follow-up').optionId,
    ).toBe(decision.options[0]!.id);
    expect(
      selectEvaluationChoice(decision.options, 'different-method').optionId,
    ).toBe(decision.options[1]!.id);
    expect(choiceIntent('career-transition', 1, 'fork')).toBe(
      'bounded-follow-up',
    );
    const ambiguous = decision.options.map((o) => ({
      ...o,
      label: 'Consider a bounded trial',
      description: 'Consider another bounded trial.',
    }));
    expect(() =>
      selectEvaluationChoice(ambiguous, 'bounded-follow-up'),
    ).toThrow('semantic mapping');
  });
  it('binds a reviewed choice to the exact options and the previously frozen intent', () => {
    const options = narrativePeriod(
      narrativeInput(narrativeProfiles[0]),
    ).events.at(-1)!.decision!.options;
    const override = {
      fixtureId: 'bounded-career',
      mode: 'legacy' as const,
      periodIndex: 0,
      branchKind: 'main' as const,
      optionId: options[0]!.id,
      decisionHash: hash(options),
      intent: 'bounded-follow-up' as const,
      rationale:
        'The selected change reduces weekly hours and examines the same remaining obstacle.',
      reviewed: true as const,
    };
    expect(
      selectEvaluationChoice(options, override.intent, override).selection,
    ).toBe('reviewed');
    expect(() =>
      selectEvaluationChoice(options, override.intent, {
        ...override,
        decisionHash: hash('other'),
      }),
    ).toThrow();
    expect(() =>
      selectEvaluationChoice(options, 'different-method', override),
    ).toThrow();
  });
  it('blinds the same pair deterministically and uses both pipeline labels exactly once', () => {
    expect(blindOrder('seed', 'pair')).toEqual(blindOrder('seed', 'pair'));
    expect(new Set(blindOrder('seed', 'pair'))).toEqual(
      new Set(['legacy', 'narrative-v1']),
    );
  });
  it('never treats mock chapters or editor grades as independent release evidence', () => {
    const { pairs, rows } = ratings();
    expect(assessHumanRatings(pairs, rows, false, operations).passed).toBe(
      false,
    );
    expect(assessHumanRatings(pairs, rows, true).passed).toBe(false);
    expect(assessHumanRatings(pairs, rows, true, operations).passed).toBe(true);
  });
  it('requires twenty non-tied pairs, seventy percent preference and all five critical human means', () => {
    const { pairs, rows } = ratings();
    for (let i = 0; i < 4; i++) rows[i]!.preferred = 'tie';
    for (let i = 4; i < 10; i++) rows[i]!.preferred = 'B';
    const result = assessHumanRatings(pairs, rows, true, operations);
    expect(result.nonTies).toBe(20);
    expect(result.preference).toBe(0.7);
    expect(result.passed).toBe(true);
    expect(result.preferenceWilson95!.low).toBeLessThan(0.7);
    rows[10]!.preferred = 'B';
    expect(assessHumanRatings(pairs, rows, true, operations).passed).toBe(
      false,
    );
    rows.forEach((r) => {
      r.preferred = 'A';
      r.scoresA.momentum = 3;
    });
    expect(assessHumanRatings(pairs, rows, true, operations).passed).toBe(
      false,
    );
  });
  it('does not inflate sample size with repeated reviewers and honors a majority of ties', () => {
    const { pairs, rows } = ratings();
    const second = rows.map((r) => ({
      ...r,
      reviewerId: 'reader-two',
      preferred: 'tie' as const,
    }));
    const result = assessHumanRatings(
      pairs,
      [...rows, ...second],
      true,
      operations,
    );
    expect(result.nonTies).toBe(0);
    expect(result.ties).toBe(24);
    expect(result.passed).toBe(false);
    expect(() =>
      assessHumanRatings(pairs, [...rows, rows[0]], true, operations),
    ).toThrow('duplicate');
  });
  it('rejects stale manuscripts, missing full-pair coverage and unsupported paragraph references', () => {
    const { pairs, rows } = ratings();
    expect(() =>
      assessHumanRatings(
        pairs,
        [{ ...rows[0]!, pairHash: hash('stale') }],
        true,
        operations,
      ),
    ).toThrow();
    expect(() =>
      assessHumanRatings(
        pairs,
        [
          {
            ...rows[0]!,
            reasons: [{ ...rows[0]!.reasons[0]!, paragraphIndex: 3 }],
          },
        ],
        true,
        operations,
      ),
    ).toThrow('beyond');
    expect(
      assessHumanRatings(pairs, rows.slice(0, 20), true, operations).passed,
    ).toBe(false);
    expect(
      assessHumanRatings(pairs, rows, true, {
        ...operations,
        allChoiceMappingsReviewed: false,
      }).passed,
    ).toBe(false);
    expect(
      assessHumanRatings(pairs, rows, true, { ...operations, hardFailures: 1 })
        .passed,
    ).toBe(false);
  });
  it('keeps unknown reservations and prior development costs separate from usage-priced estimates', () => {
    const calls = [
      {
        id: 'known',
        accountedUsd: 0.1,
        estimatedUsd: 0.04,
        reservedUsd: 0.25,
        status: 'completed',
        usage: { input_tokens: 10, output_tokens: 20 },
      },
      {
        id: 'unknown',
        accountedUsd: 0.25,
        reservedUsd: 0.25,
        status: 'response_unavailable',
      },
      {
        id: 'prior',
        accountedUsd: 0.2,
        estimatedUsd: 0.1,
        reservedUsd: 0.25,
        status: 'completed',
        usage: { input_tokens: 5, output_tokens: 6 },
      },
    ];
    const result = evaluationCostReport(
      calls,
      {
        known: { sourceHash: 'new', caseId: 'case' },
        unknown: { sourceHash: 'new', caseId: 'case' },
        prior: { sourceHash: 'old', caseId: 'case' },
      },
      'new',
    );
    expect(result.totalDevelopmentAccountedUsd).toBeCloseTo(0.55);
    expect(result.currentSourceAccountedUsd).toBeCloseTo(0.35);
    expect(result.currentSourceUsageEstimatedUsd).toBe(0.04);
    expect(result.currentSourceUnknownUsageCalls).toBe(1);
    expect(result.perCase[0]!.peakReservationUsd).toBe(0.25);
    expect(() =>
      evaluationCostReport([{ ...calls[0]!, accountedUsd: -1 }], {}, 'new'),
    ).toThrow();
  });
});

it('charges failed full narrative attempts to accepted output without mixing comparison costs or hiding zero yield', () => {
  const calls = ['accepted', 'rejected', 'fixed', 'fork', 'prior'].map(
    (id, i) => ({
      id,
      accountedUsd: [0.2, 0.3, 0.4, 0.5, 0.6][i]!,
      estimatedUsd: 0.1,
      reservedUsd: 0.7,
      status: 'completed',
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
  );
  const accounting = evaluationCostReport(
    calls,
    {
      accepted: {
        sourceHash: 'current',
        caseId: 'bounded-career:narrative-v1:0',
      },
      rejected: {
        sourceHash: 'current',
        caseId: 'bounded-career:narrative-v1:1',
      },
      fixed: {
        sourceHash: 'current',
        caseId: 'fixed:bounded-career:narrative-v1:0',
      },
      fork: {
        sourceHash: 'current',
        caseId: 'fork:bounded-career:narrative-v1:2',
      },
      prior: { sourceHash: 'prior', caseId: 'bounded-career:narrative-v1:0' },
    },
    'current',
  );
  const samples = [
    {
      fixtureId: 'bounded-career',
      mode: 'narrative-v1',
      kind: 'full',
      periodIndex: 0,
    },
  ];
  const result = evaluationNarrativeYield(accounting, samples)!;
  expect(result.attemptedChapters).toBe(2);
  expect(result.gateAcceptedChapters).toBe(1);
  expect(result.acceptanceRate).toBe(0.5);
  expect(result.accountedUsdPerGateAcceptedChapter).toBeCloseTo(0.5);
  expect(result.unacceptedAttemptAccountedUsd).toBeCloseTo(0.3);
  expect(
    evaluationNarrativeYield(accounting, [])!
      .accountedUsdPerGateAcceptedChapter,
  ).toBeNull();
  expect(
    evaluationNarrativeYield(
      { ...accounting, unassignedReservations: 1 },
      samples,
    )!.accountedUsdPerGateAcceptedChapter,
  ).toBeNull();
  expect(
    evaluationNarrativeYield({ ...accounting, perCase: [] }, samples)!
      .acceptedCostCoverage,
  ).toBe(false);
  expect(
    evaluationNarrativeYield({ ...accounting, perCase: [] }, samples)!
      .accountedUsdPerGateAcceptedChapter,
  ).toBeNull();
});

describe('real worker evaluation corpus without paid transport', () => {
  it('runs all chains, fixed-canon writers and owned forks, then resumes without another request', async () => {
    const { mkdtemp, readFile, writeFile, rm, mkdir } =
      await import('node:fs/promises');
    const { resolve, join } = await import('node:path');
    const { runNarrativeEvaluation } =
      await import('../scripts/lib/narrative-evaluation-runner');
    const { writeEvaluationArtifacts } =
      await import('../scripts/lib/narrative-evaluation-artifacts');
    await mkdir('.local/narrative-evaluation', { recursive: true });
    const out = await mkdtemp(
      resolve('.local/narrative-evaluation/test-corpus-'),
    );
    const options = parseEvaluationOptions(['--out', out]);
    try {
      // Reproduce a process stopping between the durable choose and continue.
      const firstProfile = narrativeProfiles[0]!;
      await runNarrativeEvaluation(
        { ...options, fixtureIds: [firstProfile.id], periods: 1 },
        {},
      );
      for (const mode of ['legacy', 'narrative-v1'] as const) {
        const statePath = join(out, 'state', `${firstProfile.id}-${mode}`);
        const engine = new PGlite(statePath);
        function adapt(
          client: Pick<PGlite, 'query' | 'transaction'>,
        ): Database {
          return {
            query: async <T extends Record<string, unknown>>(
              sql: string,
              values: unknown[] = [],
            ) => (await client.query<T>(sql, values)).rows,
            transaction: (run) =>
              client.transaction((tx) => run(adapt(tx as unknown as PGlite))),
          };
        }
        try {
          const owner = narrativeFixtureId(`${firstProfile.id}:${mode}:owner`);
          const lives = new LifeRepository(
            adapt(engine),
            { daily: 100, concurrent: 10 },
            {
              mode: mode === 'legacy' ? 'legacy' : 'narrative-v1',
              cohortUserIds: mode === 'legacy' ? [] : [owner],
            },
          );
          const detail = await lives.detail(
            owner,
            narrativeInput(firstProfile).input.branchId,
          );
          const decision = detail.branch.pending_decision!;
          const mapping = selectEvaluationChoice(
            decision.options,
            choiceIntent(firstProfile.id, 0),
          );
          const chosen = decision.options.find(
            (o) => o.id === mapping.optionId,
          )!;
          await writeFile(
            join(statePath, 'choice-0.json'),
            JSON.stringify({
              ...mapping,
              label: chosen.label,
              description: chosen.description,
              reviewed: false,
            }),
          );
          await lives.choose(
            owner,
            detail.branch.id,
            detail.branch.revision,
            decision.id,
            mapping.optionId,
            narrativeFixtureId(`${firstProfile.id}:${mode}:choose:0`),
          );
          expect((await lives.branch(owner, detail.branch.id)).status).toBe(
            'ready',
          );
        } finally {
          await engine.close();
        }
      }
      const run = await runNarrativeEvaluation(options, {
        OPENAI_API_KEY: 'APPLICATION_SECRET_SENTINEL',
      });
      expect(
        run.failures.map((f) => ({ caseId: f.caseId, code: f.code })),
      ).toEqual([]);
      expect(run.samples).toHaveLength(68);
      expect(run.choiceReviewRequests).toEqual([]);
      expect(run.complete).toBe(true);
      expect(run.mock).toBe(true);
      expect(run.samples.reduce((n, s) => n + s.transportCalls, 0)).toBe(248);
      expect(
        run.samples.every((s) => s.requestCount === s.transportCalls),
      ).toBe(true);
      expect(
        run.samples
          .filter((s) => s.kind === 'fork')
          .every((s) => s.prefix.length === 2),
      ).toBe(true);
      for (const fixture of narrativeProfiles) {
        const fixed = run.samples.filter(
          (s) => s.fixtureId === fixture.id && s.kind === 'fixed-canon',
        );
        expect(fixed).toHaveLength(2);
        expect(fixed[0].canon).toEqual(fixed[1].canon);
      }
      const summary = await writeEvaluationArtifacts(run, options);
      expect(summary.transportCalls).toBe(248);
      expect(summary.completedSampleAdmittedRequests).toBe(248);
      expect(summary.qualityRelease).toBe(false);
      expect(summary.p95GenerationMs).toBeNull();
      const text = await readFile(join(out, 'report.json'), 'utf8');
      expect(text).not.toContain('APPLICATION_SECRET_SENTINEL');
      const resumed = await runNarrativeEvaluation(options, {});
      expect(resumed.samples).toEqual(run.samples);
      expect(resumed.failures).toEqual([]);
      expect(resumed.complete).toBe(true);
      expect(
        JSON.parse(await readFile(join(out, 'transport-records.json'), 'utf8')),
      ).toHaveLength(248);
      const sample = run.samples.find(
        (s) => s.kind === 'full' && s.periodIndex === 1,
      )!;
      const mapping = sample.choiceMappings[0] as {
        optionId: string;
        decisionHash: string;
        intent: 'bounded-follow-up';
      };
      const reviewPath = join(out, 'reviews.json');
      await writeFile(
        reviewPath,
        JSON.stringify([
          {
            fixtureId: sample.fixtureId,
            mode: sample.mode,
            periodIndex: 0,
            branchKind: 'main',
            optionId: mapping.optionId,
            decisionHash: mapping.decisionHash,
            intent: mapping.intent,
            rationale:
              'Synthetic test reviewer confirms the bounded action matches the frozen experimental intent.',
            reviewed: true,
          },
        ]),
      );
      const reviewed = await runNarrativeEvaluation(
        { ...options, choicesFile: reviewPath },
        {},
      );
      expect(
        (
          reviewed.samples.find((s) => s.id === sample.id)!
            .choiceMappings[0] as { reviewed: boolean }
        ).reviewed,
      ).toBe(true);
      expect(
        JSON.parse(await readFile(join(out, 'transport-records.json'), 'utf8')),
      ).toHaveLength(248);
      const badReview = JSON.parse(await readFile(reviewPath, 'utf8'));
      badReview[0].optionId = '00000000-0000-4000-8000-000000000099';
      await writeFile(reviewPath, JSON.stringify(badReview));
      await expect(
        runNarrativeEvaluation({ ...options, choicesFile: reviewPath }, {}),
      ).rejects.toThrow();
      await writeFile(join(out, '.run.lock'), 'another-process');
      await expect(runNarrativeEvaluation(options, {})).rejects.toThrow();
      expect(await readFile(join(out, '.run.lock'), 'utf8')).toBe(
        'another-process',
      );
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 180000);
});

it('requires coverage of fixed-canon and fork pairs as well as full pairs', () => {
  const { pairs, rows } = ratings();
  const additional = {
    ...pairs[0],
    pairId: 'fixed-canon:extra',
    kind: 'fixed-canon' as const,
  };
  expect(
    assessHumanRatings([...pairs, additional], rows, true, operations).passed,
  ).toBe(false);
  expect(
    assessHumanRatings(pairs, rows, true, { ...operations, meanCostUsd: NaN })
      .passed,
  ).toBe(false);
});

it('authors observable fixed-canon actions without changing source profile constraints or inventing money', async () => {
  const { fixedNarrativeFixture } =
    await import('../scripts/lib/narrative-evaluation-fixtures');
  const {
    narrativeCanon,
    narrativeReferenceSnapshot,
    narrativeReferencesFromMemory,
  } = await import('@future-flow/core');
  const { narrativeV1Policy } = await import('@future-flow/contracts');
  for (const profile of narrativeProfiles) {
    const f = fixedNarrativeFixture(profile.id);
    const run = narrativeCanon(
      {
        ...f.input,
        narrativeContext: { policy: narrativeV1Policy(), memory: f.memory },
        narrativeReferences: narrativeReferenceSnapshot(
          narrativeReferencesFromMemory(f.memory),
        ),
      },
      f.result,
    );
    expect(run.canon.events[0].summary).not.toBe(
      'A bounded trial produces a first concrete observation.',
    );
    expect(run.canon.events[0].stateAfter.finance.monthlyIncome).toBeNull();
    expect(run.canon.events[0].stateAfter.finance.liquidFunds).toBeNull();
    expect(run.canon.events).toHaveLength(3);
    expect(f.result.plan.turningPointEventId).toBe(run.canon.events[1].id);
    expect(f.result.plan.scenes[1]!.eventIds).toEqual([run.canon.events[1].id]);
    expect(run.canon.events[1].stateAfter.resources).toEqual(
      f.input.state.resources,
    );
    const decision = f.candidate.events.at(-1)!.decision!;
    expect(
      decision.options.every((o) =>
        o.changes.every((c) => c.type === 'goal_progress_set'),
      ),
    ).toBe(true);
    expect(new Set(decision.options.map((o) => o.description)).size).toBe(2);
    expect(fixedNarrativeFixture(profile.id).result).toEqual(f.result);
  }
});
