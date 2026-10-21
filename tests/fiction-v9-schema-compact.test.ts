import { describe, expect, it } from 'vitest';
import {
  fictionCompactUuidFor,
  stripCopiedUuidPatterns,
} from '@future-flow/ai';
import {
  fictionAuthorSchemaFor,
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
