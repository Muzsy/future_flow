import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  breakdownMarkdown,
  breakdownRun,
} from '../scripts/lib/narrative-request-breakdown';
import { parseEvaluationOptions } from '../scripts/lib/narrative-evaluation-options';
import {
  attemptEvidence,
  characterBytes,
  runNarrativeEvaluation,
} from '../scripts/lib/narrative-evaluation-runner';

describe('living-world generation in the evaluation runner', () => {
  it('is opt-in, creative only and never paid before its own approval', () => {
    expect(parseEvaluationOptions(['--creative'])).not.toHaveProperty(
      'fictionGeneration',
    );
    expect(
      parseEvaluationOptions(['--creative', '--fiction-generation', 'v8']),
    ).not.toHaveProperty('fictionGeneration');
    expect(
      parseEvaluationOptions(['--creative-only', '--fiction-generation', 'v9'])
        .fictionGeneration,
    ).toBe('v9');
    expect(() =>
      parseEvaluationOptions(['--fiction-generation', 'v9']),
    ).toThrow('needs a creative run');
    expect(() =>
      parseEvaluationOptions(['--creative', '--fiction-generation', 'v10']),
    ).toThrow('Unsupported fiction generation');
    expect(() =>
      parseEvaluationOptions(
        [
          '--creative',
          '--fiction-generation',
          'v9',
          '--mode',
          'paid',
          '--allow-paid',
          '--budget-usd',
          '1',
          '--approval-id',
          'x',
          '--out',
          '/tmp/x',
        ],
        {},
      ),
    ).toThrow('owner-approved budget');
  });

  it('runs an offline v9 diagnosis and records the character bytes', async () => {
    const out = await mkdtemp(join(tmpdir(), 'alterward-fiction-v9-'));
    try {
      const o = parseEvaluationOptions([
        '--creative-only',
        '--fiction-generation',
        'v9',
        '--fixtures',
        'creative-portfolio',
        '--periods',
        '2',
        '--out',
        out,
      ]);
      const run = await runNarrativeEvaluation(o);
      expect(run.fictionGeneration).toBe('v9');
      expect(run.failures).toEqual([]);
      expect(run.samples).toHaveLength(2);
      for (const sample of run.samples) {
        expect(sample.requestCount).toBe(5);
        expect(sample.character?.projectionBytes).toBeGreaterThan(0);
        expect(sample.character?.deltaBytes).toBeGreaterThan(0);
        // F4: the author's output tokens are logged per call, one author call
        // and no repair here, and the repair cause is classified.
        expect(sample.character?.authorOutputTokens).toHaveLength(1);
        expect(sample.character?.authorReasoningTokens).toHaveLength(1);
        expect(sample.character?.repairMessage).toBeNull();
        expect(sample.character?.characterRepair).toBe(false);
        // N4: the local transports give no tokens, so lengths per stage and
        // for the prose and the delta are recorded with a rough estimate.
        const sizes = sample.character!.outputSizes;
        expect(sizes.stages.map((x) => x.task)).toEqual([
          'life_narrative_plan',
          'life_narrative_chapter',
          'life_narrative_plan_review',
          'life_fidelity',
          'life_narrative_editor',
        ]);
        for (const stage of sizes.stages) {
          expect(stage.outputBytes).toBeGreaterThanOrEqual(stage.outputChars);
          expect(stage.estimatedTokens).toBeGreaterThan(0);
          expect(stage.requestBytes).toBeGreaterThan(1000);
        }
        expect(sizes.proseChars).toBeGreaterThan(0);
        expect(sizes.deltaBytes).toBe(sample.character!.deltaBytes);
        expect(sizes.estimatedDeltaTokens).toBeGreaterThan(0);
        expect(Array.isArray(sample.character?.omitted)).toBe(true);
        // The stored draft gives the continuity diagnostics (no decision is
        // required of the mock cast, and a missing one is never a failure).
        expect(sample.character?.continuity?.decisions).toEqual({
          carry: 0,
          defer: 0,
          resolve: 0,
        });
        expect(
          sample.receipts.some((r) =>
            r.promptVersion.startsWith('life_fiction_author.v9'),
          ),
        ).toBe(true);
      }
      // The stored run gives the author request back, split by bytes, without
      // a model call (the real provider path from the saved payload and draft).
      const split = await breakdownRun(out, 'creative-portfolio-narrative-v1');
      expect(split.rows.map((r) => `${r.chapter}:${r.kind}`)).toEqual([
        'ch0:author',
        'ch1:author',
      ]);
      for (const row of split.rows) {
        const b = row.breakdown;
        expect(b.total).toBeGreaterThan(
          b.instructions + b.schema + b.user - 2000,
        );
        expect(b.instructions).toBeGreaterThan(1000);
        expect(b.schema).toBeGreaterThan(1000);
        expect(Object.keys(b.userKeys)).toContain('narrativeContext');
        expect(Object.keys(b.narrativeContext)).toContain(
          'characterProjection',
        );
      }
      expect(breakdownMarkdown([split])).toContain('| ch1 | author |');
      // A v8 run of the same corpus keeps its identity: no new report field.
      const v8out = await mkdtemp(join(tmpdir(), 'alterward-fiction-v8-'));
      try {
        const v8 = await runNarrativeEvaluation(
          parseEvaluationOptions([
            '--creative-only',
            '--fixtures',
            'creative-portfolio',
            '--periods',
            '1',
            '--out',
            v8out,
          ]),
        );
        expect(v8).not.toHaveProperty('fictionGeneration');
        expect(v8.samples[0]).not.toHaveProperty('character');
      } finally {
        await rm(v8out, { recursive: true, force: true });
      }
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 120000);
});

describe('v9 character repair classification (review F4)', () => {
  const receipt = (outputTokens: number, reasoningTokens?: number) =>
    ({
      task: 'life_narrative_chapter',
      outputTokens,
      reasoningTokens,
    }) as never;
  it('separates a character-state repair from other repairs and logs the author tokens', () => {
    const delta = characterBytes(
      {},
      null,
      [receipt(4100, 1500), receipt(5200)],
      {
        fictionRepair: {
          message:
            'A new recurring actor needs a character profile in its period.',
        },
      },
    );
    expect(delta.characterRepair).toBe(true);
    expect(delta.authorOutputTokens).toEqual([4100, 5200]);
    expect(delta.authorReasoningTokens).toEqual([1500, 0]);
    const other = characterBytes({}, null, [], {
      fictionRepair: { message: 'The chapter repeats its opening gesture.' },
    });
    expect(other.characterRepair).toBe(false);
    expect(other.repairMessage).toContain('opening gesture');
    expect(characterBytes({}, null, [], {}).repairMessage).toBeNull();
    // Lengths, not usage: characters and bytes differ for multibyte text.
    const sized = characterBytes(
      {},
      { characterDelta: { version: '1.0.0', note: 'ő' } },
      [],
      {},
      [
        {
          caseId: 'c',
          task: 'life_narrative_chapter',
          latencyMs: 1,
          outputChars: 7,
          outputBytes: 70,
          requestBytes: 12345,
        },
        { caseId: 'c', task: 'life_fidelity', latencyMs: 1 },
      ],
      'Árvíztűrő tükörfúrógép',
    );
    expect(sized.outputSizes.stages).toEqual([
      {
        task: 'life_narrative_chapter',
        outputChars: 7,
        outputBytes: 70,
        estimatedTokens: 20,
        requestBytes: 12345,
      },
    ]);
    expect(sized.outputSizes.proseChars).toBe(22);
    expect(sized.outputSizes.proseBytes).toBeGreaterThan(22);
    expect(sized.outputSizes.deltaChars).toBeLessThan(
      sized.outputSizes.deltaBytes,
    );
  });
});

describe('v9 planner continuity diagnostics', () => {
  const actor = (actorId: string, reasons: string[], kind = 'fictional') => ({
    actorId,
    kind,
    reasons,
  });
  const payload = {
    narrativeContext: {
      characterProjection: {
        omittedActors: 0,
        actors: [
          actor('una', ['unresolved_matter']),
          actor('fiona', ['open_thread', 'recent_change']),
          actor('joanne', ['recent_change']),
          actor('mother', ['open_thread'], 'supplied'),
        ],
      },
    },
  };
  it('counts the open matters the draft decided, deferred or left silent, without failing anything', () => {
    const c = characterBytes(payload, null, [], {
      fictionDraft: {
        characterIntent: [{ actorId: 'fiona' }],
        continuityDecisions: [
          { actorId: 'fiona', decision: 'carry' },
          { actorId: 'una', decision: 'resolve' },
        ],
      },
    }).continuity;
    // Joanne has no open matter; the supplied mother has an open thread.
    expect(c?.required).toEqual(['una', 'fiona', 'mother']);
    expect(c?.missing).toEqual(['mother']);
    // Una is resolved but has no intent; Fiona is carried with one.
    expect(c?.intentMissing).toEqual(['una']);
    expect(c?.decisions).toEqual({ carry: 1, defer: 0, resolve: 1 });
  });
  it('reports every open matter as missing when the planner ignores the ask', () => {
    const c = characterBytes(payload, null, [], {
      fictionDraft: { characterIntent: [], continuityDecisions: [] },
    }).continuity;
    expect(c?.missing).toEqual(c?.required);
    expect(c?.required).toHaveLength(3);
  });
  it('reads the draft and the repair wording from the attempt trace of a completed sample', () => {
    const attempt = (task: string, extra: object) => ({
      task,
      status: 'completed',
      output: null,
      repairFeedback: null,
      ...extra,
    });
    const evidence = attemptEvidence({
      attempts: [
        attempt('life_narrative_plan', {
          output: { continuityDecisions: [] },
        }),
        attempt('life_narrative_plan', {
          output: {
            characterIntent: [{ actorId: 'una' }],
            continuityDecisions: [{ actorId: 'una', decision: 'carry' }],
          },
          repairFeedback: { message: 'The plan repeats.' },
        }),
        attempt('life_narrative_chapter', { output: { body: 'x' } }),
      ],
    } as never);
    // The last completed plan is the one the package was authored from.
    const c = characterBytes(payload, null, [], {}, [], '', evidence);
    expect(c.continuity?.decisions.carry).toBe(1);
    expect(c.continuity?.missing).toEqual(['fiona', 'mother']);
    expect(c.repairMessage).toBe('The plan repeats.');
    expect(attemptEvidence(null)).toBeNull();
  });
  it('has no continuity when there is no draft or no projection', () => {
    expect(characterBytes(payload, null, [], {}).continuity).toBeNull();
    expect(
      characterBytes({}, null, [], { fictionDraft: { characterIntent: [] } })
        .continuity,
    ).toBeNull();
  });
});
