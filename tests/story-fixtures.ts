import {
  lifeStoryDraftRequestV2Schema,
  type LifeSetupV2,
} from '@future-flow/contracts';
import { setupFixture } from './life-fixtures';

const specified = (value: string) => ({ mode: 'specified', value });
const delegated = { mode: 'engine_decides' };
const unspecified = { mode: 'unspecified' };
const actor = (
  label: string,
  relationship: LifeSetupV2['relationships'][number]['relationship'],
  address = unspecified,
) => ({ label, relationship, address });

function profile(
  direction: string,
  subtype: string,
  id: string,
  answers: Record<string, unknown>,
  options: {
    category?: LifeSetupV2['goal']['category'];
    note?: string;
    relationships?: ReturnType<typeof actor>[];
    address?: { mode: string; value?: string };
    boundaries?: string[];
    hours?: number;
  } = {},
) {
  const setup = setupFixture();
  return lifeStoryDraftRequestV2Schema.parse({
    ...setup,
    stayInCountry: direction === 'travel' ? false : setup.stayInCountry,
    relationships: options.relationships ?? [],
    resources: {
      ...setup.resources,
      availableHoursPerWeek: options.hours ?? null,
    },
    goal: { ...setup.goal, category: options.category ?? setup.goal.category },
    story: {
      contractVersion: '1.0.0',
      catalogVersion: '1.0.0',
      direction,
      subtype,
      answers,
      startingSituation: { id, note: options.note ?? null },
      protagonistAddress: options.address ?? unspecified,
      boundaries: options.boundaries ?? [],
      title: null,
      goalChoice: options.category ? 'set' : 'none',
    },
  });
}

export const storyProfiles = {
  P1: profile('relationships', 'romantic', 'rel.new_city', {
    attraction: delegated,
  }),
  P2: profile(
    'relationships',
    'friendship',
    'rel.drifting_friends',
    {},
    {
      relationships: [
        actor('Mira', 'friend', specified('they_them')),
        actor('Ari', 'friend'),
      ],
    },
  ),
  P3: profile(
    'relationships',
    'family',
    'rel.family_expectations',
    {},
    {
      category: 'family',
      relationships: [actor('Mira', 'partner'), actor('Ari', 'family')],
      address: specified('she_her'),
    },
  ),
  P4: profile(
    'career',
    'founder',
    'car.cofounder_tension',
    {
      venture: specified('Repairing household instruments'),
      buildingWith: specified('cofounder'),
    },
    { boundaries: ['Risking the family home'] },
  ),
  P5: profile(
    'career',
    'transition',
    'car.side_project',
    { jobAnchors: ['income', 'obligations'] },
    { category: 'business', hours: 8 },
  ),
  P6: profile('career', 'employee', 'car.first_time_lead', {
    drive: 'mastery',
  }),
  P7: profile('creative', 'personal', 'cre.private_work', {
    field: 'music',
    experience: delegated,
  }),
  P8: profile(
    'creative',
    'livelihood',
    'cre.commission_vs_own',
    { field: 'visual_art' },
    { category: 'personal_growth' },
  ),
  P9: profile('travel', 'lifestyle', 'trv.remote_moving', {
    companions: specified('alone'),
    homeBase: 'open',
  }),
  P10: profile(
    'travel',
    'journey',
    'custom',
    { destination: 'The fictional western coast' },
    { note: 'The protagonist arrives at an unfamiliar coastal station.' },
  ),
  PL1: profile('politics', 'local', 'pol.new_councillor', {
    inventedNames: ['Greyhaven', 'Orchard Council'],
  }),
  PL2: profile(
    'politics',
    'staff',
    'pol.adviser',
    {},
    { category: 'other', note: 'The input mentions Winston Churchill.' },
  ),
};
