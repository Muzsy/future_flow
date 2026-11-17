import { describe, expect, it } from 'vitest';
import {
  lifeStoryDraftRequestV2Schema,
  scenarioTemplateSchema,
  storySetupFromDraft,
} from '@future-flow/contracts';
import { hash, instantiateScenarioTemplate } from '@future-flow/core';
import { scenarioFixture } from './scenario-fixtures';
import { setupFixture } from './life-fixtures';

// Plan 051: an operator template may carry the story-form setup, so an
// Official start runs on the same v10 story path as a reader's own story.
function storyBlock() {
  const draft = lifeStoryDraftRequestV2Schema.parse({
    ...setupFixture(),
    story: {
      contractVersion: '1.0.0',
      catalogVersion: '1.0.0',
      direction: 'relationships',
      subtype: 'friendship',
      answers: {},
      startingSituation: { id: 'rel.new_city', note: null },
      boundaries: [],
      title: null,
      goalChoice: 'set',
    },
  });
  const { cast: _cast, ...story } = storySetupFromDraft(draft)!.story as {
    cast?: unknown;
  } & Record<string, unknown>;
  return story;
}

describe('scenario template story block', () => {
  it('keeps every earlier template and its hash unchanged', () => {
    const template = scenarioFixture();
    const parsed = scenarioTemplateSchema.parse(template);
    expect('story' in parsed).toBe(false);
    expect(hash(parsed)).toBe(hash(template));
    expect(instantiateScenarioTemplate(template).story).toBeUndefined();
  });

  it('binds the story cast to the instantiated template actors', () => {
    const story = storyBlock();
    const template = scenarioTemplateSchema.parse({
      ...scenarioFixture(),
      story: {
        ...story,
        cast: [
          {
            actorKey: 'actor-1',
            address: (story as { protagonistAddress: unknown })
              .protagonistAddress,
          },
        ],
      },
    });
    const input = instantiateScenarioTemplate(template);
    expect(input.story).toBeDefined();
    const actor = input.initialState.actors[0]!;
    expect(input.story!.cast).toEqual([
      {
        actorId: actor.id,
        address: (story as { protagonistAddress: unknown }).protagonistAddress,
      },
    ]);
    expect(input.story!.emphases).toEqual(
      (story as { emphases: unknown }).emphases,
    );
  });

  it('refuses a cast entry that names no template actor and private IDs', () => {
    const story = storyBlock();
    const address = (story as { protagonistAddress: unknown })
      .protagonistAddress;
    expect(() =>
      instantiateScenarioTemplate({
        ...scenarioFixture(),
        story: { ...story, cast: [{ actorKey: 'actor-9', address }] },
      }),
    ).toThrow();
    expect(() =>
      scenarioTemplateSchema.parse({
        ...scenarioFixture(),
        story: {
          ...story,
          cast: [{ actorId: '00000000-0000-4000-8000-000000000001', address }],
        },
      }),
    ).toThrow();
  });
});
