import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  FICTION_CHARACTER_VERSION,
  NARRATIVE_ARTIFACT_BYTES,
  fictionArtifactSchema,
  fictionContextSchema,
  fictionEditorialVersionFor,
  fictionPolicy,
  fictionPolicySchema,
  fictionV8Policy,
  fictionV9Policy,
  type FictionCharacterDelta,
  type FictionCharacterEnvelope,
  type FictionCharacterProfile,
  type NarrativePeriodInput,
} from '@future-flow/contracts';
import {
  buildFictionArtifact,
  characterStateFromHistory,
  emptyFictionCharacterState,
  fictionAuthorRequest,
  fictionCanon,
  fictionCharacterProjectionFromEnvelope,
  fictionEditorialRequest,
  fictionFidelityRequest,
  fictionPlannerRequest,
  fictionReviewRequest,
  fictionScope,
  hash,
  narrativeReferenceSnapshot,
  narrativeReferencesFromMemory,
  validateFictionAuthor,
  validateFictionCharacterDelta,
} from '@future-flow/core';
import { fictionFixture, fictionProof } from './fiction-fixtures';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NESSA = id(11);
const SUPPLIED = id(51);
const NESSA_ORIGIN = id(711);

const profile = (
  actorId: string,
  originEventId: string,
  periodId: string,
  over: Partial<FictionCharacterProfile> = {},
): FictionCharacterProfile => ({
  actorId,
  originEventId,
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
const emptyDelta = (): FictionCharacterDelta => ({
  version: FICTION_CHARACTER_VERSION,
  addedProfiles: [],
  profileUpdates: [],
  dynamicUpdates: [],
  relationshipUpdates: [],
  removedActorIds: [],
});
const relationship = (actorId: string) => ({
  actorId,
  currentDynamic: 'Warm friendship, but art feedback now dominates meetings.',
  expectation: 'Expects ordinary shared time, not another structured critique.',
  unresolvedInteraction: 'Protagonist over-explained a small disagreement.',
  provenance: 'interaction_derived' as const,
});
const dynamic = (actorId: string, periodId: string) => ({
  actorId,
  currentAim: 'Keeping the coming weekend free.',
  currentPressure: 'A double shift is coming up this month.',
  attentionOn: 'her own schedule',
  stanceTowardProtagonist: 'Still likes the protagonist, wary of art talk.',
  unresolvedMatter: 'Protagonist turns casual meetings into art reviews.',
  lastMeaningfulChangePeriodId: periodId,
  provenance: 'branch_fiction' as const,
});
const emptyEnvelope = (): FictionCharacterEnvelope => ({
  version: FICTION_CHARACTER_VERSION,
  state: emptyFictionCharacterState(),
  fictionalOrigins: [],
  suppliedActorIds: [],
  signals: {
    openThreadActors: [],
    goalOrOpportunityActors: [],
    overduePrivateLifeActors: [],
  },
});

// A living-world fixture: the v9 policy, the envelope the server would build
// and the projection that envelope yields. `withNessa` adds one existing
// fictional person with folded state (unresolved matter, so she is projected).
function living(withNessa = false, envelope = emptyEnvelope()) {
  const base: NarrativePeriodInput = fictionFixture().input;
  const context = base.narrativeContext;
  if (context?.policy.mode !== 'narrative-fiction-v2')
    throw Error('Expected a fiction fixture.');
  if (withNessa) {
    const prior = id(901);
    context.memory.history = [
      {
        periodId: id(901),
        startDate: '2025-10-01',
        endDate: '2025-12-31',
        position: 1,
        summary:
          'A friend from the cafe joined the weekly drawing meetings, and the protagonist began treating casual evenings as art reviews, which the friend quietly noticed.',
        salientEventIds: [NESSA_ORIGIN],
        excerpt: null,
      },
    ];
    context.memory.fictionalActors = [
      {
        actorId: NESSA,
        introducedByEventId: NESSA_ORIGIN,
        role: 'Friend who works at the cafe',
        desire: 'Wants an easy evening after work.',
        resistance: 'Dislikes being pulled into plans.',
        voiceCue: 'Dry, brief, deflects with a joke.',
        lastSeenPeriodId: prior,
      },
    ];
    base.state.actors.push({
      id: NESSA,
      label: 'Nessa',
      relationship: 'friend',
    });
    base.narrativeReferences = narrativeReferenceSnapshot(
      narrativeReferencesFromMemory(context.memory),
    );
    envelope = {
      ...envelope,
      state: characterStateFromHistory(
        [
          {
            periodId: prior,
            delta: {
              ...emptyDelta(),
              addedProfiles: [profile(NESSA, NESSA_ORIGIN, prior)],
              dynamicUpdates: [dynamic(NESSA, prior)],
              relationshipUpdates: [relationship(NESSA)],
            },
          },
        ],
        {
          fictionalOrigins: new Map([[NESSA, NESSA_ORIGIN]]),
          suppliedActorIds: new Set(),
        },
      ),
      fictionalOrigins: [{ actorId: NESSA, introducedByEventId: NESSA_ORIGIN }],
    };
  }
  context.policy = fictionV9Policy();
  context.characterProjection = fictionCharacterProjectionFromEnvelope(
    envelope,
    false,
  );
  base.fictionCharacters = envelope;
  const f = fictionFixture(base);
  return {
    ...f,
    envelope,
    draft: { ...f.draft, characterIntent: [] as unknown[] },
    authored: { ...f.authored, characterDelta: emptyDelta() },
  };
}
const addActor = (
  f: ReturnType<typeof living>,
  actorId: string,
  label = 'Fictional neighbour',
) => {
  const change = {
    type: 'actor_add' as const,
    value: { id: actorId, label, relationship: 'friend' as const },
  };
  for (const candidate of [f.draft.candidate, f.authored.candidate]) {
    candidate.events[0]!.changes.push(structuredClone(change));
    candidate.events[0]!.actorIds.push(actorId);
  }
  return f.authored.candidate.events[0]!.id;
};

describe('v9 policy generation', () => {
  it('is a frozen tuple next to v8 and is never the default', () => {
    expect(fictionV9Policy().promptVersions).toEqual({
      planner: 'life_fiction_plan.v9',
      writer: 'life_fiction_author.v9',
      planReviewer: 'life_fiction_plan_review.v9',
      fidelity: 'life_fiction_fidelity.v1',
      editor: 'life_fiction_editor.v8',
    });
    expect(fictionV9Policy().qualityPolicyVersion).toBe('2.8.0');
    expect(fictionV9Policy().maxPhysicalRequests).toBe(9);
    expect(fictionV9Policy().maxContentRepairs).toBe(1);
    expect(fictionPolicy()).toEqual(fictionV8Policy());
    expect(fictionPolicySchema.safeParse(fictionV9Policy()).success).toBe(true);
    expect(fictionEditorialVersionFor('2.8.0')).toBe('1.3.0');
  });

  it('refuses mixed generations', () => {
    const v9 = fictionV9Policy();
    for (const mixed of [
      { ...v9, qualityPolicyVersion: '2.7.0' },
      {
        ...v9,
        promptVersions: {
          ...v9.promptVersions,
          editor: 'life_fiction_editor.v7',
        },
      },
      {
        ...v9,
        promptVersions: {
          ...v9.promptVersions,
          planner: 'life_fiction_plan.v8',
        },
      },
      { ...fictionV8Policy(), qualityPolicyVersion: '2.8.0' },
    ])
      expect(fictionPolicySchema.safeParse(mixed).success).toBe(false);
  });
});

describe('v9 context and artifact gates', () => {
  it('requires the projection in v9 and forbids it in v8', () => {
    const f = living();
    const { characterProjection: _p, ...without } = fictionContextSchema.parse(
      f.input.narrativeContext,
    );
    expect(fictionContextSchema.safeParse(without).success).toBe(false);
    const v8 = fictionFixture().input.narrativeContext!;
    expect(
      fictionContextSchema.safeParse({
        ...v8,
        characterProjection:
          f.input.narrativeContext &&
          fictionContextSchema.parse(f.input.narrativeContext)
            .characterProjection,
      }).success,
    ).toBe(false);
  });

  it('keeps a withheld v9 context free of character history', () => {
    const f = living(true);
    const context = fictionContextSchema.parse(f.input.narrativeContext);
    expect(context.characterProjection!.actors.length).toBe(1);
    expect(
      fictionContextSchema.safeParse({
        ...context,
        memory: { ...context.memory, withheld: true },
      }).success,
    ).toBe(false);
  });

  it('builds a v9 artifact with the delta and three bindings, inside the byte bound', () => {
    const f = living();
    const artifact = buildFictionArtifact(
      f.input,
      f.draft,
      f.authored,
      f.review,
      f.fidelity,
      f.editor,
      fictionProof(f),
    );
    expect(artifact.characterDelta).toEqual(f.authored.characterDelta);
    expect(artifact.bindings.characterDeltaHash).toBe(
      hash(f.authored.characterDelta),
    );
    expect(artifact.bindings.characterStateHash).toBe(hash(f.envelope.state));
    expect(artifact.bindings.characterProjectionHash).toBe(
      hash(
        f.input.narrativeContext &&
          fictionContextSchema.parse(f.input.narrativeContext)
            .characterProjection,
      ),
    );
    expect(Buffer.byteLength(JSON.stringify(artifact))).toBeLessThanOrEqual(
      NARRATIVE_ARTIFACT_BYTES,
    );
    expect(fictionArtifactSchema.safeParse(artifact).success).toBe(true);
    // The delta and its bindings travel together and only in v9.
    const { characterDelta: _d, ...noDelta } = artifact;
    expect(fictionArtifactSchema.safeParse(noDelta).success).toBe(false);
    expect(
      fictionArtifactSchema.safeParse({
        ...artifact,
        bindings: { ...artifact.bindings, characterDeltaHash: undefined },
      }).success,
    ).toBe(false);
    expect(
      fictionArtifactSchema.safeParse({
        ...artifact,
        policy: fictionV8Policy(),
      }).success,
    ).toBe(false);
  });

  it('keeps v8 artifacts closed to character fields', () => {
    const f = fictionFixture();
    const v8 = structuredClone(f.input);
    (v8.narrativeContext as { policy: unknown }).policy = fictionV8Policy();
    const g = fictionFixture(v8);
    const artifact = buildFictionArtifact(
      g.input,
      g.draft,
      g.authored,
      g.review,
      g.fidelity,
      g.editor,
      fictionProof(g),
    );
    expect(artifact.characterDelta).toBeUndefined();
    expect(artifact.bindings.characterDeltaHash).toBeUndefined();
    expect(
      fictionArtifactSchema.safeParse({
        ...artifact,
        characterDelta: emptyDelta(),
      }).success,
    ).toBe(false);
  });
});

describe('v9 scope: the server envelope', () => {
  it('requires a matching envelope and refuses one on older generations', () => {
    const f = living();
    expect(() => fictionScope(f.input)).not.toThrow();
    const missing = { ...f.input, fictionCharacters: undefined };
    expect(() => fictionScope(missing)).toThrow('Character envelope');
    const v8 = fictionFixture().input;
    expect(() =>
      fictionScope({ ...v8, fictionCharacters: emptyEnvelope() }),
    ).toThrow('living-world');
  });

  it("refuses a projection that is not the envelope's", () => {
    const f = living(true);
    const stale = structuredClone(f.input);
    (
      stale.narrativeContext as { characterProjection: unknown }
    ).characterProjection = fictionCharacterProjectionFromEnvelope(
      emptyEnvelope(),
      false,
    );
    expect(() => fictionScope(stale)).toThrow('Character envelope');
  });

  it('refuses an envelope that disagrees with the owned reference inventory', () => {
    const f = living(true);
    const forged = structuredClone(f.input);
    forged.fictionCharacters!.fictionalOrigins = [
      { actorId: NESSA, introducedByEventId: id(999) },
    ];
    expect(() => fictionScope(forged)).toThrow('Character envelope');
    const supplied = structuredClone(f.input);
    supplied.fictionCharacters!.suppliedActorIds = [SUPPLIED];
    expect(() => fictionScope(supplied)).toThrow('Character envelope');
  });

  it('carries the projection in the planner and author request, so the request hash follows the state', () => {
    const empty = living();
    const withNessa = living(true);
    const planner = fictionPlannerRequest(withNessa.input) as {
      narrativeContext: {
        characterProjection: { actors: { actorId: string }[] };
      };
    };
    expect(
      planner.narrativeContext.characterProjection.actors[0]!.actorId,
    ).toBe(NESSA);
    expect(JSON.stringify(planner)).not.toContain('originEventId');
    expect(hash(fictionPlannerRequest(empty.input))).not.toBe(
      hash(fictionPlannerRequest(withNessa.input)),
    );
    const author = fictionAuthorRequest(withNessa.input, withNessa.draft) as {
      draft: { characterIntent: unknown[] };
    };
    expect(author.draft.characterIntent).toEqual([]);
    const review = fictionReviewRequest(
      withNessa.input,
      withNessa.authored,
    ) as {
      proposed: { characterDelta: unknown };
    };
    expect(review.proposed.characterDelta).toEqual(
      withNessa.authored.characterDelta,
    );
    // The envelope itself is server-owned and never part of a model request.
    expect(JSON.stringify(planner)).not.toContain('fictionCharacters');
  });

  it('gives the check stages only the projection hash, still bound to the state', () => {
    const empty = living();
    const withNessa = living(true);
    const hashOf = (f: ReturnType<typeof living>) =>
      hash(
        (f.input.narrativeContext as { characterProjection: unknown })
          .characterProjection,
      );
    for (const request of [
      fictionReviewRequest,
      fictionFidelityRequest,
      fictionEditorialRequest,
    ]) {
      const a = request(withNessa.input, withNessa.authored);
      const text = JSON.stringify(a);
      expect(text).not.toContain('characterProjection"');
      expect(text).not.toContain('Notices practical inconvenience');
      expect(
        (a as { narrativeContext: { characterProjectionHash: string } })
          .narrativeContext.characterProjectionHash,
      ).toBe(hashOf(withNessa));
      // The request hash still follows the character state.
      expect(hash(a)).not.toBe(hash(request(empty.input, empty.authored)));
    }
    // v8 check requests are untouched: no hash key, no projection.
    const v8 = fictionFixture();
    expect(
      JSON.stringify(fictionReviewRequest(v8.input, v8.authored)),
    ).not.toContain('characterProjection');
  });
});

describe('v9 draft intent and author delta validation', () => {
  it('accepts intents for fictional people only', () => {
    const f = living(true);
    f.draft.characterIntent = [
      {
        actorId: NESSA,
        ownAim: 'Leave on time and avoid another long discussion.',
        attentionOn: 'an unrelated commitment later that evening',
        interactionPressure: 'protagonist wants detailed feedback',
        protagonistRelevance: 'low at scene opening',
      },
    ];
    expect(() => fictionCanon(f.input, f.draft)).not.toThrow();
    f.draft.characterIntent[0] = {
      ...(f.draft.characterIntent[0] as object),
      actorId: id(777),
    };
    expect(() => fictionCanon(f.input, f.draft)).toThrow('character intent');
    // A v8 draft never carries one (strict, policy-selected schema).
    const v8 = fictionFixture();
    expect(() =>
      fictionCanon(v8.input, { ...v8.draft, characterIntent: [] }),
    ).toThrow();
  });

  it('requires a delta in the final package and validates it against the state', () => {
    const f = living(true);
    const { characterDelta: _d, ...noDelta } = f.authored;
    expect(() => validateFictionAuthor(f.input, noDelta)).toThrow();
    expect(() => validateFictionAuthor(f.input, f.authored)).not.toThrow();
    const wrongPeriod = structuredClone(f.authored);
    wrongPeriod.characterDelta.dynamicUpdates = [dynamic(NESSA, id(902))];
    expect(() => validateFictionAuthor(f.input, wrongPeriod)).toThrow(
      'records the period',
    );
    const ok = structuredClone(f.authored);
    ok.characterDelta.dynamicUpdates = [dynamic(NESSA, f.input.periodId)];
    expect(() => validateFictionAuthor(f.input, ok)).not.toThrow();
  });

  it('demands a profile for every new recurring actor, with the right origin', () => {
    const f = living();
    const newActor = id(601);
    const event = addActor(f, newActor);
    expect(() => validateFictionAuthor(f.input, f.authored)).toThrow(
      'needs a character profile',
    );
    f.authored.characterDelta.addedProfiles = [
      profile(newActor, event, f.input.periodId),
    ];
    expect(() => validateFictionAuthor(f.input, f.authored)).not.toThrow();
    f.authored.characterDelta.addedProfiles = [
      profile(newActor, id(999), f.input.periodId),
    ];
    expect(() => validateFictionAuthor(f.input, f.authored)).toThrow('origin');
  });

  it('archives exactly the fictional actors the story removes', () => {
    const f = living(true);
    f.authored.candidate.events[1]!.changes.push({
      type: 'actor_remove',
      actorId: NESSA,
    });
    f.authored.candidate.events[1]!.actorIds.push(NESSA);
    f.draft.candidate = structuredClone(f.authored.candidate);
    expect(() => validateFictionAuthor(f.input, f.authored)).toThrow(
      'must be archived',
    );
    f.authored.characterDelta.removedActorIds = [NESSA];
    expect(() => validateFictionAuthor(f.input, f.authored)).not.toThrow();
    const stray = structuredClone(f.authored);
    stray.candidate.events[1]!.changes =
      stray.candidate.events[1]!.changes.filter(
        (c) => c.type !== 'actor_remove',
      );
    expect(() => validateFictionAuthor(f.input, stray)).toThrow('actor_remove');
  });

  it('archives an actor who joins and leaves in one chapter, and never leaves it live', () => {
    const f = living();
    const newActor = id(602);
    const event = addActor(f, newActor);
    for (const candidate of [f.draft.candidate, f.authored.candidate]) {
      candidate.events[1]!.changes.push({
        type: 'actor_remove',
        actorId: newActor,
      });
      candidate.events[1]!.actorIds.push(newActor);
    }
    // No profile: rejected. Profile without archiving: rejected, so no live
    // state for an exited actor can be committed.
    expect(() => validateFictionAuthor(f.input, f.authored)).toThrow(
      'needs a character profile',
    );
    f.authored.characterDelta.addedProfiles = [
      profile(newActor, event, f.input.periodId),
    ];
    expect(() => validateFictionAuthor(f.input, f.authored)).toThrow(
      'must be archived',
    );
    f.authored.characterDelta.removedActorIds = [newActor];
    expect(() => validateFictionAuthor(f.input, f.authored)).not.toThrow();
    const state = validateFictionCharacterDelta({
      periodId: f.input.periodId,
      envelope: f.envelope,
      delta: f.authored.characterDelta,
      events: f.authored.candidate.events,
    });
    expect(
      state.actors.filter(
        (a) => a.actorId === newActor && !a.removedAtPeriodId,
      ),
    ).toEqual([]);
    expect(state.actors.find((a) => a.actorId === newActor)).toMatchObject({
      removedAtPeriodId: f.input.periodId,
    });
  });

  it('never gives a supplied person a profile or an invented state', () => {
    const f = living();
    f.input.state.actors.push({
      id: SUPPLIED,
      label: 'Fictional older sister',
      relationship: 'family',
    });
    f.input.fictionCharacters!.suppliedActorIds = [SUPPLIED];
    f.envelope.suppliedActorIds = [SUPPLIED];
    expect(() => validateFictionAuthor(f.input, f.authored)).not.toThrow();
    const profiled = structuredClone(f.authored);
    profiled.characterDelta.addedProfiles = [
      profile(SUPPLIED, id(5), f.input.periodId),
    ];
    expect(() => validateFictionAuthor(f.input, profiled)).toThrow(
      'supplied person',
    );
    const invented = structuredClone(f.authored);
    invented.characterDelta.dynamicUpdates = [
      dynamic(SUPPLIED, f.input.periodId),
    ];
    expect(() => validateFictionAuthor(f.input, invented)).toThrow(
      'supplied person',
    );
    const related = structuredClone(f.authored);
    related.characterDelta.relationshipUpdates = [relationship(SUPPLIED)];
    expect(() => validateFictionAuthor(f.input, related)).not.toThrow();
    // The model can never label authored text as a user-supplied fact.
    const labelled = structuredClone(f.authored);
    labelled.characterDelta.relationshipUpdates = [
      {
        ...relationship(SUPPLIED),
        provenance: 'user_supplied',
        unresolvedInteraction: 'She secretly fears losing her job.',
      },
    ];
    expect(() => validateFictionAuthor(f.input, labelled)).toThrow(
      'never user supplied',
    );
  });

  it('keeps a rejected delta from touching the envelope state', () => {
    const f = living(true);
    const before = hash(f.input.fictionCharacters);
    const bad = structuredClone(f.authored);
    bad.characterDelta.removedActorIds = [id(999)];
    expect(() => validateFictionAuthor(f.input, bad)).toThrow();
    expect(hash(f.input.fictionCharacters)).toBe(before);
  });

  it('adds no character field to v8 final packages', () => {
    const v8 = fictionFixture();
    expect(() =>
      validateFictionAuthor(v8.input, {
        ...v8.authored,
        characterDelta: emptyDelta(),
      }),
    ).toThrow();
    expect(() => validateFictionAuthor(v8.input, v8.authored)).not.toThrow();
    // Sanity for the fixture helpers.
    expect(randomUUID()).toHaveLength(36);
  });
});
