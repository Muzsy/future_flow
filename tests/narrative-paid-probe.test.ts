import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import type OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import { fictionFactsOnlyEligible } from '@future-flow/core';
import { parseEvaluationOptions } from '../scripts/lib/narrative-evaluation-options';
import { runNarrativeEvaluation } from '../scripts/lib/narrative-evaluation-runner';
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
  ledgerTotals,
  readLedgerCalls,
  summariseLedger,
  type LedgerCall,
} from '../scripts/lib/paid-ledger-summary';
import {
  approvalChapterHalt,
  approvalCumulativeBudgetUsd,
  approvalSpend,
  evaluationV9MeasurementApproval,
} from '../scripts/lib/narrative-evaluation-approval';
import { runNarrativePaidProbe } from '../scripts/narrative-paid-probe';

// The provider's own copy of the SDK: its error classes are what it recognises.
const ProviderOpenAI = createRequire(
  createRequire(import.meta.url).resolve('@future-flow/ai'),
)('openai') as typeof OpenAI;

const APPROVAL = evaluationV9MeasurementApproval.approvalId;

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
  const today = Date.parse('2026-10-22T12:00:00Z');
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
    expect(() =>
      paidProbeEnvironment(env, Date.parse('2026-10-26T12:00:00Z')),
    ).toThrow(/prices/);
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
    await writeFile(
      ledgerPath,
      JSON.stringify({ calls: [call({ id: 'earlier', accountedUsd: 1.25 })] }),
    );
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
      expect(result.ledger.start.accountedUsd).toBeCloseTo(1.25);
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
    } finally {
      await rm(out, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('cannot spend past its own cap: the ledger refuses the next call', async () => {
    const { out, chapters } = await storedRun();
    const dir = await mkdtemp(join(tmpdir(), 'alterward-paid-probe-cap-'));
    const ledgerPath = join(dir, 'paid-usage.json');
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
      approvalChapterHalt([...base, mine({ accountedUsd: 2.09 })], 4),
    ).toBeNull();
    expect(
      approvalChapterHalt([...base, mine({ accountedUsd: 2.1 })], 4),
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
      ),
    ).toMatch(/no new chapter/);
  });
  it('stops on a mean usage-estimated cost above USD 0.50 after two chapters, not before', () => {
    const calls = [mine({ accountedUsd: 1.5, estimatedUsd: 1.1 })];
    expect(approvalChapterHalt(calls, 1)).toBeNull();
    expect(approvalChapterHalt(calls, 2)).toMatch(/Cost signal/);
    expect(
      approvalChapterHalt([mine({ accountedUsd: 1.5, estimatedUsd: 0.9 })], 2),
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
