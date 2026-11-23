import {
  POLITICAL_CATALOG_VERSION,
  STORY_CATALOG_VERSION,
} from '@future-flow/contracts';
import { createRequire } from 'node:module';
import type { createElement as createElementType } from 'react';
import type { renderToStaticMarkup as renderType } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  StoryDirectionFields,
  blankStory,
  type StoryAvailability,
} from '../apps/web/components/story-direction-fields';

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
