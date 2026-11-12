import {
  STORY_BLOCK_BYTES,
  STORY_CATALOG_VERSION,
  storyCatalogs,
  storyLabels,
  type NarrativePeriodInput,
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

export function lifeTitle(input: LifeInputV2): string {
  const title =
    input.story?.title ??
    input.goals.find(({ priority }) => priority === 'primary')?.description;
  if (title) return title;

  const emphasis = input.story?.emphases[0];
  if (!input.story || !emphasis)
    throw new DomainError(
      'STORY_DIRECTION_INVALID',
      'The life has no title source.',
    );
  const { locale } = input;
  const direction = storyLabels.directions[emphasis.direction].label[locale];
  const { id } = input.story.startingSituation;
  const detail =
    id === 'custom'
      ? Object.entries(storyLabels.subtypes).find(
          ([key]) => key === `${emphasis.direction}/${emphasis.subtype}`,
        )?.[1][locale]
      : Object.entries(storyLabels.situations).find(([key]) => key === id)?.[1]
          .label[locale];
  if (!detail)
    throw new DomainError(
      'STORY_DIRECTION_INVALID',
      'The life has an unknown starting situation.',
    );
  return `${direction} · ${detail}`;
}

export function storyDirectionProjection(input: NarrativePeriodInput) {
  const { story } = input.input;
  const emphasis = story?.emphases[0];
  if (!story || !emphasis)
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'A v10 request needs a story direction.',
    );
  const direction =
    storyCatalogs[story.catalogVersion].directions[emphasis.direction];
  const subtype = Object.entries(direction.subtypes).find(
    ([key]) => key === emphasis.subtype,
  )?.[1];
  const { id } = story.startingSituation;
  const situation = Object.entries(direction.situations).find(
    ([key]) => key === id,
  )?.[1];
  if (
    !subtype ||
    (id !== 'custom' &&
      (!situation ||
        !(situation.subtypes as readonly string[]).includes(emphasis.subtype)))
  )
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'The stored story direction does not match its catalogue.',
    );

  const firstPeriod = input.startDate === input.input.initialState.effectiveAt;
  const address = {
    she_her: 'she/her',
    he_him: 'he/him',
    they_them: 'they/them',
  } as const;
  const protagonist = story.protagonistAddress;
  const rules = [
    protagonist.mode === 'specified'
      ? `Protagonist address: ${address[protagonist.value]}.`
      : protagonist.mode === 'engine_decides'
        ? 'Protagonist address: choose it once for the fictional character, record it and keep it.'
        : 'Protagonist address: not given. Use second person and do not assign a gender.',
  ];
  for (const member of story.cast) {
    if (member.address.mode === 'specified')
      rules.push(
        `Actor ${member.actorId}: use ${address[member.address.value]}.`,
      );
    if (member.address.mode === 'engine_decides')
      rules.push(
        `Actor ${member.actorId}: choose a fictional form of address once and keep it.`,
      );
  }
  rules.push(
    'For supplied people without an address rule, use names or neutral wording without assigning gender or identity.',
  );
  if (emphasis.direction === 'relationships') {
    const { attraction, relationshipStatus } = emphasis;
    if (attraction.mode === 'specified')
      rules.push(
        `New fictional romantic interest: choose from ${attraction.value.join(', ')}.`,
      );
    if (attraction.mode === 'engine_decides')
      rules.push(
        'Choose the fictional romantic interest and keep it consistent.',
      );
    if (attraction.mode === 'unspecified')
      rules.push(
        'Do not initiate a new romantic interest for the protagonist without an accepted choice.',
      );
    if (firstPeriod)
      rules.push(
        relationshipStatus.mode === 'specified'
          ? `Initial relationship status: ${relationshipStatus.value}.`
          : relationshipStatus.mode === 'engine_decides'
            ? 'Choose the initial fictional relationship status.'
            : 'Initial relationship status: not given. Leave it unstated.',
      );
  }
  if (
    firstPeriod &&
    emphasis.direction === 'career' &&
    emphasis.subtype !== 'employee'
  ) {
    rules.push(
      emphasis.venture.mode === 'specified'
        ? 'Use the fictional venture described in input.story.emphases.'
        : emphasis.venture.mode === 'engine_decides'
          ? 'Choose the fictional venture once and preserve it.'
          : 'The venture is undisclosed. Leave its field unstated.',
      emphasis.buildingWith.mode === 'specified'
        ? `The protagonist builds the venture with: ${emphasis.buildingWith.value}.`
        : emphasis.buildingWith.mode === 'engine_decides'
          ? 'Choose who builds the fictional venture and preserve that arrangement.'
          : 'The venture arrangement is undisclosed. Leave it unstated.',
    );
  }
  if (firstPeriod && emphasis.direction === 'creative') {
    rules.push(
      emphasis.experience.mode === 'specified'
        ? `Initial creative experience: ${emphasis.experience.value}.`
        : emphasis.experience.mode === 'engine_decides'
          ? 'Choose the fictional starting experience once and preserve it.'
          : 'Initial creative experience is undisclosed. Leave it unstated.',
    );
  }
  if (firstPeriod && emphasis.direction === 'travel') {
    rules.push(
      emphasis.companions.mode === 'specified'
        ? `Initial travel companions: ${emphasis.companions.value}.`
        : emphasis.companions.mode === 'engine_decides'
          ? 'Choose the initial fictional travel companions and preserve them.'
          : 'Initial travel companions are undisclosed. Leave them unstated.',
    );
  }
  if (story.boundaries.length)
    rules.push(
      'Respect each entry in input.story.boundaries as a story boundary.',
    );

  const projection = {
    version: '1.0.0' as const,
    catalogVersion: story.catalogVersion,
    emphases: [
      {
        direction: emphasis.direction,
        subtype: emphasis.subtype,
        ...direction.engine,
        subtypeFocus: subtype.engine.focus,
      },
    ],
    ...(firstPeriod
      ? { startingSituation: { id, brief: situation?.engine.brief ?? null } }
      : {}),
    goalMode: input.state.goals.length ? 'set' : 'none',
    rules,
  };
  if (
    rules.length > 16 ||
    rules.some((rule) => rule.length > 240) ||
    Buffer.byteLength(JSON.stringify(projection), 'utf8') > 6144
  )
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Story direction projection is too large.',
    );
  return projection;
}
