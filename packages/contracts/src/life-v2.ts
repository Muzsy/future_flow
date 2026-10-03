import { z } from 'zod';
import { localeSchema } from './locales';

// Kept separate from the v1 schemas: existing stored canon must remain readable.
export const LIFE_CONTRACT_VERSION = '2.0.0';
const id = z.uuid();
const date = z.iso.date();
const label = z.string().trim().min(1).max(160);
const score = z.number().int().min(0).max(100);
const country = z
  .string()
  .regex(/^[A-Z]{2}$/)
  .nullable();
export const employmentV2Schema = z
  .object({
    status: z
      .enum([
        'employed',
        'self_employed',
        'student',
        'seeking_work',
        'retired',
        'other',
      ])
      .nullable(),
    employerLabel: label.nullable(),
    workDomain: label.nullable(),
  })
  .strict();
export const locationV2Schema = z
  .object({ country, region: label.nullable(), housing: label.nullable() })
  .strict();
export const financeV2Schema = z
  .object({
    currency: z.enum(['HUF', 'EUR', 'USD']).nullable(),
    monthlyIncome: z.number().nonnegative().nullable(),
    liquidFunds: z.number().nullable(),
  })
  .strict();
const assetSchema = z
  .object({
    id,
    kind: z.enum(['business', 'home', 'other']),
    label,
    sharePercent: z.number().positive().max(100),
  })
  .strict();
const actorSchema = z
  .object({
    id,
    label,
    relationship: z.enum(['partner', 'family', 'friend', 'colleague', 'other']),
  })
  .strict();
const goalProgressSchema = z
  .object({
    goalId: id,
    status: z.enum(['active', 'achieved', 'abandoned']),
    note: z.string().trim().min(1).max(400).nullable(),
  })
  .strict();
const opportunitySchema = z
  .object({
    id,
    title: label,
    status: z.enum(['open', 'accepted', 'declined', 'expired']),
    expiresAt: date.nullable(),
  })
  .strict();
const resourcesSchema = z
  .object({
    energy: score.nullable(),
    availableHoursPerWeek: z.number().min(0).max(168).nullable(),
  })
  .strict();

export const lifeStateV2Schema = z
  .object({
    schemaVersion: z.literal(LIFE_CONTRACT_VERSION),
    effectiveAt: date,
    employment: employmentV2Schema,
    location: locationV2Schema,
    finance: financeV2Schema,
    ownedAssets: z.array(assetSchema).max(30),
    actors: z.array(actorSchema).max(30),
    skills: z.array(label).max(50),
    goals: z.array(goalProgressSchema).min(1).max(5),
    opportunities: z.array(opportunitySchema).max(30),
    resources: resourcesSchema,
  })
  .strict();
export type LifeStateV2 = z.infer<typeof lifeStateV2Schema>;

// Closed, typed predicates instead of arbitrary JSON paths or prose-only rules.
export const factPredicateV2Schema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('employment_status_is'),
      value: employmentV2Schema.shape.status,
    })
    .strict(),
  z.object({ type: z.literal('country_is'), value: country }).strict(),
  z
    .object({
      type: z.literal('asset_is_owned'),
      assetId: id,
      owned: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('liquid_funds_at_least'),
      currency: z.enum(['HUF', 'EUR', 'USD']),
      amount: z.number().nonnegative(),
    })
    .strict(),
]);
export type FactPredicateV2 = z.infer<typeof factPredicateV2Schema>;
export const constraintV2Schema = z
  .object({
    id,
    description: z.string().trim().min(1).max(400),
    strength: z.enum(['hard', 'soft']),
    lifeId: id,
    branchId: id.nullable(),
    validFrom: date,
    // Exclusive end, so a restriction expiring on a decision date no longer applies.
    validUntil: date.nullable(),
    endsOnDecisionId: id.nullable(),
    predicate: factPredicateV2Schema,
  })
  .strict();
export type ConstraintV2 = z.infer<typeof constraintV2Schema>;

export const factChangeV2Schema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('employment_set'), value: employmentV2Schema })
    .strict(),
  z
    .object({ type: z.literal('location_set'), value: locationV2Schema })
    .strict(),
  z.object({ type: z.literal('finance_set'), value: financeV2Schema }).strict(),
  z.object({ type: z.literal('asset_add'), value: assetSchema }).strict(),
  z.object({ type: z.literal('asset_remove'), assetId: id }).strict(),
  z.object({ type: z.literal('actor_add'), value: actorSchema }).strict(),
  z.object({ type: z.literal('skill_add'), value: label }).strict(),
  z
    .object({ type: z.literal('goal_progress_set'), value: goalProgressSchema })
    .strict(),
  z
    .object({ type: z.literal('opportunity_set'), value: opportunitySchema })
    .strict(),
  z
    .object({ type: z.literal('resources_set'), value: resourcesSchema })
    .strict(),
]);
export type FactChangeV2 = z.infer<typeof factChangeV2Schema>;
const optionSchema = z
  .object({
    id,
    label,
    description: z.string().trim().min(3).max(500),
    preconditions: z.array(factPredicateV2Schema).max(10),
    changes: z.array(factChangeV2Schema).max(10),
  })
  .strict();
export const periodCandidateV2Schema = z
  .object({
    schemaVersion: z.literal(LIFE_CONTRACT_VERSION),
    periodId: id,
    branchId: id,
    baseRevision: z.number().int().nonnegative(),
    startDate: date,
    endDate: date,
    durationMonths: z.union([z.literal(6), z.literal(12)]),
    title: label,
    events: z
      .array(
        z
          .object({
            id,
            title: label,
            summary: z.string().trim().min(10).max(800),
            effectiveAt: date,
            actorIds: z.array(id).max(8),
            preconditions: z.array(factPredicateV2Schema).max(10),
            changes: z.array(factChangeV2Schema).max(10),
            decision: z
              .object({
                id,
                prompt: z.string().trim().min(5).max(400),
                options: z.array(optionSchema).min(2).max(4),
              })
              .strict()
              .nullable(),
          })
          .strict(),
      )
      .min(2)
      .max(5),
  })
  .strict();
export type PeriodCandidateV2 = z.infer<typeof periodCandidateV2Schema>;

const goalV2Schema = z
  .object({
    id,
    category: z.enum([
      'career',
      'business',
      'finance',
      'relationships',
      'family',
      'education',
      'lifestyle',
      'personal_growth',
      'other',
    ]),
    description: z.string().trim().min(3).max(500),
    priority: z.enum(['primary', 'secondary']),
    horizonMonths: z.number().int().min(6).max(600),
    motivation: z.string().trim().min(1).max(500).nullable(),
    acceptableTradeoffs: z.array(label).max(10),
    unacceptableTradeoffs: z.array(label).max(10),
  })
  .strict();
export const lifeInputV2Schema = z
  .object({
    schemaVersion: z.literal(LIFE_CONTRACT_VERSION),
    locale: localeSchema,
    lifeId: id,
    branchId: id,
    identity: z
      .object({
        mode: z.enum(['self', 'alternate']),
        label: label.nullable(),
        ageBand: z.enum([
          '18_24',
          '25_34',
          '35_44',
          '45_54',
          '55_64',
          '65_plus',
        ]),
        // Reference only: the original personal profile is never overwritten.
        baseProfileVersionId: id.nullable(),
      })
      .strict(),
    environment: z
      .object({
        version: z.literal('hu-neutral-v2'),
        description: z.string().trim().min(1).max(1000),
      })
      .strict(),
    goals: z.array(goalV2Schema).min(1).max(5),
    initialState: lifeStateV2Schema,
    constraints: z.array(constraintV2Schema).max(20),
    // Publication is a separate consent workflow, never a simulation input flag.
    visibility: z.literal('private'),
  })
  .strict();
export type LifeInputV2 = z.infer<typeof lifeInputV2Schema>;
