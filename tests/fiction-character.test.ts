import { describe, it, expect } from 'vitest';
import {
  FICTION_CHARACTER_DELTA_ACTORS,
  FICTION_CHARACTER_DELTA_BYTES,
  FICTION_CHARACTER_PROJECTION_BYTES,
  FICTION_CHARACTER_VERSION,
  NARRATIVE_ARTIFACT_BYTES,
  fictionCharacterDeltaSchema,
  fictionCharacterDynamicStateSchema,
  fictionCharacterProfileSchema,
  fictionCharacterProjectionSchema,
  fictionRelationshipStateSchema,
  type FictionCharacterDelta,
  type FictionCharacterProfile,
} from '@future-flow/contracts';
import {
  applyFictionCharacterDelta,
  characterStateFromHistory,
  emptyFictionCharacterState,
  fictionCharacterProjection,
  fictionCharacterProjectionHash,
  fictionCharacterSeedFromLegacy,
  fictionCharacterStateHash,
  type FictionCharacterActors,
} from '@future-flow/core';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const P1 = id(901);
const P2 = id(902);
const P3 = id(903);
const P4 = id(904);
const NESSA = id(1);
const TUNDE = id(2);
const CLODAGH = id(3);
const SUPPLIED_FRIEND = id(50);
const origin = (actorId: string) =>
  id(Number.parseInt(actorId.slice(-4), 10) + 700);

const actors: FictionCharacterActors = {
  fictionalOrigins: new Map([NESSA, TUNDE, CLODAGH].map((a) => [a, origin(a)])),
  suppliedActorIds: new Set([SUPPLIED_FRIEND]),
};

const profile = (
  actorId: string,
  periodId: string,
  over: Partial<FictionCharacterProfile> = {},
): FictionCharacterProfile => ({
  actorId,
  originEventId: origin(actorId),
  socialRole: 'Friend who works shifts',
  coreWant: 'Wants easy, unplanned time with people she trusts.',
  independentConcern: 'Protecting her free weekends, already overcommitted.',
  conflictStyle: 'Avoids long discussion but turns blunt at a crossed line.',
  attentionStyle: 'Notices practical inconvenience before artistic intent.',
  valueCue: ['spontaneity'],
  voiceCue: 'Short, dry, jokes to deflect.',
  establishedAtPeriodId: periodId,
  ...over,
});
const dynamic = (
  actorId: string,
  periodId: string,
  aim = 'Keeping the weekend free.',
) => ({
  actorId,
  currentAim: aim,
  currentPressure: 'A double shift is coming up this month.',
  attentionOn: 'her own schedule',
  stanceTowardProtagonist: 'Still likes the protagonist, wary of art talk.',
  unresolvedMatter: 'Protagonist turns casual meetings into art reviews.',
  lastMeaningfulChangePeriodId: periodId,
  provenance: 'branch_fiction' as const,
});
const relationship = (actorId: string, over = {}) => ({
  actorId,
  currentDynamic: 'Warm friendship, but art feedback now dominates meetings.',
  expectation: 'Expects ordinary shared time, not another structured critique.',
  unresolvedInteraction: 'Protagonist over-explained a small disagreement.',
  provenance: 'interaction_derived' as const,
  ...over,
});
const delta = (
  over: Partial<FictionCharacterDelta> = {},
): FictionCharacterDelta => ({
  version: FICTION_CHARACTER_VERSION,
  addedProfiles: [],
  profileUpdates: [],
  dynamicUpdates: [],
  relationshipUpdates: [],
  removedActorIds: [],
  ...over,
});
const addNessa = (periodId = P1) =>
  delta({
    addedProfiles: [profile(NESSA, periodId)],
    dynamicUpdates: [dynamic(NESSA, periodId)],
    relationshipUpdates: [relationship(NESSA)],
  });
const reject = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
    return;
  }
  throw new Error('Expected a DomainError.');
};

describe('character contracts', () => {
  it('accepts the plan fields and nothing else (no numeric scales)', () => {
    expect(
      fictionCharacterProfileSchema.safeParse(profile(NESSA, P1)).success,
    ).toBe(true);
    expect(
      fictionCharacterProfileSchema.safeParse({
        ...profile(NESSA, P1),
        trust: 73,
      }).success,
    ).toBe(false);
    expect(
      fictionCharacterDynamicStateSchema.safeParse({
        ...dynamic(NESSA, P1),
        mood: 4,
      }).success,
    ).toBe(false);
    expect(
      fictionRelationshipStateSchema.safeParse({
        ...relationship(NESSA),
        affection: 82,
      }).success,
    ).toBe(false);
  });

  it('enforces length bounds, at most three value cues and the provenance set', () => {
    expect(
      fictionCharacterProfileSchema.safeParse(
        profile(NESSA, P1, { coreWant: 'short' }),
      ).success,
    ).toBe(false);
    expect(
      fictionCharacterProfileSchema.safeParse(
        profile(NESSA, P1, { valueCue: ['a b', 'c d', 'e f', 'g h'] }),
      ).success,
    ).toBe(false);
    expect(
      fictionCharacterProfileSchema.safeParse(
        profile(NESSA, P1, { valueCue: [] }),
      ).success,
    ).toBe(false);
    expect(
      fictionRelationshipStateSchema.safeParse(
        relationship(NESSA, { provenance: 'real_world_fact' }),
      ).success,
    ).toBe(false);
  });

  it('limits a delta to six actors, one entry per actor and kind', () => {
    const six = [1, 2, 3, 4, 5, 6].map((n) => id(100 + n));
    expect(
      fictionCharacterDeltaSchema.safeParse(
        delta({ relationshipUpdates: six.map((a) => relationship(a)) }),
      ).success,
    ).toBe(true);
    const seven = [...six, id(107)];
    expect(
      fictionCharacterDeltaSchema.safeParse(
        delta({ relationshipUpdates: seven.map((a) => relationship(a)) }),
      ).success,
    ).toBe(false);
    // Six per list is fine, but the union of touched actors is what counts.
    expect(
      fictionCharacterDeltaSchema.safeParse(
        delta({
          relationshipUpdates: six.map((a) => relationship(a)),
          removedActorIds: [id(107)],
        }),
      ).success,
    ).toBe(false);
    expect(
      fictionCharacterDeltaSchema.safeParse(
        delta({
          relationshipUpdates: [relationship(NESSA), relationship(NESSA)],
        }),
      ).success,
    ).toBe(false);
    expect(
      fictionCharacterDeltaSchema.safeParse(
        delta({ removedActorIds: [NESSA, NESSA] }),
      ).success,
    ).toBe(false);
  });

  it('bounds the delta by bytes: maximal fields fit two full actors, never the artifact', () => {
    const long = (n: number) => 'x'.repeat(n);
    const maxProfile = (a: string) =>
      profile(a, P1, {
        socialRole: long(120),
        coreWant: long(200),
        independentConcern: long(200),
        conflictStyle: long(200),
        attentionStyle: long(200),
        valueCue: [long(60), long(60), long(60)],
        voiceCue: long(120),
      });
    const maxDynamic = (a: string) => ({
      ...dynamic(a, P1),
      currentAim: long(200),
      currentPressure: long(200),
      attentionOn: long(160),
      stanceTowardProtagonist: long(200),
      unresolvedMatter: long(200),
    });
    const maxRelationship = (a: string) =>
      relationship(a, {
        currentDynamic: long(240),
        expectation: long(200),
        unresolvedInteraction: long(240),
      });
    const ids = [1, 2, 3, 4, 5, 6].map((n) => id(200 + n));
    const full = (n: number) =>
      delta({
        addedProfiles: ids.slice(0, n).map(maxProfile),
        dynamicUpdates: ids.slice(0, n).map(maxDynamic),
        relationshipUpdates: ids.slice(0, n).map(maxRelationship),
      });
    const size = (d: unknown) =>
      new TextEncoder().encode(JSON.stringify(d)).length;
    // Measured (UTF-8 bytes, maximal ASCII fields): profile 1517, dynamic
    // state 1215, relationship 829; one fully maximal actor is 3561 bytes.
    expect(size(full(2))).toBeLessThanOrEqual(FICTION_CHARACTER_DELTA_BYTES);
    expect(fictionCharacterDeltaSchema.safeParse(full(2)).success).toBe(true);
    // Three maximal actors exceed the cap: the schema fails closed, no trimming.
    expect(size(full(3))).toBeGreaterThan(FICTION_CHARACTER_DELTA_BYTES);
    expect(fictionCharacterDeltaSchema.safeParse(full(3)).success).toBe(false);
    // Six maximal relationship updates alone still fit (the six-actor cap case).
    const sixRelationships = delta({
      relationshipUpdates: ids.map(maxRelationship),
    });
    expect(size(sixRelationships)).toBeLessThanOrEqual(
      FICTION_CHARACTER_DELTA_BYTES,
    );
    expect(
      fictionCharacterDeltaSchema.safeParse(sixRelationships).success,
    ).toBe(true);
    // The delta share of the 32 KiB artifact stays at a quarter at most.
    expect(
      FICTION_CHARACTER_DELTA_BYTES / NARRATIVE_ARTIFACT_BYTES,
    ).toBeLessThanOrEqual(0.25);
    expect(FICTION_CHARACTER_DELTA_ACTORS).toBe(6);
  });
});

describe('character fold', () => {
  it('adds a profile, dynamic state and relationship from an empty history', () => {
    const state = characterStateFromHistory(
      [{ periodId: P1, delta: addNessa() }],
      actors,
    );
    expect(state.ownedPeriods).toBe(1);
    expect(state.actors).toHaveLength(1);
    expect(state.actors[0]).toMatchObject({
      actorId: NESSA,
      kind: 'fictional',
      touchedAtIndex: 0,
    });
    expect(state.actors[0]!.profile?.coreWant).toContain('unplanned');
  });

  it('treats an empty delta and a period without a delta as no-ops on the actors', () => {
    const base = characterStateFromHistory(
      [{ periodId: P1, delta: addNessa() }],
      actors,
    );
    const noop = characterStateFromHistory(
      [
        { periodId: P1, delta: addNessa() },
        { periodId: P2, delta: delta() },
        { periodId: P3, delta: null },
      ],
      actors,
    );
    expect(noop.actors).toEqual(base.actors);
    expect(noop.ownedPeriods).toBe(3);
  });

  it('updates dynamic state and relationship without touching other actors', () => {
    const history = [
      { periodId: P1, delta: addNessa() },
      {
        periodId: P2,
        delta: delta({
          addedProfiles: [profile(TUNDE, P2)],
          dynamicUpdates: [dynamic(TUNDE, P2, 'Finishing a long project.')],
        }),
      },
      {
        periodId: P3,
        delta: delta({
          dynamicUpdates: [dynamic(NESSA, P3, 'Planning a short trip away.')],
        }),
      },
    ];
    const state = characterStateFromHistory(history, actors);
    const nessa = state.actors.find((a) => a.actorId === NESSA)!;
    const tunde = state.actors.find((a) => a.actorId === TUNDE)!;
    expect(nessa.dynamic?.currentAim).toBe('Planning a short trip away.');
    expect(nessa.touchedAtIndex).toBe(2);
    expect(tunde.dynamic?.currentAim).toBe('Finishing a long project.');
    expect(tunde.touchedAtIndex).toBe(1);
    expect(state.actors.map((a) => a.actorId)).toEqual([NESSA, TUNDE]);
  });

  it('archives a removed actor and refuses later updates or re-adding', () => {
    const history = [
      { periodId: P1, delta: addNessa() },
      { periodId: P2, delta: delta({ removedActorIds: [NESSA] }) },
    ];
    const state = characterStateFromHistory(history, actors);
    expect(state.actors[0]!.removedAtPeriodId).toBe(P2);
    expect(state.actors[0]!.profile).not.toBeNull();
    reject(
      () =>
        applyFictionCharacterDelta(
          state,
          P3,
          delta({ dynamicUpdates: [dynamic(NESSA, P3)] }),
          actors,
        ),
      'FICTION_CHARACTER_INVALID',
    );
    reject(
      () =>
        applyFictionCharacterDelta(
          state,
          P3,
          delta({ addedProfiles: [profile(NESSA, P3)] }),
          actors,
        ),
      'FICTION_CHARACTER_INVALID',
    );
    reject(
      () =>
        applyFictionCharacterDelta(
          state,
          P3,
          delta({ removedActorIds: [NESSA] }),
          actors,
        ),
      'FICTION_CHARACTER_INVALID',
    );
  });

  it('rejects duplicate, missing, unknown and same-period update-and-remove actors', () => {
    const state = characterStateFromHistory(
      [{ periodId: P1, delta: addNessa() }],
      actors,
    );
    reject(
      () =>
        applyFictionCharacterDelta(
          state,
          P2,
          delta({ addedProfiles: [profile(NESSA, P2)] }),
          actors,
        ),
      'FICTION_CHARACTER_INVALID',
    );
    reject(
      () =>
        applyFictionCharacterDelta(
          state,
          P2,
          delta({ dynamicUpdates: [dynamic(TUNDE, P2)] }),
          actors,
        ),
      'FICTION_CHARACTER_INVALID',
    );
    reject(
      () =>
        applyFictionCharacterDelta(
          state,
          P2,
          delta({ removedActorIds: [TUNDE] }),
          actors,
        ),
      'FICTION_CHARACTER_INVALID',
    );
    reject(
      () =>
        applyFictionCharacterDelta(
          state,
          P2,
          delta({ relationshipUpdates: [relationship(id(999))] }),
          actors,
        ),
      'FICTION_CHARACTER_INVALID',
    );
    reject(
      () =>
        applyFictionCharacterDelta(
          state,
          P2,
          delta({
            dynamicUpdates: [dynamic(NESSA, P2)],
            removedActorIds: [NESSA],
          }),
          actors,
        ),
      'FICTION_CHARACTER_INVALID',
    );
  });

  it('validates the actor origin, establishment period and state provenance', () => {
    const empty = emptyFictionCharacterState();
    reject(
      () =>
        applyFictionCharacterDelta(
          empty,
          P1,
          delta({
            addedProfiles: [profile(NESSA, P1, { originEventId: id(5) })],
          }),
          actors,
        ),
      'FICTION_CHARACTER_INVALID',
    );
    reject(
      () =>
        applyFictionCharacterDelta(
          empty,
          P1,
          delta({ addedProfiles: [profile(NESSA, P2)] }),
          actors,
        ),
      'FICTION_CHARACTER_INVALID',
    );
    const state = characterStateFromHistory(
      [{ periodId: P1, delta: addNessa() }],
      actors,
    );
    reject(
      () =>
        applyFictionCharacterDelta(
          state,
          P2,
          delta({ dynamicUpdates: [dynamic(NESSA, P1)] }),
          actors,
        ),
      'FICTION_CHARACTER_INVALID',
    );
    reject(
      () =>
        applyFictionCharacterDelta(
          state,
          P2,
          delta({
            profileUpdates: [profile(NESSA, P2, { establishedAtPeriodId: P2 })],
          }),
          actors,
        ),
      'FICTION_CHARACTER_INVALID',
    );
    reject(
      () =>
        applyFictionCharacterDelta(
          state,
          P2,
          delta({
            relationshipUpdates: [
              relationship(NESSA, { provenance: 'user_supplied' }),
            ],
          }),
          actors,
        ),
      'FICTION_CHARACTER_PRIVACY',
    );
    // State needs an established profile first.
    reject(
      () =>
        applyFictionCharacterDelta(
          empty,
          P1,
          delta({ dynamicUpdates: [dynamic(NESSA, P1)] }),
          actors,
        ),
      'FICTION_CHARACTER_INVALID',
    );
  });

  it('gives a supplied person only a relationship entry and never invented private state', () => {
    const empty = emptyFictionCharacterState();
    reject(
      () =>
        applyFictionCharacterDelta(
          empty,
          P1,
          delta({ addedProfiles: [profile(SUPPLIED_FRIEND, P1)] }),
          actors,
        ),
      'FICTION_CHARACTER_PRIVACY',
    );
    reject(
      () =>
        applyFictionCharacterDelta(
          empty,
          P1,
          delta({ dynamicUpdates: [dynamic(SUPPLIED_FRIEND, P1)] }),
          actors,
        ),
      'FICTION_CHARACTER_PRIVACY',
    );
    reject(
      () =>
        applyFictionCharacterDelta(
          empty,
          P1,
          delta({ profileUpdates: [profile(SUPPLIED_FRIEND, P1)] }),
          actors,
        ),
      'FICTION_CHARACTER_PRIVACY',
    );
    for (const provenance of [
      'user_supplied',
      'branch_fiction',
      'interaction_derived',
    ] as const) {
      const state = applyFictionCharacterDelta(
        empty,
        P1,
        delta({
          relationshipUpdates: [relationship(SUPPLIED_FRIEND, { provenance })],
        }),
        actors,
      );
      expect(state.actors[0]).toMatchObject({
        actorId: SUPPLIED_FRIEND,
        kind: 'supplied',
        profile: null,
        dynamic: null,
      });
      expect(state.actors[0]!.relationship?.provenance).toBe(provenance);
    }
  });

  it('replays deterministically and is independent of object key order', () => {
    const history = [
      { periodId: P1, delta: addNessa() },
      {
        periodId: P2,
        delta: delta({ relationshipUpdates: [relationship(SUPPLIED_FRIEND)] }),
      },
    ];
    const a = characterStateFromHistory(history, actors);
    const b = characterStateFromHistory(structuredClone(history), actors);
    expect(fictionCharacterStateHash(a)).toBe(fictionCharacterStateHash(b));
    const reordered = structuredClone(history);
    reordered[0]!.delta = Object.fromEntries(
      Object.entries(reordered[0]!.delta as object).reverse(),
    );
    expect(
      fictionCharacterStateHash(characterStateFromHistory(reordered, actors)),
    ).toBe(fictionCharacterStateHash(a));
  });

  it('shares only the prefix after a fork and leaves no state for an uncommitted period', () => {
    const prefix = [{ periodId: P1, delta: addNessa() }];
    const parent = characterStateFromHistory(prefix, actors);
    const left = characterStateFromHistory(
      [
        ...prefix,
        {
          periodId: P2,
          delta: delta({
            dynamicUpdates: [dynamic(NESSA, P2, 'Left branch aim here.')],
          }),
        },
      ],
      actors,
    );
    const right = characterStateFromHistory(
      [
        ...prefix,
        {
          periodId: P3,
          delta: delta({
            dynamicUpdates: [dynamic(NESSA, P3, 'Right branch aim here.')],
          }),
        },
      ],
      actors,
    );
    expect(left.actors[0]!.dynamic?.currentAim).toBe('Left branch aim here.');
    expect(right.actors[0]!.dynamic?.currentAim).toBe('Right branch aim here.');
    expect(fictionCharacterStateHash(left)).not.toBe(
      fictionCharacterStateHash(right),
    );
    // The prefix state is unchanged by either continuation and by a rejected one.
    const before = fictionCharacterStateHash(parent);
    reject(
      () =>
        applyFictionCharacterDelta(
          parent,
          P2,
          delta({ removedActorIds: [id(999)] }),
          actors,
        ),
      'FICTION_CHARACTER_INVALID',
    );
    expect(fictionCharacterStateHash(parent)).toBe(before);
    expect(characterStateFromHistory(prefix, actors)).toEqual(parent);
  });

  it('seeds legacy actors with unknown new fields and mines nothing from prose', () => {
    const legacy = {
      actorId: NESSA,
      introducedByEventId: origin(NESSA),
      role: 'Friend who works at the cafe',
      desire: 'Wants an easy evening after work.',
      resistance: 'Dislikes being pulled into plans.',
      voiceCue: 'Dry, brief, deflects with a joke.',
      lastSeenPeriodId: P1,
    };
    const seed = fictionCharacterSeedFromLegacy([legacy], 3);
    expect(seed.ownedPeriods).toBe(3);
    expect(seed.actors[0]).toMatchObject({
      actorId: NESSA,
      profile: null,
      dynamic: null,
      relationship: null,
    });
    expect(seed.actors[0]!.legacy?.role).toBe(legacy.role);
    // A legacy-only actor has no new state, so it is not projected.
    expect(
      fictionCharacterProjection(seed, { inCandidate: [NESSA] }).actors,
    ).toEqual([]);
    // The first profile may still be added later; the seed alone does not block it.
    const next = applyFictionCharacterDelta(
      seed,
      P2,
      delta({ addedProfiles: [profile(NESSA, P2)] }),
      actors,
    );
    expect(next.actors[0]!.profile).not.toBeNull();
    expect(next.actors[0]!.legacy).not.toBeNull();
    expect(() => fictionCharacterSeedFromLegacy([legacy, legacy])).toThrow();
  });
});

describe('character projection', () => {
  const history = [
    { periodId: P1, delta: addNessa() },
    {
      periodId: P2,
      delta: delta({
        addedProfiles: [profile(TUNDE, P2)],
        dynamicUpdates: [{ ...dynamic(TUNDE, P2), unresolvedMatter: null }],
        relationshipUpdates: [
          relationship(TUNDE, { unresolvedInteraction: null }),
        ],
      }),
    },
    { periodId: P3, delta: null },
    { periodId: P4, delta: null },
  ];
  const state = characterStateFromHistory(history, actors);

  it('selects relevant actors only and drops the rest', () => {
    // Nessa has an unresolved matter; Tunde changed two periods ago (outside window 1).
    const projection = fictionCharacterProjection(
      state,
      {},
      { recentWindow: 1 },
    );
    expect(projection.actors.map((a) => a.actorId)).toEqual([NESSA]);
    expect(projection.actors[0]!.reasons).toEqual(['unresolved_matter']);
    expect(
      fictionCharacterProjection(
        state,
        { inCandidate: [TUNDE] },
        { recentWindow: 1 },
      ).actors.map((a) => a.actorId),
    ).toEqual([TUNDE, NESSA]);
  });

  it('orders by reason priority then actor id and is hash-stable', () => {
    const signals = { inCandidate: [TUNDE], openThreadActors: [NESSA] };
    const a = fictionCharacterProjection(state, signals);
    const b = fictionCharacterProjection(structuredClone(state), {
      openThreadActors: [NESSA],
      inCandidate: [TUNDE],
    });
    expect(a.actors.map((x) => x.actorId)).toEqual([TUNDE, NESSA]);
    expect(fictionCharacterProjectionHash(a)).toBe(
      fictionCharacterProjectionHash(b),
    );
    expect(a.actors[0]!.reasons[0]).toBe('in_candidate');
  });

  it('puts an unresolved actor ahead of a merely recent one', () => {
    const projection = fictionCharacterProjection(
      state,
      { overduePrivateLifeActors: [TUNDE] },
      { recentWindow: 0 },
    );
    expect(projection.actors.map((x) => [x.actorId, x.reasons[0]])).toEqual([
      [NESSA, 'unresolved_matter'],
      [TUNDE, 'overdue_private_life'],
    ]);
  });

  it('does not leak archive-only fields or removed actors', () => {
    const removed = applyFictionCharacterDelta(
      state,
      P1,
      delta({ removedActorIds: [TUNDE] }),
      actors,
    );
    const projection = fictionCharacterProjection(removed, {
      inCandidate: [TUNDE, NESSA],
    });
    expect(projection.actors.map((a) => a.actorId)).toEqual([NESSA]);
    const json = JSON.stringify(projection);
    expect(json).not.toContain('originEventId');
    expect(json).not.toContain('establishedAtPeriodId');
    expect(json).not.toContain('lastMeaningfulChangePeriodId');
  });

  it('returns an empty projection for withheld history', () => {
    expect(
      fictionCharacterProjection(
        state,
        { inCandidate: [NESSA] },
        { withheld: true },
      ),
    ).toEqual({
      version: FICTION_CHARACTER_VERSION,
      actors: [],
      omittedActors: 0,
    });
  });

  it('shows a supplied person through the relationship only', () => {
    const withFriend = applyFictionCharacterDelta(
      state,
      P1,
      delta({
        relationshipUpdates: [
          relationship(SUPPLIED_FRIEND, { provenance: 'user_supplied' }),
        ],
      }),
      actors,
    );
    const view = fictionCharacterProjection(withFriend, {
      inCandidate: [SUPPLIED_FRIEND],
    }).actors[0]!;
    expect(view).toMatchObject({
      kind: 'supplied',
      profile: null,
      dynamic: null,
    });
    expect(view.relationship?.provenance).toBe('user_supplied');
  });

  it('stays under the byte bound with maximal states, dropping optional actors visibly', () => {
    const long = (n: number) => 'y'.repeat(n);
    const many = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => id(300 + n));
    const manyActors: FictionCharacterActors = {
      fictionalOrigins: new Map(many.map((a) => [a, origin(a)])),
      suppliedActorIds: new Set(),
    };
    let s = emptyFictionCharacterState();
    // Four periods of two maximal actors keep every delta inside its own bound.
    for (const [pi, group] of [0, 2, 4, 6]
      .map((i) => many.slice(i, i + 2))
      .entries()) {
      const pid = id(800 + pi);
      s = applyFictionCharacterDelta(
        s,
        pid,
        delta({
          addedProfiles: group.map((a) =>
            profile(a, pid, {
              originEventId: origin(a),
              socialRole: long(120),
              coreWant: long(200),
              independentConcern: long(200),
              conflictStyle: long(200),
              attentionStyle: long(200),
              valueCue: [long(60), long(60), long(60)],
              voiceCue: long(120),
            }),
          ),
          dynamicUpdates: group.map((a) => ({
            ...dynamic(a, pid),
            currentAim: long(200),
            currentPressure: long(200),
            attentionOn: long(160),
            stanceTowardProtagonist: long(200),
            unresolvedMatter: long(200),
          })),
        }),
        manyActors,
      );
    }
    const open = fictionCharacterProjection(s, { openThreadActors: many });
    const bytes = new TextEncoder().encode(JSON.stringify(open)).length;
    expect(bytes).toBeLessThanOrEqual(FICTION_CHARACTER_PROJECTION_BYTES);
    expect(open.actors.length + open.omittedActors).toBe(8);
    expect(open.omittedActors).toBeGreaterThan(0);
    expect(fictionCharacterProjectionSchema.safeParse(open).success).toBe(true);
    // Mandatory candidate actors that cannot fit are refused, not dropped.
    reject(
      () => fictionCharacterProjection(s, { inCandidate: many }),
      'FICTION_CHARACTER_PROJECTION_TOO_LARGE',
    );
  });
});
