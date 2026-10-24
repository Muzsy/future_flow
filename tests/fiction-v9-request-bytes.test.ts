import { describe, expect, it, vi } from 'vitest';
import type OpenAI from 'openai';
import {
  EXPERIMENT_DEFAULT_MAX_REQUEST_BYTES,
  EXPERIMENT_REQUEST_BYTE_BUFFER,
  OpenAiProvider,
} from '@future-flow/ai';
import {
  fictionAuthorSchemaFor,
  fictionDraftSchemaFor,
  fictionHumanEditorialV13Schema,
  fidelitySchema,
  narrativePlanReviewV2Schema,
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
  FICTION_REPAIR_RULES,
  fictionAuthorRequest,
  characterStateFromHistory,
  fictionCharacterProjectionFromEnvelope,
  narrativeReferenceSnapshot,
  narrativeReferencesFromMemory,
  type FictionRepair,
} from '@future-flow/core';
import { zodTextFormat } from 'openai/helpers/zod';
import { fictionFixture } from './fiction-fixtures';

// Plan section 55: request bytes of the living-world generation, measured per
// stage with a deterministic cast of 0, 1, 4 and 8 recurring people, typical
// and maximal field lengths. The bounds are provisional until measured.
// KNOWN, MARKED STATE, not a tolerance: the production request guard
// (AI_FICTION_MAX_REQUEST_BYTES, default 100000) is already exceeded by the
// package-repair request of a real chapter in v8 and in v9. The value the
// production setting needs is an owner decision that waits for N09 / the
// release (docs/operations/NARRATIVE_RELEASE_HU.md); 196608 is the prepared
// reviewed-envelope candidate; C5 later measured a 139370-byte raw repair.
// Measured on real runs, not computed by this mock.
const REQUIRED_PROD_REQUEST_CAP_PENDING_OWNER = 196608;
const RECORDED_REAL_REPAIR_REQUEST_BYTES = {
  v8: 108751, // 2026-10-19, v8 paid measurement, real repair author request
  v9: 116336, // 2026-10-20, v9-6b chapter 1, local Codex run, raw request bytes
} as const;
const PINNED_V8_SCHEMA_BYTES = {
  planner: 25927,
  author: 28137,
  review: 1712,
  fidelity: 526,
  editor: 4734,
};
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
  const base = fictionFixture(input);
  // Worst case of the planner's continuity decisions: one maximal decision
  // for every person the projection shows (v9 only; v8 drafts have none).
  const shown =
    (
      input.narrativeContext as unknown as {
        characterProjection?: { actors: { actorId: string }[] };
      }
    ).characterProjection?.actors ?? [];
  const f = {
    ...base,
    draft: shown.length
      ? {
          ...base.draft,
          continuityDecisions: shown.slice(0, 8).map((a) => ({
            actorId: a.actorId,
            decision: 'carry' as const,
            reason: fill(100, 'reason'),
          })),
        }
      : base.draft,
  };
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
  await ai.reviewFiction(f.input, authored, f.draft);
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
    // The response format (JSON schema) each stage sent, by stage.
    formats: {
      planner: parse.mock.calls[0]![0].text.format,
      author: parse.mock.calls[1]![0].text.format,
      review: parse.mock.calls[2]![0].text.format,
      fidelity: parse.mock.calls[3]![0].text.format,
      editor: parse.mock.calls[4]![0].text.format,
    },
    projection: Buffer.byteLength(
      JSON.stringify(f.input.narrativeContext!.characterProjection ?? null),
    ),
  };
}

const STAGES = [
  'planner',
  'author',
  'review',
  'fidelity',
  'editor',
  'authorRepair',
] as const;
const projectionOf = (input: NarrativePeriodInput) =>
  (
    input.narrativeContext as unknown as {
      characterProjection: { actors: unknown[]; omittedActors: number };
    }
  ).characterProjection;

describe('v9 request bytes (plan section 55)', () => {
  // Review F1/F2: the projection is written from by the planner and the
  // author only; the check stages carry its hash. Deltas are against a v8
  // request with the SAME cast, so only what v9 adds is counted.
  it('adds only the projection and a short prompt to the v8 requests', async () => {
    const v8 = await measure(livingInput(0, 'typical', false));
    const empty = await measure(livingInput(0, 'typical'));
    // Measured 2026-10-20: planner +1.9 KiB (intent rules and schema, empty
    // projection), author and package repair +6.9 KiB (delta schema and rules).
    expect(empty.planner - v8.planner).toBeLessThan(3 * 1024);
    // Author side measured 2026-10-20 after the continuity, cast/repair and
    // embodiment lines: +8.0 KiB (was +6.9 KiB), +0.4 KiB of it the cast and
    // repair rules.
    expect(empty.author - v8.author).toBeLessThan(8.5 * 1024);
    expect(empty.authorRepair - v8.authorRepair).toBeLessThan(8.5 * 1024);
    // The checks only see the final package, which gained its delta.
    // The v9 editor prompt is 46 B shorter than the v8 one (the acceptance
    // sentence), so the editor stage is held to the original bound.
    for (const stage of ['review', 'fidelity', 'editor'] as const)
      expect(empty[stage] - v8[stage]).toBeLessThan(1024);
  });

  // Lasting-cost fix: zod renders every uuid with a 178 B regex, a third of
  // the v9 author/plan schema bytes. The v9 plan and author requests drop it
  // where the model copies an identifier (tests/fiction-v9-schema-compact);
  // v8 and the shared check schemas must stay byte for byte as zod renders
  // them, so v8 (and its measured baseline) cannot move.
  it('leaves the v8 and the shared check schemas untouched and shrinks the v9 plan and author schemas', async () => {
    const v8 = await measure(livingInput(0, 'typical', false));
    const v9 = await measure(livingInput(0, 'typical'));
    const wire = (value: unknown) =>
      JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    const bytes = (value: unknown) =>
      Buffer.byteLength(JSON.stringify(value), 'utf8');
    const v8Policy = fictionV8Policy();
    const v9Policy = fictionV9Policy();
    const rendered = {
      planner: zodTextFormat(
        fictionDraftSchemaFor(v8Policy),
        'life_narrative_plan',
      ),
      author: zodTextFormat(
        fictionAuthorSchemaFor(v8Policy),
        'life_narrative_chapter',
      ),
      review: zodTextFormat(
        narrativePlanReviewV2Schema,
        'life_narrative_plan_review',
      ),
      fidelity: zodTextFormat(fidelitySchema, 'life_fidelity'),
      editor: zodTextFormat(
        fictionHumanEditorialV13Schema,
        'life_narrative_editor',
      ),
    };
    for (const stage of [
      'planner',
      'author',
      'review',
      'fidelity',
      'editor',
    ] as const)
      expect(wire(v8.formats[stage])).toEqual(wire(rendered[stage]));
    // Recorded 2026-10-21 before the change; a later contract edit that moves
    // them must be deliberate.
    expect(bytes(v8.formats.author)).toBe(PINNED_V8_SCHEMA_BYTES.author);
    expect(bytes(v8.formats.planner)).toBe(PINNED_V8_SCHEMA_BYTES.planner);
    expect(bytes(v8.formats.review)).toBe(PINNED_V8_SCHEMA_BYTES.review);
    expect(bytes(v8.formats.fidelity)).toBe(PINNED_V8_SCHEMA_BYTES.fidelity);
    expect(bytes(v8.formats.editor)).toBe(PINNED_V8_SCHEMA_BYTES.editor);
    // v9 shares the check schemas byte for byte.
    for (const stage of ['review', 'fidelity', 'editor'] as const)
      expect(wire(v9.formats[stage])).toEqual(wire(v8.formats[stage]));
    // The v9 plan and author schemas keep every uuid format but lose the
    // copied-id patterns (measured 2026-10-21: author 33.5 → 25.8 KB, 43 of
    // 55 uuid patterns; plan 27.2 → 21.8 KB, 30 of 41; the minted ids keep
    // theirs; the other patterns of these schemas are dates).
    const full = {
      planner: zodTextFormat(
        fictionDraftSchemaFor(v9Policy),
        'life_narrative_plan',
      ),
      author: zodTextFormat(
        fictionAuthorSchemaFor(v9Policy),
        'life_narrative_chapter',
      ),
    };
    const count = (value: unknown, needle: string) =>
      (JSON.stringify(value).match(new RegExp(needle, 'g')) ?? []).length;
    for (const stage of ['planner', 'author'] as const) {
      expect(count(v9.formats[stage], '"format":"uuid"')).toBe(
        count(full[stage], '"format":"uuid"'),
      );
      expect(count(v9.formats[stage], '"pattern":"')).toBeLessThan(
        count(full[stage], '"pattern":"') * 0.6,
      );
    }
    expect(bytes(full.author) - bytes(v9.formats.author)).toBeGreaterThan(
      7 * 1024,
    );
    expect(bytes(full.planner) - bytes(v9.formats.planner)).toBeGreaterThan(
      5 * 1024,
    );
    // The request itself falls by the same bytes: the v9 author is no larger
    // than the v8 author plus the projection and the delta rules and the three
    // general sentences of C4/D1 (about 0.6 KB: the order and background
    // sentences, and the mechanics-figures rule).
    expect(v9.author - v8.author).toBeLessThan(2 * 1024);
  });

  // Owner decision 2026-10-21 (v9-6e/6b): a repair carries the rule of ITS
  // mode. A prose-only repair cannot register a fact, so it never hears
  // "register"; an author-package repair is told to edit surgically and to
  // register. v8 requests carry no such key (frozen).
  it('gives the two repair modes different rules, v9 only', () => {
    const v9Input = livingInput(0, 'typical');
    const v8Input = livingInput(0, 'typical', false);
    const f9 = fictionFixture(v9Input);
    const f8 = fictionFixture(v8Input);
    const previous = f9.authored as FictionAuthorResult;
    const repair = (mode: FictionRepair['mode']): FictionRepair => ({
      mode,
      message: 'Fix it.',
      previous,
    });
    const rule = (mode: FictionRepair['mode']) =>
      (
        fictionAuthorRequest(v9Input, f9.draft, repair(mode)) as {
          authorRepair: { repairRule: string };
        }
      ).authorRepair.repairRule;
    expect(rule('prose_only')).toBe(FICTION_REPAIR_RULES.prose_only);
    expect(rule('author_package')).toBe(FICTION_REPAIR_RULES.author_package);
    expect(rule('prose_only')).not.toBe(rule('author_package'));
    // The prose-only rule cannot ask for a registration; the package rule must.
    expect(rule('prose_only')).toContain('no fact can be registered');
    expect(rule('prose_only')).not.toMatch(/Register in storyFacts/);
    expect(rule('prose_only')).toContain('introduce no new cause');
    expect(rule('author_package')).toContain('Register in storyFacts');
    expect(rule('author_package')).toContain('copy previous.chapter.body');
    expect(rule('author_package')).toContain('Never raise the strength');
    // Both modes end on the balance guard (v9-6f chapter 2) and it is small.
    for (const mode of ['prose_only', 'author_package'] as const) {
      expect(rule(mode)).toContain(
        'Fix the named weakness without weakening anything else',
      );
      expect(rule(mode)).toContain(
        "the closing keeps the protagonist's own decision at its center",
      );
      expect(rule(mode)).toContain(
        'every other editorial dimension stays at 4 or above',
      );
    }
    expect(
      FICTION_REPAIR_RULES.prose_only.length +
        FICTION_REPAIR_RULES.author_package.length,
    ).toBeLessThan(1400);
    // No repair: no rule. v8: the repair is sent exactly as before.
    expect(fictionAuthorRequest(v9Input, f9.draft)).toMatchObject({
      authorRepair: null,
    });
    const v8Repair = repair('prose_only');
    expect(
      (
        fictionAuthorRequest(v8Input, f8.draft, v8Repair) as {
          authorRepair: unknown;
        }
      ).authorRepair,
    ).toEqual(v8Repair);
    expect(
      JSON.stringify(
        (
          fictionAuthorRequest(v8Input, f8.draft, v8Repair) as {
            authorRepair: unknown;
          }
        ).authorRepair,
      ),
    ).not.toContain('repairRule');
    // v8 repair request: byte for byte the frozen shape (planner request, the
    // draft, the repair exactly as given), none of the v9 guidance anywhere.
    const v8Request = JSON.stringify(
      fictionAuthorRequest(v8Input, f8.draft, v8Repair),
    );
    expect(v8Request).not.toContain('repairRule');
    expect(v8Request).not.toContain('Fix the named weakness');
    expect(v8Request).toBe(
      JSON.stringify({
        ...fictionAuthorRequest(v8Input, f8.draft),
        authorRepair: v8Repair,
      }),
    );
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
      const v8 = await measure(livingInput(count, size, false));
      expect(m.projection).toBeLessThanOrEqual(
        FICTION_CHARACTER_PROJECTION_BYTES,
      );
      const projection = projectionOf(input);
      // Omission is visible, never silent.
      expect(projection.actors.length + projection.omittedActors).toBe(count);
      // Planner and author pay the projection once (plus the fixed prompt and
      // schema overhead); the three check stages pay almost nothing.
      const slack = 512;
      expect(m.planner - v8.planner).toBeLessThan(
        3 * 1024 + m.projection + slack,
      );
      // The worst-case continuity decisions (up to 8, 100-character reasons,
      // about 1.2 KiB) ride in the draft the author gets and in the one
      // `continuity` block of the review; fidelity and editor never see them.
      const decisions = 1536;
      expect(m.author - v8.author).toBeLessThan(
        8.5 * 1024 + m.projection + decisions + slack,
      );
      expect(m.authorRepair - v8.authorRepair).toBeLessThan(
        8.5 * 1024 + m.projection + decisions + slack,
      );
      expect(m.review - v8.review).toBeLessThan(1024 + decisions);
      for (const stage of ['fidelity', 'editor'] as const)
        expect(m[stage] - v8[stage]).toBeLessThan(1024);
      // A package without repair is five calls; the whole increase stays small
      // against the five v8 requests of the same cast (about +9% measured).
      const sum = (r: typeof m) =>
        r.planner + r.author + r.review + r.fidelity + r.editor;
      expect(sum(m) - sum(v8)).toBeLessThan(0.12 * sum(v8));
      // The REAL production transport guard (AI_FICTION_MAX_REQUEST_BYTES,
      // default 100000), not the 192 KiB experiment envelope. These are mock
      // fixture sizes: real chapters measured +20-30 KB larger already in v8.
      // Every stage but the package repair fits the current production
      // default. The repair request is the worst case of this mock (a
      // 1800-character message and eight people) and is held to the cap the
      // owner still has to set, not to the default it already exceeds (see
      // the recorded state below).
      for (const stage of STAGES)
        expect(m[stage]).toBeLessThan(
          stage === 'authorRepair'
            ? REQUIRED_PROD_REQUEST_CAP_PENDING_OWNER
            : EXPERIMENT_DEFAULT_MAX_REQUEST_BYTES,
        );
    },
  );

  it('shows the full cast at typical sizes and drops optional people first at maximal sizes', async () => {
    const typical = projectionOf(livingInput(8, 'typical'));
    const maximal = projectionOf(livingInput(8, 'max'));
    expect(maximal.omittedActors).toBeGreaterThan(0);
    expect(maximal.actors.length).toBeLessThan(
      typical.actors.length + typical.omittedActors,
    );
  });
});

describe('recorded production request-cap state', () => {
  it('records that the default guard is exceeded by the real v8 and v9 repair requests and the pending value covers them', () => {
    for (const bytes of Object.values(RECORDED_REAL_REPAIR_REQUEST_BYTES)) {
      expect(bytes + EXPERIMENT_REQUEST_BYTE_BUFFER).toBeGreaterThan(
        EXPERIMENT_DEFAULT_MAX_REQUEST_BYTES,
      );
      expect(bytes + EXPERIMENT_REQUEST_BYTE_BUFFER).toBeLessThan(
        REQUIRED_PROD_REQUEST_CAP_PENDING_OWNER,
      );
    }
    // When the default is raised to the required value this test has to be
    // revisited together with the release document, not silently kept.
    expect(EXPERIMENT_DEFAULT_MAX_REQUEST_BYTES).toBeLessThan(
      REQUIRED_PROD_REQUEST_CAP_PENDING_OWNER,
    );
  });
});
