import { z } from 'zod';
import { hash } from '@future-flow/core';
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
// 5.5 USD after a chapter failed its quality gate, and to 6.5 USD on
// 2026-11-18 to recover the Promotion's fourth chapter with plan 052 K2).
export const SAMPLE_STORY_BUDGET_USD = 6.5;
// Each fictional source account keeps its own lower ceiling.
// Raised from 3 to 4 USD (2026-11-18) when the restarted Promotion account
// reached its own ceiling; the shared owner-approved allocation is unchanged.
export const SAMPLE_STORY_USER_BUDGET_USD = 4;
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

// Publication (plan 051 M4). The editorial record is a separate, explicit
// owner-approved decision bound to the exact bundle and its AI content review;
// an AI verdict never approves publication by itself.
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const sampleLifeEditorialSchema = z
  .object({
    at: z.iso.datetime(),
    actor: z.string().trim().min(3).max(200),
    contentHash: digest,
    reviewId: z.uuid(),
    reviewHash: digest,
    fullCopyRead: z.literal(true),
    privacyChecked: z.literal(true),
    contentChecked: z.literal(true),
    consistencyChecked: z.literal(true),
    qualityChecked: z.literal(true),
    fictionalSourceChecked: z.literal(true),
    rightsChecked: z.literal(true),
    note: z.string().trim().min(30).max(3000),
  })
  .strict();
export const samplePublicationApprovalSchema = z
  .object({
    at: z.iso.datetime(),
    actor: z.string().trim().min(3).max(200),
    contentHash: digest,
    previewId: z.uuid(),
    previewHash: digest,
    snapshotHash: digest,
    editorialApprovalHash: digest,
    fullSnapshotReviewed: z.literal(true),
    settings: z
      .object({
        visibility: z.literal('public'),
        authorMode: z.literal('anonymous'),
        indexable: z.literal(false),
      })
      .strict(),
    note: z.string().trim().min(30).max(3000),
  })
  .strict();
export function validateSamplePublicationApproval(
  raw: unknown,
  preview: {
    previewId: string;
    previewHash: string;
    snapshotHash: string;
    binding: { contentHash: string };
    settings: unknown;
  },
  editorial: unknown,
) {
  const record = samplePublicationApprovalSchema.parse(raw);
  if (
    record.contentHash !== preview.binding.contentHash ||
    record.previewId !== preview.previewId ||
    record.previewHash !== preview.previewHash ||
    record.snapshotHash !== preview.snapshotHash ||
    record.editorialApprovalHash !==
      hash(sampleLifeEditorialSchema.parse(editorial)) ||
    hash(record.settings) !== hash(preview.settings)
  )
    throw Error(
      'The publication approval must match the exact preview and the editorial decision',
    );
  return record;
}

// Owner-approved editorial corrections of the public copy (2026-11-19). Only
// the public timeline summaries change; the story canon stays as generated.
// Each correction applies only to the exact original text.
export const SAMPLE_COPY_CORRECTIONS: Record<
  SampleStoryKey,
  { period: number; event: number; original: string; corrected: string }[]
> = {
  hometown: [
    {
      period: 2,
      event: 1,
      original:
        "Hannah completes the twelve prepaid deliveries with mother remaining the ordering contact. No further block is booked. Comparing the completed service receipt with the current $1,750 monthly rent prompts you to begin a city housing search. You retain your son's school and existing time with his father as requirements; listings are checked against both ordinary school travel and access to the town bus.",
      corrected:
        "The twelve prepaid deliveries end, with your mother still placing the orders herself; no further block is booked. Setting the final receipt beside the $1,750 monthly rent, you start looking for a cheaper city apartment that keeps your son's school, his time with his father and a workable route to the town bus.",
    },
    {
      period: 3,
      event: 1,
      original:
        'During a town visit while your son is with his father, shopping uses part of the afternoon. The longer connection requires leaving before supper. Mother offers to cook something quick, but you cannot stay. Later visits confirm that practical help still happens while shared evenings have become difficult.',
      corrected:
        'On a town visit while your son is with his father, the shopping takes part of the afternoon. With the longer journey, getting home the same night means leaving before supper; your mother offers to cook, and you choose to go home. Later visits keep the practical help going, while shared evenings have become harder to fit in.',
    },
  ],
  promotion: [],
};
export function correctedSampleCopy<
  T extends {
    periods: { events: { summary: string }[] }[];
  },
>(story: SampleStoryKey, copy: T): T {
  const next = structuredClone(copy);
  for (const c of SAMPLE_COPY_CORRECTIONS[story]) {
    const event = next.periods[c.period]?.events[c.event];
    if (!event || event.summary !== c.original)
      throw Error('An approved correction no longer matches its exact source');
    event.summary = c.corrected;
  }
  return next;
}

// The owner's publication authorization, given after reading the exact final
// copy. It binds the hash of that copy; the publish phase checks it, then
// completes review, curation, grant, preview and confirmation in one run
// (a preview lives 30 minutes). Any review finding outside the fiction
// categories stops the run before curation.
export const SAMPLE_FICTION_FINDING_CATEGORIES = [
  'person_name',
  'private_financial',
  'identifying_combination',
] as const;
export const samplePublishAuthorizationSchema = z
  .object({
    at: z.iso.datetime(),
    actor: z.string().trim().min(3).max(200),
    story: z.enum(SAMPLE_STORY_KEYS),
    copyHash: digest,
    fullCopyRead: z.literal(true),
    allowedFindingCategories: z
      .array(z.enum(SAMPLE_FICTION_FINDING_CATEGORIES))
      .max(3),
    settings: z
      .object({
        visibility: z.literal('public'),
        authorMode: z.literal('anonymous'),
        indexable: z.literal(false),
      })
      .strict(),
    note: z.string().trim().min(30).max(3000),
  })
  .strict();
