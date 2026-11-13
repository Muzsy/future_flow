import { describe, expect, it } from 'vitest';
import {
  STORY_CATALOG_VERSION,
  fictionPolicySchema,
  fictionV9Policy,
  fictionV10Policy,
  lifeCreateRequestV2Schema,
  lifeStoryCreateRequestV2Schema,
  storyCatalogs,
  storyEmphasisSchema,
  storyLabels,
  storyV1Schema,
} from '../packages/contracts/src';
import { validateStorySetup } from '../packages/core/src/story-direction';
import { fictionPrompts } from '../packages/ai/src/fiction-prompts';

const catalog = storyCatalogs[STORY_CATALOG_VERSION];
const emphasis = {
  direction: 'relationships',
  subtype: 'romantic',
  attraction: { mode: 'engine_decides' },
  relationshipStatus: { mode: 'unspecified' },
  themes: [],
};

describe('story direction contracts', () => {
  it('keeps v9 policy readable and rejects mixed v9 and v10 prompt versions', () => {
    const oldPolicy = fictionV9Policy();
    const policy = fictionV10Policy();
    expect(fictionPolicySchema.parse(oldPolicy)).toEqual(oldPolicy);
    expect(fictionPolicySchema.parse(policy)).toEqual(policy);
    expect(
      fictionPolicySchema.safeParse({
        ...policy,
        promptVersions: {
          ...policy.promptVersions,
          fidelity: oldPolicy.promptVersions.fidelity,
        },
      }).success,
    ).toBe(false);
  });

  it('keeps emerging aims available in goal-free v10 stories', () => {
    const prompts = fictionPrompts('en', fictionV10Policy().promptVersions);
    for (const prompt of Object.values(prompts)) {
      expect(prompt).toContain('its hardLimits are binding when present');
      expect(prompt).not.toContain('Every institution, party, movement');
    }
    expect(prompts.author).toContain('Characters can develop wants and plans');
    expect(prompts.author).toContain('Never emit goal_progress_set');
  });

  it('uses the supplied timing scope throughout the v10 prompts', () => {
    for (const locale of ['en', 'hu'] as const) {
      const prompts = fictionPrompts(locale, fictionV10Policy().promptVersions);
      for (const [stage, prompt] of Object.entries(prompts)) {
        if (stage !== 'planner') expect(prompt).not.toMatch(/six[ -]months?/i);
      }
      expect(prompts.planner).toContain('six months as the planning default');
      expect(prompts.planner).toContain('Choose a shorter period');
      expect(prompts.planner).toContain('Choose a longer period');
      expect(prompts.planner).toContain(
        'first plan the causal progression through the closing decision',
      );
      expect(prompts.author).toContain(
        'When endDate and durationMonths are supplied, copy both exactly',
      );
    }
  });

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
    const setup = lifeStoryCreateRequestV2Schema.parse(request);
    const access = { enabled: true, politicsEnabled: false };
    expect(setup).toEqual(request);
    expect(() => validateStorySetup(setup, access)).not.toThrow();
    expect(() =>
      validateStorySetup(setup, { ...access, enabled: false }),
    ).toThrow('This story direction is unavailable.');
    setup.story.startingSituation.id = 'trv.invalid';
    expect(() => validateStorySetup(setup, access)).toThrow(
      'Select a starting situation for this subtype.',
    );
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
