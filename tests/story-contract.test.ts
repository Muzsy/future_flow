import { describe, expect, it } from 'vitest';
import {
  STORY_CATALOG_VERSION,
  lifeCreateRequestV2Schema,
  lifeStoryCreateRequestV2Schema,
  storyCatalogs,
  storyEmphasisSchema,
  storyLabels,
  storyV1Schema,
} from '../packages/contracts/src';

const catalog = storyCatalogs[STORY_CATALOG_VERSION];
const emphasis = {
  direction: 'relationships',
  subtype: 'romantic',
  attraction: { mode: 'engine_decides' },
  relationshipStatus: { mode: 'unspecified' },
  themes: [],
};

describe('story direction contracts', () => {
  it('covers each catalogue entry with labels and matching schema identifiers', () => {
    const situationIds = new Set<string>();
    for (const [direction, entry] of Object.entries(catalog.directions)) {
      expect(storyLabels.directions).toHaveProperty(direction);
      expect(entry.engine.hardLimits.length > 0, direction).toBe(
        direction === 'politics',
      );
      const variant = storyEmphasisSchema.options.find(
        (option) => option.shape.direction.value === direction,
      );
      expect(variant?.shape.subtype.options.toSorted()).toEqual(
        Object.keys(entry.subtypes).toSorted(),
      );
      for (const subtype of Object.keys(entry.subtypes)) {
        expect(
          Object.hasOwn(storyLabels.subtypes, direction + '/' + subtype),
        ).toBe(true);
        expect(
          Object.values(entry.situations).some((situation) =>
            (situation.subtypes as readonly string[]).includes(subtype),
          ),
        ).toBe(true);
      }
      for (const [id, situation] of Object.entries(entry.situations)) {
        expect(situationIds.has(id)).toBe(false);
        situationIds.add(id);
        expect(Object.hasOwn(storyLabels.situations, id)).toBe(true);
        expect(situation.engine.brief.length).toBeLessThanOrEqual(300);
      }
    }
    expect(situationIds.size).toBe(50);
  });

  it('distinguishes delegated fictional choices from undisclosed answers', () => {
    expect(storyEmphasisSchema.parse(emphasis)).toEqual(emphasis);
    expect(
      storyEmphasisSchema.safeParse({
        ...emphasis,
        attraction: { mode: 'unspecified', value: ['women'] },
      }).success,
    ).toBe(false);
    expect(
      storyEmphasisSchema.safeParse({
        ...emphasis,
        attraction: { mode: 'specified' },
      }).success,
    ).toBe(false);
  });

  it('accepts a goal-free direction request without loosening the legacy endpoint contract', () => {
    const request = {
      locale: 'en',
      identity: { mode: 'alternate', label: null, ageBand: '25_34' },
      location: { country: null, region: null, housing: null },
      employment: { status: null, employerLabel: null, workDomain: null },
      finance: { currency: null, monthlyIncome: null, liquidFunds: null },
      skills: [],
      relationships: [],
      resources: { energy: null, availableHoursPerWeek: null },
      goal: null,
      stayInCountry: false,
      context: null,
      story: {
        contractVersion: '1.0.0',
        catalogVersion: STORY_CATALOG_VERSION,
        emphases: [emphasis],
        startingSituation: { id: 'rel.new_city', note: null },
        protagonistAddress: { mode: 'unspecified' },
        boundaries: [],
        title: null,
      },
    };
    expect(lifeStoryCreateRequestV2Schema.parse(request)).toEqual(request);
    const { story: _story, ...withoutDirection } = request;
    expect(
      lifeStoryCreateRequestV2Schema.safeParse(withoutDirection).success,
    ).toBe(false);
    expect(lifeCreateRequestV2Schema.safeParse(withoutDirection).success).toBe(
      false,
    );
  });

  it('accepts exactly one emphasis in a stored story', () => {
    const story = {
      contractVersion: '1.0.0',
      catalogVersion: STORY_CATALOG_VERSION,
      emphases: [emphasis],
      startingSituation: { id: 'rel.new_city', note: null },
      protagonistAddress: { mode: 'unspecified' },
      cast: [],
      boundaries: [],
      title: null,
    };
    expect(storyV1Schema.parse(story)).toEqual(story);
    expect(storyV1Schema.safeParse({ ...story, emphases: [] }).success).toBe(
      false,
    );
    expect(
      storyV1Schema.safeParse({ ...story, emphases: [emphasis, emphasis] })
        .success,
    ).toBe(false);
  });
});
