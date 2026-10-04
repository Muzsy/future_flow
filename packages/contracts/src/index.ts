import { z } from 'zod';
export * from './questionnaire';
export * from './life-v2';
export * from './locales';
export * from './questionnaire-localization';
export * from './error-messages';

import { enabledLocaleSchema } from './locales';

export const CONTRACT_VERSION = '1.0.0';
export const SIMULATION_VERSION = '1.0.0';
export const idSchema = z.uuid();
export const scoreSchema = z.number().int().min(0).max(100);
export const uncertaintySchema = z.enum(['low', 'medium', 'high']);
export const traitKeys = [
  'riskTolerance',
  'changeSeeking',
  'persistence',
  'sociability',
  'planningOrientation',
  'conflictAvoidance',
  'autonomyNeed',
  'securityNeed',
  'familyOrientation',
  'careerAmbition',
  'learningOrientation',
  'adaptability',
] as const;
export const traitKeySchema = z.enum(traitKeys);
export const traitsSchema = z
  .object(
    Object.fromEntries(traitKeys.map((key) => [key, scoreSchema])) as Record<
      (typeof traitKeys)[number],
      typeof scoreSchema
    >,
  )
  .strict();

export const relationshipSchema = z
  .object({
    id: idSchema,
    label: z.string().trim().min(1).max(50),
    type: z.enum(['partner', 'family', 'friend', 'colleague', 'other']),
    closeness: scoreSchema,
    support: scoreSchema,
    conflict: scoreSchema,
  })
  .strict();
export const factsSchema = z
  .object({
    ageBand: z.enum(['18_24', '25_34', '35_44', '45_54', '55_64', '65_plus']),
    country: z.literal('HU'),
    region: z.string().trim().min(1).max(80),
    regionType: z.enum(['capital', 'city', 'small_town', 'village']),
    relationshipStatus: z.enum([
      'single',
      'partnered',
      'married',
      'separated',
      'widowed',
    ]),
    children: z.number().int().min(0).max(15),
    employmentStatus: z.enum([
      'employed',
      'self_employed',
      'student',
      'seeking_work',
      'retired',
      'other',
    ]),
    workDomain: z.string().trim().min(1).max(80),
    workSatisfaction: scoreSchema,
    financialStability: scoreSchema,
    housingStability: scoreSchema,
  })
  .strict();
export const profileSchema = z
  .object({
    schemaVersion: z.literal(CONTRACT_VERSION),
    facts: factsSchema,
    preferences: z
      .object({
        relocationWillingness: scoreSchema,
        careerChangeWillingness: scoreSchema,
      })
      .strict(),
    traits: traitsSchema,
    values: z
      .array(
        z.enum([
          'family',
          'security',
          'autonomy',
          'learning',
          'free_time',
          'career',
          'community',
          'creativity',
          'adventure',
          'calm',
        ]),
      )
      .min(3)
      .max(5),
    goals: z
      .array(
        z
          .object({
            id: idSchema,
            category: z.enum([
              'career',
              'family',
              'learning',
              'finance',
              'social',
              'lifestyle',
            ]),
            title: z.string().trim().min(3).max(160),
            importance: scoreSchema,
          })
          .strict(),
      )
      .min(1)
      .max(3),
    relationships: z.array(relationshipSchema).max(12),
    noCloseRelationships: z.boolean(),
  })
  .strict()
  .superRefine((profile, ctx) => {
    if (new Set(profile.values).size !== profile.values.length)
      ctx.addIssue({
        code: 'custom',
        path: ['values'],
        message: 'Az értékek nem ismétlődhetnek.',
      });
    if (
      (!profile.noCloseRelationships && profile.relationships.length < 2) ||
      (profile.noCloseRelationships && profile.relationships.length > 0)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['relationships'],
        message:
          'Legalább két kapcsolatot adj meg, vagy jelöld, hogy nincs ilyen.',
      });
    if (
      new Set(profile.relationships.map((r) => r.id)).size !==
      profile.relationships.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['relationships'],
        message: 'A kapcsolatok azonosítója legyen egyedi.',
      });
  });
export type Profile = z.infer<typeof profileSchema>;

export const stateSchema = z
  .object({
    effectiveAt: z.iso.date(),
    career: z
      .object({
        employmentStatus: factsSchema.shape.employmentStatus,
        satisfaction: scoreSchema,
        stability: scoreSchema,
        growthOpportunity: scoreSchema,
      })
      .strict(),
    finance: z.object({ stability: scoreSchema, stress: scoreSchema }).strict(),
    social: z.object({ connectedness: scoreSchema }).strict(),
    internal: z
      .object({
        changeDesire: scoreSchema,
        perceivedAgency: scoreSchema,
        energy: scoreSchema,
      })
      .strict(),
  })
  .strict();
export type LifeState = z.infer<typeof stateSchema>;
export const effectPaths = [
  'career.satisfaction',
  'career.stability',
  'career.growthOpportunity',
  'finance.stability',
  'finance.stress',
  'social.connectedness',
  'internal.changeDesire',
  'internal.perceivedAgency',
  'internal.energy',
] as const;
export const effectSchema = z
  .object({
    path: z.enum(effectPaths),
    delta: z.number().int().min(-25).max(25),
  })
  .strict();
export const constraintSchema = z
  .object({
    type: z.enum(['relocation', 'finance', 'employment', 'relationship']),
    operator: z.enum(['forbid', 'require', 'limit']),
    strength: z.enum(['hard', 'soft']),
    description: z.string().min(1).max(200),
  })
  .strict();
export const decisionOptionSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
    label: z.string().min(3).max(160),
    description: z.string().min(3).max(400),
    effects: z.array(effectSchema).max(5),
    constraints: z.array(constraintSchema).max(5),
  })
  .strict();
export const candidateEventSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
    type: z.enum([
      'career',
      'relationships',
      'personal',
      'financial',
      'environment',
    ]),
    title: z.string().min(3).max(140),
    summary: z.string().min(10).max(600),
    offsetMonths: z.number().int().min(1).max(120),
    actorIds: z.array(z.string()).max(6),
    causes: z
      .array(
        z
          .object({
            source: z.enum(['profile', 'state', 'world', 'decision']),
            key: z.string().min(1).max(100),
            explanation: z.string().min(5).max(300),
          })
          .strict(),
      )
      .min(1)
      .max(5),
    uncertainty: uncertaintySchema,
    effects: z.array(effectSchema).max(5),
    decision: z
      .object({
        prompt: z.string().min(5).max(300),
        options: z.array(decisionOptionSchema).min(2).max(4),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const simulationOutputSchema = z
  .object({
    title: z.string().min(3).max(100),
    events: z.array(candidateEventSchema).min(5).max(10),
  })
  .strict();
export type SimulationOutput = z.infer<typeof simulationOutputSchema>;
export type CandidateEvent = z.infer<typeof candidateEventSchema>;
export const chapterOutputSchema = z
  .object({
    chapters: z
      .array(
        z
          .object({
            chapterNo: z.number().int().min(1).max(3),
            title: z.string().min(3).max(140),
            lead: z.string().min(5).max(500),
            body: z.string().min(200).max(12000),
            summary: z.string().min(10).max(800),
            eventKeys: z.array(z.string()).min(1).max(10),
            decisionEventKey: z.string().nullable(),
          })
          .strict(),
      )
      .min(2)
      .max(3),
  })
  .strict();
export type ChapterOutput = z.infer<typeof chapterOutputSchema>;
export const fidelitySchema = z
  .object({
    valid: z.boolean(),
    issues: z
      .array(
        z
          .object({
            chapterNo: z.number().int(),
            reason: z.string().min(5).max(300),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export const worldSchema = z
  .object({
    version: z.literal('hu-neutral-v1'),
    region: z.string(),
    economy: z.literal('neutral_scenario'),
    description: z.string(),
  })
  .strict();
export type WorldState = z.infer<typeof worldSchema>;
export const futureRequestSchema = z
  .object({
    profileVersionId: idSchema,
    horizonYears: z.literal(10),
    mode: z.literal('baseline'),
    locale: enabledLocaleSchema.default('en'),
  })
  .strict();
export const resolveDecisionSchema = z
  .object({ type: z.literal('option'), optionId: idSchema })
  .strict();
export const draftRequestSchema = z
  .object({
    revision: z.number().int().min(0),
    answers: z.record(
      z.string().max(80),
      z.union([
        z.string().max(160),
        scoreSchema,
        z.boolean(),
        z.array(z.string().max(160)).max(12),
      ]),
    ),
    relationships: z.array(relationshipSchema).max(12),
  })
  .strict();
export const jobStatuses = [
  'queued',
  'running',
  'validating',
  'completed',
  'failed',
  'cancelled',
] as const;
export type JobStatus = (typeof jobStatuses)[number];
export * from './public-draft';
export * from './beta';
