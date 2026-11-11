import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseEvaluationOptions } from '../scripts/lib/narrative-evaluation-options';
import { runNarrativeEvaluation } from '../scripts/lib/narrative-evaluation-runner';
import { requestParts } from '../scripts/lib/narrative-request-parts';
import {
  compareMarkdown,
  compareReplays,
  replayMarkdown,
  replayRun,
  type RunReplay,
} from '../scripts/lib/narrative-request-replay';
import { runNarrativeRequestReplay } from '../scripts/narrative-request-replay';

describe('requestParts', () => {
  it('adds up to the serialized request, escaping and wrapper included', () => {
    const parameters = {
      model: 'm',
      store: false,
      input: [
        { role: 'system', content: 'Rules "quoted"\nnext' },
        {
          role: 'user',
          content: JSON.stringify({
            state: { a: 1 },
            narrativeContext: { memory: { x: 'ü' }, seriesLedger: [1, 2] },
          }),
        },
      ],
      text: { format: { type: 'json_schema', schema: { type: 'object' } } },
    };
    const parts = requestParts(parameters);
    expect(parts.total).toBe(Buffer.byteLength(JSON.stringify(parameters)));
    expect(parts.system + parts.schema + parts.user + parts.envelope).toBe(
      parts.total,
    );
    // The user message is escaped inside the request, so the envelope is the
    // wrapper plus that escaping and never negative.
    expect(parts.envelope).toBeGreaterThan(0);
    expect(Object.keys(parts.userKeys)).toEqual(['state', 'narrativeContext']);
    expect(Object.keys(parts.narrativeContext)).toEqual([
      'memory',
      'seriesLedger',
    ]);
  });
  it('tolerates a request without a system message or with a user text that is not JSON', () => {
    const parts = requestParts({
      input: [{ role: 'user', content: 'plain text' }],
    });
    expect(parts.system).toBe(0);
    expect(parts.userKeys).toEqual({});
    expect(parts.system + parts.schema + parts.user + parts.envelope).toBe(
      parts.total,
    );
  });
});

describe('request replay', () => {
  it('records the parts per call and rebuilds every request of a stored run to the same bytes', async () => {
    const out = await mkdtemp(join(tmpdir(), 'alterward-replay-'));
    try {
      const run = await runNarrativeEvaluation(
        parseEvaluationOptions([
          '--creative-only',
          '--fiction-generation',
          'v9',
          '--fixtures',
          'creative-portfolio',
          '--periods',
          '2',
          '--out',
          out,
        ]),
      );
      expect(run.failures).toEqual([]);
      const transports = JSON.parse(
        await readFile(join(out, 'transport-records.json'), 'utf8'),
      ) as {
        caseId: string;
        task: string;
        requestBytes: number;
        requestParts: ReturnType<typeof requestParts>;
      }[];
      expect(transports).toHaveLength(10);
      for (const t of transports) {
        const p = t.requestParts;
        expect(p.total).toBe(t.requestBytes);
        expect(p.system + p.schema + p.user + p.envelope).toBe(p.total);
        expect(p.system).toBeGreaterThan(1000);
      }
      // The report carries the same split per stage.
      for (const sample of run.samples)
        for (const stage of sample.character!.outputSizes.stages)
          expect(stage.requestParts?.total).toBe(stage.requestBytes);

      const replay = await replayRun(out, 'creative-portfolio-narrative-v1');
      expect(replay.rows).toHaveLength(10);
      expect(replay.rows.map((r) => `${r.chapter}:${r.task}`)).toEqual(
        transports.map((t, i) => {
          void t;
          return `ch${Math.floor(i / 5)}:${t.task}`;
        }),
      );
      // The same code builds the same bytes: the replay reproduces what the
      // run recorded, part by part, without a model call.
      replay.rows.forEach((row, i) => {
        expect(row.kind).toBe('first');
        expect(row.parts).toEqual(transports[i]!.requestParts);
      });
      expect(replayMarkdown([replay])).toContain('| ch1 | chapter | first |');
      // A run replayed twice shows no difference.
      expect(
        compareReplays(replay, replay).every(
          (d) => d.delta === 0 && Object.keys(d.parts).length === 0,
        ),
      ).toBe(true);

      // The CLI writes the replay and compares two replay files.
      const a = await mkdtemp(join(tmpdir(), 'alterward-replay-a-'));
      try {
        await runNarrativeRequestReplay([
          '--out',
          a,
          `${out}:creative-portfolio-narrative-v1`,
        ]);
        const markdown = await runNarrativeRequestReplay([
          '--compare',
          join(a, 'request-replay.json'),
          join(a, 'request-replay.json'),
          '--out',
          a,
        ]);
        expect(markdown).toContain('Total over all rows: +0.00 KB.');
      } finally {
        await rm(a, { recursive: true, force: true });
      }
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 120000);

  it('attributes a difference between two code versions to the part that changed', () => {
    const parts = (extra: number, ledger: number, ctx = 0) => ({
      total: 1000 + extra + ledger + ctx,
      system: 400,
      schema: 300 + extra,
      user: 250 + ledger + ctx,
      envelope: 50,
      userKeys: { narrativeContext: 100 + ledger + ctx, state: 50 },
      narrativeContext: { seriesLedger: 40 + ledger, memory: 60 + ctx },
    });
    const row = (task: string, p: ReturnType<typeof parts>) => ({
      chapter: 'ch1',
      caseId: 'x:narrative-v1:1',
      ordinal: 0,
      task,
      kind: 'first' as const,
      parts: p,
    });
    const before: RunReplay = {
      label: 'control',
      rows: [row('life_narrative_chapter', parts(0, 0))],
    };
    const after: RunReplay = {
      label: 'candidate',
      rows: [
        row('life_narrative_chapter', parts(0, 700)),
        row('life_fidelity', parts(0, 700)),
      ],
    };
    const deltas = compareReplays(before, after);
    expect(deltas[0]).toMatchObject({ delta: 700 });
    expect(deltas[0]!.parts).toEqual({
      user: 700,
      'user.narrativeContext': 700,
      'ctx.seriesLedger': 700,
    });
    // A row only one side has counts as 0 on the other side.
    expect(deltas[1]).toMatchObject({ before: 0, delta: 1700 });
    expect(compareMarkdown(deltas, ['control', 'candidate'])).toContain(
      'user.narrativeContext +0.70',
    );
  });
});
