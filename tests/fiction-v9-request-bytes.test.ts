import { describe, expect, it, vi } from 'vitest';
import type OpenAI from 'openai';
import {
  EXPERIMENT_CREATIVE_MAX_REQUEST_BYTES,
  EXPERIMENT_REQUEST_BYTE_BUFFER,
  OpenAiProvider,
} from '@future-flow/ai';
import {
  FICTION_CHARACTER_PROJECTION_BYTES,
  FICTION_CHARACTER_VERSION,
  fictionV8Policy,
  fictionV9Policy,
  type FictionAuthorResult,
  type FictionCharacterDelta,
  type FictionCharacterEnvelope,
  type NarrativePeriodInput,
} from '@future-flow/contracts';
import {
  characterStateFromHistory,
  fictionCharacterProjectionFromEnvelope,
  narrativeReferenceSnapshot,
  narrativeReferencesFromMemory,
  type FictionRepair,
} from '@future-flow/core';
import { fictionFixture } from './fiction-fixtures';

// Plan section 55: request bytes of the living-world generation, measured per
// stage with a deterministic cast of 0, 1, 4 and 8 recurring people, typical
// and maximal field lengths. The bounds are provisional until measured.
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const guarded = (request: unknown) =>
  Buffer.byteLength(JSON.stringify(request), 'utf8') +
  EXPERIMENT_REQUEST_BYTE_BUFFER;
const fill = (length: number, seed: string) =>
  `${seed} `
    .repeat(Math.ceil(length / (seed.length + 1)))
    .slice(0, length)
    .trim();

type Size = 'typical' | 'max';
function livingInput(
  count: number,
  size: Size,
  living = true,
): NarrativePeriodInput {
  const base = fictionFixture().input;
  const context = base.narrativeContext;
  if (context?.policy.mode !== 'narrative-fiction-v2')
    throw Error('Expected a fiction fixture.');
  const len = (max: number) => (size === 'max' ? max : Math.ceil(max * 0.55));
  const actorIds = Array.from({ length: count }, (_, i) => id(100 + i));
  const origin = (i: number) => id(700 + i);
  // The 8 KiB delta bound fits two maximal or three typical full states.
  const perDelta = size === 'max' ? 2 : 3;
  const chunks = Array.from({ length: Math.ceil(count / perDelta) }, (_, k) =>
    actorIds.slice(k * perDelta, (k + 1) * perDelta),
  );
  context.memory.history = Array.from(
    { length: Math.ceil(count / 3) },
    (_, k) => ({
      periodId: id(910 + k),
      startDate: `2025-0${k + 1}-01`,
      endDate: `2025-0${k + 1}-28`,
      position: k + 1,
      summary:
        'A friend from the cafe joined the weekly drawing meetings, and the protagonist began treating casual evenings as art reviews, which the friend quietly noticed.',
      salientEventIds: actorIds
        .slice(k * 3, k * 3 + 3)
        .map((_, j) => origin(k * 3 + j)),
      excerpt: null,
    }),
  );
  context.memory.fictionalActors = actorIds.map((actorId, i) => ({
    actorId,
    introducedByEventId: origin(i),
    role: 'Friend who works at the cafe',
    desire: 'Wants an easy evening after work.',
    resistance: 'Dislikes being pulled into plans.',
    voiceCue: 'Dry, brief, deflects with a joke.',
    lastSeenPeriodId: id(910),
  }));
  for (const [i, actorId] of actorIds.entries())
    base.state.actors.push({
      id: actorId,
      label: `Person ${i}`,
      relationship: 'friend',
    });
  base.narrativeReferences = narrativeReferenceSnapshot(
    narrativeReferencesFromMemory(context.memory),
  );
  const delta = (ids: string[], periodId: string): FictionCharacterDelta => ({
    version: FICTION_CHARACTER_VERSION,
    addedProfiles: ids.map((actorId) => ({
      actorId,
      originEventId: origin(actorIds.indexOf(actorId)),
      socialRole: fill(len(120), 'role'),
      coreWant: fill(len(200), 'want'),
      independentConcern: fill(len(200), 'concern'),
      conflictStyle: fill(len(200), 'conflict'),
      attentionStyle: fill(len(200), 'attention'),
      valueCue: [fill(len(60), 'valueone'), fill(len(60), 'valuetwo')],
      voiceCue: fill(len(120), 'voice'),
      establishedAtPeriodId: periodId,
    })),
    profileUpdates: [],
    dynamicUpdates: ids.map((actorId) => ({
      actorId,
      currentAim: fill(len(200), 'aim'),
      currentPressure: fill(len(200), 'pressure'),
      attentionOn: fill(len(160), 'attention'),
      stanceTowardProtagonist: fill(len(200), 'stance'),
      unresolvedMatter: fill(len(200), 'matter'),
      lastMeaningfulChangePeriodId: periodId,
      provenance: 'branch_fiction' as const,
    })),
    relationshipUpdates: ids.map((actorId) => ({
      actorId,
      currentDynamic: fill(len(240), 'dynamic'),
      expectation: fill(len(200), 'expect'),
      unresolvedInteraction: fill(len(240), 'interaction'),
      provenance: 'interaction_derived' as const,
    })),
    removedActorIds: [],
  });
  const envelope: FictionCharacterEnvelope = {
    version: FICTION_CHARACTER_VERSION,
    state: characterStateFromHistory(
      chunks.map((ids, k) => ({
        periodId: id(901 + k),
        delta: delta(ids, id(901 + k)),
      })),
      {
        fictionalOrigins: new Map(actorIds.map((a, i) => [a, origin(i)])),
        suppliedActorIds: new Set(),
      },
    ),
    fictionalOrigins: actorIds.map((actorId, i) => ({
      actorId,
      introducedByEventId: origin(i),
    })),
    suppliedActorIds: [],
    signals: {
      openThreadActors: actorIds,
      goalOrOpportunityActors: [],
      overduePrivateLifeActors: [],
    },
  };
  if (!living) {
    context.policy = fictionV8Policy();
    return base;
  }
  context.policy = fictionV9Policy();
  context.characterProjection = fictionCharacterProjectionFromEnvelope(
    envelope,
    false,
  );
  base.fictionCharacters = envelope;
  return base;
}

// Real provider code path with a recording mock: the guard sees exactly this.
async function measure(input: NarrativePeriodInput) {
  const f = fictionFixture(input);
  const authored = f.authored as FictionAuthorResult;
  const requests: Record<string, unknown> = {};
  const parse = vi.fn(
    async (request: { model: string; text: { format: { name: string } } }) => {
      const task = request.text.format.name;
      requests[`${task}:${Object.keys(requests).length}`] = request;
      return {
        status: 'completed',
        model: request.model,
        output_parsed:
          task === 'life_narrative_plan'
            ? f.draft
            : task === 'life_narrative_chapter'
              ? f.authored
              : task === 'life_narrative_plan_review'
                ? f.review
                : task === 'life_fidelity'
                  ? f.fidelity
                  : f.editor,
        usage: { input_tokens: 1, output_tokens: 1 },
      };
    },
  );
  const ai = new OpenAiProvider(
    {
      apiKey: 'offline-fiction-only',
      eventModel: 'gpt-6.1-sol',
      storyModel: 'gpt-6.1-sol',
      checkModel: 'gpt-6.1-sol',
      timeoutMs: 1000,
      maxOutputTokens: 12000,
    },
    { responses: { parse } } as unknown as OpenAI,
  );
  const repair: FictionRepair = {
    mode: 'author_package',
    message: 'x'.repeat(1800),
    previous: authored,
  };
  await ai.planFiction(f.input);
  await ai.authorFiction(f.input, f.draft, undefined);
  await ai.reviewFiction(f.input, authored);
  await ai.checkFiction(f.input, authored);
  await ai.editFiction(f.input, authored);
  await ai.authorFiction(f.input, f.draft, repair);
  const bytes = parse.mock.calls.map((call) => guarded(call[0]));
  return {
    planner: bytes[0]!,
    author: bytes[1]!,
    review: bytes[2]!,
    fidelity: bytes[3]!,
    editor: bytes[4]!,
    authorRepair: bytes[5]!,
    projection: Buffer.byteLength(
      JSON.stringify(f.input.narrativeContext!.characterProjection ?? null),
    ),
  };
}

describe('v9 request bytes (plan section 55)', () => {
  it('adds only the projection and a short prompt to the v8 requests', async () => {
    const v8 = await measure(livingInput(0, 'typical', false));
    const empty = await measure(livingInput(0, 'typical'));
    // Measured 2026-10-20: planner +1.9 KiB (intent rules and schema, empty
    // projection), author and package repair +6.9 KiB (delta schema and rules).
    expect(empty.planner - v8.planner).toBeLessThan(3 * 1024);
    expect(empty.author - v8.author).toBeLessThan(8 * 1024);
    expect(empty.authorRepair - v8.authorRepair).toBeLessThan(8 * 1024);
    // The checks only see the final package, which gained its delta.
    for (const stage of ['review', 'fidelity', 'editor'] as const)
      expect(empty[stage] - v8[stage]).toBeLessThan(1024);
  });

  it.each([
    [1, 'typical'],
    [4, 'typical'],
    [8, 'typical'],
    [8, 'max'],
  ] as const)(
    'keeps %i %s people inside the projection and request bounds',
    async (count, size) => {
      const input = livingInput(count, size);
      const m = await measure(input);
      expect(m.projection).toBeLessThanOrEqual(
        FICTION_CHARACTER_PROJECTION_BYTES,
      );
      const projection =
        input.narrativeContext!.policy.mode === 'narrative-fiction-v2'
          ? (
              input.narrativeContext as unknown as {
                characterProjection: {
                  actors: unknown[];
                  omittedActors: number;
                };
              }
            ).characterProjection
          : null;
      // Omission is visible, never silent.
      expect(projection!.actors.length + projection!.omittedActors).toBe(count);
      for (const stage of [
        'planner',
        'author',
        'review',
        'fidelity',
        'editor',
        'authorRepair',
      ] as const)
        expect(m[stage]).toBeLessThan(EXPERIMENT_CREATIVE_MAX_REQUEST_BYTES);
    },
  );

  it('shows the full cast at typical sizes and drops optional people first at maximal sizes', async () => {
    const typical = livingInput(8, 'typical').narrativeContext as unknown as {
      characterProjection: { actors: unknown[]; omittedActors: number };
    };
    const maximal = livingInput(8, 'max').narrativeContext as unknown as {
      characterProjection: { actors: unknown[]; omittedActors: number };
    };
    expect(maximal.characterProjection.omittedActors).toBeGreaterThan(0);
    expect(maximal.characterProjection.actors.length).toBeLessThan(
      typical.characterProjection.actors.length +
        typical.characterProjection.omittedActors,
    );
  });
});
