import type { Database } from '@future-flow/database';
import {
  SCENARIO_CONTRACT_VERSION,
  scenarioTemplateSchema,
  type ScenarioTemplate,
} from '@future-flow/contracts';

// Plan 051 M3: the two everyday sample stories. Wholly fictional people and
// places; no real or private data. The story block is the reader's story
// (v10) path, exactly what a reader's direction form produces.
export const SAMPLE_STORY_KEYS = ['promotion', 'hometown'] as const;
export type SampleStoryKey = (typeof SAMPLE_STORY_KEYS)[number];

// One fixed, owner-approved paid allocation for both stories together
// (3 USD on 2026-11-17, raised by the owner to 4.5 USD after chapter 2 and to
// 5.5 USD after a chapter failed its quality gate).
export const SAMPLE_STORY_BUDGET_USD = 5.5;
// Each fictional source account keeps its own lower ceiling.
export const SAMPLE_STORY_USER_BUDGET_USD = 3;
export const SAMPLE_STORY_WINDOW_DAYS = 14;
export const SAMPLE_STORY_PERIODS = 4;
// Fiction requests may carry the full reviewed envelope, like the service.
export const SAMPLE_STORY_MAX_REQUEST_BYTES = 196608;
export const SAMPLE_STORY_LEASE_SECONDS = 600;

const effectiveAt = '2026-11-02';
const unspecified = { mode: 'unspecified' } as const;

const promotion: ScenarioTemplate = {
  schemaVersion: SCENARIO_CONTRACT_VERSION,
  contentLocale: 'en',
  title: 'The Promotion',
  summary:
    'A logistics coordinator in their early forties is offered a team lead role on the evening shift. The extra pay would help with the mortgage, but the job would take the evenings the family has always shared.',
  identity: { mode: 'alternate', label: null, ageBand: '35_44' },
  environment: {
    version: 'fictional-neutral-1',
    description:
      'An ordinary mid-sized city with a large regional distribution centre, school runs, a mortgage and a fixed household budget. Fictional and neutral, without economic forecasts.',
  },
  goals: [
    {
      key: 'goal-1',
      category: 'career',
      description: 'Step up to team lead at the distribution centre.',
      priority: 'primary',
      horizonMonths: 12,
      motivation:
        'More pay for the mortgage and a little more say in how the shift runs.',
      acceptableTradeoffs: ['A few longer days while learning the role'],
      unacceptableTradeoffs: ['Missing most of the children’s evenings'],
      status: 'active',
      note: null,
    },
    {
      key: 'goal-2',
      category: 'family',
      description: 'Keep most weekday evenings with the family.',
      priority: 'secondary',
      horizonMonths: 24,
      motivation: 'The children are nine and twelve and will not stay young.',
      acceptableTradeoffs: [],
      unacceptableTradeoffs: [],
      status: 'active',
      note: null,
    },
  ],
  story: {
    contractVersion: '1.0.0',
    catalogVersion: '1.0.0',
    emphases: [
      {
        direction: 'career',
        subtype: 'employee',
        field: 'Logistics',
        drive: 'advancement',
        venture: unspecified,
        buildingWith: unspecified,
        funding: [],
        jobAnchors: ['income', 'colleagues', 'obligations'],
      },
    ],
    startingSituation: {
      id: 'car.plateau',
      note: 'After eleven years as a coordinator, a team lead role on the evening shift has just been offered.',
    },
    protagonistAddress: unspecified,
    boundaries: [],
    title: 'The Promotion',
    cast: [],
  },
  startingState: {
    effectiveAt,
    employment: {
      status: 'employed',
      employerLabel: 'A regional distribution centre',
      workDomain: 'Logistics coordination',
    },
    location: {
      country: 'US',
      region: 'A mid-sized city',
      housing: 'A three-bedroom house with a mortgage',
    },
    finance: { currency: 'USD', monthlyIncome: 3900, liquidFunds: 6200 },
    ownedAssets: [
      {
        key: 'asset-1',
        kind: 'home',
        label: 'The family house, still on a mortgage',
        sharePercent: 50,
      },
    ],
    actors: [
      { key: 'actor-1', label: 'Your spouse', relationship: 'partner' },
      { key: 'actor-2', label: 'Your daughter, 12', relationship: 'family' },
      { key: 'actor-3', label: 'Your son, 9', relationship: 'family' },
      {
        key: 'actor-4',
        label: 'The warehouse operations manager',
        relationship: 'colleague',
      },
      {
        key: 'actor-5',
        label: 'A coordinator who started the same year as you',
        relationship: 'colleague',
      },
    ],
    skills: [
      'Delivery scheduling',
      'Calming down drivers on a bad day',
      'Spreadsheets',
    ],
    opportunities: [
      {
        key: 'opportunity-1',
        title: 'Team lead on the evening shift',
        status: 'open',
        expiresAt: '2026-12-01',
      },
    ],
    resources: { energy: 55, availableHoursPerWeek: 6 },
  },
  constraints: [
    {
      key: 'constraint-1',
      description: 'Keep a steady job while the mortgage is being paid.',
      strength: 'hard',
      scope: 'branch',
      validFrom: effectiveAt,
      validUntil: '2027-05-02',
      predicate: { type: 'employment_status_is', value: 'employed' },
    },
    {
      key: 'constraint-2',
      description: 'Prefer to keep at least USD 3,000 in savings.',
      strength: 'soft',
      scope: 'life',
      validFrom: effectiveAt,
      validUntil: null,
      predicate: {
        type: 'liquid_funds_at_least',
        currency: 'USD',
        amount: 3000,
      },
    },
  ],
};

const hometown: ScenarioTemplate = {
  schemaVersion: SCENARIO_CONTRACT_VERSION,
  contentLocale: 'en',
  title: 'Back Home',
  summary:
    'A divorced office assistant in their mid-thirties pays most of their income on rent in the city, while their mother, alone in the small town where they grew up, needs more help after a fall.',
  identity: { mode: 'alternate', label: null, ageBand: '35_44' },
  environment: {
    version: 'fictional-neutral-1',
    description:
      'A large, expensive city and a small town two hours away by bus, with one high street, a medical practice and the house the protagonist grew up in. Fictional and neutral, without economic forecasts.',
  },
  goals: [
    {
      key: 'goal-1',
      category: 'family',
      description:
        'Be there for my mother while keeping a steady life for my son.',
      priority: 'primary',
      horizonMonths: 12,
      motivation:
        'She managed alone for years, and now she cannot quite manage.',
      acceptableTradeoffs: ['A smaller job for a while'],
      unacceptableTradeoffs: ['Pulling my son away from his father'],
      status: 'active',
      note: null,
    },
    {
      key: 'goal-2',
      category: 'finance',
      description: 'Stop spending most of my income on rent.',
      priority: 'secondary',
      horizonMonths: 24,
      motivation: null,
      acceptableTradeoffs: [],
      unacceptableTradeoffs: [],
      status: 'active',
      note: null,
    },
  ],
  story: {
    contractVersion: '1.0.0',
    catalogVersion: '1.0.0',
    emphases: [
      {
        direction: 'relationships',
        subtype: 'family',
        attraction: unspecified,
        relationshipStatus: unspecified,
        themes: ['closeness_distance', 'commitment'],
      },
    ],
    startingSituation: {
      id: 'rel.new_family_role',
      note: 'Your mother had a fall in October. She is fine, but she now needs help with shopping, stairs and appointments.',
    },
    protagonistAddress: unspecified,
    boundaries: [],
    title: 'Back Home',
    cast: [],
  },
  startingState: {
    effectiveAt,
    employment: {
      status: 'employed',
      employerLabel: 'A property management office',
      workDomain: 'Office administration',
    },
    location: {
      country: 'US',
      region: 'A large city',
      housing: 'A rented one-bedroom apartment',
    },
    finance: { currency: 'USD', monthlyIncome: 2900, liquidFunds: 2100 },
    ownedAssets: [],
    actors: [
      { key: 'actor-1', label: 'Your mother', relationship: 'family' },
      { key: 'actor-2', label: 'Your son, 8', relationship: 'family' },
      {
        key: 'actor-3',
        label: 'Your ex-husband, who has your son every other weekend',
        relationship: 'other',
      },
      {
        key: 'actor-4',
        label: 'An old school friend who never left town',
        relationship: 'friend',
      },
    ],
    skills: ['Office administration', 'Keeping a tight household budget'],
    opportunities: [
      {
        key: 'opportunity-1',
        title: 'A part-time receptionist job at the town’s medical practice',
        status: 'open',
        expiresAt: '2027-01-15',
      },
    ],
    resources: { energy: 45, availableHoursPerWeek: 4 },
  },
  constraints: [
    {
      key: 'constraint-1',
      description: 'Keep a regular income for the household.',
      strength: 'hard',
      scope: 'branch',
      validFrom: effectiveAt,
      validUntil: '2027-05-02',
      predicate: { type: 'employment_status_is', value: 'employed' },
    },
    {
      key: 'constraint-2',
      description: 'Prefer to keep at least USD 1,000 for emergencies.',
      strength: 'soft',
      scope: 'life',
      validFrom: effectiveAt,
      validUntil: null,
      predicate: {
        type: 'liquid_funds_at_least',
        currency: 'USD',
        amount: 1000,
      },
    },
  ],
};

export const sampleStoryTemplates: Record<SampleStoryKey, ScenarioTemplate> = {
  promotion: scenarioTemplateSchema.parse(promotion),
  hometown: scenarioTemplateSchema.parse(hometown),
};

export function isSampleStoryKey(value: unknown): value is SampleStoryKey {
  return SAMPLE_STORY_KEYS.includes(value as SampleStoryKey);
}

// The operator's own lease, taken inside the creation transaction so the
// service worker never sees the job queued. It is an ordinary lease (the
// fiction path refuses exhausted attempts); the operator renews it while it
// works. If the operator stops, the service worker's own admission refuses
// the job before any paid request (the sample accounts have no service access).
export async function claimSampleStoryJob(
  tx: Database,
  userId: string,
  jobId: string,
  leaseToken: string,
) {
  const [job] = await tx.query<Record<string, unknown>>(
    "UPDATE aw_jobs SET status='running',lease_token=$3,lease_until=clock_timestamp()+($4*interval '1 second') WHERE id=$1 AND user_id=$2 AND status='queued' RETURNING *",
    [jobId, userId, leaseToken, SAMPLE_STORY_LEASE_SECONDS],
  );
  if (!job)
    throw Error(
      'Sample story job must be claimed inside its creation transaction',
    );
  return job;
}
