import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError, fictionFactsOnlyEligible } from '@future-flow/core';
import {
  evaluationPriceEvidence,
  parseEvaluationOptions,
} from '../scripts/lib/narrative-evaluation-options';
// Price evidence expires after a week; gates are tested relative to its date.
const priceDay = (days: number) =>
  Date.parse(`${evaluationPriceEvidence.checkedOn}T12:00:00Z`) +
  days * 86400000;

import { runNarrativeEvaluation } from '../scripts/lib/narrative-evaluation-runner';
import { verifyEvaluationAuthorization } from '../scripts/lib/narrative-evaluation-options';
import {
  paidProbeEnvironment,
  paidProbeMarkdown,
  runPaidProbe,
  storedFactsOnlyCases,
  syntheticFactsOnlyCase,
  type FactsOnlyCase,
} from '../scripts/lib/narrative-paid-probe';
import { storedChapters } from '../scripts/lib/narrative-request-breakdown';
import { resolveStateName } from '../scripts/lib/narrative-probe';
import {
  paidLockStatus,
  ledgerTotals,
  paidLockStatus,
  readLedgerCalls,
  summariseLedger,
  type LedgerCall,
} from '../scripts/lib/paid-ledger-summary';
import {
  approvalChapterHalt,
  approvalCumulativeBudgetUsd,
  approvalSpend,
  runEstimatedUsd,
  chapterHaltApproval,
  evaluationLedgerFloorUsd,
  evaluationV9MeasurementApproval,
  verifyApprovalBudget,
  verifyApprovalLedger,
} from '../scripts/lib/narrative-evaluation-approval';
import { evaluationCostReport } from '../scripts/lib/narrative-evaluation-costs';
import { runNarrativePaidProbe } from '../scripts/narrative-paid-probe';

// The provider's own copy of the SDK: its error classes are what it recognises.
const ProviderOpenAI = createRequire(
  createRequire(import.meta.url).resolve('@future-flow/ai'),
)('openai') as typeof OpenAI;

const APPROVAL = evaluationV9MeasurementApproval.approvalId;
// The shared ledger the approval is anchored to: the closed earlier spend.
const base = (usd = 50) =>
  call({ id: 'base', caseName: 'closed', accountedUsd: usd });
const seedLedger = (path: string, extra: LedgerCall[] = []) =>
  writeFile(path, JSON.stringify({ calls: [base(), ...extra] }));

const call = (patch: Partial<LedgerCall>): LedgerCall => ({
  id: 'a',
  caseName: 'run-1',
  model: 'gpt-6.1-sol',
  task: 'life_narrative_plan',
  startedAt: '2026-10-22T20:00:00.000Z',
  reservedUsd: 0.3,
  accountedUsd: 0.1,
  estimatedUsd: 0.08,
  status: 'completed',
  usage: {
    input_tokens: 1000,
    output_tokens: 200,
    input_tokens_details: { cached_tokens: 400, cache_write_tokens: 0 },
  },
  ...patch,
});

describe('paid ledger summary', () => {
  it('groups the calls per run, stage, case and UTC day and model', () => {
    const calls = [
      call({ id: 'a' }),
      call({ id: 'b', task: 'life_narrative_chapter', accountedUsd: 0.2 }),
      call({
        id: 'c',
        caseName: 'run-2',
        startedAt: '2026-10-23T00:30:00.000Z',
        status: 'reserved',
        usage: undefined,
        estimatedUsd: undefined,
      }),
    ];
    const summary = summariseLedger(calls, {}, { a: { caseId: 'ch1' } });
    expect(summary.ledger.calls).toBe(3);
    expect(summary.ledger.accountedUsd).toBeCloseTo(0.4);
    expect(summary.ledger.unknownUsageCalls).toBe(1);
    expect(summary.perRun.map((r) => [r.key, r.calls])).toEqual([
      ['run-1', 2],
      ['run-2', 1],
    ]);
    expect(summary.perStage.map((r) => r.key)).toEqual([
      'life_narrative_chapter',
      'life_narrative_plan',
    ]);
    expect(summary.perCase.find((r) => r.key === 'ch1')?.calls).toBe(1);
    expect(summary.perUtcDayAndModel.map((r) => r.key)).toEqual([
      '2026-10-22 gpt-6.1-sol',
      '2026-10-23 gpt-6.1-sol',
    ]);
    const plan = summary.perStage.find((r) => r.key === 'life_narrative_plan')!;
    expect(plan).toMatchObject({
      completed: 1,
      inputTokens: 1000,
      cachedInputTokens: 400,
      outputTokens: 200,
    });
  });
  it('selects by start time and case name prefix', () => {
    const calls = [
      call({ id: 'a' }),
      call({ id: 'b', caseName: 'other', startedAt: '2026-10-22T21:00:00Z' }),
    ];
    expect(
      summariseLedger(calls, { since: '2026-10-22T20:30:00Z' }).selected.calls,
    ).toBe(1);
    expect(
      summariseLedger(calls, { caseNamePrefix: 'run' }).selected.calls,
    ).toBe(1);
    expect(() => summariseLedger(calls, { since: 'yesterday' })).toThrow();
  });
});

describe('paid probe environment', () => {
  const env = {
    NARRATIVE_EVAL_API_KEY: `sk-proj-${'a'.repeat(30)}`,
    NARRATIVE_EVAL_PROJECT_ID: 'proj_abc123',
    NARRATIVE_EVAL_PROJECT_CONFIRMATION: 'dedicated-development',
  };
  const today = priceDay(1);
  it('needs the dedicated development key, project and confirmation', () => {
    expect(paidProbeEnvironment(env, today).project).toBe('proj_abc123');
    expect(() =>
      paidProbeEnvironment({ ...env, NARRATIVE_EVAL_PROJECT_CONFIRMATION: '' }),
    ).toThrow(/separately approved development project/);
    expect(() =>
      paidProbeEnvironment({ ...env, NARRATIVE_EVAL_API_KEY: 'sk-other' }),
    ).toThrow(/evaluation key/);
  });
  it('refuses prices older than a week', () => {
    expect(() => paidProbeEnvironment(env, priceDay(8))).toThrow(/prices/);
  });
});

// A stored offline run in which the fidelity check reports one unregistered
// fact and the facts-only repair registers it: the same shape that a real run
// leaves on disk, which the probe reads.
async function storedRun() {
  const out = await mkdtemp(join(tmpdir(), 'alterward-paid-probe-run-'));
  const options = parseEvaluationOptions([
    '--creative-only',
    '--fiction-generation',
    'v9',
    '--fixtures',
    'creative-portfolio',
    '--periods',
    '1',
    '--out',
    out,
  ]);
  const previousOf = (parameters: unknown) =>
    JSON.parse(
      (parameters as { input: { role: string; content: string }[] }).input.find(
        (m) => m.role === 'user',
      )!.content,
    ).authorRepair.previous as { candidate: { events: { id: string }[] } };
  const run = await runNarrativeEvaluation(
    options,
    {},
    ({ task, ordinal, parameters, defaultOutput }) => {
      if (task === 'life_fidelity' && ordinal === 3)
        return {
          valid: false,
          issues: [
            {
              chapterNo: 1,
              reason:
                'unregistered_material_fact: the prose names a request that no story fact records.',
            },
          ],
        };
      if (task === 'life_narrative_chapter' && ordinal === 4)
        return {
          outcome: 'facts_added',
          storyFacts: [
            {
              id: '00000000-0000-4000-8000-0000000000aa',
              introducedByEventId:
                previousOf(parameters).candidate.events[0]!.id,
              aboutActorIds: [],
              kind: 'observation',
              assertion: 'An earlier request that the scene refers to.',
              supersedesFactId: null,
              relevance: 'continuity',
            },
          ],
        };
      return JSON.parse(JSON.stringify(defaultOutput()));
    },
  );
  expect(run.failures).toEqual([]);
  const stored = await storedChapters(out, resolveStateName(out));
  return { out, chapters: stored.chapters };
}

// The SDK client the provider talks to: answers by the request's text format
// and the user message, with a usage block that carries cached tokens.
function fakeClient(
  behaviour: (request: {
    schemaKeys: string[];
    user: Record<string, unknown>;
  }) => unknown,
  seen: { bytes: number; maxOutputTokens: number }[] = [],
) {
  let n = 0;
  const parse = async (request: {
    input: { role: string; content: string }[];
    text: { format: { schema: { properties?: Record<string, unknown> } } };
    max_output_tokens: number;
    model: string;
  }) => {
    seen.push({
      bytes: Buffer.byteLength(JSON.stringify(request), 'utf8'),
      maxOutputTokens: request.max_output_tokens,
    });
    const user = JSON.parse(
      request.input.find((m) => m.role === 'user')!.content,
    );
    const output = behaviour({
      schemaKeys: Object.keys(request.text.format.schema.properties ?? {}),
      user,
    });
    return {
      status: 'completed',
      model: request.model,
      output_parsed: output,
      _request_id: `req_test_${++n}`,
      usage: {
        input_tokens: 20000,
        output_tokens: 300,
        input_tokens_details: { cached_tokens: 5000, cache_write_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 120 },
      },
    };
  };
  return { responses: { parse } } as unknown as OpenAI;
}

const fact = (previous: { candidate: { events: { id: string }[] } }) => ({
  id: '00000000-0000-4000-8000-0000000000bb',
  introducedByEventId: previous.candidate.events[0]!.id,
  aboutActorIds: [],
  kind: 'observation',
  assertion: 'An earlier request that the scene refers to.',
  supersedesFactId: null,
  relevance: 'continuity',
});

describe('forced facts-only paid probe, offline', () => {
  it('finds the stored case the product would send to a facts-only repair, and a synthetic one on demand', async () => {
    const { out, chapters } = await storedRun();
    try {
      const cases = storedFactsOnlyCases(chapters, 'run-a');
      expect(cases).toHaveLength(1);
      expect(cases[0]).toMatchObject({ source: 'stored' });
      expect(cases[0]!.message).toMatch(
        /^Correct the final package\/prose discrepancy: unregistered_material_fact/,
      );
      expect(
        fictionFactsOnlyEligible([{ reason: cases[0]!.reasons[0]! }]),
      ).toBe(true);
      const synthetic = syntheticFactsOnlyCase(chapters[0]!, 'run-a')!;
      expect(synthetic.source).toBe('synthetic');
      // Built from the chapter's own prose, never a fixed story phrase.
      expect(synthetic.reasons[0]).toContain(
        synthetic.previous.chapter.body.split(/\n{2,}/)[0]!.slice(0, 20),
      );
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });

  it('runs the smokes and the case through the ledger and reports the start and end totals', async () => {
    const { out, chapters } = await storedRun();
    const dir = await mkdtemp(join(tmpdir(), 'alterward-paid-probe-ledger-'));
    const ledgerPath = join(dir, 'paid-usage.json');
    // An earlier spend in the same ledger: the probe starts from it.
    await seedLedger(ledgerPath, [call({ id: 'earlier', accountedUsd: 1.25 })]);
    try {
      const seen: { bytes: number; maxOutputTokens: number }[] = [];
      const client = fakeClient(({ schemaKeys, user }) => {
        if (schemaKeys.includes('outcome') && !user.authorRepair)
          return { outcome: 'needs_full_repair', storyFacts: [] };
        if (!user.authorRepair)
          return { chapter: { title: 'A title', body: 'x'.repeat(700) } };
        return {
          outcome: 'facts_added',
          storyFacts: [
            fact(
              (user.authorRepair as { previous: never }).previous as {
                candidate: { events: { id: string }[] };
              },
            ),
          ],
        };
      }, seen);
      const result = await runPaidProbe({
        ledgerPath,
        maxSpendUsd: 0.5,
        approvalId: APPROVAL,
        cases: storedFactsOnlyCases(chapters, 'run-a'),
        smoke: true,
        apiKey: 'offline-test-key',
        client,
      });
      expect(result.stoppedBy).toBeNull();
      expect(result.calls.map((c) => [c.stage, c.mode, c.status])).toEqual([
        ['schema-smoke', 'facts_only', 'ok'],
        ['schema-smoke', 'prose_only', 'ok'],
        ['forced-facts-only', 'facts_only', 'ok'],
      ]);
      expect(result.calls[2]!.outcome).toBe('merged_valid');
      // The smoke calls are small and capped; the case call carries the
      // product's own output limit and a large request.
      expect(seen.map((s) => s.maxOutputTokens)).toEqual([4000, 4000, 12000]);
      expect(seen[2]!.bytes).toBeGreaterThan(seen[0]!.bytes * 10);
      // Every call has its receipt and its ledger reservation with the money.
      for (const c of result.calls) {
        expect(c.receipt).toMatchObject({
          inputTokens: 20000,
          outputTokens: 300,
          cachedInputTokens: 5000,
          reasoningTokens: 120,
        });
        expect(c.receipt!.requestId).toMatch(/^req_test_/);
        expect(c.ledgerCallIds).toHaveLength(1);
        expect(c.accountedUsd).toBeGreaterThan(0);
        expect(c.estimatedUsd).toBeLessThan(c.accountedUsd!);
      }
      // Ledger totals at the start and at the end, and the probe's own spend.
      expect(result.ledger.start.accountedUsd).toBeCloseTo(51.25);
      const calls = readLedgerCalls(ledgerPath);
      expect(result.ledger.end!.accountedUsd).toBeCloseTo(
        ledgerTotals(calls).accountedUsd,
      );
      const spent = result.calls.reduce((s, c) => s + c.accountedUsd!, 0);
      expect(result.ledger.spentAccountedUsd).toBeCloseTo(spent);
      expect(result.ledger.spentAccountedUsd!).toBeLessThanOrEqual(0.5);
      expect(result.summary!.selected.calls).toBe(3);
      expect(result.summary!.perStage.map((r) => r.key)).toEqual([
        'life_narrative_chapter',
      ]);
      expect(paidProbeMarkdown(result)).toContain('req_test_3');
      expect(paidProbeMarkdown(result)).toContain(
        `Ledger file (resolved): ${ledgerPath}`,
      );
    } finally {
      await rm(out, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('cannot spend past its own cap: the ledger refuses the next call', async () => {
    const { out, chapters } = await storedRun();
    const dir = await mkdtemp(join(tmpdir(), 'alterward-paid-probe-cap-'));
    const ledgerPath = join(dir, 'paid-usage.json');
    await seedLedger(ledgerPath);
    try {
      const client = fakeClient(() => ({
        outcome: 'needs_full_repair',
        storyFacts: [],
      }));
      // The smoke reservations fit; the 0.3 USD reservation of a full-size
      // case request does not fit under a 0.05 USD cap.
      const result = await runPaidProbe({
        ledgerPath,
        maxSpendUsd: 0.05,
        approvalId: APPROVAL,
        cases: storedFactsOnlyCases(chapters, 'run-a'),
        smoke: false,
        apiKey: 'offline-test-key',
        client,
      });
      expect(result.calls).toHaveLength(1);
      expect(result.calls[0]).toMatchObject({
        status: 'error',
        errorCode: 'SMOKE_BUDGET_EXCEEDED',
      });
      expect(result.stoppedBy).toMatch(/cap/);
      expect(result.ledger.spentAccountedUsd).toBe(0);
    } finally {
      await rm(out, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports a facts-only answer that asks for the full repair, with its receipt', async () => {
    const { out, chapters } = await storedRun();
    const dir = await mkdtemp(join(tmpdir(), 'alterward-paid-probe-full-'));
    await seedLedger(join(dir, 'paid-usage.json'));
    try {
      const result = await runPaidProbe({
        ledgerPath: join(dir, 'paid-usage.json'),
        maxSpendUsd: 0.5,
        approvalId: APPROVAL,
        cases: storedFactsOnlyCases(chapters, 'run-a'),
        smoke: false,
        apiKey: 'offline-test-key',
        client: fakeClient(() => ({
          outcome: 'needs_full_repair',
          storyFacts: [],
        })),
      });
      expect(result.calls[0]).toMatchObject({
        status: 'ok',
        outcome: 'needs_full_repair',
      });
      expect(result.calls[0]!.receipt?.inputTokens).toBe(20000);
    } finally {
      await rm(out, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('stops after a refused schema and sends no case request', async () => {
    const { out, chapters } = await storedRun();
    const dir = await mkdtemp(join(tmpdir(), 'alterward-paid-probe-refuse-'));
    await seedLedger(join(dir, 'paid-usage.json'));
    try {
      const client = {
        responses: {
          parse: async () => {
            throw new ProviderOpenAI.BadRequestError(
              400,
              { message: 'Invalid schema' },
              'Invalid schema',
              new Headers(),
            );
          },
        },
      } as unknown as OpenAI;
      const result = await runPaidProbe({
        ledgerPath: join(dir, 'paid-usage.json'),
        maxSpendUsd: 0.5,
        approvalId: APPROVAL,
        cases: storedFactsOnlyCases(chapters, 'run-a'),
        smoke: true,
        apiKey: 'offline-test-key',
        client,
      });
      expect(result.calls).toHaveLength(1);
      expect(result.calls[0]).toMatchObject({
        stage: 'schema-smoke',
        mode: 'facts_only',
        status: 'error',
        errorCode: 'AI_PROVIDER_FAILED',
      });
      expect(result.stoppedBy).toMatch(/refused the facts_only schema/);
    } finally {
      await rm(out, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses a cap that would pass the owner-approved cumulative ceiling', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'alterward-paid-probe-ceiling-'));
    const ledgerPath = join(dir, 'paid-usage.json');
    await writeFile(
      ledgerPath,
      JSON.stringify({ calls: [call({ accountedUsd: 52.8 })] }),
    );
    try {
      await expect(
        runPaidProbe({
          ledgerPath,
          maxSpendUsd: 0.5,
          approvalId: APPROVAL,
          cases: [],
          smoke: true,
          apiKey: 'offline-test-key',
          client: fakeClient(() => ({})),
        }),
      ).rejects.toThrow(/approved ceiling/);
      // Nothing was written or locked by the refused run.
      expect(JSON.parse(await readFile(ledgerPath, 'utf8')).calls).toHaveLength(
        1,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('the command refuses to spend without the explicit paid flag, an approval id and an output directory', async () => {
    await expect(
      runNarrativePaidProbe(['run', '--run', '/nonexistent']),
    ).rejects.toThrow();
    await expect(runNarrativePaidProbe(['frobnicate'])).rejects.toThrow(
      /Usage/,
    );
  });

  it('the ledger command summarises a ledger and writes the report', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'alterward-paid-probe-cmd-'));
    const ledger = join(dir, 'paid-usage.json');
    await writeFile(ledger, JSON.stringify({ calls: [call({})] }));
    try {
      const { markdown, summary } = await runNarrativePaidProbe([
        'ledger',
        '--ledger',
        ledger,
        '--since',
        '2026-10-22T19:00:00Z',
        '--out',
        join(dir, 'out'),
      ]);
      expect(summary.selected.calls).toBe(1);
      expect(markdown).toContain('Per stage');
      expect(
        JSON.parse(
          await readFile(join(dir, 'out', 'ledger-summary.json'), 'utf8'),
        ).selected.calls,
      ).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('the source-bound v9 measurement approval', () => {
  const mine = (patch: Partial<LedgerCall>) =>
    call({ caseName: `narrative-evaluation:${APPROVAL}`, ...patch });
  it('holds everything the approval spends, probe included, to its cap on the shared ledger', () => {
    const calls = [
      call({ id: 'old', accountedUsd: 50 }),
      mine({ id: 'a', accountedUsd: 0.7 }),
      call({ id: 'p', caseName: `paid-probe:${APPROVAL}`, accountedUsd: 0.3 }),
    ];
    expect(approvalSpend(calls, APPROVAL).accountedUsd).toBeCloseTo(1);
    // 51.0 on the ledger, 1.0 of it the approval's: baseline 50, cap 2.70.
    expect(approvalCumulativeBudgetUsd(calls, APPROVAL, 2.7)).toBeCloseTo(52.7);
    // The same figure before and after the approval spent anything.
    expect(approvalCumulativeBudgetUsd([calls[0]!], APPROVAL, 2.7)).toBeCloseTo(
      52.7,
    );
  });
  it('starts no new chapter once the approval has accounted USD 2.10', () => {
    const base = [call({ id: 'old', accountedUsd: 50 })];
    expect(
      approvalChapterHalt([...base, mine({ accountedUsd: 2.09 })], 4, 0),
    ).toBeNull();
    expect(
      approvalChapterHalt([...base, mine({ accountedUsd: 2.1 })], 4, 0),
    ).toMatch(/no new chapter/);
    // The probe's spend counts too.
    expect(
      approvalChapterHalt(
        [
          ...base,
          mine({ accountedUsd: 1.7 }),
          call({ caseName: `paid-probe:${APPROVAL}`, accountedUsd: 0.4 }),
        ],
        1,
        0,
      ),
    ).toMatch(/no new chapter/);
  });
  it('stops on a mean usage-estimated cost above USD 0.50 after two chapters, not before', () => {
    const calls = [mine({ accountedUsd: 1.5, estimatedUsd: 1.1 })];
    expect(approvalChapterHalt(calls, 1, 1.1)).toBeNull();
    expect(approvalChapterHalt(calls, 2, 1.1)).toMatch(/Cost signal/);
    expect(approvalChapterHalt(calls, 2, 0.9)).toBeNull();
  });
  it("takes a run's own spend from the budget bindings, not from the approval-wide case name", () => {
    const calls = [
      mine({ id: 'r1', estimatedUsd: 0.65 }),
      mine({ id: 'r2a', estimatedUsd: 0.3 }),
      mine({ id: 'r2b', estimatedUsd: 0.386 }),
      mine({ id: 'old', estimatedUsd: 9 }),
      // The probe has no run: its spend is not a run's.
      call({ id: 'p', caseName: `paid-probe:${APPROVAL}`, estimatedUsd: 5 }),
    ];
    const bindings = {
      r1: { sourceHash: 's', caseId: 'c:0', out: '/runs/m1' },
      r2a: { sourceHash: 's', caseId: 'c:0', out: '/runs/m2' },
      r2b: { sourceHash: 's', caseId: 'c:1', out: '/runs/m2' },
      // An older binding without the field belongs to no run.
      old: { sourceHash: 's', caseId: 'c:2' },
      p: { sourceHash: 's', caseId: 'c:3', out: '/runs/m2' },
    };
    expect(runEstimatedUsd(calls, bindings, APPROVAL, '/runs/m2')).toBeCloseTo(
      0.686,
    );
    expect(runEstimatedUsd(calls, bindings, APPROVAL, '/runs/m1')).toBeCloseTo(
      0.65,
    );
    expect(runEstimatedUsd(calls, bindings, APPROVAL, '/runs/m3')).toBe(0);
    // The second run's mean is 0.343, below the signal, whatever m1 spent.
    expect(
      approvalChapterHalt(
        calls,
        2,
        runEstimatedUsd(calls, bindings, APPROVAL, '/runs/m2'),
      ),
    ).toBeNull();
  });
  it('lets the paid probe run only under this approval, and under the cap left by the ledger', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'alterward-paid-probe-appr-'));
    const ledgerPath = join(dir, 'paid-usage.json');
    await writeFile(
      ledgerPath,
      JSON.stringify({
        calls: [
          call({ id: 'old', accountedUsd: 50 }),
          mine({ id: 'a', accountedUsd: 2.4 }),
        ],
      }),
    );
    try {
      await expect(
        runPaidProbe({
          ledgerPath,
          maxSpendUsd: 0.1,
          approvalId: 'other',
          cases: [],
          smoke: true,
          apiKey: 'offline-test-key',
          client: fakeClient(() => ({})),
        }),
      ).rejects.toThrow(/approved only under/);
      // 2.4 of the 2.70 is spent: a 0.5 cap is cut to the 0.30 that is left.
      const result = await runPaidProbe({
        ledgerPath,
        maxSpendUsd: 0.5,
        approvalId: APPROVAL,
        cases: [],
        smoke: false,
        apiKey: 'offline-test-key',
        client: fakeClient(() => ({})),
      });
      expect(result.ledger.cumulativeBudgetUsd).toBeCloseTo(52.7);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('the paid v9 gate of the evaluation options', () => {
  const env = {
    NARRATIVE_EVAL_API_KEY: 'sk-proj-synthetic-config-test-only-123456',
    NARRATIVE_EVAL_PROJECT_ID: 'proj_synthetic_test',
    NARRATIVE_EVAL_PROJECT_CONFIRMATION: 'dedicated-development',
  };
  // The conditions of the owner's approval; each test breaks exactly one.
  const allowed: Record<string, string | null> = {
    '--mode': 'paid',
    '--allow-paid': null,
    '--creative-only': null,
    '--fiction-generation': 'v9',
    '--fixtures': 'career-transition',
    '--periods': '4',
    '--choice-mix': 'rotate',
    '--budget-usd': '52.7',
    '--approval-id': evaluationV9MeasurementApproval.approvalId,
    '--out': '.local/narrative-evaluation/test-v9-m',
  };
  const argv = (patch: Record<string, string | null | undefined> = {}) =>
    Object.entries({ ...allowed, ...patch }).flatMap(([k, v]) =>
      v === undefined ? [] : v === null ? [k] : [k, v],
    );
  // The price evidence expires after a week; the gate is tested inside it.
  beforeEach(() =>
    vi.useFakeTimers({
      toFake: ['Date'],
      now: priceDay(1),
    }),
  );
  afterEach(() => vi.useRealTimers());
  const refused = (patch: Record<string, string | null | undefined>) =>
    expect(() => parseEvaluationOptions(argv(patch), env)).toThrow(
      'owner-approved budget',
    );

  it('admits the approved measurement and nothing wider', () => {
    const options = parseEvaluationOptions(argv(), env);
    expect(options).toMatchObject({
      kind: 'paid',
      fictionGeneration: 'v9',
      periods: 4,
      approvalId: evaluationV9MeasurementApproval.approvalId,
    });
    // Fewer periods stay inside the approval.
    expect(() =>
      parseEvaluationOptions(argv({ '--periods': '2' }), env),
    ).not.toThrow();
  });
  it('refuses another approval id', () =>
    refused({ '--approval-id': 'v9-m-other' }));
  it('refuses a run that is not creative-only', () =>
    // Three periods, so that only the creative-only condition is broken.
    refused({
      '--creative-only': undefined,
      '--creative': null,
      '--periods': '3',
    }));
  it('refuses another fixture, or more than one', () => {
    refused({ '--fixtures': 'creative-portfolio' });
    refused({ '--fixtures': 'career-transition,creative-portfolio' });
    refused({ '--fixtures': 'all' });
  });
  it('refuses more than four periods', () => {
    refused({ '--periods': '5' });
    refused({ '--periods': '8' });
  });
  it('refuses choices other than the rotating mix, or none', () => {
    refused({ '--choice-mix': 'first' });
    refused({ '--choice-mix': undefined });
  });
  it('keeps every other paid v9 request refused', () =>
    refused({ '--fixtures': 'bounded-career', '--approval-id': 'x' }));
});

describe('the shared-ledger floor and the approval budget', () => {
  it('refuses a missing or a too small ledger: the cap never starts from zero', async () => {
    expect(() => verifyApprovalLedger([], '/x/paid-usage.json')).toThrow(
      /\/x\/paid-usage\.json holds/,
    );
    expect(() =>
      verifyApprovalLedger([base(10)], '/x/paid-usage.json'),
    ).toThrow(DomainError);
    expect(() =>
      verifyApprovalLedger(
        [base(evaluationLedgerFloorUsd)],
        '/x/paid-usage.json',
      ),
    ).not.toThrow();
    const dir = await mkdtemp(join(tmpdir(), 'alterward-paid-probe-floor-'));
    try {
      const run = (path: string) =>
        runPaidProbe({
          ledgerPath: path,
          maxSpendUsd: 0.6,
          approvalId: APPROVAL,
          cases: [],
          smoke: true,
          apiKey: 'offline-test-key',
          client: fakeClient(() => ({})),
        });
      await expect(run(join(dir, 'missing.json'))).rejects.toMatchObject({
        code: 'EVAL_LEDGER_INVALID',
      });
      await writeFile(
        join(dir, 'small.json'),
        JSON.stringify({ calls: [base(3)] }),
      );
      await expect(run(join(dir, 'small.json'))).rejects.toMatchObject({
        code: 'EVAL_LEDGER_INVALID',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('allows a budget up to the ledger baseline plus the cap, and no more', () => {
    const calls = [
      base(50),
      call({ caseName: `narrative-evaluation:${APPROVAL}`, accountedUsd: 1 }),
    ];
    expect(() => verifyApprovalBudget(calls, 52.7)).not.toThrow();
    expect(() => verifyApprovalBudget(calls, 52.7000001)).toThrow(
      /52\.700000 at most/,
    );
    expect(() => verifyApprovalBudget(calls, 52.9)).toThrow(DomainError);
  });
  it('reports the lock file of a crashed paid process without touching it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'alterward-paid-lock-'));
    const ledger = join(dir, 'paid-usage.json');
    try {
      expect(paidLockStatus(ledger)).toMatch(/none/);
      await writeFile(
        join(dir, 'paid-run.lock'),
        JSON.stringify({ pid: 2 ** 22 + 12345 }),
      );
      expect(paidLockStatus(ledger)).toMatch(/STALE/);
      await writeFile(
        join(dir, 'paid-run.lock'),
        JSON.stringify({ pid: process.pid }),
      );
      expect(paidLockStatus(ledger)).toMatch(/running/);
      await writeFile(join(dir, 'paid-run.lock'), 'garbage');
      expect(paidLockStatus(ledger)).toMatch(/unreadable/);
      expect(readFileSync(join(dir, 'paid-run.lock'), 'utf8')).toBe('garbage');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('the probe never writes the key, and never lets the SDK retry', () => {
  it('keeps a marked key out of the report, the markdown and the ledger, even when the API answers 401', async () => {
    const { out, chapters } = await storedRun();
    const dir = await mkdtemp(join(tmpdir(), 'alterward-paid-probe-key-'));
    const ledgerPath = join(dir, 'paid-usage.json');
    await seedLedger(ledgerPath);
    const key = `sk-proj-MARKER${'z'.repeat(30)}`;
    try {
      const client = {
        responses: {
          parse: async () => {
            throw new ProviderOpenAI.AuthenticationError(
              401,
              { message: `Incorrect API key provided: ${key}` },
              `Incorrect API key provided: ${key}`,
              new Headers(),
            );
          },
        },
      } as unknown as OpenAI;
      const result = await runPaidProbe({
        ledgerPath,
        maxSpendUsd: 0.6,
        approvalId: APPROVAL,
        cases: storedFactsOnlyCases(chapters, 'run-a'),
        smoke: true,
        apiKey: key,
        client,
      });
      // The first authentication failure ends the probe after one call.
      expect(result.calls).toHaveLength(1);
      expect(result.stoppedBy).toMatch(/AI_AUTH_FAILED/);
      for (const text of [
        JSON.stringify(result),
        paidProbeMarkdown(result),
        readFileSync(ledgerPath, 'utf8'),
      ])
        expect(text).not.toContain('MARKER');
    } finally {
      await rm(out, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('builds every paid SDK client with maxRetries 0, so no retry bypasses the ledger', () => {
    for (const file of [
      'scripts/lib/narrative-paid-probe.ts',
      'scripts/lib/narrative-evaluation-runner.ts',
    ]) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      const clients = [...source.matchAll(/new OpenAI\(\{[\s\S]*?\}\)/g)];
      expect(clients.length).toBeGreaterThan(0);
      for (const [client] of clients) expect(client).toMatch(/maxRetries: 0/);
    }
  });
});

describe('the runner holds a paid v9 run to the approval (wiring)', () => {
  const env = {
    NARRATIVE_EVAL_API_KEY: 'sk-proj-synthetic-config-test-only-123456',
    NARRATIVE_EVAL_PROJECT_ID: 'proj_synthetic_test',
    NARRATIVE_EVAL_PROJECT_CONFIRMATION: 'dedicated-development',
  };
  beforeEach(() =>
    vi.useFakeTimers({
      toFake: ['Date'],
      now: priceDay(1),
    }),
  );
  afterEach(() => vi.useRealTimers());
  const paidOptions = (out: string, budget: string, id = APPROVAL) =>
    parseEvaluationOptions(
      [
        '--mode',
        'paid',
        '--allow-paid',
        '--creative-only',
        '--fiction-generation',
        'v9',
        '--fixtures',
        'career-transition',
        '--periods',
        '4',
        '--choice-mix',
        'rotate',
        '--budget-usd',
        budget,
        '--approval-id',
        id,
        '--out',
        out,
      ],
      env,
    );

  it('refuses a --budget-usd above what the ledger leaves the approval, before any work', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'alterward-paid-wiring-'));
    try {
      await seedLedger(join(dir, 'paid-usage.json'));
      await expect(
        runNarrativeEvaluation(
          paidOptions(join(dir, 'run'), '52.9'),
          env,
          undefined,
          { ledgerDir: dir },
        ),
      ).rejects.toMatchObject({ code: 'EVAL_BUDGET_INVALID' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('refuses a missing or a non-shared ledger before any work', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'alterward-paid-wiring-'));
    try {
      await expect(
        runNarrativeEvaluation(
          paidOptions(join(dir, 'run'), '2.7'),
          env,
          undefined,
          { ledgerDir: dir },
        ),
      ).rejects.toMatchObject({ code: 'EVAL_LEDGER_INVALID' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('a hand-built paid v9 options object meets the gate again (closed baseline)', async () => {
    const wide = {
      ...parseEvaluationOptions([
        '--creative-only',
        '--fiction-generation',
        'v9',
        '--fixtures',
        'creative-portfolio',
        '--periods',
        '8',
        '--out',
        '/tmp/x',
      ]),
      kind: 'paid' as const,
      allowPaid: true,
      budgetUsd: 5,
      approvalId: 'anything',
    };
    expect(() => verifyEvaluationAuthorization(wide, env)).toThrow(
      'owner-approved budget',
    );
    await expect(runNarrativeEvaluation(wide, env)).rejects.toThrow(
      'owner-approved budget',
    );
  });

  // Offline mock runs with the approval's chapter halts switched on: the mock
  // writes the approval's spend into a temporary ledger after a chosen chapter,
  // as the real calls would.
  async function haltedRun(
    spendAfterPeriod: number,
    spend: { accountedUsd: number; estimatedUsd: number },
    // A call of an EARLIER run of the same approval, already on the ledger.
    earlier?: { accountedUsd: number; estimatedUsd: number },
  ) {
    const dir = await mkdtemp(join(tmpdir(), 'alterward-paid-halt-'));
    const ledger = join(dir, 'paid-usage.json');
    const runDir = join(dir, 'run');
    await seedLedger(
      ledger,
      earlier
        ? [
            call({
              id: 'earlier',
              caseName: `narrative-evaluation:${APPROVAL}`,
              ...earlier,
            }),
          ]
        : [],
    );
    const bindings = (mine: boolean) => ({
      ...(earlier
        ? {
            earlier: {
              sourceHash: 'x',
              caseId: 'career-transition:narrative-v1:0',
              out: join(dir, 'earlier-run'),
            },
          }
        : {}),
      ...(mine
        ? {
            v9m: {
              sourceHash: 'x',
              caseId: 'career-transition:narrative-v1:1',
              out: runDir,
            },
          }
        : {}),
    });
    writeFileSync(
      join(dir, 'budget-bindings.json'),
      JSON.stringify(bindings(false)),
    );
    let spent = false;
    const options = parseEvaluationOptions([
      '--creative-only',
      '--fiction-generation',
      'v9',
      '--fixtures',
      'career-transition',
      '--periods',
      '3',
      '--out',
      runDir,
    ]);
    try {
      const run = await runNarrativeEvaluation(
        options,
        {},
        ({ task, caseId, defaultOutput }) => {
          if (
            !spent &&
            task === 'life_narrative_editor' &&
            caseId.endsWith(`:${spendAfterPeriod}`)
          ) {
            spent = true;
            writeFileSync(
              ledger,
              JSON.stringify({
                calls: [
                  base(),
                  ...(earlier
                    ? [
                        call({
                          id: 'earlier',
                          caseName: `narrative-evaluation:${APPROVAL}`,
                          ...earlier,
                        }),
                      ]
                    : []),
                  call({
                    id: 'v9m',
                    caseName: `narrative-evaluation:${APPROVAL}`,
                    ...spend,
                  }),
                ],
              }),
            );
            writeFileSync(
              join(dir, 'budget-bindings.json'),
              JSON.stringify(bindings(true)),
            );
          }
          return JSON.parse(JSON.stringify(defaultOutput()));
        },
        { ledgerDir: dir, approval: evaluationV9MeasurementApproval },
      );
      return run;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  const limits = (run: Awaited<ReturnType<typeof haltedRun>>) =>
    run.failures.filter((f) => f.code === 'EVAL_APPROVAL_LIMIT');

  it('starts no new chapter in the main loop once the approval has accounted USD 2.10', async () => {
    const run = await haltedRun(1, { accountedUsd: 2.2, estimatedUsd: 0.2 });
    expect(run.samples.filter((s) => s.kind === 'full')).toHaveLength(2);
    expect(limits(run).map((f) => f.caseId)).toEqual([
      'career-transition:narrative-v1:2',
    ]);
    // The halt is a stop: no fork follows.
    expect(run.samples.some((s) => s.kind === 'fork')).toBe(false);
  }, 120_000);
  it('starts no fork either', async () => {
    const run = await haltedRun(2, { accountedUsd: 2.2, estimatedUsd: 0.2 });
    expect(run.samples.filter((s) => s.kind === 'full')).toHaveLength(3);
    expect(run.samples.some((s) => s.kind === 'fork')).toBe(false);
    expect(limits(run).map((f) => f.caseId)).toEqual([
      'fork:career-transition:narrative-v1',
    ]);
  }, 120_000);
  it('stops after two chapters on a mean estimated cost above USD 0.50', async () => {
    const run = await haltedRun(1, { accountedUsd: 1.5, estimatedUsd: 1.2 });
    expect(run.samples.filter((s) => s.kind === 'full')).toHaveLength(2);
    expect(limits(run)).toHaveLength(1);
    expect(limits(run)[0]!.diagnostic).toBeDefined();
  }, 120_000);
  it("does not add an earlier run of the approval to this run's cost signal (false alarm of the second run)", async () => {
    // Earlier run: USD 0.65 estimated. This run: two chapters at 0.343 each.
    // The approval-wide mean would be (0.65 + 0.686) / 2 = 0.668 and stop the
    // run; this run's own mean is 0.343.
    const run = await haltedRun(
      1,
      { accountedUsd: 0.85, estimatedUsd: 0.686 },
      { accountedUsd: 0.7, estimatedUsd: 0.65 },
    );
    expect(limits(run)).toEqual([]);
    expect(run.samples.filter((s) => s.kind === 'full')).toHaveLength(3);
    expect(run.samples.some((s) => s.kind === 'fork')).toBe(true);
  }, 120_000);
  it('still counts an earlier run in the approval-wide USD 2.10 rule', async () => {
    const run = await haltedRun(
      1,
      { accountedUsd: 0.7, estimatedUsd: 0.2 },
      { accountedUsd: 1.5, estimatedUsd: 0.2 },
    );
    expect(limits(run).map((f) => f.caseId)).toEqual([
      'career-transition:narrative-v1:2',
    ]);
    expect(limits(run)[0]!.diagnostic).toBeDefined();
  }, 120_000);
});

describe('the budget binding names the run', () => {
  it('writes the resolved output directory into every paid binding', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts/lib/narrative-evaluation-runner.ts'),
      'utf8',
    );
    expect(source).toMatch(
      /budgetBindings\[id\] = \{[^}]*out: resolve\(options\.out\)/,
    );
  });
});

describe('which approval governs the chapter halts', () => {
  const seam = { ...evaluationV9MeasurementApproval, approvalId: 'seam' };
  it('gives a paid v9 run the source-bound approval, whatever the caller offers', () => {
    expect(chapterHaltApproval({ kind: 'paid', fictionGeneration: 'v9' })).toBe(
      evaluationV9MeasurementApproval,
    );
    expect(
      chapterHaltApproval({ kind: 'paid', fictionGeneration: 'v9' }, seam),
    ).toBe(evaluationV9MeasurementApproval);
  });
  it('gives a paid run that is not v9 no halts, and never the seam', () => {
    expect(chapterHaltApproval({ kind: 'paid' })).toBeUndefined();
    expect(chapterHaltApproval({ kind: 'paid' }, seam)).toBeUndefined();
  });
  it('lets only an offline mock run take the seam approval', () => {
    expect(chapterHaltApproval({ kind: 'offline' }, seam)).toBe(seam);
    expect(chapterHaltApproval({ kind: 'offline' })).toBeUndefined();
  });
});

describe('the resolved ledger path in every report', () => {
  it('names the ledger file in the ledger command and refuses a missing one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'alterward-paid-path-'));
    const ledger = join(dir, 'paid-usage.json');
    try {
      await expect(
        runNarrativePaidProbe(['ledger', '--ledger', ledger]),
      ).rejects.toThrow(`does not exist: ${ledger}`);
      await seedLedger(ledger);
      const { markdown } = await runNarrativePaidProbe([
        'ledger',
        '--ledger',
        ledger,
      ]);
      expect(markdown).toContain(`Ledger file (resolved): ${ledger}`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('names it in the probe report and in the cost accounting', () => {
    const calls = [call({})];
    expect(
      evaluationCostReport(calls, {}, 'src', '/abs/paid-usage.json'),
    ).toMatchObject({ ledgerPath: '/abs/paid-usage.json' });
    expect(evaluationCostReport(calls, {}, 'src')).not.toHaveProperty(
      'ledgerPath',
    );
  });
});
