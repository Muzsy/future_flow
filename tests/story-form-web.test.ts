import {
  POLITICAL_CATALOG_VERSION,
  STORY_CATALOG_VERSION,
  lifeStoryDraftRequestV2Schema,
  storySetupFromDraft,
} from '@future-flow/contracts';
import { validateStorySetup } from '@future-flow/core';
import {
  storyDirectionProjection,
  fictionPlannerRequest,
  lifeTitle,
} from '@future-flow/core';
import { buildLifeInput } from '../packages/database/src/lives';
import { createRequire } from 'node:module';
import type { createElement as createElementType } from 'react';
import type { renderToStaticMarkup as renderType } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  StoryDirectionFields,
  blankStory,
  directionStep,
  type StoryAvailability,
} from '../apps/web/components/story-direction-fields';
import {
  detailedBackTarget,
  quickStoryGroups,
  QuickStoryStart,
  selectOwnSituation,
  selectQuickStory,
} from '../apps/web/components/quick-story-start';
import { setupFixture } from './life-fixtures';
import { fictionFixture } from './fiction-fixtures';

const webRequire = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const { createElement } = webRequire('react') as {
  createElement: typeof createElementType;
};
const { renderToStaticMarkup } = webRequire('react-dom/server') as {
  renderToStaticMarkup: typeof renderType;
};

const availability = {
  enabled: true,
  catalogVersion: STORY_CATALOG_VERSION,
  politicsCatalogVersion: POLITICAL_CATALOG_VERSION,
  directions: ['relationships', 'career', 'creative', 'travel', 'politics'].map(
    (id) => ({ id, enabled: true }),
  ),
} as unknown as StoryAvailability;

function render(direction: string, subtype: string, locale: 'en' | 'hu') {
  const story = {
    ...blankStory(
      direction === 'politics'
        ? POLITICAL_CATALOG_VERSION
        : STORY_CATALOG_VERSION,
    ),
    direction,
    subtype,
  };
  return renderToStaticMarkup(
    createElement(StoryDirectionFields, {
      step: -2,
      story,
      availability,
      locale,
      onChange: () => undefined,
    }),
  );
}

// Every question title appears once as visible text: the legend, never again
// as a heading inside its own card group (owner report, 2026-11-23).
describe('story direction questions show each title once', () => {
  const cases = [
    ['politics', 'local'],
    ['politics', 'organization'],
    ['politics', 'staff'],
    ['politics', 'civic'],
    ['career', 'transition'],
    ['creative', 'personal'],
    ['travel', 'journey'],
    ['relationships', 'romantic'],
  ] as const;
  for (const locale of ['en', 'hu'] as const)
    for (const [direction, subtype] of cases)
      it(`${direction}/${subtype} (${locale})`, () => {
        const html = render(direction, subtype, locale);
        const legends = [...html.matchAll(/<legend>([^<]+)<\/legend>/g)].map(
          (m) => m[1]!,
        );
        expect(legends.length).toBeGreaterThan(0);
        for (const title of legends) {
          const visible = html.split(`>${title}<`).length - 1;
          expect(visible, title).toBe(1);
        }
      });
});

describe('single-page story selection', () => {
  it('reuses the theme for a custom start and renders no second picker', () => {
    const groups = quickStoryGroups(availability);
    const blank = blankStory(STORY_CATALOG_VERSION);
    const career = selectOwnSituation(blank, groups, 'career');
    expect(career).toMatchObject({ direction: 'career', subtype: 'employee' });
    const note = 'The first customers arrive unexpectedly.';
    career.startingSituation.note = note;
    const travel = selectOwnSituation(career, groups, 'travel');
    expect(travel).toMatchObject({
      direction: 'travel',
      subtype: 'journey',
      startingSituation: { id: 'custom', note },
    });
    expect(directionStep(travel, availability)).toBe(0);
    const html = renderToStaticMarkup(
      createElement(QuickStoryStart, {
        story: career,
        availability,
        locale: 'en',
        busy: false,
        canStart: true,
        context: null,
        hasSavedDetails: false,
        onStory: () => undefined,
        onContext: () => undefined,
        onStart: () => undefined,
        onDetailed: () => undefined,
      }),
    );
    expect(html.match(/<select\b/g)).toHaveLength(1);
    expect(html).toContain('value="career" selected=""');
    expect(html).toContain(note);
    expect(html).not.toContain('First real role');
    const employee = groups.find(({ key }) => key === 'career:employee')!;
    const ready = selectQuickStory(career, employee, 'car.first_real_role');
    const restored = selectOwnSituation(
      lifeStoryDraftRequestV2Schema.parse({
        ...setupFixture(),
        locale: 'en',
        story: ready,
      }).story,
      groups,
      'career',
    );
    expect(restored.startingSituation.note).toBe(note);
  });
  it('builds a valid start from every preset and custom focus', () => {
    const groups = quickStoryGroups(availability);
    expect(groups).toHaveLength(17);
    expect(groups.flatMap(({ cards }) => cards)).toHaveLength(80);
    for (const group of groups) {
      for (const id of [...group.cards, 'custom']) {
        const story = selectQuickStory(
          blankStory(STORY_CATALOG_VERSION),
          group,
          id,
        );
        if (id === 'custom')
          story.startingSituation.note = 'A letter changes the plans.';
        expect(directionStep(story, availability), group.key + ' ' + id).toBe(
          0,
        );
        const setup = storySetupFromDraft({
          ...setupFixture(),
          locale: 'en',
          stayInCountry: false,
          story: { ...story, quickStart: true },
        });
        expect(setup, group.key + ' ' + id).not.toBeNull();
        expect(setup?.story.premiseLed).toBe(
          id === 'custom' ? true : undefined,
        );
        validateStorySetup(setup!, { enabled: true, politicsEnabled: true });
      }
    }
  });

  it('keeps the detailed draft fields available without applying them on quick start', () => {
    const group = quickStoryGroups(availability).find(
      ({ key }) => key === 'relationships:romantic',
    )!;
    const story = selectQuickStory(
      blankStory(STORY_CATALOG_VERSION),
      group,
      'rel.long_partnership_turn',
    );
    const detail = lifeStoryDraftRequestV2Schema.parse({
      ...setupFixture(),
      locale: 'en',
      identity: { mode: 'self', ageBand: '45_54', label: 'Saved name' },
      context: 'Only free at weekends.',
      story: {
        ...story,
        startingSituation: {
          ...story.startingSituation,
          note: 'Earlier note.',
        },
        protagonistAddress: { mode: 'specified', value: 'he_him' },
        boundaries: ['No violence'],
        title: 'Private title',
      },
    });
    const quick = storySetupFromDraft({
      ...detail,
      story: { ...detail.story, quickStart: true },
    });
    const detailed = storySetupFromDraft(detail);
    expect(quick).toMatchObject({
      identity: { mode: 'alternate', label: null },
      relationships: [],
      context: detail.context,
      story: {
        startingSituation: { note: null },
        protagonistAddress: { mode: 'unspecified' },
        boundaries: ['No violence'],
        title: null,
      },
    });
    expect(detailed).toMatchObject({
      identity: detail.identity,
      story: {
        startingSituation: detail.story.startingSituation,
        protagonistAddress: detail.story.protagonistAddress,
      },
    });
  });

  it('uses a written premise without projecting a technical subtype or creative field', () => {
    const groups = quickStoryGroups(availability);
    for (const [direction, note, fallback] of [
      ['career', 'I quit my job to start a bakery.', 'do not own'],
      [
        'creative',
        'I am a sculptor preparing a public exhibition.',
        'never push toward',
      ],
      [
        'relationships',
        "At my cousin's wedding I fall for one of the musicians.",
        'Do not initiate a new romantic interest',
      ],
      ['travel', 'I retire at 67 and finally travel by rail.', 'local'],
    ]) {
      const story = selectOwnSituation(
        blankStory(STORY_CATALOG_VERSION),
        groups,
        direction!,
      );
      story.startingSituation.note = note!;
      const setup = storySetupFromDraft({
        ...setupFixture(),
        locale: 'en',
        story: { ...story, quickStart: true },
      })!;
      const fixture = fictionFixture().input;
      const life = {
        ...buildLifeInput(setup, fixture.startDate),
        branchId: fixture.input.branchId,
      };
      const input = { ...fixture, input: life, state: life.initialState };
      const projection = storyDirectionProjection(input);
      expect(projection.emphases[0]?.subtype).toBe('custom');
      expect(JSON.stringify(projection)).not.toContain(fallback);
      const request = fictionPlannerRequest(input);
      expect(request.input.story).toMatchObject({
        emphases: [{ direction }],
        startingSituation: { id: 'custom', note },
      });
      expect(request.input.story?.emphases[0]).toEqual({
        direction,
      });
      expect(request.input.identity).not.toHaveProperty('ageBand');
      expect(lifeTitle(life)).toContain(note);
      if (direction === 'relationships')
        expect(projection.rules).toContain(
          'A romantic interest may follow the reader’s fictional premise or an accepted choice. Keep the established relationship consistent.',
        );
    }
  });

  it('offers a generated public-life start after the subtype’s issues are used', () => {
    const local = quickStoryGroups(availability).find(
      ({ key }) => key === 'politics:local',
    )!;
    const used = { ...availability, usedPoliticalIssueKeys: local.cards };
    const available = quickStoryGroups(used).find(
      ({ key }) => key === local.key,
    )!;
    expect(available.cards).toEqual(['generated']);
    const story = selectQuickStory(
      blankStory(STORY_CATALOG_VERSION),
      available,
      'generated',
    );
    expect(directionStep(story, used)).toBe(0);
  });

  it('returns from the detailed setup to the quick start along the reader’s path', () => {
    // Entered at "The main character" (index 3) after choosing a card.
    expect(detailedBackTarget(3, 3)).toBe('quick');
    expect(detailedBackTarget(5, 3)).toBe('previous');
    expect(detailedBackTarget(2, 3)).toBe('previous');
    expect(detailedBackTarget(0, 3)).toBe('quick');
    // Entered on the first step with nothing chosen yet.
    expect(detailedBackTarget(0, 0)).toBe('quick');
    expect(detailedBackTarget(1, 0)).toBe('previous');
  });
});
