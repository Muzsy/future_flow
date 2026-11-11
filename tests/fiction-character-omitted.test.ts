import { describe, expect, it } from 'vitest';
import {
  FICTION_CHARACTER_VERSION,
  type FictionCharacterDelta,
} from '@future-flow/contracts';
import {
  characterStateFromHistory,
  fictionCharacterOmitted,
  fictionCharacterProjection,
  hash,
} from '@future-flow/core';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ACTORS = Array.from({ length: 6 }, (_, i) => id(100 + i));
const PERIODS = [id(901), id(902), id(903)];
const delta = (ids: string[], periodId: string): FictionCharacterDelta => ({
  version: FICTION_CHARACTER_VERSION,
  addedProfiles: ids.map((actorId) => ({
    actorId,
    originEventId: id(700 + ACTORS.indexOf(actorId)),
    socialRole: 'Neighbour who keeps their own hours',
    coreWant: 'Wants a quiet routine that is not disturbed.',
    independentConcern: 'Keeping an ageing relative comfortable at home.',
    conflictStyle: 'Says little, then states one firm condition.',
    attentionStyle: 'Notices practical details before intentions.',
    valueCue: ['reliability'],
    voiceCue: 'Short, plain sentences.',
    establishedAtPeriodId: periodId,
  })),
  profileUpdates: [],
  dynamicUpdates: ids.map((actorId) => ({
    actorId,
    currentAim: 'Keeping the coming weekend free for family.',
    currentPressure: 'A double shift is coming up this month.',
    attentionOn: 'their own schedule',
    stanceTowardProtagonist: 'Still likes the protagonist, wary of art talk.',
    unresolvedMatter: 'Protagonist turns casual meetings into art reviews.',
    lastMeaningfulChangePeriodId: periodId,
    provenance: 'branch_fiction' as const,
  })),
  relationshipUpdates: [],
  removedActorIds: [],
});
const state = characterStateFromHistory(
  [
    { periodId: PERIODS[0]!, delta: delta(ACTORS.slice(0, 2), PERIODS[0]!) },
    { periodId: PERIODS[1]!, delta: delta(ACTORS.slice(2, 4), PERIODS[1]!) },
    { periodId: PERIODS[2]!, delta: delta(ACTORS.slice(4), PERIODS[2]!) },
  ],
  {
    fictionalOrigins: new Map(ACTORS.map((a, i) => [a, id(700 + i)])),
    suppliedActorIds: new Set(),
  },
);
const signals = { openThreadActors: [ACTORS[0]!, ACTORS[1]!] };

describe('projection omission diagnostics', () => {
  it('leaves the projection output and hash exactly as before the diagnostics existed', () => {
    const projection = fictionCharacterProjection(state, signals);
    expect(hash(projection)).toBe(
      '9d1b26a197a5351b93579b1549f9d4c4e7825d426e9733874b1460266daa8224',
    );
  });
  it('lists exactly the relevant people the projection did not show, with their reasons', () => {
    const projection = fictionCharacterProjection(state, signals);
    const shown = projection.actors.map((a) => a.actorId);
    const omitted = fictionCharacterOmitted(state, signals, shown);
    expect(omitted).toHaveLength(projection.omittedActors);
    for (const o of omitted) {
      expect(shown).not.toContain(o.actorId);
      expect(o.reasons.length).toBeGreaterThan(0);
    }
    expect(new Set([...shown, ...omitted.map((o) => o.actorId)]).size).toBe(
      ACTORS.length,
    );
  });
  it('reports nothing when everything is shown', () => {
    const all = state.actors.map((a) => a.actorId);
    expect(fictionCharacterOmitted(state, signals, all)).toEqual([]);
  });
});
