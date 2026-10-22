import { randomUUID } from 'node:crypto';
import { zodTextFormat } from 'openai/helpers/zod';
import { describe, it, expect } from 'vitest';
import {
  FICTION_CHARACTER_DELTA_BYTES,
  FICTION_CHARACTER_VERSION,
  NARRATIVE_ARTIFACT_BYTES,
  fictionArtifactSchema,
  fictionAuthorSchemaFor,
  fictionCompactAuthorSchema,
  fictionCompactAuthorV9Schema,
  fictionContextSchema,
  fictionCompactDraftV9Schema,
  fictionDraftSchemaFor,
  fictionSeriesLedgerSchema,
  fictionSeriesLedgerV11Schema,
  fictionStoredDraftV9Schema,
  fictionEditorialVersionFor,
  fictionPolicy,
  fictionPolicySchema,
  fictionV8Policy,
  fictionV9Policy,
  fictionFidelityFirstRepairQualityVersions,
  type FictionCharacterDelta,
  type FictionCharacterEnvelope,
  type FictionCharacterProfile,
  type NarrativePeriodInput,
} from '@future-flow/contracts';
import {
  buildFictionArtifact,
  fictionSeriesLedgerFrom,
  fictionSeriesLedgerV11From,
  characterStateFromHistory,
  emptyFictionCharacterState,
  fictionAuthorRequest,
  fictionCanon,
  fictionCharacterProjectionFromEnvelope,
  fictionEditorialRequest,
  fictionFidelityRequest,
  fictionMechanicsFigures,
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
    draft: {
      ...f.draft,
      characterIntent: [] as unknown[],
      continuityDecisions: [] as unknown[],
    },
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
      editor: 'life_fiction_editor.v9',
    });
    expect(fictionV9Policy().qualityPolicyVersion).toBe('2.8.0');
    expect(fictionV9Policy().maxPhysicalRequests).toBe(9);
    expect(fictionV9Policy().maxContentRepairs).toBe(1);
    expect(fictionPolicy()).toEqual(fictionV8Policy());
    expect(fictionPolicySchema.safeParse(fictionV9Policy()).success).toBe(true);
    expect(fictionEditorialVersionFor('2.8.0')).toBe('1.3.0');
  });

  it('keeps a stored v9 snapshot with the v8 editor readable, and never lets v9 or v8 take the wrong editor', () => {
    const v9 = fictionV9Policy();
    // The measured v9-6b..6g payloads carry the v8 editor text.
    const stored = {
      ...v9,
      promptVersions: {
        ...v9.promptVersions,
        editor: 'life_fiction_editor.v8',
      },
    };
    expect(fictionPolicySchema.safeParse(stored).success).toBe(true);
    // v9 accepts exactly these two editors; v8 and everything before stay exact.
    for (const editor of [
      'life_fiction_editor.v1',
      'life_fiction_editor.v6',
      'life_fiction_editor.v7',
    ])
      expect(
        fictionPolicySchema.safeParse({
          ...v9,
          promptVersions: { ...v9.promptVersions, editor },
        }).success,
      ).toBe(false);
    const v8 = fictionV8Policy();
    for (const editor of ['life_fiction_editor.v8', 'life_fiction_editor.v9'])
      expect(
        fictionPolicySchema.safeParse({
          ...v8,
          promptVersions: { ...v8.promptVersions, editor },
        }).success,
      ).toBe(false);
    expect(v8.promptVersions.editor).toBe('life_fiction_editor.v7');
    // A new v9 policy is only ever built with the v9 editor.
    expect(fictionV9Policy().promptVersions.editor).toBe(
      'life_fiction_editor.v9',
    );
  });

  it('marks only the v9 quality version as fidelity-first', () => {
    expect(fictionFidelityFirstRepairQualityVersions).toEqual(['2.8.0']);
    expect(fictionV9Policy().qualityPolicyVersion).toBe('2.8.0');
    expect(
      fictionFidelityFirstRepairQualityVersions.includes(
        fictionV8Policy().qualityPolicyVersion,
      ),
    ).toBe(false);
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
  it('parses a stored v9 context that carries the v8 editor, and the v9 editor one', () => {
    const context = fictionContextSchema.parse(living().input.narrativeContext);
    expect(context.policy.promptVersions.editor).toBe('life_fiction_editor.v9');
    const stored = {
      ...context,
      policy: {
        ...context.policy,
        promptVersions: {
          ...context.policy.promptVersions,
          editor: 'life_fiction_editor.v8',
        },
      },
    };
    expect(fictionContextSchema.safeParse(stored).success).toBe(true);
    expect(
      fictionContextSchema.safeParse({
        ...stored,
        policy: {
          ...stored.policy,
          promptVersions: {
            ...stored.policy.promptVersions,
            editor: 'life_fiction_editor.v7',
          },
        },
      }).success,
    ).toBe(false);
  });

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

  it('leaves room for the whole delta bound inside the 32 KiB artifact (worst case, plan section 56)', () => {
    const f = living();
    const build = () =>
      buildFictionArtifact(
        f.input,
        f.draft,
        f.authored,
        f.review,
        f.fidelity,
        f.editor,
        fictionProof(f),
      );
    const withDelta = Buffer.byteLength(JSON.stringify(build()));
    // An empty delta costs a few dozen bytes; the cap is the only growth.
    const withoutDelta = withDelta - JSON.stringify(emptyDelta()).length;
    expect(withoutDelta + FICTION_CHARACTER_DELTA_BYTES).toBeLessThanOrEqual(
      NARRATIVE_ARTIFACT_BYTES,
    );
    expect(NARRATIVE_ARTIFACT_BYTES).toBe(32768);
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

  it('binds continuity decisions to the projection, without failing a draft that gives none', () => {
    const f = living(true);
    // None is allowed: missing coverage is a diagnostic, never a failure.
    expect(f.draft.continuityDecisions).toEqual([]);
    expect(() => fictionCanon(f.input, f.draft)).not.toThrow();
    f.draft.continuityDecisions = [
      { actorId: NESSA, decision: 'defer', reason: 'Her shift stays busy.' },
    ];
    expect(() => fictionCanon(f.input, f.draft)).not.toThrow();
    // A decision for a person the projection does not show is refused.
    f.draft.continuityDecisions = [
      { actorId: id(777), decision: 'carry', reason: 'Not in the cast.' },
    ];
    expect(() => fictionCanon(f.input, f.draft)).toThrow(
      'not in the character projection',
    );
    // One decision per person, and the reason stays short.
    const schema = fictionDraftSchemaFor(f.input.narrativeContext!.policy);
    const twice = {
      ...f.draft,
      continuityDecisions: [
        { actorId: NESSA, decision: 'carry', reason: 'First answer.' },
        { actorId: NESSA, decision: 'resolve', reason: 'Second answer.' },
      ],
    };
    expect(schema.safeParse(twice).success).toBe(false);
    expect(
      schema.safeParse({
        ...f.draft,
        continuityDecisions: [
          { actorId: NESSA, decision: 'carry', reason: 'x'.repeat(101) },
        ],
      }).success,
    ).toBe(false);
    // A v8 draft is closed to the field.
    const v8 = fictionFixture();
    expect(() =>
      fictionCanon(v8.input, { ...v8.draft, continuityDecisions: [] }),
    ).toThrow();
  });

  it('shows the review the decisions only in v9 and only when there are some', () => {
    const f = living(true);
    expect(
      fictionReviewRequest(f.input, f.authored, f.draft),
    ).not.toHaveProperty('continuity');
    f.draft.continuityDecisions = [
      { actorId: NESSA, decision: 'carry', reason: 'Her matter stays live.' },
    ];
    const withDecisions = fictionReviewRequest(
      f.input,
      f.authored,
      f.draft,
    ) as { continuity: { continuityDecisions: unknown[] } };
    expect(withDecisions.continuity.continuityDecisions).toHaveLength(1);
    // The request hash follows the decisions; fidelity and editor never get them.
    expect(hash(withDecisions)).not.toBe(
      hash(fictionReviewRequest(f.input, f.authored)),
    );
    expect(fictionFidelityRequest(f.input, f.authored)).not.toHaveProperty(
      'continuity',
    );
    expect(fictionEditorialRequest(f.input, f.authored)).not.toHaveProperty(
      'continuity',
    );
    // v8 requests are byte-identical, draft or not.
    const v8 = fictionFixture();
    expect(hash(fictionReviewRequest(v8.input, v8.authored, v8.draft))).toBe(
      hash(fictionReviewRequest(v8.input, v8.authored)),
    );
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

  it('adds a profile only for an actor introduced in this period, so a pruned exit cannot be revived', () => {
    const f = living(true);
    // Nessa already exists with a profile: a second profile is rejected.
    f.authored.characterDelta.addedProfiles = [
      profile(NESSA, NESSA_ORIGIN, f.input.periodId),
    ];
    expect(() => validateFictionAuthor(f.input, f.authored)).toThrow(
      /adds an actor twice|introduced in this period/,
    );
    // A former actor whose tombstone was pruned away is no longer in the
    // state, but its origin is still recorded: no actor_add, no profile.
    const g = living(true);
    g.envelope.state.actors = [];
    g.input.fictionCharacters = g.envelope;
    g.authored.characterDelta.addedProfiles = [
      profile(NESSA, NESSA_ORIGIN, g.input.periodId),
    ];
    expect(() =>
      validateFictionCharacterDelta({
        periodId: g.input.periodId,
        envelope: g.envelope,
        delta: g.authored.characterDelta,
        events: g.authored.candidate.events,
      }),
    ).toThrow('introduced in this period');
  });

  it('fails closed, not repairable, when the state is past its bound', () => {
    const f = living();
    const newActor = id(603);
    const event = addActor(f, newActor);
    f.authored.characterDelta.addedProfiles = [
      profile(newActor, event, f.input.periodId),
    ];
    f.envelope.state.actors = Array.from({ length: 300 }, (_, i) => ({
      actorId: id(20000 + i),
      kind: 'supplied' as const,
      legacy: null,
      profile: null,
      dynamic: null,
      relationship: null,
      touchedAtIndex: null,
      removedAtPeriodId: null,
    }));
    try {
      validateFictionCharacterDelta({
        periodId: f.input.periodId,
        envelope: f.envelope,
        delta: f.authored.characterDelta,
        events: f.authored.candidate.events,
      });
      throw new Error('Expected a DomainError.');
    } catch (error) {
      expect((error as { code?: string }).code).toBe(
        'NARRATIVE_CONTEXT_INVALID',
      );
    }
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

describe('the planner turn label (v9 only)', () => {
  const build = (f: ReturnType<typeof living>, draft: unknown) =>
    buildFictionArtifact(
      f.input,
      draft as typeof f.draft,
      f.authored,
      f.review,
      f.fidelity,
      f.editor,
      fictionProof({ ...f, draft } as typeof f),
    );
  it('is a required, nullable key of the provider draft and an optional one of a stored draft', () => {
    const living9 = living();
    const { turnType: _label, ...unlabelledDraft } = living9.draft;
    const f = { ...living9, draft: unlabelledDraft };
    const provider = fictionDraftSchemaFor(fictionV9Policy());
    expect(provider).toBe(fictionCompactDraftV9Schema);
    expect(provider.safeParse({ ...f.draft, turnType: null }).success).toBe(
      true,
    );
    expect(
      provider.safeParse({ ...f.draft, turnType: 'old_matter_returns' })
        .success,
    ).toBe(true);
    // Strict provider output: the key must be there, and from the catalogue.
    expect(provider.safeParse(f.draft).success).toBe(false);
    expect(
      provider.safeParse({ ...f.draft, turnType: 'a_new_made_up_type' })
        .success,
    ).toBe(false);
    // The first 2.8.0 runs stored drafts without the key; they stay readable.
    expect(fictionStoredDraftV9Schema.safeParse(f.draft).success).toBe(true);
    expect(
      fictionStoredDraftV9Schema.safeParse({ ...f.draft, turnType: 'x_y' })
        .success,
    ).toBe(false);
  });

  it('is copied from the draft into the artifact, and a stored draft without it rebuilds byte-identical', () => {
    const living9 = living();
    const { turnType: _label, ...unlabelledDraft } = living9.draft;
    const f = { ...living9, draft: unlabelledDraft };
    const labelled = build(f, { ...f.draft, turnType: 'old_matter_returns' });
    expect(labelled.turnType).toBe('old_matter_returns');
    expect(fictionArtifactSchema.safeParse(labelled).success).toBe(true);
    const unlabelled = build(f, { ...f.draft, turnType: null });
    expect(unlabelled.turnType).toBeNull();
    // No key in the stored draft: no key in the artifact, so a checkpoint
    // proof built before the label existed still hashes the same.
    const legacy = build(f, f.draft);
    expect(legacy).not.toHaveProperty('turnType');
    expect(fictionArtifactSchema.safeParse(legacy).success).toBe(true);
    expect(
      fictionArtifactSchema.safeParse({ ...legacy, turnType: 'nonsense' })
        .success,
    ).toBe(false);
  });

  it('is refused on a v8 artifact', () => {
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
    expect(artifact).not.toHaveProperty('turnType');
    for (const turnType of ['quiet_persistence', null])
      expect(
        fictionArtifactSchema.safeParse({ ...artifact, turnType }).success,
      ).toBe(false);
  });

  it('puts ledger 1.1.0 in v9 contexts only, and still reads a v9 context with 1.0.0', () => {
    const f = living();
    const periods = [1, 2].map((n) => ({
      periodId: id(300 + n),
      body: `Chapter ${n} closes on a plain sentence about the harbour.`,
      events: [{ actorIds: [], changes: [] }],
    }));
    const state = { actors: [], goals: [] };
    const v10 = fictionSeriesLedgerSchema.parse(
      fictionSeriesLedgerFrom(periods, state),
    );
    const v11 = fictionSeriesLedgerV11Schema.parse(
      fictionSeriesLedgerV11From(periods, state, {
        branchId: id(1),
        cast: [],
        turns: [null, 'quiet_persistence'],
      }),
    );
    const context = f.input.narrativeContext as Record<string, unknown>;
    expect(
      fictionContextSchema.safeParse({ ...context, seriesLedger: v11 }).success,
    ).toBe(true);
    expect(
      fictionContextSchema.safeParse({ ...context, seriesLedger: v10 }).success,
    ).toBe(true);
    const v8 = fictionFixture().input.narrativeContext as Record<
      string,
      unknown
    >;
    expect(
      fictionContextSchema.safeParse({
        ...v8,
        policy: fictionV8Policy(),
        seriesLedger: v11,
      }).success,
    ).toBe(false);
    expect(
      fictionContextSchema.safeParse({
        ...v8,
        policy: fictionV8Policy(),
        seriesLedger: v10,
      }).success,
    ).toBe(true);
  });
});

describe('v9 request cleaning for the check stages (C4/D5)', () => {
  const count = (text: string, needle: string) => text.split(needle).length - 1;
  const firstParagraph = (body: string) => body.split(/\n\s*\n/)[0]!.trim();

  it('sends the editor the chapter text once: paragraphs, not the body twice', () => {
    const f = living(true);
    const text = firstParagraph(f.authored.chapter.body);
    expect(text.length).toBeGreaterThan(40);
    const editor = fictionEditorialRequest(f.input, f.authored) as {
      chapter: Record<string, unknown>;
      paragraphs: { index: number; text: string }[];
    };
    expect(count(JSON.stringify(editor), text)).toBe(1);
    expect(editor.paragraphs[0]).toEqual({ index: 1, text });
    // Title and the event and decision IDs stay; only the body is gone.
    expect(Object.keys(editor.chapter).sort()).toEqual([
      'decisionId',
      'eventIds',
      'title',
    ]);
    // The fidelity check still reads the whole chapter.
    expect(
      (
        fictionFidelityRequest(f.input, f.authored) as {
          chapter: { body: string };
        }
      ).chapter.body,
    ).toBe(f.authored.chapter.body);
    // The request got smaller by about the body.
    const v8 = fictionFixture();
    const v8Editor = JSON.stringify(
      fictionEditorialRequest(v8.input, v8.authored),
    );
    expect(count(v8Editor, firstParagraph(v8.authored.chapter.body))).toBe(2);
  });

  it('leaves the authoring aids to the planner and the author', () => {
    const f = living(true);
    const aids = ['referenceProjection', 'castingProjection'];
    for (const key of aids) {
      expect(fictionPlannerRequest(f.input)).toHaveProperty(key);
      expect(fictionAuthorRequest(f.input, f.draft)).toHaveProperty(key);
      expect(
        fictionReviewRequest(f.input, f.authored, f.draft),
      ).not.toHaveProperty(key);
      expect(fictionFidelityRequest(f.input, f.authored)).not.toHaveProperty(
        key,
      );
      expect(fictionEditorialRequest(f.input, f.authored)).not.toHaveProperty(
        key,
      );
    }
    // The bound context and the rest of the review request are untouched.
    expect(fictionReviewRequest(f.input, f.authored)).toHaveProperty(
      'narrativeContext',
    );
    expect(fictionReviewRequest(f.input, f.authored)).toHaveProperty(
      'proposed',
    );
    // The request hash is stable for the same package (reuse checks compare it).
    expect(hash(fictionReviewRequest(f.input, f.authored, f.draft))).toBe(
      hash(fictionReviewRequest(f.input, f.authored, f.draft)),
    );
    // v8 keeps whatever its planner base carries in every check stage.
    const v8 = fictionFixture();
    const planner = fictionPlannerRequest(v8.input);
    for (const key of aids)
      for (const request of [
        fictionReviewRequest(v8.input, v8.authored),
        fictionFidelityRequest(v8.input, v8.authored),
        fictionEditorialRequest(v8.input, v8.authored),
      ])
        expect(key in request).toBe(key in planner);
  });
});

describe('v9 author package order and mechanics figures (C4/D1)', () => {
  it('generates the chapter before the story facts in v9 and keeps the v8 order', () => {
    const keys = (schema: { shape: Record<string, unknown> }) =>
      Object.keys(schema.shape);
    expect(keys(fictionCompactAuthorV9Schema)).toEqual([
      'version',
      'candidate',
      'plan',
      'chapter',
      'storyFacts',
      'characterDelta',
    ]);
    expect(keys(fictionCompactAuthorSchema)).toEqual([
      'version',
      'candidate',
      'plan',
      'storyFacts',
      'chapter',
    ]);
    // The provider's strict output schema follows the same order.
    const sent = zodTextFormat(
      fictionAuthorSchemaFor(fictionV9Policy()),
      'life_narrative_chapter',
    ).schema as { properties: Record<string, unknown>; required: string[] };
    expect(Object.keys(sent.properties)).toEqual(
      keys(fictionCompactAuthorV9Schema),
    );
    expect(sent.required).toEqual(keys(fictionCompactAuthorV9Schema));
  });

  it('still reads a stored v9 package written in the old key order', () => {
    const f = living(true);
    const { storyFacts, chapter, ...rest } = f.authored;
    const oldOrder = { ...rest, storyFacts, chapter };
    expect(Object.keys(oldOrder).indexOf('storyFacts')).toBeLessThan(
      Object.keys(oldOrder).indexOf('chapter'),
    );
    expect(fictionCompactAuthorV9Schema.parse(oldOrder)).toEqual(
      fictionCompactAuthorV9Schema.parse(f.authored),
    );
    expect(() => validateFictionAuthor(f.input, oldOrder)).not.toThrow();
  });

  it('gives only the v9 author request the figures of the life, computed from its own data', () => {
    const f = living(true);
    f.input.state.resources = { energy: 60, availableHoursPerWeek: 5 };
    const request = fictionAuthorRequest(f.input, f.draft) as {
      mechanicsFigures: unknown;
    };
    expect(request.mechanicsFigures).toEqual(
      fictionMechanicsFigures(f.input.state, f.draft.candidate.events),
    );
    expect(request.mechanicsFigures).toContainEqual({
      path: 'resources.availableHoursPerWeek',
      value: 5,
    });
    // Planner, review, fidelity and editor never carry them; v8 neither.
    for (const other of [
      fictionPlannerRequest(f.input),
      fictionReviewRequest(f.input, f.authored, f.draft),
      fictionFidelityRequest(f.input, f.authored),
      fictionEditorialRequest(f.input, f.authored),
    ])
      expect(other).not.toHaveProperty('mechanicsFigures');
    const v8 = fictionFixture();
    expect(fictionAuthorRequest(v8.input, v8.draft)).not.toHaveProperty(
      'mechanicsFigures',
    );
    // A different life, different figures: nothing is fixed in the code.
    f.input.state.resources = { energy: null, availableHoursPerWeek: 9 };
    expect(
      (fictionAuthorRequest(f.input, f.draft) as { mechanicsFigures: unknown })
        .mechanicsFigures,
    ).toContainEqual({ path: 'resources.availableHoursPerWeek', value: 9 });
  });
});
