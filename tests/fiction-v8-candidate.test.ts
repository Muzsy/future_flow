import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  fictionPolicy,
  fictionPolicySchema,
  fictionV7Policy,
  fictionV8Policy,
  fictionContextSchema,
  fictionEditorialVersionFor,
  fictionSeriesLedgerSchema,
  type FictionPolicy,
} from '@future-flow/contracts';
import {
  fictionCastingProjection,
  fictionEditorialRequest,
  fictionPlannerRequest,
  fictionSeriesLedgerFrom,
  seriesClosingSentence,
  seriesEchoFindings,
  seriesEchoFlags,
  seriesFrictionMarkers,
  seriesFrictionRun,
  seriesNameCandidates,
  seriesRepeatedOpenings,
  seriesRepeatedPhrases,
  validateFictionAuthor,
} from '@future-flow/core';
import { fictionPrompts } from '../packages/ai/src/fiction-prompts';
import {
  auditCrossRun,
  auditSequence,
  auditSequences,
  narrativeSeriesAudit,
} from '../scripts/lib/narrative-series-audit';
import {
  codexChildEnv,
  codexLocalResponder,
} from '../scripts/lib/narrative-evaluation-codex';
import { evaluateNarrativeWithCodex } from '../scripts/evaluate-narrative-codex';
import { fictionFixture } from './fiction-fixtures';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const v7Versions = fictionV7Policy().promptVersions;
const v8Versions = fictionV8Policy().promptVersions;
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function fixtureFor(policy: FictionPolicy, ledger?: unknown) {
  const base = fictionFixture().input;
  if (base.narrativeContext?.policy.mode !== 'narrative-fiction-v2')
    throw Error('Expected a fiction-mode fixture.');
  base.narrativeContext.policy = policy;
  if (ledger)
    (base.narrativeContext as Record<string, unknown>).seriesLedger = ledger;
  return fictionFixture(base);
}

// Synthetic prose with the v7 reading's defects: a "Neither of you…" opening
// tic, one stock phrase, the same quiet closing gesture and a recurring name.
const v7Like = (n: number) =>
  [
    `The office smelled of toner when Niamh Byrne slid the sheet across to you on a grey Tuesday.`,
    `Neither of you said the obvious thing. She suggested a different column order, and you resisted, irritated, before agreeing to half of it.`,
    `Neither of you mentioned the deadline. You let the silence settle between the two desks for a while.`,
    `Chapter ${n} detail: the printer jammed twice and the agency rang about the contract.`,
    `She turned back to her screen, and you looked at the sheet for a long moment.`,
  ].join('\n\n');

describe('v8 candidate policy selection and frozen predecessors', () => {
  it('selects v8/quality2.7/editor v7 for new jobs with report 1.3.0', () => {
    expect(fictionPolicy()).toEqual(fictionV8Policy());
    expect(fictionV8Policy()).toMatchObject({
      qualityPolicyVersion: '2.7.0',
      maxPhysicalRequests: 9,
      maxContentRepairs: 1,
      promptVersions: {
        planner: 'life_fiction_plan.v8',
        writer: 'life_fiction_author.v8',
        planReviewer: 'life_fiction_plan_review.v8',
        fidelity: 'life_fiction_fidelity.v1',
        editor: 'life_fiction_editor.v7',
      },
    });
    expect(fictionEditorialVersionFor('2.7.0')).toBe('1.3.0');
    expect(fictionPolicySchema.parse(fictionV7Policy())).toEqual(
      fictionV7Policy(),
    );
    for (const bad of [
      { ...fictionV8Policy(), qualityPolicyVersion: '2.6.0' },
      {
        ...fictionV8Policy(),
        promptVersions: { ...v8Versions, editor: 'life_fiction_editor.v6' },
      },
      { ...fictionV7Policy(), qualityPolicyVersion: '2.7.0' },
    ])
      expect(fictionPolicySchema.safeParse(bad).success).toBe(false);
  });
  it('appends only to the v7 text and keeps fidelity unchanged', () => {
    const v7 = fictionPrompts('en', v7Versions);
    const v8 = fictionPrompts('en', v8Versions);
    for (const role of ['planner', 'author', 'review', 'editor'] as const) {
      expect(v8[role].startsWith(v7[role])).toBe(true);
      expect(v8[role].length).toBeGreaterThan(v7[role].length);
    }
    expect(sha(v8.fidelity)).toBe(sha(v7.fidelity));
    expect(v8.author).toContain('SERIES-LEDGER CRAFT');
    expect(v8.author).toContain('CASTING CRAFT');
    expect(v8.author).toContain('FRICTION-BEAT CRAFT');
    expect(v8.author).toContain('ENDING-KIND CRAFT');
    expect(v8.editor).toContain('frictionFinding');
    expect(v8.editor).toContain('seriesEchoFindings');
  });
  it('introduces no chapter schedule, billing or quota language', () => {
    const v7 = fictionPrompts('en', v7Versions);
    const v8 = fictionPrompts('en', v8Versions);
    for (const role of ['planner', 'author', 'review', 'editor'] as const) {
      const delta = v8[role].slice(v7[role].length);
      expect(delta).not.toMatch(
        /every \d+ (chapters|periods)|chapter \d|billing|price|USD|credit/i,
      );
      expect(delta).not.toMatch(
        /at least \d+ times|exactly \d+ (new )?(people|actors)/i,
      );
    }
  });
});

describe('deterministic series evidence', () => {
  const chapters = [1, 2, 3, 4].map((n) => ({ body: v7Like(n) }));
  it('finds the recurring opening tic and stock phrases across chapters', () => {
    const openings = seriesRepeatedOpenings(chapters);
    expect(openings[0]).toEqual({
      text: 'neither of you',
      count: 8,
      chapters: 4,
    });
    const phrases = seriesRepeatedPhrases(chapters).map((p) => p.text);
    expect(phrases).toContain('neither of you mentioned the');
    expect(phrases).toHaveLength(6);
    // Overlapping windows of one longer phrase collapse.
    expect(new Set(phrases).size).toBe(phrases.length);
  });
  it('ignores a phrase used once and stays empty for a first chapter', () => {
    expect(seriesRepeatedOpenings([])).toEqual([]);
    expect(seriesRepeatedOpenings(chapters.slice(0, 1))).toEqual([]);
    expect(
      seriesRepeatedPhrases([
        { body: 'A completely different sentence about painting walls.' },
        { body: 'Another unrelated sentence about the river at dusk.' },
      ]),
    ).toEqual([]);
  });
  it('reports where a new chapter reuses already-recurring wording', () => {
    const ledger = {
      repeatedOpenings: seriesRepeatedOpenings(chapters),
      repeatedPhrases: seriesRepeatedPhrases(chapters),
    };
    const reused = seriesEchoFindings(v7Like(5), ledger);
    expect(reused.find((f) => f.text === 'neither of you')).toMatchObject({
      kind: 'opening',
      occurrences: 2,
      priorChapters: 4,
    });
    expect(
      seriesEchoFindings(
        'You carried the canvas down three flights. The rain had stopped.',
        ledger,
      ),
    ).toEqual([]);
  });
  it('counts clause openings after a dash, colon or quote and flags within-chapter tics', () => {
    const body =
      'You wait — neither of you moves. She says: "Neither of you planned this." ' +
      'Neither of you speaks again.';
    const findings = seriesEchoFindings(body, {
      repeatedOpenings: [],
      repeatedPhrases: [],
    });
    expect(findings).toEqual([
      {
        kind: 'within',
        text: 'neither of you',
        priorChapters: 0,
        occurrences: 3,
      },
    ]);
    expect(seriesEchoFlags(findings)).toBe(true);
  });
  it('flags reuse by the same rule the v8 editor is given', () => {
    const one = (priorChapters: number, occurrences: number) => ({
      kind: 'opening' as const,
      text: 'there is no',
      priorChapters,
      occurrences,
    });
    expect(seriesEchoFlags([])).toBe(false);
    expect(seriesEchoFlags([one(2, 1)])).toBe(false);
    expect(seriesEchoFlags([one(3, 1)])).toBe(true);
    expect(seriesEchoFlags([one(2, 2)])).toBe(true);
    expect(
      seriesEchoFlags([one(2, 1), { ...one(2, 1), text: 'you read the' }]),
    ).toBe(true);
  });
  it('counts narrated small-friction words, not dialogue, and their recent run', () => {
    expect(
      seriesFrictionMarkers(
        'Her neatness is disproportionately irritating. You dislike her a little and close the laptop too sharply. "I am not annoyed," Tunde says.',
      ),
    ).toEqual(['irritating', 'dislike', 'too sharply']);
    expect(seriesFrictionMarkers('You laugh, surprised, and say yes.')).toEqual(
      [],
    );
    const calm = { body: 'You walk with Clodagh to the pier.' };
    const sharp = { body: 'Fiona annoys you more than she should.' };
    expect(seriesFrictionRun([sharp, calm, sharp, sharp])).toBe(2);
    expect(seriesFrictionRun([sharp, calm])).toBe(0);
  });
  it('drops interface labels and words that also occur in lowercase', () => {
    const names = seriesNameCandidates(
      'You click "Cancel" and then "Delete". Orla laughs. You should go, and you fold the page while Orla Kavanagh waits. "Should we?" asks Declan.',
    );
    expect(names).toEqual(['Orla Kavanagh', 'Declan']);
  });
  it('extracts closing sentences and person-like names deterministically', () => {
    expect(seriesClosingSentence(v7Like(1))).toBe(
      'She turned back to her screen, and you looked at the sheet for a long moment.',
    );
    const names = seriesNameCandidates(v7Like(1));
    expect(names).toContain('Niamh Byrne');
    expect(names).not.toContain('Neither');
    expect(names).not.toContain('Tuesday');
  });
  it('builds a bounded ledger with private-life presence and goal activity', () => {
    const sister = id(1),
      flatmate = id(2),
      goal = id(3);
    const periods = [1, 2, 3, 4].map((n) => ({
      periodId: id(100 + n),
      body: v7Like(n),
      events: [
        {
          actorIds: n === 1 ? [flatmate] : [],
          changes:
            n === 2
              ? [
                  {
                    type: 'goal_progress_set',
                    value: { goalId: goal, status: 'active', note: null },
                  },
                ]
              : [],
        },
      ],
    }));
    const ledger = fictionSeriesLedgerSchema.parse(
      fictionSeriesLedgerFrom(periods, {
        actors: [
          { id: id(9), relationship: 'colleague' },
          { id: sister, relationship: 'family' },
          { id: flatmate, relationship: 'friend' },
        ],
        goals: [{ goalId: goal }],
      }),
    );
    expect(ledger.ownedChapters).toBe(4);
    expect(ledger.privateLife).toEqual([
      {
        actorId: sister,
        relationship: 'family',
        chaptersPresent: 0,
        chaptersSinceLast: null,
      },
      {
        actorId: flatmate,
        relationship: 'friend',
        chaptersPresent: 1,
        chaptersSinceLast: 3,
      },
    ]);
    expect(ledger.goalActivity).toEqual([
      { goalId: goal, chaptersSinceProgressChange: 2 },
    ]);
    expect(ledger.recentClosings).toHaveLength(4);
    expect(ledger.repeatedOpenings[0]!.text).toBe('neither of you');
  });
});

describe('per-life casting palette', () => {
  const base = { country: 'IE', locale: 'en', usedLabels: [] as string[] };
  it('is stable for one life and differs between lives', () => {
    const a = fictionCastingProjection({ ...base, lifeId: id(1) })!;
    expect(fictionCastingProjection({ ...base, lifeId: id(1) })).toEqual(a);
    expect(a.givenNames).toHaveLength(10);
    expect(a.familyNames).toHaveLength(8);
    const palettes = [2, 3, 4, 5, 6].map(
      (n) => fictionCastingProjection({ ...base, lifeId: id(n) })!.givenNames,
    );
    expect(new Set(palettes.map((p) => p.join())).size).toBe(5);
  });
  it('never suggests a name token already carried by a person in this life', () => {
    const p = fictionCastingProjection({
      ...base,
      lifeId: id(1),
      usedLabels: ['Fictional older sister Gráinne', 'Liam Nolan'],
    })!;
    for (const name of ['Gráinne', 'Liam'])
      expect(p.givenNames).not.toContain(name);
    expect(p.familyNames).not.toContain('Nolan');
  });
  it('leaves out habitual defaults and stays null without a pool', () => {
    const all = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((n) => {
      const p = fictionCastingProjection({ ...base, lifeId: id(n) })!;
      return [...p.givenNames, ...p.familyNames];
    });
    for (const habit of [
      'Niamh',
      'Byrne',
      'Kavanagh',
      'Doyle',
      'Orla',
      'Maeve',
    ])
      expect(all).not.toContain(habit);
    expect(
      fictionCastingProjection({
        lifeId: id(1),
        country: 'JP',
        locale: 'en',
        usedLabels: [],
      }),
    ).toBeNull();
    expect(
      fictionCastingProjection({
        lifeId: id(1),
        country: null,
        locale: 'hu',
        usedLabels: [],
      })!.familyNames.length,
    ).toBe(8);
  });
});

describe('quality2.7 context and requests', () => {
  const ledger = fictionSeriesLedgerSchema.parse(
    fictionSeriesLedgerFrom(
      [1, 2, 3].map((n) => ({
        periodId: id(200 + n),
        body: v7Like(n),
        events: [],
      })),
      { actors: [], goals: [] },
    ),
  );
  it('accepts a series ledger only under quality2.7 and never when withheld', () => {
    const v8 = fixtureFor(fictionV8Policy()).input.narrativeContext!;
    const v7 = fixtureFor(fictionV7Policy()).input.narrativeContext!;
    expect(
      fictionContextSchema.safeParse({ ...v8, seriesLedger: ledger }).success,
    ).toBe(true);
    expect(
      fictionContextSchema.safeParse({ ...v7, seriesLedger: ledger }).success,
    ).toBe(false);
    const oversized = {
      ...ledger,
      recentClosings: Array.from({ length: 6 }, (_, i) => ({
        periodId: id(300 + i),
        sentence: 'x'.repeat(200),
      })),
      repeatedPhrases: Array.from({ length: 6 }, () => ({
        text: 'y'.repeat(80),
        count: 3,
        chapters: 2,
      })),
      repeatedOpenings: Array.from({ length: 6 }, () => ({
        text: 'z'.repeat(80),
        count: 3,
        chapters: 2,
      })),
      privateLife: Array.from({ length: 12 }, (_, i) => ({
        actorId: id(400 + i),
        relationship: 'friend',
        chaptersPresent: 0,
        chaptersSinceLast: null,
      })),
    };
    expect(fictionSeriesLedgerSchema.safeParse(oversized).success).toBe(false);
  });
  it('adds the casting palette and echo findings only to v8 requests', () => {
    const v8 = fixtureFor(fictionV8Policy(), ledger);
    const v7 = fixtureFor(fictionV7Policy());
    expect('castingProjection' in fictionPlannerRequest(v8.input)).toBe(true);
    expect('castingProjection' in fictionPlannerRequest(v7.input)).toBe(false);
    const authored = {
      ...v8.authored,
      chapter: {
        ...v8.authored.chapter,
        body: `${v7Like(4)}\n\n${'You walked home along the canal, counting the barges. '.repeat(6)}`,
      },
    };
    const editor = fictionEditorialRequest(v8.input, authored) as {
      seriesEchoFindings?: { text: string; occurrences: number }[];
    };
    expect(
      editor.seriesEchoFindings?.find((f) => f.text === 'neither of you')
        ?.occurrences,
    ).toBe(2);
    expect(
      'seriesEchoFindings' in fictionEditorialRequest(v7.input, v7.authored),
    ).toBe(false);
  });
});

describe('offline series audit over stored runs', () => {
  const sample = (
    fixtureId: string,
    i: number,
    body: string,
    kind = 'full',
  ) => ({
    fixtureId,
    mode: 'narrative-fiction-v2',
    kind,
    periodIndex: i,
    chapter: { title: `T${i}`, body },
    errorCode: null,
  });
  const runs = [
    {
      label: 'v7-long',
      samples: [
        ...[0, 1, 2, 3].map((i) => sample('career-transition', i, v7Like(i))),
        sample('career-transition', 4, 'rejected', 'full'),
        {
          ...sample('career-transition', 5, v7Like(5)),
          errorCode: 'NARRATIVE_QUALITY_FAILED',
        },
      ].filter((s) => s.chapter.body !== 'rejected'),
    },
    {
      label: 'v7-smoke',
      samples: [0, 1, 2].map((i) => sample('career-transition', i, v7Like(i))),
    },
  ];
  it('skips rejected samples and audits each accepted sequence', () => {
    const sequences = auditSequences(runs);
    expect(sequences.map((s) => [s.id, s.chapters.length])).toEqual([
      ['v7-long/career-transition', 4],
      ['v7-smoke/career-transition', 3],
    ]);
    const audit = auditSequence(sequences[0]!);
    expect(audit.repeatedOpenings[0]!.text).toBe('neither of you');
    // Chapters 3 and 4 reuse the tic after it already recurred.
    expect(audit.chaptersFlaggedByEcho).toBeGreaterThanOrEqual(2);
    expect(audit.names[0]).toEqual({ name: 'Niamh Byrne', chapters: 4 });
    expect(
      audit.privateLife.find((p) => p.label.includes('sister'))!.chaptersByRole,
    ).toBe(0);
  });
  it('detects cross-run name and phrase convergence', () => {
    const cross = auditCrossRun(auditSequences(runs));
    expect(cross.sharedFullNames[0]).toEqual({
      text: 'Niamh Byrne',
      sequences: ['v7-long/career-transition', 'v7-smoke/career-transition'],
    });
    expect(cross.sharedRecurringPhrases.length).toBeGreaterThan(0);
    expect(cross.sameProfileOverlap.length).toBe(3);
    expect(narrativeSeriesAudit(runs).version).toBe('1.0.0');
  });
});

describe('local Codex development transport', () => {
  it('never hands an API key or ledger credential to the Codex child', () => {
    const env = codexChildEnv({
      PATH: '/usr/bin',
      HOME: '/home/x',
      OPENAI_API_KEY: 'secret',
      OPENAI_PROJECT: 'p',
      CODEX_API_KEY: 'secret',
      NARRATIVE_EVAL_API_KEY: 'secret',
      NARRATIVE_EVAL_PROJECT_ID: 'p',
    });
    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/home/x' });
  });
  it('passes the exact system prompt, request and strict schema to codex exec', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fake-codex-'));
    const bin = join(dir, 'codex');
    writeFileSync(
      bin,
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const out = args[args.indexOf('--output-last-message') + 1];
const schema = fs.readFileSync(args[args.indexOf('--output-schema') + 1], 'utf8');
const stdin = fs.readFileSync(0, 'utf8');
fs.writeFileSync(out, JSON.stringify({ args, schema: JSON.parse(schema), stdin, cwd: process.cwd(), key: process.env.OPENAI_API_KEY ?? null }));
`,
    );
    chmodSync(bin, 0o755);
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'must-not-leak';
    try {
      const respond = codexLocalResponder({
        bin,
        model: 'gpt-6.1-sol',
      });
      const result = (await respond({
        caseId: 'c',
        task: 'life_narrative_editor',
        model: 'gpt-6.1-sol',
        ordinal: 0,
        timeoutMs: 20000,
        parameters: {
          model: 'gpt-6.1-sol',
          max_output_tokens: 6500,
          input: [
            { role: 'system', content: 'SYSTEM TEXT' },
            { role: 'user', content: '{"a":1}' },
          ],
          text: {
            format: { name: 'x', schema: { type: 'object' } } as never,
          },
        },
        job: {} as never,
        defaultOutput: () => null,
      })) as {
        args: string[];
        schema: unknown;
        stdin: string;
        cwd: string;
        key: string | null;
      };
      expect(result.key).toBeNull();
      expect(result.schema).toEqual({ type: 'object' });
      expect(result.stdin).toContain('SYSTEM TEXT');
      expect(result.stdin).toContain('{"a":1}');
      expect(result.args).toEqual(
        expect.arrayContaining([
          'exec',
          '--ephemeral',
          '--ignore-user-config',
          '--ignore-rules',
          '--sandbox',
          'read-only',
          '--model',
          'gpt-6.1-sol',
          'model_reasoning_effort="medium"',
        ]),
      );
      expect(result.cwd).toContain('alterward-codex-');
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('runs end to end into an empty output directory and labels it afterwards', async () => {
    const out = mkdtempSync(join(tmpdir(), 'codex-run-'));
    rmSync(out, { recursive: true, force: true });
    try {
      await evaluateNarrativeWithCodex(
        [
          '--creative-only',
          '--fixtures',
          'career-transition',
          '--periods',
          '1',
          '--out',
          out,
        ],
        {},
        ({ defaultOutput }) => defaultOutput(),
      );
      const marker = JSON.parse(
        readFileSync(join(out, 'codex-local.json'), 'utf8'),
      );
      expect(marker).toMatchObject({
        transport: 'codex-local',
        reasoningEffort: 'medium',
        ignoreUserConfig: true,
        ignoreRules: true,
        comparableWithPaid: false,
      });
      expect(existsSync(join(out, 'report.json'))).toBe(true);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60000);
  it('refuses paid options', async () => {
    await expect(
      evaluateNarrativeWithCodex(['--mode', 'paid'], {}),
    ).rejects.toThrow();
    await expect(
      evaluateNarrativeWithCodex(['--allow-paid', '--creative-only'], {}),
    ).rejects.toThrow();
  });
});

describe('v8 cast changes: up to three new actors and invented departures', () => {
  const add = (n: number) => ({
    type: 'actor_add' as const,
    value: {
      id: id(900 + n),
      label: `Fictional tester ${n}`,
      relationship: 'other' as const,
    },
  });
  it('accepts three new recurring actors under v8 and rejects a fourth or a second under v3', () => {
    const f = fixtureFor(fictionV8Policy());
    f.authored.candidate.events[0]!.changes.push(add(1), add(2), add(3));
    expect(() => validateFictionAuthor(f.input, f.authored)).not.toThrow();
    const g = fixtureFor(fictionV8Policy());
    g.authored.candidate.events[0]!.changes.push(
      add(1),
      add(2),
      add(3),
      add(4),
    );
    expect(() => validateFictionAuthor(g.input, g.authored)).toThrow(
      'At most 3 new recurring actors',
    );
    const h = fictionFixture();
    h.authored.candidate.events[0]!.changes.push(add(1), add(2));
    expect(() => validateFictionAuthor(h.input, h.authored)).toThrow(
      'Only one new recurring actor',
    );
  });
  it('lets an invented actor leave, but never a supplied person', () => {
    const f = fixtureFor(fictionV8Policy());
    const events = f.authored.candidate.events;
    expect(events.length).toBeGreaterThan(1);
    events[0]!.changes.push(add(1));
    events[1]!.changes.push({ type: 'actor_remove', actorId: id(901) });
    events[1]!.actorIds = [id(901)];
    expect(() => validateFictionAuthor(f.input, f.authored)).not.toThrow();
    const supplied = {
      id: id(950),
      label: 'Fictional older sister',
      relationship: 'family' as const,
    };
    const g = fixtureFor(fictionV8Policy());
    g.input.state.actors.push(supplied);
    g.authored.candidate.events[1]!.changes.push({
      type: 'actor_remove',
      actorId: supplied.id,
    });
    expect(() => validateFictionAuthor(g.input, g.authored)).toThrow(
      'Only an invented fictional actor may leave',
    );
    const v7 = fixtureFor(fictionV7Policy());
    v7.authored.candidate.events[0]!.changes.push(add(1));
    v7.authored.candidate.events[1]!.changes.push({
      type: 'actor_remove',
      actorId: id(901),
    });
    expect(() => validateFictionAuthor(v7.input, v7.authored)).toThrow(
      'Only an invented fictional actor may leave',
    );
  });
});
