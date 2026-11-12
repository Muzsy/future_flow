import {
  STORY_BLOCK_BYTES,
  STORY_CATALOG_VERSION,
  storyCatalogs,
  type LifeInputV2,
  type lifeStoryCreateRequestV2Schema,
} from '@future-flow/contracts';
import type { z } from 'zod';
import { DomainError } from './errors';

export function validateStorySetup(
  setup: z.infer<typeof lifeStoryCreateRequestV2Schema>,
  access: { enabled: boolean; politicsEnabled: boolean },
): void {
  const { story } = setup;
  const [emphasis] = story.emphases;
  if (!emphasis || story.catalogVersion !== STORY_CATALOG_VERSION)
    throw new DomainError(
      'STORY_DIRECTION_INVALID',
      'Select a current story direction.',
      400,
    );
  const direction =
    storyCatalogs[story.catalogVersion].directions[emphasis.direction];
  if (
    !access.enabled ||
    !direction.selectable ||
    (direction.flag === 'politics' && !access.politicsEnabled)
  )
    throw new DomainError(
      'STORY_DIRECTION_UNAVAILABLE',
      'This story direction is unavailable.',
      409,
    );

  const { id, note } = story.startingSituation;
  const situation = Object.entries(direction.situations).find(
    ([key]) => key === id,
  )?.[1];
  const validSituation =
    id === 'custom'
      ? (note?.length ?? 0) >= 10
      : situation?.selectable &&
        (situation.subtypes as readonly string[]).includes(emphasis.subtype);
  if (!validSituation)
    throw new DomainError(
      'STORY_DIRECTION_INVALID',
      'Select a starting situation for this subtype.',
      400,
    );

  const invalidAnswers =
    (emphasis.direction === 'relationships' &&
      (emphasis.subtype === 'friendship' || emphasis.subtype === 'family') &&
      (emphasis.attraction.mode !== 'unspecified' ||
        emphasis.relationshipStatus.mode !== 'unspecified')) ||
    (emphasis.direction === 'creative' &&
      emphasis.field === 'other' &&
      !emphasis.fieldLabel) ||
    (emphasis.direction === 'career' &&
      ((emphasis.subtype === 'employee' &&
        (emphasis.venture.mode !== 'unspecified' ||
          emphasis.buildingWith.mode !== 'unspecified' ||
          emphasis.funding.length > 0)) ||
        (emphasis.subtype !== 'transition' &&
          emphasis.jobAnchors.length > 0))) ||
    (emphasis.direction === 'travel' &&
      (setup.stayInCountry ||
        (emphasis.subtype !== 'work' && emphasis.workKind !== null)));
  if (
    invalidAnswers ||
    Buffer.byteLength(JSON.stringify(story), 'utf8') > STORY_BLOCK_BYTES
  )
    throw new DomainError(
      'STORY_DIRECTION_INVALID',
      'The answers do not fit this story direction.',
      400,
    );
}

export function assertPublishableStory(input: LifeInputV2): void {
  if (
    input.goals.length === 0 ||
    input.story?.emphases.some(({ direction }) => direction === 'politics')
  )
    throw new DomainError(
      'PUBLIC_PREVIEW_STORY_UNSUPPORTED',
      'This story cannot be prepared for publication yet.',
      409,
    );
}
