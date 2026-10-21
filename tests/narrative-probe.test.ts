import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FICTION_CHARACTER_VERSION,
  fictionV9Policy,
  type FictionCharacterEnvelope,
} from '@future-flow/contracts';
import {
  characterStateFromHistory,
  fictionCharacterProjectionFromEnvelope,
} from '@future-flow/core';
import { LocalQuotaGuard } from '../scripts/lib/narrative-evaluation-quota';
import type { OfflineMockResponder } from '../scripts/lib/narrative-evaluation-runner';
import {
  attemptOrdinal,
  authorAttemptOf,
  editorProbeMarkdown,
  editorRequest,
  editorSummary,
  firstAuthorRequest,
  latencyProbeMarkdown,
  probeArgs,
  probeOutputDir,
  probeSchedule,
  runEditorProbe,
  runLatencyProbe,
  withFullPatternSchema,
  type ProbeArm,
  type ProviderParameters,
} from '../scripts/lib/narrative-probe';
import type { StoredChapter } from '../scripts/lib/narrative-request-breakdown';
import {
  fictionFixture,
  fictionFixtureCharacterDelta,
} from './fiction-fixtures';

const parameters = (name: string, size = 10): ProviderParameters => ({
  model: 'gpt-6.1-sol',
  input: [
    { role: 'system', content: 's' },
    { role: 'user', content: 'x'.repeat(size) },
  ],
  max_output_tokens: 12000,
  text: { format: { name, schema: { type: 'object' } } },
});
const arm = (id: string): ProbeArm => ({
  id,
  description: id,
  parameters: parameters(id, id === 'full' ? 40 : 10),
  validate: (output) => (output as { ok?: boolean }).ok === true,
});
const clock = () => {
  let t = Date.parse('2026-10-21T08:00:00Z');
  return { now: () => t, advance: (ms: number) => (t += ms) };
};

describe('probe schedule', () => {
  it('interleaves the arms round by round', () => {
    expect(
      probeSchedule(['A', 'B'], 3).map((s) => `${s.round}${s.arm}`),
    ).toEqual(['1A', '1B', '2A', '2B', '3A', '3B']);
    expect(
      probeSchedule(['A', 'B', 'C'], 2)
        .map((s) => s.arm)
        .join(''),
    ).toBe('ABCABC');
  });
});

describe('latency probe', () => {
  it('records every call per arm and keeps going after a failed one', async () => {
    const c = clock();
    const seen: string[] = [];
    let n = 0;
    const responder: OfflineMockResponder = async ({ parameters: p }) => {
      const name = p.text.format.name;
      seen.push(name);
      n++;
      c.advance(name === 'full' ? 200_000 : 100_000);
      if (n === 3) throw new Error('Codex exec did not finish.');
      if (n === 4) return { ok: false };
      return { ok: true, text: 'y'.repeat(100) };
    };
    const progress: number[] = [];
    const result = await runLatencyProbe(
      [arm('compact'), arm('full')],
      2,
      { responder, now: c.now },
      (partial) => progress.push(partial.calls.length),
    );
    expect(seen).toEqual(['compact', 'full', 'compact', 'full']);
    expect(progress).toEqual([1, 2, 3, 4]);
    const compact = result.summary.find((s) => s.arm === 'compact')!;
    const full = result.summary.find((s) => s.arm === 'full')!;
    expect(compact).toMatchObject({ calls: 2, ok: 1, failed: 1 });
    expect(full).toMatchObject({
      calls: 2,
      ok: 2,
      failed: 0,
      schemaInvalid: 1,
    });
    expect(full.latencyMs.mean).toBe(200_000);
    expect(full.over180s).toBe(2);
    expect(compact.over180s).toBe(0);
    expect(full.requestBytes).toBeGreaterThan(compact.requestBytes!);
    expect(result.calls[2]).toMatchObject({
      status: 'error',
      outputBytes: null,
      error: 'Codex exec did not finish.',
    });
    expect(result.calls[0]!.outputBytes).toBeGreaterThan(100);
    const md = latencyProbeMarkdown(result);
    expect(md).toContain('| compact |');
    expect(md).toContain('| full |');
    expect(md).toContain('Hungarian local time');
  });

  it('marks an answer over the output limit as incomplete', async () => {
    const result = await runLatencyProbe([arm('compact')], 1, {
      responder: async () => ({
        __rawResponse: { status: 'incomplete' },
      }),
    });
    expect(result.calls[0]).toMatchObject({ status: 'incomplete' });
  });

  it('stops on a spent quota, keeps the partial result and never switches', async () => {
    const reads = [30, 30, 0.5];
    let i = 0;
    const source = {
      engine: 'codex' as const,
      thresholds: {
        start: { 'five-hour': 30, weekly: 20 },
        boundary: { 'five-hour': 10, weekly: 5 },
        hard: { 'five-hour': 1, weekly: 1 },
      },
      read: async () => ({
        engine: 'codex' as const,
        at: '2026-10-21T08:00:00Z',
        blockedReason: null,
        windows: [
          {
            name: 'five-hour' as const,
            remainingPercent:
              reads[Math.min(i++, reads.length - 1)]! < 1 ? 0 : 50,
            resetsAt: null,
          },
          { name: 'weekly' as const, remainingPercent: 80, resetsAt: null },
        ],
      }),
    };
    const guard = new LocalQuotaGuard(source, { sticky: true });
    await guard.preflight();
    let calls = 0;
    const result = await runLatencyProbe([arm('compact'), arm('full')], 3, {
      guard,
      responder: async () => {
        calls++;
        return { ok: true };
      },
    });
    expect(result.halted).toMatch(/quota stop/);
    expect(calls).toBeLessThan(6);
    expect(result.calls.length).toBeLessThan(6);
    expect(result.quota.length).toBeGreaterThan(0);
  });
});

describe('editor probe', () => {
  const report = (scores: Record<string, number>, verdict = 'pass') => ({
    verdict,
    scores,
    sequenceReview: { characterAgency: true },
    issues:
      verdict === 'pass'
        ? []
        : [
            {
              dimension: 'choiceStakes',
              severity: 'minor',
              repairScope: 'prose',
              suggestedFix: 'Make the stakes concrete.',
            },
          ],
  });
  it('runs independent editor calls and applies the gate to each', async () => {
    const reports = [
      report({ novelty: 4, choiceStakes: 4 }),
      report({ novelty: 4, choiceStakes: 3 }, 'revise'),
      report({ novelty: 5, choiceStakes: 4 }),
    ];
    let i = 0;
    const result = await runEditorProbe(
      {
        caseId: 'x:narrative-v1:2',
        authorOrdinal: 4,
        parameters: parameters('life_narrative_editor'),
        stored: [
          {
            ordinal: 5,
            verdict: 'revise',
            scores: { novelty: 3, choiceStakes: 4 },
            issues: ['novelty/minor/prose'],
          },
        ],
        gate: (raw) => {
          const r = raw as ReturnType<typeof report>;
          return (
            r.verdict === 'pass' && Object.values(r.scores).every((s) => s >= 4)
          );
        },
      },
      3,
      { responder: async () => reports[i++] },
    );
    expect(result.runs.map((r) => r.gatePassed)).toEqual([true, false, true]);
    expect(result.runs[1]).toMatchObject({
      below4: ['choiceStakes'],
      verdict: 'revise',
    });
    expect(result.summary).toMatchObject({
      runs: 3,
      gatePassed: 2,
      gateFailed: 1,
      below4ByDimension: { choiceStakes: 1 },
      issueDimensions: { choiceStakes: 1 },
    });
    expect(result.summary.scoresByDimension.novelty).toMatchObject({
      min: 4,
      max: 5,
    });
    const md = editorProbeMarkdown(result);
    expect(md).toContain('the product gate passed 2, failed 1');
    expect(md).toContain('attempt 5: revise');
  });
  it('summarises runs without a report', () => {
    expect(editorSummary([]).gatePassed).toBe(0);
  });
});

describe('stored chapter requests', () => {
  const f = fictionFixture();
  const v9 = structuredClone(f.input);
  // A living-world input with no recurring person: the v9 policy, an empty
  // character envelope and its projection.
  const envelope: FictionCharacterEnvelope = {
    version: FICTION_CHARACTER_VERSION,
    state: characterStateFromHistory([], {
      fictionalOrigins: new Map(),
      suppliedActorIds: new Set(),
    }),
    fictionalOrigins: [],
    suppliedActorIds: [],
    signals: {
      openThreadActors: [],
      goalOrOpportunityActors: [],
      overduePrivateLifeActors: [],
    },
  };
  v9.narrativeContext!.policy = fictionV9Policy();
  (
    v9.narrativeContext as unknown as { characterProjection: unknown }
  ).characterProjection = fictionCharacterProjectionFromEnvelope(
    envelope,
    false,
  );
  v9.fictionCharacters = envelope;
  const draft = { ...f.draft, characterIntent: [], continuityDecisions: [] };
  const authored = {
    ...f.authored,
    characterDelta: fictionFixtureCharacterDelta(v9.periodId, f.authored),
  };
  const repaired = {
    ...authored,
    chapter: { ...authored.chapter, body: `${authored.chapter.body} REPAIRED` },
  };
  const attempts = (
    [
      ['life_narrative_plan', draft, null],
      ['life_narrative_chapter', authored, null],
      [
        'life_narrative_editor',
        { verdict: 'revise', scores: {}, issues: [] },
        null,
      ],
      [
        'life_narrative_chapter',
        repaired,
        { mode: 'prose_only', message: 'Fix it.' },
      ],
    ] as const
  ).map(([task, output, repairFeedback], ordinal) => ({
    ordinal,
    task,
    status: 'completed',
    output,
    repairFeedback,
  }));
  const chapter: StoredChapter = {
    chapter: 'ch2',
    caseId: 'x:narrative-v1:2',
    payload: v9,
    attempts,
  };
  it('selects the first or the last author attempt with its plan', () => {
    expect(authorAttemptOf(chapter, 'first').author.ordinal).toBe(1);
    expect(authorAttemptOf(chapter, 'last').author.ordinal).toBe(3);
    expect(authorAttemptOf(chapter, 3).plan.ordinal).toBe(0);
    expect(() => authorAttemptOf(chapter, 9)).toThrow();
    expect(attemptOrdinal('0')).toBe(0);
    expect(() => attemptOrdinal('x')).toThrow();
  });
  it('rebuilds the author request and differs from it only by the schema', async () => {
    const compact = await firstAuthorRequest(chapter);
    const full = withFullPatternSchema(compact, chapter.payload);
    expect(compact.text.format.name).toBe('life_narrative_chapter');
    expect(JSON.stringify(full.text).length).toBeGreaterThan(
      JSON.stringify(compact.text).length + 3000,
    );
    expect(full.input).toEqual(compact.input);
    expect(full.max_output_tokens).toBe(compact.max_output_tokens);
    expect(full.model).toBe(compact.model);
    // The compact schema is the product's: nothing is removed from it by the
    // probe, only the full arm gets the patterns back.
    expect(JSON.stringify(compact.text)).not.toBe(JSON.stringify(full.text));
  });
  it('rebuilds the editor request of the final chapter', async () => {
    const e = await editorRequest(chapter, 'last');
    expect(e.ordinal).toBe(3);
    expect(e.parameters.text.format.name).toBe('life_narrative_editor');
    expect(JSON.stringify(e.parameters.input)).toContain('REPAIRED');
  });
});

describe('probe files', () => {
  it('refuses an output directory inside the stored run and bad options', () => {
    const run = mkdtempSync(join(tmpdir(), 'alterward-probe-run-'));
    writeFileSync(join(run, 'transport-records.json'), '[]');
    expect(() => probeOutputDir(join(run, 'probe'), [run])).toThrow(/outside/);
    expect(() => probeOutputDir(run, [run])).toThrow(/outside/);
    const out = mkdtempSync(join(tmpdir(), 'alterward-probe-out-'));
    expect(probeOutputDir(out, [run])).toBe(out);
    expect(() => probeArgs(['--wat', '1'], ['--run'])).toThrow();
    expect(() => probeArgs(['--run'], ['--run'])).toThrow();
    expect(probeArgs(['--run', 'a'], ['--run']).get('--run')).toBe('a');
  });
});
