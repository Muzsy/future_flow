import { createHash } from 'node:crypto';
import { cp, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, it, expect } from 'vitest';
import { fictionV9Policy } from '@future-flow/contracts';
import { fictionFixture } from './fiction-fixtures';
import {
  breakdownMarkdown,
  breakdownRun,
  storedChapters,
} from '../scripts/lib/narrative-request-breakdown';
import { runNarrativeProbeEditor } from '../scripts/narrative-probe-editor';
import { runNarrativeProbeLatency } from '../scripts/narrative-probe-latency';
import {
  attemptTracePath,
  verifyAttemptTrace,
  verifyTraceMatchesReceipts,
  type EvaluationAttemptTrace,
} from '../scripts/lib/narrative-evaluation-attempts';
import { DomainError, hash } from '@future-flow/core';
import { narrativeDimensions } from '@future-flow/contracts';
import { parseEvaluationOptions } from '../scripts/lib/narrative-evaluation-options';
import {
  attemptEvidence,
  characterBytes,
  runNarrativeEvaluation,
} from '../scripts/lib/narrative-evaluation-runner';

// Every file of a directory tree with its size, modification time and content
// hash, so a test can prove that a tool only read it.
async function evidenceFingerprint(root: string) {
  const files: Record<string, string> = {};
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else {
        const stats = await stat(path);
        files[path.slice(root.length)] =
          `${stats.size}:${stats.mtimeMs}:${createHash('sha1')
            .update(await readFile(path))
            .digest('hex')}`;
      }
    }
  };
  await walk(root);
  return files;
}

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
        // Turn diagnostics: the mock planner names the same type every time,
        // so the second chapter picks the type the ledger ranks last and
        // rests (the diagnostic says so; nothing is repaired because of it).
        expect(sample.character?.turn).toMatchObject({
          label: 'attempt_meets_resistance',
          coverage: 'labelled',
          ...(sample.periodIndex === 0
            ? { queueRank: null, restingChosen: null }
            : { queueRank: 10, restingChosen: true }),
        });
        // The figures of the life's own state are counted, and the mock prose
        // recounts none (diagnostic only; a flag, never a gate).
        expect(sample.character?.mechanics).toMatchObject({
          recounted: [],
        });
        expect(sample.character?.mechanics?.figures).toBeGreaterThanOrEqual(0);
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
      const before = await evidenceFingerprint(out);
      const split = await breakdownRun(out, 'creative-portfolio-narrative-v1');
      // The evidence directory is only read: no file added, removed or
      // touched (PGlite writes its control file, WAL and postmaster.pid when
      // it opens a directory, so the state is opened on a copy).
      expect(await evidenceFingerprint(out)).toEqual(before);
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
      // The two local-transport probes replay stored requests: the run is only
      // read (a probe output inside it is refused) and the answers here come
      // from a stand-in transport.
      const probeOut = await mkdtemp(join(tmpdir(), 'alterward-probe-out-'));
      const trace = JSON.parse(
        await readFile(
          attemptTracePath(out, 'creative-portfolio:narrative-v1:1'),
          'utf8',
        ),
      ) as { attempts: { task: string; output: unknown }[] };
      const storedEditor = trace.attempts.find(
        (a) => a.task === 'life_narrative_editor',
      )!.output;
      try {
        await expect(
          runNarrativeProbeEditor(
            ['--run', out, '--chapter', 'ch1', '--out', join(out, 'probe')],
            {},
            async () => storedEditor,
          ),
        ).rejects.toThrow(/outside/);
        const edited = await runNarrativeProbeEditor(
          [
            '--run',
            out,
            '--chapter',
            'ch1',
            '--runs',
            '2',
            '--out',
            join(probeOut, 'editor'),
          ],
          {},
          async () => storedEditor,
        );
        expect(edited.result.runs).toHaveLength(2);
        expect(edited.result.runs.map((r) => r.status)).toEqual(['ok', 'ok']);
        expect(edited.result.summary.gatePassed).toBe(2);
        expect(edited.result.stored.length).toBeGreaterThan(0);
        const requests: string[] = [];
        const latency = await runNarrativeProbeLatency(
          [
            '--run',
            out,
            '--chapter',
            'ch1',
            '--rounds',
            '2',
            '--out',
            join(probeOut, 'latency'),
          ],
          {},
          async ({ parameters }) => {
            requests.push(
              JSON.stringify(
                (parameters.text.format as { schema?: unknown }).schema,
              ),
            );
            return { ok: true };
          },
        );
        expect(latency.result.calls.map((c) => c.arm)).toEqual([
          'compact',
          'full-pattern',
          'compact',
          'full-pattern',
        ]);
        // Same request, only the schema differs, the full one is larger.
        const [compactSchema, fullSchema] = requests;
        expect(fullSchema!.length).toBeGreaterThan(
          compactSchema!.length + 3000,
        );
        expect(latency.result.summary[0]!.requestBytes).toBeLessThan(
          latency.result.summary[1]!.requestBytes!,
        );
        expect(await evidenceFingerprint(out)).toEqual(before);
        // A chapter that failed its gates keeps its job row and trace and is
        // replayable too; an absent chapter is reported with what is stored.
        const failedRun = join(probeOut, 'failed-run');
        await cp(out, failedRun, { recursive: true });
        const statePath = join(
          failedRun,
          'state',
          'creative-portfolio-narrative-v1',
        );
        await rm(join(statePath, 'postmaster.pid'), { force: true });
        const engine = new PGlite(statePath);
        await engine.exec(
          "UPDATE aw_jobs SET status='failed', error_code='NARRATIVE_QUALITY_FAILED' WHERE id=(SELECT id FROM aw_jobs ORDER BY created_at DESC LIMIT 1)",
        );
        await engine.close();
        const failed = await storedChapters(
          failedRun,
          'creative-portfolio-narrative-v1',
        );
        expect(
          failed.chapters.map((c) => `${c.chapter}:${c.jobStatus}`),
        ).toEqual(['ch0:completed', 'ch1:failed']);
        const replayed = await runNarrativeProbeEditor(
          [
            '--run',
            failedRun,
            '--chapter',
            'ch1',
            '--runs',
            '1',
            '--out',
            join(probeOut, 'failed-editor'),
          ],
          {},
          async () => storedEditor,
        );
        expect(replayed.result.runs[0]!.status).toBe('ok');
        await expect(
          runNarrativeProbeEditor(
            ['--run', out, '--chapter', 'ch7', '--out', join(probeOut, 'x')],
            {},
            async () => storedEditor,
          ),
        ).rejects.toThrow(
          /stored chapters ch0 \(completed\), ch1 \(completed\).*attempt traces/,
        );
      } finally {
        await rm(probeOut, { recursive: true, force: true });
      }
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
        // The probe takes a stored v8 author request as its control arm, and
        // a v8 run alone cannot be the compact/full comparison.
        const controlOut = await mkdtemp(join(tmpdir(), 'alterward-probe-c-'));
        try {
          const withControl = await runNarrativeProbeLatency(
            [
              '--run',
              out,
              '--chapter',
              'ch1',
              '--control-run',
              v8out,
              '--control-chapter',
              'ch0',
              '--rounds',
              '1',
              '--out',
              controlOut,
            ],
            {},
            async () => ({ ok: true }),
          );
          expect(withControl.result.calls.map((c) => c.arm)).toEqual([
            'compact',
            'full-pattern',
            'v8-control',
          ]);
          await expect(
            runNarrativeProbeLatency(
              ['--run', v8out, '--chapter', 'ch0', '--out', controlOut + '-x'],
              {},
              async () => ({ ok: true }),
            ),
          ).rejects.toThrow(/needs a v9 run/);
        } finally {
          await rm(controlOut, { recursive: true, force: true });
          await rm(controlOut + '-x', { recursive: true, force: true });
        }
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
    // A checker's feedback quotes scores such as "character" and is no
    // character-state repair (the v9-6c chapter 5 editor repair was misread).
    for (const message of [
      'Rewrite the weak story rather than paraphrasing it: {"scores":{"character":4,"novelty":3}}',
      'Correct the final package/prose discrepancy: the character Clodagh is given a new history.',
      'Fix BOTH final checks in one full-package repair.\nFidelity: x\nEditor: character/minor',
    ])
      expect(
        characterBytes({}, null, [], { fictionRepair: { message } })
          .characterRepair,
      ).toBe(false);
    // The v9 editor-triggered wording starts with a checker prefix too (it
    // lists the editor's issues, which name dimensions such as "character"),
    // and every older prefix is still recognised as before.
    for (const message of [
      "Correct the final package's literary issues:\nFailing flags: distinctEnding\nScores below 4: character=3\ncharacter/major/canon, paragraph 2: the profile of the neighbour is vague. Fix: delta it.",
      'The existing literary check also requires a repair.',
    ])
      expect(
        characterBytes({}, null, [], { fictionRepair: { message } })
          .characterRepair,
      ).toBe(false);
    // Repair triggers, from the fixed wording only; null without a repair.
    const trigger = (message: string) =>
      characterBytes({}, null, [], { fictionRepair: { message } })
        .repairTrigger;
    expect(trigger('Correct the final package/prose discrepancy: x')).toBe(
      'fidelity',
    );
    expect(
      trigger('Fix BOTH final checks in one full-package repair.\nFidelity: x'),
    ).toBe('fidelity');
    expect(trigger('Improve the final authored story: {}')).toBe('plan_review');
    expect(
      trigger('Rewrite the weak story rather than paraphrasing it: {}'),
    ).toBe('editor');
    expect(trigger("Correct the final package's literary issues:\nx")).toBe(
      'editor',
    );
    expect(trigger('The actor profile is missing.')).toBe('other');
    expect(characterBytes({}, null, [], {}).repairTrigger).toBeNull();
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
  it('counts schema and uuid failures of the compact v9 request schemas from the attempt trace', () => {
    const f = fictionFixture();
    const goodDraft = f.draft as { candidate: { periodId: string } };
    const badUuid = {
      ...goodDraft,
      candidate: { ...goodDraft.candidate, periodId: 'not-a-uuid' },
    };
    const attempt = (extra: object) => ({
      task: 'life_narrative_plan',
      status: 'completed',
      errorCode: null,
      output: null,
      repairFeedback: null,
      ...extra,
    });
    const trace = {
      attempts: [
        attempt({ output: goodDraft }),
        // Refused by the server schema because of a uuid.
        attempt({
          status: 'malformed',
          errorCode: 'AI_INVALID_SCHEMA',
          output: badUuid,
        }),
        // Refused because of a minted id (its pattern is kept in the request).
        attempt({
          status: 'malformed',
          errorCode: 'AI_INVALID_SCHEMA',
          output: {
            ...goodDraft,
            candidate: {
              ...goodDraft.candidate,
              events: goodDraft.candidate.events.map((e: object, i: number) =>
                i === 0 ? { ...e, id: 'not-a-uuid' } : e,
              ),
            },
          },
        }),
        // Refused for another reason (a missing required field).
        attempt({
          status: 'malformed',
          errorCode: 'AI_INVALID_SCHEMA',
          output: { candidate: goodDraft.candidate },
        }),
        // The API rejected the request itself.
        attempt({ status: 'failed', errorCode: 'AI_HTTP_400' }),
        attempt({ status: 'failed', errorCode: 'AI_HTTP_429' }),
      ],
    } as never;
    const policy = fictionV9Policy();
    expect(attemptEvidence(trace, policy)?.schemaFailures).toEqual({
      malformed: 3,
      uuid: 2,
      uuidOnCompactFields: 1,
      rejected: 1,
    });
    // Without a policy the uuid share cannot be told, the totals still count.
    expect(attemptEvidence(trace)?.schemaFailures).toEqual({
      malformed: 3,
      uuid: 0,
      uuidOnCompactFields: 0,
      rejected: 1,
    });
    // The sample carries the counter next to the stage output tokens.
    const evidence = attemptEvidence(trace, policy);
    const c = characterBytes(
      {},
      null,
      [{ task: 'life_narrative_chapter', outputTokens: 900 }] as never,
      {},
      [
        {
          task: 'life_narrative_chapter',
          latencyMs: 120_000,
          outputBytes: 10,
        },
      ] as never,
      '',
      evidence,
    );
    expect(c.schemaFailures).toEqual({
      malformed: 3,
      uuid: 2,
      uuidOnCompactFields: 1,
      rejected: 1,
    });
    expect(c.stageTokens).toEqual([
      { task: 'life_narrative_chapter', outputTokens: 900 },
    ]);
    expect(c.stageLatencies).toEqual([
      { task: 'life_narrative_chapter', latencyMs: 120_000 },
    ]);
    expect(characterBytes({}, null).schemaFailures).toEqual({
      malformed: 0,
      uuid: 0,
      uuidOnCompactFields: 0,
      rejected: 0,
    });
  });
  it('has no continuity when there is no draft or no projection', () => {
    expect(characterBytes(payload, null, [], {}).continuity).toBeNull();
    expect(
      characterBytes({}, null, [], { fictionDraft: { characterIntent: [] } })
        .continuity,
    ).toBeNull();
  });
});

describe('v9 mechanics-recount diagnostic (C4/D1)', () => {
  const payload = (locale: string) => ({
    input: { locale },
    state: {
      resources: { energy: null, availableHoursPerWeek: 4 },
      finance: { currency: 'EUR', monthlyIncome: 900, liquidFunds: null },
      ownedAssets: [],
    },
  });
  const living = { characterDelta: {} };
  const draft = {
    candidate: {
      events: [
        {
          changes: [
            {
              type: 'resources_set',
              value: { energy: null, availableHoursPerWeek: 2 },
            },
          ],
        },
      ],
    },
  };
  const checkpoints = { fictionDraft: draft };

  it('flags a figure of the life that the prose restates, and counts the figures', () => {
    const c = characterBytes(
      payload('en'),
      living,
      [],
      checkpoints,
      [],
      'You keep four hours a week for it, and the rest is yours.',
    );
    expect(c.mechanics).toEqual({
      figures: 3,
      recounted: [{ path: 'resources.availableHoursPerWeek', value: 4 }],
    });
  });
  it('reads Hungarian number words and flags nothing for prose without a figure', () => {
    expect(
      characterBytes(
        payload('hu'),
        living,
        [],
        checkpoints,
        [],
        'Négy órád marad.',
      ).mechanics?.recounted,
    ).toEqual([{ path: 'resources.availableHoursPerWeek', value: 4 }]);
    expect(
      characterBytes(
        payload('en'),
        living,
        [],
        checkpoints,
        [],
        'You walk home slowly.',
      ).mechanics?.recounted,
    ).toEqual([]);
  });
  it('is null outside the living-world generation', () => {
    expect(
      characterBytes(payload('en'), {}, [], null, [], 'Four hours.').mechanics,
    ).toBeNull();
  });
});

// A reduced repair (chapter text only, or the added facts only) is merged into
// the previous package by the provider, and its receipt binds the MERGED
// package. The diagnostic trace must bind the same hash and keep the raw
// response's hash beside it; every call is still checked against its receipt.
describe('the diagnostic trace of a reduced v9 repair (Codex A/B regression)', () => {
  const caseId = 'creative-portfolio:narrative-v1:0';
  async function reducedRun(kind: 'prose_only' | 'facts_only'): Promise<{
    out: string;
    trace: EvaluationAttemptTrace;
    run: Awaited<ReturnType<typeof runNarrativeEvaluation>>;
  }> {
    const out = await mkdtemp(join(tmpdir(), `alterward-reduced-${kind}-`));
    const o = parseEvaluationOptions([
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
        (
          parameters as { input: { role: string; content: string }[] }
        ).input.find((m) => m.role === 'user')!.content,
      ).authorRepair.previous as {
        candidate: { events: { id: string }[] };
        chapter: { title: string; body: string };
      };
    const run = await runNarrativeEvaluation(
      o,
      {},
      ({ task, ordinal, parameters, defaultOutput }) => {
        const base = JSON.parse(JSON.stringify(defaultOutput()));
        if (kind === 'prose_only') {
          if (task === 'life_narrative_editor' && ordinal === 4)
            return {
              ...base,
              scores: Object.fromEntries(
                narrativeDimensions.map((d) => [d, d === 'prose' ? 3 : 4]),
              ),
              verdict: 'revise',
              issues: [
                {
                  dimension: 'prose',
                  severity: 'major',
                  repairScope: 'prose',
                  paragraphIndex: 1,
                  eventIds: [],
                  explanation: 'The closing leans on a tidy summary sentence.',
                  suggestedFix: 'Replace it with a concrete physical gesture.',
                },
              ],
            };
          if (
            task === 'life_narrative_chapter' &&
            ordinal === (kind === 'facts_only' ? 4 : 5)
          )
            return {
              chapter: {
                title: base.chapter.title,
                body: `${base.chapter.body} A repaired sentence.`,
              },
            };
        } else {
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
          if (
            task === 'life_narrative_chapter' &&
            ordinal === (kind === 'facts_only' ? 4 : 5)
          )
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
        }
        return base;
      },
    );
    const trace = JSON.parse(
      await readFile(attemptTracePath(out, caseId), 'utf8'),
    ) as EvaluationAttemptTrace;
    return { out, trace, run };
  }

  for (const kind of ['prose_only', 'facts_only'] as const)
    it(`binds the merged package of a ${kind} repair to its receipt and keeps the raw hash`, async () => {
      const { out, trace, run } = await reducedRun(kind);
      try {
        expect(run.failures).toEqual([]);
        const sample = run.samples[0]!;
        expect(sample.repairUsed).toBe(true);
        expect(sample.requestCount).toBe(8);
        const repair = trace.attempts.find(
          (a) => a.task === 'life_narrative_chapter' && a.repairFeedback,
        )!;
        expect(repair.repairFeedback?.mode).toBe(kind);
        // outputHash is what the receipt binds (the merged package); the raw
        // response keeps its own hash.
        const receipt = sample.receipts[repair.ordinal]!;
        expect(repair.outputHash).toBe(receipt.outputHash);
        expect(repair.providerOutputHash).toBe(hash(repair.output));
        expect(repair.providerOutputHash).not.toBe(repair.outputHash);
        if (kind === 'prose_only')
          expect(sample.chapter.body).toBe(
            (repair.output as { chapter: { body: string } }).chapter.body,
          );
        else
          expect((repair.output as { outcome: string }).outcome).toBe(
            'facts_added',
          );
        // The strict receipt check passes on the real trace...
        const binding = {
          caseId,
          sourceCommit: run.sourceCommit,
          sourceHash: run.sourceHash,
          manifestBinding: JSON.parse(
            await readFile(join(out, 'manifest.json'), 'utf8'),
          ).binding,
          mock: true,
          models: run.models,
          projectHash: null,
        };
        expect(verifyAttemptTrace(trace, binding)).toEqual(trace);
        expect(() =>
          verifyTraceMatchesReceipts(trace, sample.receipts),
        ).not.toThrow();
        // ...and a trace that claims the raw hash instead no longer matches.
        const forged = structuredClone(trace);
        forged.attempts[repair.ordinal]!.outputHash =
          repair.providerOutputHash!;
        expect(() =>
          verifyTraceMatchesReceipts(forged, sample.receipts),
        ).toThrow(DomainError);
      } finally {
        await rm(out, { recursive: true, force: true });
      }
    });
});
