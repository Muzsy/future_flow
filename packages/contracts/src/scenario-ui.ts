import { z } from 'zod';
import { scenarioTemplateSchema } from './public-scenarios';
import {
  publicScenarioSlugSchema,
  publicScenarioOwnerSchema,
} from './public-scenario-publication';
export const SCENARIO_UI_VERSION = 'scenario-ui-1';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const scenarioPersonalizationCapabilitySchema = z
  .object({
    schemaVersion: z.literal(SCENARIO_UI_VERSION),
    slug: publicScenarioSlugSchema,
    templateHash: digest,
    personalizationEnabled: z.boolean(),
  })
  .strict();
export const scenarioPublicationSourceSchema = z
  .object({
    schemaVersion: z.literal(SCENARIO_UI_VERSION),
    scenarioVersionId: z.uuid(),
    templateHash: digest,
    sourceGrantId: z.uuid(),
    template: scenarioTemplateSchema,
    publicationApproved: z.literal(false),
    officialLifeApproved: z.literal(false),
  })
  .strict();
export const scenarioOwnedPublicationsSchema = z
  .object({
    schemaVersion: z.literal(SCENARIO_UI_VERSION),
    scenarioVersionId: z.uuid(),
    publications: z.array(publicScenarioOwnerSchema).max(100),
  })
  .strict();
export type ScenarioPersonalizationCapability = z.infer<
  typeof scenarioPersonalizationCapabilitySchema
>;
export type ScenarioPublicationSource = z.infer<
  typeof scenarioPublicationSourceSchema
>;
