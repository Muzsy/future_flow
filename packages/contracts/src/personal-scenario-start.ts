import { z } from 'zod';
import { publicScenarioSlugSchema } from './public-scenario-publication';
import {
  scenarioPersonalProfileSchema,
  scenarioPersonalizationPreviewSchema,
} from './scenario-personalization';

export const PERSONAL_SCENARIO_VERSION = 'personal-scenario-1';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const personalScenarioPrepareRequestSchema = z
  .object({
    templateHash: digest,
    profile: scenarioPersonalProfileSchema,
    acknowledged: z.literal(true),
  })
  .strict();
export const personalScenarioPreviewSchema = z
  .object({
    schemaVersion: z.literal(PERSONAL_SCENARIO_VERSION),
    id: z.uuid(),
    sourceSlug: publicScenarioSlugSchema,
    templateHash: digest,
    profileHash: digest,
    previewHash: digest,
    profile: scenarioPersonalProfileSchema,
    expiresAt: z.iso.datetime(),
    composition: scenarioPersonalizationPreviewSchema,
    publicationApproved: z.literal(false),
    officialLifeApproved: z.literal(false),
  })
  .strict();
export const personalScenarioStartRequestSchema = z
  .object({
    previewId: z.uuid(),
    previewHash: digest,
    profile: scenarioPersonalProfileSchema,
    acknowledged: z.literal(true),
  })
  .strict();
export const personalScenarioStartReceiptSchema = z
  .object({
    schemaVersion: z.literal(PERSONAL_SCENARIO_VERSION),
    lifeId: z.uuid(),
    branchId: z.uuid(),
    jobId: z.uuid(),
    status: z.literal('queued'),
  })
  .strict();
export const personalScenarioAttributionSchema = z
  .object({
    schemaVersion: z.literal(PERSONAL_SCENARIO_VERSION),
    lifeId: z.uuid(),
    origin: z.literal('personalized_scenario'),
    source: z
      .object({
        slug: publicScenarioSlugSchema,
        title: z.string().trim().min(1).max(160),
        officialScenario: z.literal(true),
      })
      .strict()
      .nullable(),
  })
  .strict();
