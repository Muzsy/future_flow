import { describe, expect, it } from 'vitest';
import { zodTextFormat } from 'openai/helpers/zod';
import {
  fictionCompactUuidFor,
  stripCopiedUuidPatterns,
} from '@future-flow/ai';
import {
  fictionAuthorSchemaFor,
  fictionDraftSchemaFor,
  fictionV9Policy,
  type FictionAuthorResult,
} from '@future-flow/contracts';
import {
  fictionFixture,
  fictionFixtureCharacterDelta,
} from './fiction-fixtures';

// Lasting-cost fix (owner request 2026-10-20): the v9 request schemas drop the
// zod uuid `pattern` where the model only copies an identifier. The server's
// zod schema stays the authority. The provider-path byte tests (v8 and shared
// check schemas byte for byte, v9 smaller) are in fiction-v9-request-bytes.
type Json = { [key: string]: unknown };

describe('v9 request schema compaction', () => {
  it('keeps the pattern on every id the model mints, and strips only copies', () => {
    const uuid = { type: 'string', format: 'uuid', pattern: '^x$' };
    const schema = {
      type: 'object',
      properties: {
        id: { ...uuid },
        sceneId: { ...uuid },
        periodId: { ...uuid },
        eventIds: { type: 'array', items: { ...uuid } },
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { ...uuid },
              actorIds: { type: 'array', items: { ...uuid } },
              threadId: { anyOf: [{ ...uuid }, { type: 'null' }] },
            },
          },
        },
      },
    };
    expect(stripCopiedUuidPatterns(schema)).toBe(4);
    const kept = (node: Json) => 'pattern' in node;
    const props = schema.properties as Record<string, Json>;
    expect(kept(props.id as Json)).toBe(true);
    expect(kept(props.sceneId as Json)).toBe(true);
    expect(kept(props.periodId as Json)).toBe(false);
    expect(kept((props.eventIds as { items: Json }).items)).toBe(false);
    const inner = (
      props.events as unknown as { items: { properties: Record<string, Json> } }
    ).items.properties;
    expect(kept(inner.id as Json)).toBe(true);
    expect(kept((inner.actorIds as unknown as { items: Json }).items)).toBe(
      false,
    );
    expect(
      kept((inner.threadId as unknown as { anyOf: Json[] }).anyOf[0] as Json),
    ).toBe(false);
    // format: uuid is never removed.
    expect(JSON.stringify(schema).match(/"format":"uuid"/g)).toHaveLength(7);
  });

  // Review I2: which uuid fields keep their pattern is a decision, pinned by
  // name on the real schemas. A new field where the model mints an identifier
  // under another name must be added here on purpose (and to the rule in
  // fiction-schema.ts); otherwise it would silently lose its shape guard.
  const retainedUuidPaths = (
    schema: Parameters<typeof zodTextFormat>[0],
    task: string,
  ) => {
    const format = zodTextFormat(schema, task);
    const all: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (Array.isArray(node))
        return node.forEach((x, i) => walk(x, `${path}[${i}]`));
      if (!node || typeof node !== 'object') return;
      const n = node as Json;
      if (n.format === 'uuid' && typeof n.pattern === 'string') all.push(path);
      for (const [k, v] of Object.entries(n)) walk(v, `${path}.${k}`);
    };
    const before = (() => {
      walk(format.schema, '');
      return all.splice(0).length;
    })();
    stripCopiedUuidPatterns(format.schema);
    walk(format.schema, '');
    const short = (path: string) =>
      path
        .replace(/\.properties/g, '')
        .replace(/\.items/g, '[]')
        .replace(/\.anyOf\[(\d+)\]/g, '|$1');
    return { before, kept: all.map(short) };
  };
  const MINTED_CANDIDATE_PATHS = [
    '.candidate.events[].id',
    '.candidate.events[].changes[]|3.value.id',
    '.candidate.events[].changes[]|5.value.id',
    '.candidate.events[].changes[]|9.value.id',
    '.candidate.events[].decision|0.id',
    '.candidate.events[].decision|0.options[].id',
    '.candidate.events[].decision|0.options[].changes[]|3.value.id',
    '.candidate.events[].decision|0.options[].changes[]|5.value.id',
    '.candidate.events[].decision|0.options[].changes[]|9.value.id',
    '.plan.scenes[].sceneId',
    '.plan.memoryDelta.threadUpdates[].id',
  ];
  it('keeps the pattern on exactly the minted ids of the real v9 plan and author schemas', () => {
    const policy = fictionV9Policy();
    const plan = retainedUuidPaths(
      fictionDraftSchemaFor(policy),
      'life_narrative_plan',
    );
    const author = retainedUuidPaths(
      fictionAuthorSchemaFor(policy),
      'life_narrative_chapter',
    );
    // 41 and 55 uuid fields carry a pattern (the other patterns of these
    // schemas are dates); 30 and 43 lose it, 11 and 12 keep it.
    expect(plan.before).toBe(41);
    expect(plan.kept).toEqual(MINTED_CANDIDATE_PATHS);
    expect(author.before).toBe(55);
    expect(author.kept).toEqual([
      ...MINTED_CANDIDATE_PATHS,
      '.storyFacts[].id',
    ]);
  });

  it('only the v9 plan and author prompts select the compact schema', () => {
    expect(fictionCompactUuidFor('life_fiction_plan.v9.en')).toBe(true);
    expect(fictionCompactUuidFor('life_fiction_author.v9.hu')).toBe(true);
    for (const other of [
      undefined,
      'life_fiction_plan.v8.en',
      'life_fiction_author.v8.en',
      'life_fiction_plan_review.v9.en',
      'life_fiction_editor.v8.en',
      'life_fidelity.v1.en',
    ])
      expect(fictionCompactUuidFor(other)).toBe(false);
  });

  it('fails closed: the server zod schema still rejects a malformed uuid anywhere', () => {
    const f = fictionFixture();
    const periodId = f.input.narrativeContext!.periodId;
    const base = f.authored as FictionAuthorResult;
    const authored = {
      ...base,
      characterDelta: fictionFixtureCharacterDelta(periodId, base),
    };
    const schema = fictionAuthorSchemaFor(fictionV9Policy());
    expect(schema.safeParse(authored).success).toBe(true);
    const valid = (mutate: (draft: any) => void) => {
      const copy = JSON.parse(JSON.stringify(authored));
      mutate(copy);
      return schema.safeParse(copy).success;
    };
    const anotherUuid = '00000000-0000-4000-8000-0000000000aa';
    // Copied fields (pattern dropped from the request), a referencing array,
    // a minted id and a delta reference: each accepts a well-formed uuid in
    // the same place and refuses a malformed one.
    for (const set of [
      (d: any, v: string) => (d.candidate.periodId = v),
      (d: any, v: string) => (d.chapter.eventIds[0] = v),
      (d: any, v: string) => (d.candidate.events[0].id = v),
      (d: any, v: string) => (d.characterDelta.removedActorIds = [v]),
    ]) {
      expect(valid((d) => set(d, anotherUuid))).toBe(true);
      expect(valid((d) => set(d, 'not-a-uuid'))).toBe(false);
    }
  });
});
