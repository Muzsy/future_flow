import {
  STORY_BLOCK_BYTES,
  STORY_CATALOG_VERSION,
  POLITICAL_CATALOG_VERSION,
  isPoliticalCatalogVersion,
  politicsForm,
  storyCatalogs,
  storyLabels,
  type NarrativePeriodInput,
  type LifeInputV2,
  type lifeStoryCreateRequestV2Schema,
  fictionAddressQualityVersions,
} from '@future-flow/contracts';
import type { z } from 'zod';
import { DomainError } from './errors';

// Plan 049/08: from catalogue 1.2.0 each political subtype asks its own
// questions; no scope, the adviser's way of acting is implied, and free-text
// role only beside position 'other'.
function politicalAnswersFit(emphasis: {
  subtype: keyof typeof politicsForm;
  role: string | null;
  stakes: string | null;
  style: string | null;
  position?: string | null;
  institution?: string | null;
}) {
  const form = politicsForm[emphasis.subtype];
  const position = emphasis.position ?? null;
  const institution = emphasis.institution ?? null;
  return (
    emphasis.stakes === null &&
    (position === null ||
      (form.position as readonly string[]).includes(position)) &&
    (institution === null ||
      (form.institution as readonly string[]).includes(institution)) &&
    (form.style || emphasis.style === null) &&
    (emphasis.role === null || position === 'other')
  );
}

const politicalLabels: Record<string, string> = {
  new_councillor: 'new councillor',
  long_serving_councillor: 'long-serving councillor',
  candidate: 'candidate',
  committee_chair: 'committee chair',
  member: 'member',
  officer: 'office holder',
  adviser: 'adviser',
  communications: 'communications',
  policy_staff: 'policy staff',
  organiser: 'organiser',
  spokesperson: 'spokesperson',
  volunteer: 'volunteer',
  party_branch: 'party branch',
  trade_union: 'trade union',
  professional_chamber: 'professional chamber',
  association: 'association',
  elected_leader: 'an elected leader',
  appointed_official: 'an appointed official',
  governing_body: 'a governing body',
  residents_group: "residents' group",
  campaign: 'campaign',
  advocacy_organisation: 'advocacy organisation',
  open: 'in the open',
  dealmaking: 'through deals and alliances',
  behind_scenes: 'from the background',
};

export function validateStorySetup(
  setup: z.infer<typeof lifeStoryCreateRequestV2Schema>,
  access: { enabled: boolean; politicsEnabled: boolean },
): void {
  const { story } = setup;
  const [emphasis] = story.emphases;
  if (
    !emphasis ||
    (story.catalogVersion !== STORY_CATALOG_VERSION &&
      (story.catalogVersion !== POLITICAL_CATALOG_VERSION ||
        emphasis.direction !== 'politics'))
  )
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
  const generated =
    id === 'generated' &&
    emphasis.direction === 'politics' &&
    story.catalogVersion === POLITICAL_CATALOG_VERSION &&
    note === null;
  const validSituation =
    generated ||
    (id === 'custom'
      ? (note?.length ?? 0) >= 10
      : situation?.selectable &&
        (situation.subtypes as readonly string[]).includes(emphasis.subtype));
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
        (emphasis.subtype !== 'work' && emphasis.workKind !== null))) ||
    (emphasis.direction === 'politics' &&
      story.catalogVersion === POLITICAL_CATALOG_VERSION &&
      !politicalAnswersFit(emphasis));
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

export function storyPublicationBlocker(
  input: LifeInputV2,
): 'politics' | 'goal_missing' | null {
  if (input.story?.emphases.some(({ direction }) => direction === 'politics'))
    return 'politics';
  return input.goals.length === 0 ? 'goal_missing' : null;
}

export function assertPublishableStory(input: LifeInputV2): void {
  if (storyPublicationBlocker(input))
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
    id === 'custom' || id === 'generated'
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

// Plan 053 B1: a reader-supplied relationship word such as "son" or "mother"
// already states the form of address. Without it the v11 neutral rule made the
// prose call "your son" "they", and stories started on v10 switched pronouns
// between chapters. Only these exact words count, never one followed by a
// possessive ("my mother's friend" is not the mother); a label with words of
// both kinds stays neutral. The label itself never enters the rules.
const MALE_RELATION_WORDS = new Set([
  'son',
  'stepson',
  'grandson',
  'father',
  'stepfather',
  'grandfather',
  'dad',
  'daddy',
  'grandpa',
  'granddad',
  'husband',
  'boyfriend',
  'brother',
  'stepbrother',
  'uncle',
  'nephew',
  'fiance',
  'widower',
]);
const FEMALE_RELATION_WORDS = new Set([
  'daughter',
  'stepdaughter',
  'granddaughter',
  'mother',
  'stepmother',
  'grandmother',
  'mom',
  'mum',
  'mommy',
  'mummy',
  'grandma',
  'granny',
  'nan',
  'wife',
  'girlfriend',
  'sister',
  'stepsister',
  'aunt',
  'auntie',
  'niece',
  'fiancee',
  'widow',
]);
export function labelAddress(label: string): 'he_him' | 'she_her' | null {
  const words = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’ʼ]/g, "'")
    .match(/[a-z]+(?:'s|s')?/g);
  let male = false;
  let female = false;
  for (const word of words ?? []) {
    if (/'s$|s'$/.test(word)) continue;
    if (MALE_RELATION_WORDS.has(word)) male = true;
    if (FEMALE_RELATION_WORDS.has(word)) female = true;
  }
  return male === female ? null : male ? 'he_him' : 'she_her';
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
  const generated =
    id === 'generated' &&
    emphasis.direction === 'politics' &&
    isPoliticalCatalogVersion(story.catalogVersion);
  if (
    !subtype ||
    (id !== 'custom' &&
      !generated &&
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
  if (
    fictionAddressQualityVersions.includes(
      input.narrativeContext?.policy.qualityPolicyVersion ?? '',
    )
  ) {
    // v11 (plan 052): one explicit line per person, so no stage has to infer
    // who the reader supplied. IDs only: labels stay untrusted state data.
    const supplied = new Set(
      input.input.initialState.actors.map((actor) => actor.id),
    );
    // The form of address recorded when the story introduced a person (K1b).
    const recorded = new Map(
      (input.fictionCharacters?.state.actors ?? []).flatMap((entry) =>
        entry.profile && 'addressForm' in entry.profile
          ? [[entry.actorId, entry.profile.addressForm] as const]
          : [],
      ),
    );
    for (const actor of input.state.actors) {
      const member = story.cast.find(({ actorId }) => actorId === actor.id);
      const established = recorded.get(actor.id);
      rules.push(
        !supplied.has(actor.id)
          ? established
            ? `Actor ${actor.id}: introduced by the story, not supplied by the reader; use ${address[established]}, as established when the story introduced them.`
            : `Actor ${actor.id}: introduced by the story, not supplied by the reader; keep the form of address earlier chapters established, or choose one and keep it.`
          : member?.address.mode === 'specified'
            ? `Actor ${actor.id}: supplied by the reader; use ${address[member.address.value]}.`
            : member?.address.mode === 'engine_decides'
              ? `Actor ${actor.id}: supplied by the reader; choose a fictional form of address once and keep it.`
              : labelAddress(actor.label)
                ? `Actor ${actor.id}: supplied by the reader, no address given, but the reader's own relationship word already states it; use ${address[labelAddress(actor.label)!]} in every chapter.`
                : `Actor ${actor.id}: supplied by the reader, no address given; use the label, a name or neutral wording and never assign a gender or identity.`,
      );
    }
  } else {
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
  }
  // Plan 049/08: the 1.2.0 political answers as readable lines; earlier lives
  // keep their exact request.
  if (
    emphasis.direction === 'politics' &&
    story.catalogVersion === POLITICAL_CATALOG_VERSION
  ) {
    const institution = emphasis.institution
      ? politicalLabels[emphasis.institution]
      : null;
    const role =
      emphasis.position === 'other'
        ? emphasis.role
        : emphasis.position
          ? politicalLabels[emphasis.position]
          : null;
    if (institution)
      rules.push(
        emphasis.subtype === 'staff'
          ? `The protagonist works for ${institution}.`
          : `Setting: a fictional ${institution}.`,
      );
    if (role)
      rules.push(
        emphasis.position === 'other'
          ? 'Protagonist role: as described in input.story.emphases (role).'
          : `Protagonist role: ${role}.`,
      );
    if (emphasis.style)
      rules.push(
        `The protagonist tends to act ${politicalLabels[emphasis.style]}.`,
      );
  }
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

export function normalizePoliticalPremise(premise: string) {
  return premise
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}
