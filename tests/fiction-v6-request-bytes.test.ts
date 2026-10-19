import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type OpenAI from 'openai';
import {
  EXPERIMENT_CREATIVE_MAX_REQUEST_BYTES,
  EXPERIMENT_DEFAULT_MAX_REQUEST_BYTES,
  EXPERIMENT_REQUEST_BYTE_BUFFER,
  ExperimentAiBudget,
  combineAiGuards,
  OpenAiProvider,
  type AiRequestGuard,
} from '@future-flow/ai';
import {
  FICTION_MODE,
  NARRATIVE_ARTIFACT_BYTES,
  NARRATIVE_MEMORY_BYTES,
  fictionHumanEditorialSchema,
  fictionPolicy,
  fictionV6Quality25Policy,
  type FictionAuthorResult,
} from '@future-flow/contracts';
import {
  DomainError,
  evaluateFictionEditorialGate,
  fictionAuthorRequest,
  fictionEditorialRequest,
  fictionFidelityRequest,
  fictionPlannerRequest,
  fictionProseRepairAllowed,
  fictionReviewRequest,
  hash,
  type FictionRepair,
} from '@future-flow/core';
import {
  DatabaseAiBudget,
  LifeJobRepository,
  LifeRepository,
  Repository,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  evaluationCostReport,
  type ExperimentalCall,
} from '../scripts/lib/narrative-evaluation-costs';
import {
  evaluationApprovedCumulativeBudgetUsd,
  evaluationCreativeMaxRequestBytes,
  evaluationDefaultMaxRequestBytes,
  evaluationMaxRequestBytes,
  evaluationPrices,
  parseEvaluationOptions,
} from '../scripts/lib/narrative-evaluation-options';
import { bulkyFictionFixture, fictionFixture } from './fiction-fixtures';
import { setupFixture } from './life-fixtures';

const V6_CHAPTER5_NORMAL_GUARD_BYTES = 86889;
const V6_CHAPTER5_REPAIR_GUARD_BYTES = 108751;

function guardedBytes(raw: unknown) {
  return (
    Buffer.byteLength(JSON.stringify(raw), 'utf8') +
    EXPERIMENT_REQUEST_BYTE_BUFFER
  );
}

function syntheticRequestWithGuardedBytes(
  targetGuardedBytes: number,
  maxOutputTokens = 12000,
) {
  const base = {
    model: 'gpt-6.1-sol',
    store: false,
    max_output_tokens: maxOutputTokens,
    input: [
      { role: 'system', content: 'Frozen creative system instructions.' },
      { role: 'user', content: '' },
    ],
    text: { format: { name: 'life_narrative_chapter' } },
  };
  const baseBytes = guardedBytes(base);
  const padLength = targetGuardedBytes - baseBytes;
  if (padLength < 0) throw new Error('Target guarded byte size is too small.');
  return {
    ...base,
    input: [base.input[0]!, { role: 'user', content: 'x'.repeat(padLength) }],
  };
}

let engine: PGlite;
let db: Database;
let jobs: LifeJobRepository;
let repo: Repository;
const tempDirs: string[] = [];

function adapter(client: Pick<PGlite, 'query' | 'transaction'>): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) => (await client.query<T>(sql, values)).rows,
    transaction: (run) =>
      client.transaction((tx) => run(adapter(tx as unknown as PGlite))),
  };
}

async function tempLedgerPath() {
  const dir = await mkdtemp(join(tmpdir(), 'alterward-v6-req-bytes-'));
  tempDirs.push(dir);
  return resolve(dir, 'paid-usage.json');
}

beforeAll(async () => {
  engine = new PGlite();
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await applyMigrations(engine);
  db = adapter(engine);
  jobs = new LifeJobRepository(db);
  repo = new Repository(db);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.query(
    "UPDATE aw_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE status IN ('running','queued')",
  );
  while (tempDirs.length) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
});

afterAll(async () => {
  await engine?.close();
});

async function buildChapter5RepairCaptureFixture() {
  const owner = randomUUID();
  await repo.ensureUser(owner);
  await repo.acceptPrivacy(owner);
  const lives = new LifeRepository(
    db,
    { daily: 100, concurrent: 10 },
    { mode: FICTION_MODE, cohortUserIds: [owner] },
  );
  await lives.create(owner, setupFixture(), randomUUID());
  const job = (await jobs.claim())!;
  if (job.payload.narrativeContext?.policy.mode !== 'narrative-fiction-v2') {
    throw new Error('Expected creative v6 job payload.');
  }
  expect(job.payload.narrativeContext.policy).toEqual(fictionPolicy());
  // These byte measurements are v6 evidence; pin the merged v6/quality2.5
  // snapshot explicitly now that newly queued jobs select v7.
  job.payload.narrativeContext.policy = fictionV6Quality25Policy();

  const normalFixture = fictionFixture(job.payload);
  const baseFixture = bulkyFictionFixture(normalFixture);
  // Use the bulky validated plan/candidate on draft as well (draft is only sent
  // to authorFiction, keeping review/fidelity/editor well below 100,000 bytes).
  const draft = {
    version: '1.0.0' as const,
    candidate: structuredClone(baseFixture.authored.candidate),
    plan: structuredClone(baseFixture.authored.plan),
  };
  const initialAuthored: FictionAuthorResult = {
    ...structuredClone(baseFixture.authored),
    storyFacts: structuredClone(baseFixture.authored.storyFacts.slice(0, 4)),
  };
  const review = structuredClone(normalFixture.review);
  const fidelity = structuredClone(normalFixture.fidelity);
  const passingEditor = fictionHumanEditorialSchema.parse(normalFixture.editor);

  // Measure the normal author transport envelope and pad recentEvents in
  // job.payload so the normal author call renders to exact 86,889 guarded bytes.
  let capturedProbeParams: unknown = null;
  const probeClient = {
    responses: {
      parse: async (params: unknown) => {
        capturedProbeParams = params;
        return {
          status: 'completed',
          model: 'gpt-6.1-sol',
          output_parsed: initialAuthored,
          usage: { input_tokens: 100, output_tokens: 100 },
        };
      },
    },
  } as unknown as OpenAI;
  const probeAi = new OpenAiProvider(
    {
      apiKey: 'offline-probe-only',
      eventModel: 'gpt-6.1-sol',
      storyModel: 'gpt-6.1-sol',
      checkModel: 'gpt-6.1-sol',
      timeoutMs: 1000,
      maxOutputTokens: 12000,
    },
    probeClient,
  );

  job.payload.memory.recentEvents = Array.from({ length: 12 }, (_, i) => ({
    id: randomUUID(),
    title: `Prior studio period event ${i + 1}`,
    summary: 'P'.repeat(800),
    effectiveAt: job.payload.startDate,
  }));
  await probeAi.authorFiction(job.payload, draft);
  const initialNormalBytes = guardedBytes(capturedProbeParams);
  const normalDelta = V6_CHAPTER5_NORMAL_GUARD_BYTES - initialNormalBytes;
  if (normalDelta >= 0) {
    job.payload.memory.recentEvents.push({
      id: randomUUID(),
      title: 'Prior studio continuity note',
      summary: 'N'.repeat(normalDelta),
      effectiveAt: job.payload.startDate,
    });
    await probeAi.authorFiction(job.payload, draft);
    const afterPushBytes = guardedBytes(capturedProbeParams);
    const fineAdjust = V6_CHAPTER5_NORMAL_GUARD_BYTES - afterPushBytes;
    const last = job.payload.memory.recentEvents.at(-1)!;
    last.summary = 'N'.repeat(last.summary.length + fineAdjust);
  } else {
    let remaining = -normalDelta;
    for (const ev of job.payload.memory.recentEvents) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, ev.summary.length - 20);
      ev.summary = ev.summary.slice(0, ev.summary.length - take);
      remaining -= take;
    }
  }

  await probeAi.authorFiction(job.payload, draft);
  expect(guardedBytes(capturedProbeParams)).toBe(
    V6_CHAPTER5_NORMAL_GUARD_BYTES,
  );

  await db.query('UPDATE aw_jobs SET payload=$2 WHERE id=$1', [
    job.id,
    JSON.stringify(job.payload),
  ]);

  // First editorial report rightly rejects the repeated ending while permitting
  // a single prose_only repair (no canon issues; structural/agency flags pass).
  const rejectedEditor = fictionHumanEditorialSchema.parse({
    ...passingEditor,
    verdict: 'revise',
    scores: {
      ...passingEditor.scores,
      novelty: 3,
    },
    sequenceReview: {
      ...passingEditor.sequenceReview,
      distinctEnding: false,
      evidence:
        'The chapter closes on another answer-waiting handoff at the worktable instead of a distinct ending.',
    },
    issues: [
      {
        dimension: 'novelty',
        severity: 'major',
        repairScope: 'prose',
        eventIds: [initialAuthored.candidate.events.at(-1)!.id],
        paragraphIndex: 2,
        explanation:
          'Ending repeats the earlier answer-waiting posture across periods.',
        suggestedFix:
          'Close on a concrete physical consequence or action in progress without changing canonical events.',
      },
    ],
  });
  expect(fictionProseRepairAllowed(rejectedEditor)).toBe(true);
  expect(evaluateFictionEditorialGate(job.payload, rejectedEditor).passed).toBe(
    false,
  );

  const expectedRepairMessage =
    `Rewrite the weak story rather than paraphrasing it: ${JSON.stringify(rejectedEditor)}`.slice(
      0,
      1800,
    );

  // Tune initialAuthored.chapter.body (within its 250..950 word and <=10,000 char
  // bounds and two-paragraph structure) so the prose_only repair request renders
  // to exact 108,751 guarded bytes without touching job.payload or draft.
  const paragraphOneWords = Array.from({ length: 250 }, () => 'studio').join(
    ' ',
  );
  const paragraphTwoPrefix = Array.from({ length: 249 }, () => 'panel').join(
    ' ',
  );
  initialAuthored.chapter.body = `${paragraphOneWords}\n\n${paragraphTwoPrefix} ${'w'.repeat(1500)}`;
  await probeAi.authorFiction(job.payload, draft, {
    mode: 'prose_only',
    message: expectedRepairMessage,
    previous: initialAuthored,
  });
  const baseRepairBytes = guardedBytes(capturedProbeParams);
  const repairDelta = V6_CHAPTER5_REPAIR_GUARD_BYTES - baseRepairBytes;
  if (1500 + repairDelta < 1) {
    throw new Error(`Repair byte delta underflow: ${repairDelta}`);
  }
  initialAuthored.chapter.body = `${paragraphOneWords}\n\n${paragraphTwoPrefix} ${'w'.repeat(1500 + repairDelta)}`;

  const expectedFeedback: FictionRepair = {
    mode: 'prose_only',
    message: expectedRepairMessage,
    previous: structuredClone(initialAuthored),
  };
  await probeAi.authorFiction(job.payload, draft, expectedFeedback);
  expect(guardedBytes(capturedProbeParams)).toBe(
    V6_CHAPTER5_REPAIR_GUARD_BYTES,
  );

  // Repaired authored package keeps the exact reviewed candidate/plan/storyFacts
  // and replaces only the prose chapter to resolve the repeated ending.
  const repairedAuthored: FictionAuthorResult = {
    ...structuredClone(initialAuthored),
    chapter: {
      ...structuredClone(initialAuthored.chapter),
      body: `${Array.from({ length: 250 }, () => 'gallery').join(' ')}\n\n${Array.from({ length: 250 }, () => 'courier').join(' ')}`,
    },
  };

  return {
    owner,
    job,
    draft,
    initialAuthored,
    repairedAuthored,
    review,
    fidelity,
    rejectedEditor,
    passingEditor,
    expectedFeedback,
  };
}

describe('v6 creative request-byte admission and worst-case financial reservation', () => {
  it('selects 196,608 request bytes only for creative evaluation while preserving 100,000 for legacy/default callers', () => {
    expect(evaluationDefaultMaxRequestBytes).toBe(100000);
    expect(evaluationCreativeMaxRequestBytes).toBe(196608);
    expect(evaluationCreativeMaxRequestBytes).toBe(192 * 1024);
    expect(evaluationCreativeMaxRequestBytes).toBeLessThan(272000);
    expect(evaluationApprovedCumulativeBudgetUsd).toBeCloseTo(40.8616975, 7);

    const legacyDefault = parseEvaluationOptions([]);
    expect(legacyDefault.creative).toBeUndefined();
    expect(evaluationMaxRequestBytes(legacyDefault)).toBe(100000);

    const creativePaired = parseEvaluationOptions(['--creative']);
    expect(creativePaired.creative).toBe(true);
    expect(evaluationMaxRequestBytes(creativePaired)).toBe(196608);

    const creativeOnly = parseEvaluationOptions([
      '--creative-only',
      '--fixtures',
      'creative-portfolio,career-transition',
      '--periods',
      '8',
    ]);
    expect(creativeOnly.creative).toBe(true);
    expect(evaluationMaxRequestBytes(creativeOnly)).toBe(196608);
  });

  it('rejects the 108,751-byte repair envelope under the default 100,000 cap, admits it under explicit 196,608 with full worst-case pricing, and rejects >196,608 and invalid configs', async () => {
    for (const invalidCap of [
      NaN,
      Infinity,
      -Infinity,
      -100,
      0,
      4096,
      99999,
      100000.25,
      196609,
      262144,
    ]) {
      const badLedger = await tempLedgerPath();
      expect(
        () =>
          new ExperimentAiBudget(
            badLedger,
            5,
            'invalid-config',
            evaluationPrices,
            5,
            invalidCap,
          ),
      ).toThrowError(
        expect.objectContaining({
          code: 'SMOKE_BUDGET_CONFIG',
        }),
      );
      expect(existsSync(resolve(dirname(badLedger), 'paid-run.lock'))).toBe(
        false,
      );
    }

    const normal86889 = syntheticRequestWithGuardedBytes(
      V6_CHAPTER5_NORMAL_GUARD_BYTES,
    );
    const boundary100000 = syntheticRequestWithGuardedBytes(100000);
    const overDefault100001 = syntheticRequestWithGuardedBytes(100001);
    const repair108751 = syntheticRequestWithGuardedBytes(
      V6_CHAPTER5_REPAIR_GUARD_BYTES,
    );
    const boundary196608 = syntheticRequestWithGuardedBytes(196608);
    const oversized196609 = syntheticRequestWithGuardedBytes(196609);

    expect(guardedBytes(normal86889)).toBe(86889);
    expect(guardedBytes(boundary100000)).toBe(100000);
    expect(guardedBytes(overDefault100001)).toBe(100001);
    expect(guardedBytes(repair108751)).toBe(108751);
    expect(guardedBytes(boundary196608)).toBe(196608);
    expect(guardedBytes(oversized196609)).toBe(196609);

    // Default 100K guard admits 86,889 and 100,000, but rejects 100,001 and 108,751
    const defaultLedger = await tempLedgerPath();
    const defaultGuard = new ExperimentAiBudget(
      defaultLedger,
      5,
      'legacy-default',
      evaluationPrices,
    );
    try {
      const idNormal = await defaultGuard.reserve(normal86889);
      await defaultGuard.settle(idNormal, {
        input_tokens: 1200,
        output_tokens: 800,
      });
      const idBoundary = await defaultGuard.reserve(boundary100000);
      await defaultGuard.settle(idBoundary, {
        input_tokens: 1200,
        output_tokens: 800,
      });
      await expect(
        defaultGuard.reserve(overDefault100001),
      ).rejects.toMatchObject({
        code: 'SMOKE_BUDGET_CONFIG',
      });
      await expect(defaultGuard.reserve(repair108751)).rejects.toMatchObject({
        code: 'SMOKE_BUDGET_CONFIG',
      });
    } finally {
      defaultGuard.close();
    }

    // Explicit 196,608 creative guard admits 86,889, 108,751, and 196,608 with full worst-case reservation, and rejects 196,609
    const creativeLedger = await tempLedgerPath();
    const creativeGuard = new ExperimentAiBudget(
      creativeLedger,
      evaluationApprovedCumulativeBudgetUsd,
      'narrative-evaluation:v6-stage-b',
      evaluationPrices,
      evaluationApprovedCumulativeBudgetUsd,
      EXPERIMENT_CREATIVE_MAX_REQUEST_BYTES,
    );
    try {
      const normalId = await creativeGuard.reserve(normal86889);
      let saved = JSON.parse(await readFile(creativeLedger, 'utf8'));
      const expectedNormalReserve = (86889 * 2.5 + 12000 * 10) / 1e6;
      expect(expectedNormalReserve).toBeCloseTo(0.3372225, 8);
      expect(saved.calls[0].reservedUsd).toBeCloseTo(expectedNormalReserve, 8);
      expect(saved.calls[0].accountedUsd).toBeCloseTo(expectedNormalReserve, 8);
      await creativeGuard.settle(normalId, {
        input_tokens: 18000,
        output_tokens: 2400,
        input_tokens_details: { cached_tokens: 4000 },
      });

      const repairId = await creativeGuard.reserve(repair108751);
      saved = JSON.parse(await readFile(creativeLedger, 'utf8'));
      const expectedRepairReserve = (108751 * 2.5 + 12000 * 10) / 1e6;
      expect(expectedRepairReserve).toBeCloseTo(0.3918775, 8);
      expect(saved.calls[1].reservedUsd).toBeCloseTo(expectedRepairReserve, 8);
      expect(saved.calls[1].accountedUsd).toBeCloseTo(expectedRepairReserve, 8);
      await creativeGuard.settle(repairId, {
        input_tokens: 22000,
        output_tokens: 2500,
        input_tokens_details: { cached_tokens: 8000 },
      });

      const upperId = await creativeGuard.reserve(boundary196608);
      saved = JSON.parse(await readFile(creativeLedger, 'utf8'));
      const expectedUpperReserve = (196608 * 2.5 + 12000 * 10) / 1e6;
      expect(expectedUpperReserve).toBeCloseTo(0.61152, 8);
      expect(saved.calls[2].reservedUsd).toBeCloseTo(expectedUpperReserve, 8);
      await creativeGuard.settle(upperId, {
        input_tokens: 30000,
        output_tokens: 2000,
      });

      await expect(
        creativeGuard.reserve(oversized196609),
      ).rejects.toMatchObject({
        code: 'SMOKE_BUDGET_CONFIG',
      });
      saved = JSON.parse(await readFile(creativeLedger, 'utf8'));
      expect(saved.calls).toHaveLength(3);
    } finally {
      creativeGuard.close();
    }
  });

  it('enforces the owner USD ceiling and preserves all prior cumulative ledger calls without clipping, deduplication, retagging or source adoption', async () => {
    const ledgerPath = await tempLedgerPath();
    // Even with creative 196,608 byte cap, USD ceiling cannot exceed default 5 or the owner-approved cumulative ceiling
    expect(
      () =>
        new ExperimentAiBudget(
          ledgerPath,
          5.01,
          'over-default-usd',
          evaluationPrices,
          undefined,
          EXPERIMENT_CREATIVE_MAX_REQUEST_BYTES,
        ),
    ).toThrowError(expect.objectContaining({ code: 'SMOKE_BUDGET_CONFIG' }));
    expect(
      () =>
        new ExperimentAiBudget(
          ledgerPath,
          evaluationApprovedCumulativeBudgetUsd + 0.000001,
          'over-owner-usd',
          evaluationPrices,
          evaluationApprovedCumulativeBudgetUsd,
          EXPERIMENT_CREATIVE_MAX_REQUEST_BYTES,
        ),
    ).toThrowError(expect.objectContaining({ code: 'SMOKE_BUDGET_CONFIG' }));

    // Seed /tmp ledger with 320 prior calls (305 v5 calls = 10.732030 USD + 15 Stage A calls = 0.741945 USD -> 11.473975 USD)
    const priorCalls: ExperimentalCall[] = [
      ...Array.from({ length: 305 }, (_, i) => ({
        id: `v5-call-${i + 1}`,
        caseName: 'narrative-evaluation:v5',
        model: 'gpt-6.1-sol',
        task: 'life_narrative_chapter',
        startedAt: '2026-10-17T12:00:00.000Z',
        reservedUsd: 0.05,
        accountedUsd: i === 304 ? 10.73203 - 304 * 0.035 : 0.035,
        estimatedUsd: i === 304 ? 9.8234197 - 304 * 0.032 : 0.032,
        status: 'completed',
        usage: { input_tokens: 100, output_tokens: 100 },
      })),
      ...Array.from({ length: 15 }, (_, i) => ({
        id: `v6-stage-a-call-${i + 1}`,
        caseName: 'narrative-evaluation:v6-stage-a',
        model: 'gpt-6.1-sol',
        task: 'life_narrative_chapter',
        startedAt: '2026-10-18T00:30:00.000Z',
        reservedUsd: 0.06,
        accountedUsd: i === 14 ? 0.741945 - 14 * 0.049 : 0.049,
        estimatedUsd: i === 14 ? 0.6618489 - 14 * 0.044 : 0.044,
        status: 'completed',
        usage: { input_tokens: 120, output_tokens: 110 },
      })),
    ];
    await writeFile(
      ledgerPath,
      JSON.stringify(
        {
          budgetUsd: evaluationApprovedCumulativeBudgetUsd,
          accountedUsd: 11.473975,
          estimatedUsd: 10.4852686,
          unknownUsageCalls: 0,
          calls: priorCalls,
        },
        null,
        2,
      ),
    );

    const guard = new ExperimentAiBudget(
      ledgerPath,
      evaluationApprovedCumulativeBudgetUsd,
      'narrative-evaluation:v6-stage-b',
      evaluationPrices,
      evaluationApprovedCumulativeBudgetUsd,
      EXPERIMENT_CREATIVE_MAX_REQUEST_BYTES,
    );
    let repairCallId = '';
    try {
      const repairReq = syntheticRequestWithGuardedBytes(
        V6_CHAPTER5_REPAIR_GUARD_BYTES,
      );
      repairCallId = await guard.reserve(repairReq);
      await guard.settle(repairCallId, {
        input_tokens: 22000,
        output_tokens: 2500,
        input_tokens_details: { cached_tokens: 8000 },
      });
    } finally {
      guard.close();
    }

    const after = JSON.parse(await readFile(ledgerPath, 'utf8'));
    expect(after.calls).toHaveLength(321);
    expect(after.calls.slice(0, 320)).toEqual(priorCalls);
    expect(after.calls[320].id).toBe(repairCallId);
    expect(after.calls[320].reservedUsd).toBeCloseTo(0.3918775, 8);

    const bindings = {
      ...Object.fromEntries(
        priorCalls.slice(0, 305).map((c) => [
          c.id!,
          {
            sourceHash: 'v5-source-hash',
            caseId: 'creative-portfolio:narrative-v1:0',
          },
        ]),
      ),
      ...Object.fromEntries(
        priorCalls.slice(305).map((c) => [
          c.id!,
          {
            sourceHash: 'v6-stage-a-source-hash',
            caseId: 'career-transition:narrative-v1:0',
          },
        ]),
      ),
      [repairCallId]: {
        sourceHash: 'v6-stage-b-source-hash',
        caseId: 'creative-portfolio:narrative-v1:4',
      },
    };
    const report = evaluationCostReport(
      after.calls,
      bindings,
      'v6-stage-b-source-hash',
    );
    expect(report.unassignedReservations).toBe(0);
    expect(report.perCase).toHaveLength(1);
    expect(report.perCase[0]!.reservations).toBe(1);
    expect(report.perCase[0]!.peakReservationUsd).toBeCloseTo(0.3918775, 8);
    expect(report.currentSourceAccountedUsd).toBeCloseTo(
      after.calls[320].accountedUsd,
      6,
    );
    expect(report.totalDevelopmentAccountedUsd).toBeCloseTo(
      11.473975 + after.calls[320].accountedUsd,
      6,
    );

    // When remaining cumulative headroom is smaller than the 0.3918775 USD worst-case
    // reservation of the 108,751-byte repair request, reserve rejects with SMOKE_BUDGET_EXCEEDED
    const tightLedgerPath = await tempLedgerPath();
    const tightPriorSpend = evaluationApprovedCumulativeBudgetUsd - 0.38;
    await writeFile(
      tightLedgerPath,
      JSON.stringify(
        {
          budgetUsd: evaluationApprovedCumulativeBudgetUsd,
          accountedUsd: tightPriorSpend,
          estimatedUsd: 21.0,
          unknownUsageCalls: 0,
          calls: [
            {
              id: 'prior-cumulative-spend',
              caseName: 'narrative-evaluation:v6-stage-b',
              model: 'gpt-6.1-sol',
              task: 'life_narrative_chapter',
              startedAt: '2026-10-18T00:50:00.000Z',
              reservedUsd: tightPriorSpend,
              accountedUsd: tightPriorSpend,
              estimatedUsd: 21.0,
              status: 'completed',
              usage: { input_tokens: 1000, output_tokens: 1000 },
            },
          ],
        },
        null,
        2,
      ),
    );
    const tightGuard = new ExperimentAiBudget(
      tightLedgerPath,
      evaluationApprovedCumulativeBudgetUsd,
      'narrative-evaluation:v6-stage-b',
      evaluationPrices,
      evaluationApprovedCumulativeBudgetUsd,
      EXPERIMENT_CREATIVE_MAX_REQUEST_BYTES,
    );
    try {
      await expect(
        tightGuard.reserve(
          syntheticRequestWithGuardedBytes(V6_CHAPTER5_REPAIR_GUARD_BYTES),
        ),
      ).rejects.toMatchObject({
        code: 'SMOKE_BUDGET_EXCEEDED',
      });
    } finally {
      tightGuard.close();
    }
  });

  it('keeps the transactional default bounded and prices the explicit dev envelope without weakening USD limits', async () => {
    const owner = randomUUID();
    await new Repository(db).ensureUser(owner);
    const raw = syntheticRequestWithGuardedBytes(108751);
    const config = { projectUsd: 1, userUsd: 1 };
    await expect(
      new DatabaseAiBudget(db, owner, randomUUID(), config).reserve(raw),
    ).rejects.toMatchObject({ code: 'AI_BUDGET_CONFIG' });
    for (const invalid of [99999, 196609, 108751.5, NaN, Infinity]) {
      expect(
        () =>
          new DatabaseAiBudget(
            db,
            owner,
            randomUUID(),
            config,
            undefined,
            invalid,
          ),
      ).toThrowError(expect.objectContaining({ code: 'AI_BUDGET_CONFIG' }));
    }
    const allowed = new DatabaseAiBudget(
      db,
      owner,
      randomUUID(),
      config,
      undefined,
      196608,
    );
    await expect(
      allowed.reserve(syntheticRequestWithGuardedBytes(196609)),
    ).rejects.toMatchObject({ code: 'AI_BUDGET_CONFIG' });
    const id = await allowed.reserve(raw);
    const [reservation] = await db.query<{ reserved_micro: number }>(
      'SELECT reserved_micro FROM aw_budget_reservations WHERE id=$1',
      [id],
    );
    expect(Number(reservation!.reserved_micro)).toBe(
      Math.ceil(108751 * 2.5 + 12000 * 10),
    );
    await allowed.settle(id, { input_tokens: 100, output_tokens: 50 });
    await expect(
      new DatabaseAiBudget(
        db,
        owner,
        randomUUID(),
        { projectUsd: 0.1, userUsd: 0.1 },
        undefined,
        196608,
      ).reserve(raw),
    ).rejects.toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });
  });

  it('rejects inherited model names and incomplete rates before corrupting the original cumulative ledger', async () => {
    const path = await tempLedgerPath();
    const guard = new ExperimentAiBudget(path, 5, 'invalid-model-controls');
    try {
      for (const model of [
        'constructor',
        '__proto__',
        'toString',
        'hasOwnProperty',
        null,
        {},
        42,
      ]) {
        await expect(
          guard.reserve({ model, max_output_tokens: 12000 }),
        ).rejects.toMatchObject({ code: 'SMOKE_BUDGET_CONFIG' });
      }
      expect(existsSync(path)).toBe(false);
      const id = await guard.reserve(syntheticRequestWithGuardedBytes(86889));
      await guard.settle(id, { input_tokens: 100, output_tokens: 50 });
      const saved = JSON.parse(readFileSync(path, 'utf8'));
      expect(saved.calls).toHaveLength(1);
      expect(Number.isFinite(saved.accountedUsd)).toBe(true);
    } finally {
      guard.close();
    }
    const incomplete = new ExperimentAiBudget(
      await tempLedgerPath(),
      5,
      'invalid-rate-control',
      {
        'gpt-6.1-sol': { input: 2, cachedInput: 0.1, output: 10 },
      } as unknown as typeof evaluationPrices,
    );
    try {
      await expect(
        incomplete.reserve(syntheticRequestWithGuardedBytes(86889)),
      ).rejects.toMatchObject({ code: 'SMOKE_BUDGET_CONFIG' });
    } finally {
      incomplete.close();
    }
  });

  it('releases the real experimental reservation when the real default transactional envelope rejects it', async () => {
    const owner = randomUUID();
    await new Repository(db).ensureUser(owner);
    const path = await tempLedgerPath();
    const first = new ExperimentAiBudget(
      path,
      5,
      'paired-byte-negative-control',
      evaluationPrices,
      5,
      196608,
    );
    const second = new DatabaseAiBudget(db, owner, randomUUID(), {
      projectUsd: 5,
      userUsd: 5,
    });
    try {
      await expect(
        combineAiGuards(first, second).reserve(
          syntheticRequestWithGuardedBytes(108751),
        ),
      ).rejects.toMatchObject({ code: 'AI_BUDGET_CONFIG' });
      const saved = JSON.parse(readFileSync(path, 'utf8'));
      expect(saved.calls).toHaveLength(1);
      expect(saved.calls[0].status).toBe('completed');
      expect(saved.calls[0].accountedUsd).toBe(0);
      expect(saved.accountedUsd).toBe(0);
      const reservations = await db.query(
        'SELECT id FROM aw_budget_reservations WHERE user_id=$1',
        [owner],
      );
      expect(reservations).toEqual([]);
    } finally {
      first.close();
    }
  });

  it('captures actual offline provider normal (86,889B) and prose_only repair (108,751B) parameters through processLifeJob without mutating request hashes or inputs', async () => {
    // 1. Default 100,000-byte guard admits the 86,889-byte normal author call,
    // rejects the repeated ending in editor, and fails on the 108,751-byte prose_only repair call
    const failFixture = await buildChapter5RepairCaptureFixture();
    const defaultLedger = await tempLedgerPath();
    const defaultGuard = new ExperimentAiBudget(
      defaultLedger,
      evaluationApprovedCumulativeBudgetUsd,
      'narrative-evaluation:default-cap-control',
      evaluationPrices,
      evaluationApprovedCumulativeBudgetUsd,
      evaluationDefaultMaxRequestBytes,
    );
    const failParseCalls: Array<{ task: string; guardedBytes: number }> = [];
    try {
      const failClient = {
        responses: {
          parse: vi.fn(
            async (params: {
              model: string;
              text: { format: { name: string } };
            }) => {
              const task = params.text.format.name;
              failParseCalls.push({
                task,
                guardedBytes: guardedBytes(params),
              });
              const output =
                task === 'life_narrative_plan'
                  ? failFixture.draft
                  : task === 'life_narrative_chapter'
                    ? failFixture.initialAuthored
                    : task === 'life_narrative_plan_review'
                      ? failFixture.review
                      : task === 'life_fidelity'
                        ? failFixture.fidelity
                        : failFixture.rejectedEditor;
              return {
                status: 'completed',
                model: params.model,
                output_parsed: structuredClone(output),
                usage: { input_tokens: 100, output_tokens: 50 },
              };
            },
          ),
        },
      } as unknown as OpenAI;
      const failAi = new OpenAiProvider(
        {
          apiKey: 'offline-v6-repair-test',
          eventModel: 'gpt-6.1-sol',
          storyModel: 'gpt-6.1-sol',
          checkModel: 'gpt-6.1-sol',
          timeoutMs: 1000,
          maxOutputTokens: 12000,
          beforePhysicalRequest: () =>
            jobs.admitNarrativeRequest(failFixture.job),
          guard: defaultGuard,
        },
        failClient,
      );

      await expect(
        processLifeJob(failFixture.job, jobs, failAi),
      ).rejects.toMatchObject({
        code: 'SMOKE_BUDGET_CONFIG',
      });
      // Five normal calls reached the mock provider; the 6th call (prose_only repair at 108,751B) was blocked by the 100,000B guard
      expect(failParseCalls.map((c) => c.task)).toEqual([
        'life_narrative_plan',
        'life_narrative_chapter',
        'life_narrative_plan_review',
        'life_fidelity',
        'life_narrative_editor',
      ]);
      expect(failParseCalls[1]!.guardedBytes).toBe(
        V6_CHAPTER5_NORMAL_GUARD_BYTES,
      );
    } finally {
      defaultGuard.close();
      await db.query(
        "UPDATE aw_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE id=$1",
        [failFixture.job.id],
      );
    }

    // 2. Creative 196,608-byte guard admits both the 86,889-byte normal author call
    // and the 108,751-byte prose_only repair call, completing the job in 8 calls and 1 repair
    // with byte-identical transport parameters and unmutated input hashes
    const passFixture = await buildChapter5RepairCaptureFixture();
    const creativeLedger = await tempLedgerPath();
    const creativeBudget = new ExperimentAiBudget(
      creativeLedger,
      evaluationApprovedCumulativeBudgetUsd,
      'narrative-evaluation:v6-creative-cap',
      evaluationPrices,
      evaluationApprovedCumulativeBudgetUsd,
      evaluationCreativeMaxRequestBytes,
    );
    const reservedSnapshots: Array<{
      task: string;
      serialized: string;
      guardedBytes: number;
    }> = [];
    const tracingGuard: AiRequestGuard = {
      reserve: async (raw) => {
        const p = raw as { text?: { format?: { name?: string } } };
        reservedSnapshots.push({
          task: p.text?.format?.name ?? 'unknown',
          serialized: JSON.stringify(raw),
          guardedBytes: guardedBytes(raw),
        });
        return creativeBudget.reserve(raw);
      },
      settle: (id, usage) => creativeBudget.settle(id, usage),
    };

    const transportSnapshots: Array<{
      task: string;
      serialized: string;
      guardedBytes: number;
      userContent: string;
    }> = [];
    try {
      const passClient = {
        responses: {
          parse: vi.fn(
            async (params: {
              model: string;
              input: Array<{ role: string; content: string }>;
              text: { format: { name: string } };
            }) => {
              const task = params.text.format.name;
              const taskOrdinal =
                transportSnapshots.filter((s) => s.task === task).length + 1;
              transportSnapshots.push({
                task,
                serialized: JSON.stringify(params),
                guardedBytes: guardedBytes(params),
                userContent: params.input[1]!.content,
              });
              const output =
                task === 'life_narrative_plan'
                  ? passFixture.draft
                  : task === 'life_narrative_chapter'
                    ? taskOrdinal === 1
                      ? passFixture.initialAuthored
                      : passFixture.repairedAuthored
                    : task === 'life_narrative_plan_review'
                      ? passFixture.review
                      : task === 'life_fidelity'
                        ? passFixture.fidelity
                        : taskOrdinal === 1
                          ? passFixture.rejectedEditor
                          : passFixture.passingEditor;
              return {
                status: 'completed',
                model: params.model,
                output_parsed: structuredClone(output),
                usage: { input_tokens: 1500, output_tokens: 600 },
              };
            },
          ),
        },
      } as unknown as OpenAI;

      const passAi = new OpenAiProvider(
        {
          apiKey: 'offline-v6-repair-test',
          eventModel: 'gpt-6.1-sol',
          storyModel: 'gpt-6.1-sol',
          checkModel: 'gpt-6.1-sol',
          timeoutMs: 1000,
          maxOutputTokens: 12000,
          beforePhysicalRequest: () =>
            jobs.admitNarrativeRequest(passFixture.job),
          guard: combineAiGuards(
            tracingGuard,
            new DatabaseAiBudget(
              db,
              passFixture.job.user_id,
              passFixture.job.id,
              {
                projectUsd: evaluationApprovedCumulativeBudgetUsd,
                userUsd: evaluationApprovedCumulativeBudgetUsd,
              },
              passFixture.job.lease_token,
              evaluationCreativeMaxRequestBytes,
            ),
          ),
        },
        passClient,
      );

      await processLifeJob(passFixture.job, jobs, passAi);

      const [completedJob] = await db.query<LifeJob>(
        'SELECT * FROM aw_jobs WHERE id=$1',
        [passFixture.job.id],
      );
      expect(completedJob!.status).toBe('completed');
      expect(completedJob!.checkpoints.repairUsed).toBe(true);
      expect(completedJob!.checkpoints.providerRequestCount).toBe(8);

      // Verify all 8 physical calls: 5 normal + 3 prose_only repair (author, fidelity, editor; review reused)
      expect(transportSnapshots.map((s) => s.task)).toEqual([
        'life_narrative_plan',
        'life_narrative_chapter',
        'life_narrative_plan_review',
        'life_fidelity',
        'life_narrative_editor',
        'life_narrative_chapter',
        'life_fidelity',
        'life_narrative_editor',
      ]);
      expect(reservedSnapshots).toEqual(
        transportSnapshots.map(({ task, serialized, guardedBytes }) => ({
          task,
          serialized,
          guardedBytes,
        })),
      );

      const normalAuthorTransport = transportSnapshots[1]!;
      const repairAuthorTransport = transportSnapshots[5]!;
      expect(normalAuthorTransport.guardedBytes).toBe(
        V6_CHAPTER5_NORMAL_GUARD_BYTES,
      );
      expect(repairAuthorTransport.guardedBytes).toBe(
        V6_CHAPTER5_REPAIR_GUARD_BYTES,
      );

      // Prove zero request or inputHash mutation between domain builders, guard reservation, and transport
      const expectedNormalRequest = fictionAuthorRequest(
        passFixture.job.payload,
        passFixture.draft,
      );
      const expectedRepairRequest = fictionAuthorRequest(
        passFixture.job.payload,
        passFixture.draft,
        passFixture.expectedFeedback,
      );
      expect(JSON.parse(normalAuthorTransport.userContent)).toEqual(
        expectedNormalRequest,
      );
      expect(JSON.parse(repairAuthorTransport.userContent)).toEqual(
        expectedRepairRequest,
      );
      expect(hash(JSON.parse(normalAuthorTransport.userContent))).toBe(
        hash(expectedNormalRequest),
      );
      expect(hash(JSON.parse(repairAuthorTransport.userContent))).toBe(
        hash(expectedRepairRequest),
      );

      // Verify other stage request builders are also unmutated
      expect(JSON.parse(transportSnapshots[0]!.userContent)).toEqual(
        fictionPlannerRequest(passFixture.job.payload),
      );
      expect(JSON.parse(transportSnapshots[2]!.userContent)).toEqual(
        fictionReviewRequest(
          passFixture.job.payload,
          passFixture.initialAuthored,
        ),
      );
      expect(JSON.parse(transportSnapshots[6]!.userContent)).toEqual(
        fictionFidelityRequest(
          passFixture.job.payload,
          passFixture.repairedAuthored,
        ),
      );
      expect(JSON.parse(transportSnapshots[7]!.userContent)).toEqual(
        fictionEditorialRequest(
          passFixture.job.payload,
          passFixture.repairedAuthored,
        ),
      );

      // Verify ledger reservations priced every guarded UTF-8 byte + max_output_tokens
      const ledgerData = JSON.parse(readFileSync(creativeLedger, 'utf8'));
      expect(ledgerData.calls).toHaveLength(8);
      expect(ledgerData.calls[1].reservedUsd).toBeCloseTo(
        (V6_CHAPTER5_NORMAL_GUARD_BYTES * 2.5 + 12000 * 10) / 1e6,
        8,
      );
      expect(ledgerData.calls[5].reservedUsd).toBeCloseTo(
        (V6_CHAPTER5_REPAIR_GUARD_BYTES * 2.5 + 12000 * 10) / 1e6,
        8,
      );

      // Verify persisted period artifact and memory bounds remain strictly within 12 KiB / 32 KiB
      const [savedPeriod] = await db.query<{
        narrative_artifact: {
          bindings: { authorInputHash: string; reviewInputHash: string };
        };
      }>('SELECT narrative_artifact FROM aw_periods WHERE id=$1', [
        passFixture.job.payload.periodId,
      ]);
      expect(savedPeriod!.narrative_artifact.bindings.authorInputHash).toBe(
        hash(expectedRepairRequest),
      );
      expect(savedPeriod!.narrative_artifact.bindings.reviewInputHash).toBe(
        hash(
          fictionReviewRequest(
            passFixture.job.payload,
            passFixture.repairedAuthored,
          ),
        ),
      );
      expect(
        Buffer.byteLength(
          JSON.stringify(savedPeriod!.narrative_artifact),
          'utf8',
        ),
      ).toBeLessThanOrEqual(NARRATIVE_ARTIFACT_BYTES);
      expect(NARRATIVE_MEMORY_BYTES).toBe(12288);
      expect(NARRATIVE_ARTIFACT_BYTES).toBe(32768);
    } finally {
      creativeBudget.close();
    }
  });
});
