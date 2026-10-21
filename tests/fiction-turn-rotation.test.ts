import { describe, expect, it } from 'vitest';
import {
  FICTION_ROTATING_TURN_TYPES,
  FICTION_SERIES_LEDGER_BYTES,
  FICTION_SERIES_LEDGER_V11_BYTES,
  FICTION_TURN_TYPES,
  fictionSeriesLedgerSchema,
  fictionSeriesLedgerV11Schema,
  fictionV8Policy,
  fictionV9Policy,
  fictionSequenceSignatureSchema,
} from '@future-flow/contracts';
import {
  fictionRecurringCastCandidates,
  fictionRestingTurns,
  fictionSeriesLedgerFrom,
  fictionSeriesLedgerV11From,
  fictionTurnQueue,
  type SeriesLedgerPeriod,
} from '@future-flow/core';
import {
  FICTION_LIVING_ENDING_CHARS,
  FICTION_LIVING_OPENING_CHARS,
  boundFictionContext,
} from '@future-flow/database';
import { fictionPrompts } from '../packages/ai/src/fiction-prompts';
import { rotatingChoice } from '../scripts/lib/narrative-evaluation-runner';
import { parseEvaluationOptions } from '../scripts/lib/narrative-evaluation-options';
import {
  TURN_SIGNATURE_TABLE,
  turnDiagnostics,
  turnSummary,
} from '../scripts/lib/narrative-turn-diagnostics';
import { fictionFixture } from './fiction-fixtures';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BRANCH = id(1);
const rotating = FICTION_ROTATING_TURN_TYPES;

describe('the turn catalogue and its rotation order', () => {
  it('has eleven values, ten of which rotate (other never counts)', () => {
    expect(FICTION_TURN_TYPES).toHaveLength(11);
    expect(rotating).toHaveLength(10);
    expect(rotating).not.toContain('other');
    for (const type of FICTION_TURN_TYPES)
      expect(type).toMatch(/^[a-z]+(?:_[a-z]+)*$/);
  });

  it('is a permutation of the catalogue, also for an empty story', () => {
    const queue = fictionTurnQueue([], BRANCH);
    expect([...queue].sort()).toEqual([...rotating].sort());
    expect(fictionRestingTurns([])).toEqual([]);
  });

  it('is reproducible, and the tie order depends on the branch only among equals', () => {
    expect(fictionTurnQueue([], BRANCH)).toEqual(fictionTurnQueue([], BRANCH));
    const a = fictionTurnQueue(['quiet_persistence'], 'branch-a'),
      b = fictionTurnQueue(['quiet_persistence'], 'branch-b');
    // The used type is last in both; the nine never-used ones are tied, and a
    // different branch breaks the tie differently.
    expect(a.at(-1)).toBe('quiet_persistence');
    expect(b.at(-1)).toBe('quiet_persistence');
    expect(a).not.toEqual(b);
    expect([...a].sort()).toEqual([...b].sort());
    // The head is not the fixed catalogue order.
    expect(a.slice(0, 9)).not.toEqual(
      rotating.slice(0, 9).filter((t) => t !== 'quiet_persistence'),
    );
  });

  it('puts the least recently used first and a just used type last', () => {
    const history = [...rotating];
    // Every type has been used once, in catalogue order.
    expect(fictionTurnQueue(history, BRANCH)).toEqual(history);
    // Using the first one again moves it to the back.
    const again = fictionTurnQueue([...history, history[0]!], BRANCH);
    expect(again).toEqual([...history.slice(1), history[0]!]);
  });

  it('ignores unlabelled, other and unknown values', () => {
    const noise = [null, undefined, 'other', 'not_in_the_catalogue'];
    expect(fictionTurnQueue(noise, BRANCH)).toEqual(
      fictionTurnQueue([], BRANCH),
    );
    expect(fictionRestingTurns(noise)).toEqual([]);
  });

  it('rests the types of the last two labelled chapters, the latest first', () => {
    expect(fictionRestingTurns(['quiet_persistence'])).toEqual([
      'quiet_persistence',
    ]);
    expect(
      fictionRestingTurns(['quiet_persistence', 'old_matter_returns']),
    ).toEqual(['old_matter_returns', 'quiet_persistence']);
    // Two in a row of the same type rest one type.
    expect(
      fictionRestingTurns([
        'success_with_price',
        'quiet_persistence',
        'quiet_persistence',
      ]),
    ).toEqual(['quiet_persistence']);
    // Unlabelled chapters in between do not count as one of the last two.
    expect(
      fictionRestingTurns(['relationship_shift', null, 'quiet_persistence']),
    ).toEqual(['quiet_persistence', 'relationship_shift']);
    // The resting types are at the back of the queue.
    const turns = ['success_with_price', 'quiet_persistence'];
    expect(fictionTurnQueue(turns, BRANCH).slice(-2)).toEqual(turns);
  });
});

const periodsOf = (
  n: number,
  present: (index: number) => string[] = () => [],
): SeriesLedgerPeriod[] =>
  Array.from({ length: n }, (_, i) => ({
    periodId: id(100 + i),
    body: `Chapter ${i + 1} ends on its own plain sentence number ${i + 1}.`,
    events: [{ actorIds: present(i), changes: [] }],
  }));
const state = { actors: [], goals: [] };
const UNA = id(11);

describe('series ledger 1.1.0', () => {
  it('counts the absence of a returning person with an open matter (1, 2, 3 chapters)', () => {
    for (const absent of [1, 2, 3]) {
      const ledger = fictionSeriesLedgerV11From(
        periodsOf(1 + absent, (i) => (i === 0 ? [UNA] : [])),
        state,
        {
          branchId: BRANCH,
          cast: [{ actorId: UNA, openMatter: true }],
          turns: [],
        },
      );
      expect(ledger.recurringCast).toEqual([
        {
          actorId: UNA,
          chaptersPresent: 1,
          chaptersSinceLast: absent,
          openMatter: true,
        },
      ]);
    }
  });

  it('orders the cast by open matter, then longest absence, and keeps six', () => {
    const cast = Array.from({ length: 8 }, (_, i) => ({
      actorId: id(20 + i),
      openMatter: i % 2 === 0,
    }));
    const ledger = fictionSeriesLedgerV11From(
      periodsOf(5, (i) => (i === 4 ? [id(26)] : i === 1 ? [id(20)] : [])),
      state,
      { branchId: BRANCH, cast, turns: [] },
    );
    expect(ledger.recurringCast).toHaveLength(6);
    const open = ledger.recurringCast.map((c) => c.openMatter);
    expect(open).toEqual([...open].sort((a, b) => Number(b) - Number(a)));
    // Never seen sorts after a seen person of the same openness.
    const [first] = ledger.recurringCast;
    expect(first!.openMatter).toBe(true);
    expect(
      ledger.recurringCast.find((c) => c.actorId === id(20))!.chaptersSinceLast,
    ).toBe(3);
  });

  it('keeps the 1.0.0 fields of the v8 builder and changes nothing in it', () => {
    const periods = periodsOf(4);
    const old = fictionSeriesLedgerFrom(periods, state);
    const { version: _v, ...fields } = old;
    const next = fictionSeriesLedgerV11From(periods, state, {
      branchId: BRANCH,
      cast: [],
      turns: [],
    });
    expect(next.version).toBe('1.1.0');
    for (const [key, value] of Object.entries(fields))
      expect((next as Record<string, unknown>)[key]).toEqual(value);
    expect(old.version).toBe('1.0.0');
    expect(old).not.toHaveProperty('turnQueue');
  });

  it('records the labels of the last six chapters and reads an unknown value as none', () => {
    const turns = [
      'quiet_persistence',
      'bogus_value',
      'old_matter_returns',
      null,
      'success_with_price',
      'relationship_shift',
      'event_from_outside',
    ];
    const ledger = fictionSeriesLedgerV11From(periodsOf(7), state, {
      branchId: BRANCH,
      cast: [],
      turns,
    });
    expect(ledger.recentTurns).toEqual([
      null,
      'old_matter_returns',
      null,
      'success_with_price',
      'relationship_shift',
      'event_from_outside',
    ]);
    expect(ledger.restingTurns).toEqual([
      'event_from_outside',
      'relationship_shift',
    ]);
    expect(fictionSeriesLedgerV11Schema.safeParse(ledger).success).toBe(true);
  });

  it('moves a just labelled chapter to the back and to the head of the resting types', () => {
    const before = fictionSeriesLedgerV11From(periodsOf(2), state, {
      branchId: BRANCH,
      cast: [],
      turns: ['quiet_persistence', 'success_with_price'],
    });
    const after = fictionSeriesLedgerV11From(periodsOf(3), state, {
      branchId: BRANCH,
      cast: [],
      turns: ['quiet_persistence', 'success_with_price', 'old_matter_returns'],
    });
    expect(before.turnQueue.at(-1)).toBe('success_with_price');
    expect(after.turnQueue.at(-1)).toBe('old_matter_returns');
    expect(after.restingTurns[0]).toBe('old_matter_returns');
  });

  it('refuses a queue with a duplicate or an invented type, and a ledger over 4 KiB', () => {
    const ok = fictionSeriesLedgerV11From(periodsOf(2), state, {
      branchId: BRANCH,
      cast: [],
      turns: [],
    });
    expect(
      fictionSeriesLedgerV11Schema.safeParse({
        ...ok,
        turnQueue: ['quiet_persistence', 'quiet_persistence'],
      }).success,
    ).toBe(false);
    expect(
      fictionSeriesLedgerV11Schema.safeParse({
        ...ok,
        turnQueue: ['other'],
      }).success,
    ).toBe(false);
    expect(
      fictionSeriesLedgerV11Schema.safeParse({
        ...ok,
        repeatedPhrases: Array.from({ length: 6 }, (_, i) => ({
          text: 'p'.repeat(80) + i,
          count: 99999,
          chapters: 999,
        })),
        recentClosings: Array.from({ length: 6 }, (_, i) => ({
          periodId: id(i),
          sentence: 's'.repeat(200),
        })),
        privateLife: Array.from({ length: 12 }, (_, i) => ({
          actorId: id(i),
          relationship: 'friend',
          chaptersPresent: 1000,
          chaptersSinceLast: 1000,
        })),
        repeatedOpenings: Array.from({ length: 6 }, (_, i) => ({
          text: 'o'.repeat(79) + i,
          count: 99999,
          chapters: 999,
        })),
        recurringCast: Array.from({ length: 6 }, (_, i) => ({
          actorId: id(i),
          chaptersPresent: 1000,
          chaptersSinceLast: 1000,
          openMatter: false,
        })),
        recentTurns: Array(6).fill('protagonist_refuses_or_withdraws'),
        turnQueue: [...rotating],
      }).success,
    ).toBe(false);
  });

  it('stays within 4 KiB in the worst case by dropping evidence in a fixed order, the v8 3 KiB bound untouched', () => {
    // Six long closings and openings, twelve friends, five goals, six returning
    // people, six labels: the ledger a long, crowded story would carry.
    const longPeriods: SeriesLedgerPeriod[] = Array.from(
      { length: 7 },
      (_, i) => ({
        periodId: id(400 + i),
        body: [
          ...Array.from(
            { length: 6 },
            (_, k) =>
              `Alpha${k} beta${k} gamma${k} delta${k} epsilon${k} zeta${k} eta${k} theta${k}.`,
          ),
          'Z'.repeat(190) + ' ends the chapter.',
        ].join('\n\n'),
        events: [{ actorIds: [], changes: [] }],
      }),
    );
    const wide = {
      actors: Array.from({ length: 12 }, (_, i) => ({
        id: id(500 + i),
        relationship: 'friend',
      })),
      goals: Array.from({ length: 5 }, (_, i) => ({ goalId: id(600 + i) })),
    };
    const ledger = fictionSeriesLedgerV11From(longPeriods, wide, {
      branchId: BRANCH,
      cast: Array.from({ length: 8 }, (_, i) => ({
        actorId: id(700 + i),
        openMatter: true,
      })),
      turns: rotating.slice(0, 7),
    });
    expect(
      new TextEncoder().encode(JSON.stringify(ledger)).length,
    ).toBeLessThanOrEqual(FICTION_SERIES_LEDGER_V11_BYTES);
    expect(fictionSeriesLedgerV11Schema.safeParse(ledger).success).toBe(true);
    // Evidence went in the fixed order: the recent turns and the cast first.
    expect(ledger.recentTurns).toEqual([]);
    expect(ledger.recurringCast).toEqual([]);
    // The queue and the resting turns are what the rotation needs.
    expect(ledger.turnQueue).toHaveLength(10);
    expect(ledger.restingTurns).toHaveLength(2);
    // The v8 builder and bound are unchanged: 1.0.0 still has its 3 KiB.
    expect(FICTION_SERIES_LEDGER_BYTES).toBe(3 * 1024);
    expect(FICTION_SERIES_LEDGER_V11_BYTES).toBe(4 * 1024);
    const v10 = fictionSeriesLedgerFrom(longPeriods, wide);
    expect(fictionSeriesLedgerSchema.safeParse(v10).success).toBe(
      new TextEncoder().encode(JSON.stringify(v10)).length <=
        FICTION_SERIES_LEDGER_BYTES,
    );
  });

  it('drops nothing while the ledger fits', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      actorId: id(800 + i),
      openMatter: i < 6,
    }));
    const ledger = fictionSeriesLedgerV11From(periodsOf(6), state, {
      branchId: BRANCH,
      cast: many,
      turns: rotating.slice(0, 6),
    });
    expect(ledger.recurringCast).toHaveLength(6);
    expect(ledger.recentTurns).toHaveLength(6);
  });
});

describe('the v9 planner prompt', () => {
  const v8 = fictionPrompts('en', fictionV8Policy().promptVersions);
  const v9 = fictionPrompts('en', fictionV9Policy().promptVersions);
  const count = (text: string, part: string) => text.split(part).length - 1;

  it('names every catalogue value exactly once, and other as the fallback', () => {
    for (const type of rotating) expect(count(v9.planner, type)).toBe(1);
    expect(v9.planner).toContain('or other, or null');
    expect(count(v9.planner, 'TURN-TYPE CRAFT')).toBe(1);
    const start = v9.planner.indexOf('\nTURN-TYPE CRAFT');
    const end = v9.planner.indexOf('\n', start + 1);
    expect(end - start).toBeLessThanOrEqual(1946);
    expect(v9.planner).toContain('seriesLedger.turnQueue');
    expect(v9.planner).toContain('seriesLedger.restingTurns');
    expect(v9.planner).toContain('neither a quota nor a schedule');
  });

  it('carries the returning-cast rule after the series-ledger rule', () => {
    expect(count(v9.planner, 'RETURNING-CAST CRAFT')).toBe(1);
    expect(v9.planner.indexOf('RETURNING-CAST CRAFT')).toBeGreaterThan(
      v9.planner.indexOf('SERIES-LEDGER CRAFT'),
    );
    expect(v9.planner).toContain('seriesLedger.recurringCast');
    expect(v8.planner).not.toContain('RETURNING-CAST');
  });

  it('opens from what people already do, and no longer prescribes the attempt skeleton', () => {
    expect(v9.planner).toContain(
      'Start from what this protagonist wants and from what the other people in the story are already doing; let their paths cross, and allow',
    );
    expect(v9.planner).not.toContain('let a specific attempt meet');
    expect(v8.planner).toContain('let a specific attempt meet');
  });

  it('drops the prose-side rules the planner cannot act on, and keeps them for author and editor', () => {
    for (const section of [
      'FRICTION-BEAT CRAFT',
      'ENDING-KIND CRAFT',
      'CLOSING-PASSAGE CRAFT',
      'PATTERN-SIGNAL CRAFT',
      'PROGRESSION-SOURCE CRAFT',
      'Vary sentence rhythm',
    ]) {
      expect(v9.planner).not.toContain(section);
      expect(v8.planner).toContain(section);
    }
    // Author text unchanged from v8 plus the v9 additions; review too.
    expect(v9.author.startsWith(v8.author)).toBe(true);
    expect(v9.author).toContain('FRICTION-BEAT CRAFT');
    expect(v9.author).toContain('PROGRESSION-SOURCE CRAFT');
    expect(v9.editor).toContain('SERIES EVIDENCE');
  });

  it('is shorter than the v8 planner even with the character rules and the new ones', () => {
    expect(v9.planner.length).toBeLessThan(v8.planner.length);
  });

  it('keeps the v8 and earlier planner text out of reach of the replacements', () => {
    expect(fictionPrompts('en')).toEqual(v8);
    expect(v8.planner).toContain('PROGRESSION-SOURCE CRAFT');
    expect(v8.planner).not.toContain('TURN-TYPE CRAFT');
  });
});

describe('living-world context bound (A1)', () => {
  const base = () => fictionFixture().input.narrativeContext!;
  const memory = (summaries: number) => {
    const m = structuredClone(base().memory);
    m.history = Array.from({ length: summaries }, (_, i) => ({
      periodId: id(900 + i),
      startDate: `2025-0${i + 1}-01`,
      endDate: `2025-0${i + 1}-28`,
      position: i + 1,
      summary: `Summary ${i + 1}: `.padEnd(480, 's'),
      salientEventIds: [],
      excerpt: 'e'.repeat(1100),
    }));
    return m;
  };
  const sequence = () =>
    [1, 2, 3].map((n) => ({
      periodId: id(950 + n),
      scenes: [`${'a'.repeat(80)} | ${'b'.repeat(80)} | ${'c'.repeat(80)}`],
      opening: 'o'.repeat(400),
      ending: 'e'.repeat(500),
    }));
  const projection = () =>
    fictionFixture().input.narrativeContext?.characterProjection ??
    ({ version: '1.0.0', actors: [], omittedActors: 0 } as never);
  const size = (c: ReturnType<typeof boundFictionContext>) =>
    Buffer.byteLength(
      JSON.stringify({
        memory: c.memory,
        storyFacts: c.storyFacts,
        sequenceHistory: c.sequenceHistory,
        sequenceSignatureHistory: c.sequenceSignatureHistory,
      }),
    );

  it('cuts the raw sequence text and keeps the last three summaries', () => {
    const bound = boundFictionContext(
      memory(8),
      [],
      sequence(),
      [],
      undefined,
      {
        version: '1.0.0',
        actors: [],
        omittedActors: 0,
      } as never,
    );
    expect(size(bound)).toBeLessThanOrEqual(12 * 1024);
    for (const entry of bound.sequenceHistory ?? []) {
      expect(entry.opening.length).toBeLessThanOrEqual(
        FICTION_LIVING_OPENING_CHARS,
      );
      expect(entry.ending.length).toBeLessThanOrEqual(
        FICTION_LIVING_ENDING_CHARS,
      );
    }
    const kept = bound.memory.history.map((h) => h.periodId);
    expect(kept.length).toBeGreaterThanOrEqual(3);
    expect(kept.slice(-3)).toEqual([id(905), id(906), id(907)]);
  });

  it('leaves the v8 bound exactly as it was: full sequence text, one protected summary', () => {
    const v8 = boundFictionContext(memory(8), [], sequence(), []);
    expect(size(v8)).toBeLessThanOrEqual(12 * 1024);
    // v8 keeps its 400/500 character raw text when the sequence survives.
    for (const entry of v8.sequenceHistory ?? []) {
      expect(entry.opening.length).toBeLessThanOrEqual(400);
    }
    const v9 = boundFictionContext(memory(8), [], sequence(), [], undefined, {
      version: '1.0.0',
      actors: [],
      omittedActors: 0,
    } as never);
    expect(v9.memory.history.length).toBeGreaterThanOrEqual(
      v8.memory.history.length,
    );
    void projection;
  });

  it('never drops a summary for sequence text that could be cut instead', () => {
    const v9 = boundFictionContext(memory(8), [], sequence(), [], undefined, {
      version: '1.0.0',
      actors: [],
      omittedActors: 0,
    } as never);
    expect(v9.sequenceHistory!.length).toBeGreaterThanOrEqual(1);
    expect(v9.memory.history.at(-1)!.periodId).toBe(id(907));
  });
});

describe('turn diagnostics', () => {
  it('maps every labelled type to valid signature values', () => {
    const shape = fictionSequenceSignatureSchema.shape;
    const valid: Record<string, readonly string[]> = {
      dramaticEngine: shape.dramaticEngine.options,
      turningPointDriver: shape.turningPointDriver.options,
      resolutionMode: shape.resolutionMode.options,
      protagonistResponse: shape.protagonistResponse.options,
    };
    expect(Object.keys(TURN_SIGNATURE_TABLE).sort()).toEqual(
      [...rotating].sort(),
    );
    for (const row of Object.values(TURN_SIGNATURE_TABLE)) {
      expect(Object.keys(row).length).toBeGreaterThan(0);
      for (const [field, values] of Object.entries(row))
        for (const value of values) expect(valid[field]).toContain(value);
    }
  });

  it('reads the label, its queue rank and whether it was a resting type', () => {
    const ledger = {
      turnQueue: [...rotating],
      restingTurns: ['relationship_shift', 'quiet_persistence'],
    };
    expect(
      turnDiagnostics({ turnType: rotating[2], ledger, signature: null }),
    ).toMatchObject({
      coverage: 'labelled',
      queueRank: 3,
      restingChosen: false,
      signatureConsistency: 'unchecked',
    });
    expect(
      turnDiagnostics({ turnType: 'relationship_shift', ledger }),
    ).toMatchObject({ restingChosen: true });
    expect(turnDiagnostics({ turnType: null, ledger }).coverage).toBe('null');
    expect(turnDiagnostics({ turnType: 'other', ledger })).toMatchObject({
      coverage: 'other',
      queueRank: null,
    });
    expect(turnDiagnostics({ turnType: undefined, ledger }).coverage).toBe(
      'absent',
    );
    // The first chapter has no ledger: no rank, no resting judgement.
    expect(
      turnDiagnostics({ turnType: rotating[0], ledger: undefined }),
    ).toMatchObject({ queueRank: null, restingChosen: null });
  });

  it('judges the label against the editor signature loosely and never as an error', () => {
    expect(
      turnDiagnostics({
        turnType: 'old_matter_returns',
        signature: {
          dramaticEngine: 'relationship_shift',
          turningPointDriver: 'npc',
        },
      }).signatureConsistency,
    ).toBe('consistent');
    expect(
      turnDiagnostics({
        turnType: 'old_matter_returns',
        signature: {
          dramaticEngine: 'material_experiment',
          turningPointDriver: 'environment',
          resolutionMode: 'partial_resolution',
          protagonistResponse: 'persist',
        },
      }).signatureConsistency,
    ).toBe('inconsistent');
    // Any one listed field is enough.
    expect(
      turnDiagnostics({
        turnType: 'quiet_persistence',
        signature: {
          dramaticEngine: 'external_opportunity',
          protagonistResponse: 'persist',
        },
      }).signatureConsistency,
    ).toBe('consistent');
    expect(
      turnDiagnostics({
        turnType: 'success_with_price',
        signature: { resolutionMode: 'consequence' },
      }).signatureConsistency,
    ).toBe('consistent');
  });

  it('summarises a run', () => {
    const turns = [
      turnDiagnostics({ turnType: undefined }),
      turnDiagnostics({
        turnType: 'quiet_persistence',
        ledger: {
          turnQueue: [...rotating],
          restingTurns: ['quiet_persistence'],
        },
      }),
      turnDiagnostics({ turnType: null }),
      null,
    ];
    expect(turnSummary(turns)).toMatchObject({
      chapters: 3,
      labelled: 1,
      null: 1,
      absent: 1,
      restingChosen: 1,
    });
  });
});

describe('the returning-cast filter', () => {
  const entry = (
    actorId: string,
    over: Record<string, unknown> = {},
  ): Parameters<typeof fictionRecurringCastCandidates>[0][number] => ({
    actorId,
    kind: 'fictional',
    removedAtPeriodId: null,
    profile: { label: 'x' },
    dynamic: { unresolvedMatter: 'An open matter.' },
    relationship: null,
    legacy: null,
    ...over,
  });
  it('offers a live fictional person and reads her open matter', () => {
    expect(
      fictionRecurringCastCandidates([
        entry(id(10)),
        entry(id(11), {
          dynamic: null,
          relationship: { unresolvedInteraction: null },
        }),
      ]),
    ).toEqual([
      { actorId: id(10), openMatter: true },
      { actorId: id(11), openMatter: false },
    ]);
  });
  it('never offers a supplied person, whatever relationship state she has', () => {
    expect(
      fictionRecurringCastCandidates([
        entry(id(12), {
          kind: 'supplied',
          profile: null,
          dynamic: null,
          relationship: { unresolvedInteraction: 'An unreturned message.' },
        }),
        // Even a (forbidden) profile on a supplied entry is not enough.
        entry(id(13), { kind: 'supplied' }),
      ]),
    ).toEqual([]);
  });
  it('never offers an archived fictional person, even one with state left on it', () => {
    expect(
      fictionRecurringCastCandidates([
        entry(id(14), { removedAtPeriodId: id(99) }),
      ]),
    ).toEqual([]);
  });
});
