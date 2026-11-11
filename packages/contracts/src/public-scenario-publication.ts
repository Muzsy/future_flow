import { z } from 'zod';
import { scenarioTemplateSchema } from './public-scenarios';

export const PUBLIC_SCENARIO_VERSION = 'public-scenario-1';
export const publicScenarioSlugSchema = z
  .string()
  .regex(/^scenario-[a-f0-9]{32}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const publicScenarioPrepareRequestSchema = z
  .object({
    templateHash: digest,
    sourceGrantId: z.uuid(),
    allowPersonalization: z.boolean(),
  })
  .strict();
export const publicScenarioPreviewSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_SCENARIO_VERSION),
    id: z.uuid(),
    scenarioVersionId: z.uuid(),
    sourceGrantId: z.uuid(),
    templateHash: digest,
    previewHash: digest,
    template: scenarioTemplateSchema,
    allowPersonalization: z.boolean(),
    expiresAt: z.iso.datetime(),
    publicationApproved: z.literal(false),
    officialLifeApproved: z.literal(false),
  })
  .strict();
export const publicScenarioConfirmRequestSchema = z
  .object({
    previewId: z.uuid(),
    previewHash: digest,
    acknowledged: z.literal(true),
    personalizationAcknowledged: z.boolean(),
  })
  .strict();
export const publicScenarioOwnerSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_SCENARIO_VERSION),
    id: z.uuid(),
    slug: publicScenarioSlugSchema,
    status: z.enum(['active', 'withdrawn', 'hidden', 'removed']),
    templateHash: digest,
    allowPersonalization: z.boolean(),
    officialLifeApproved: z.literal(false),
  })
  .strict();
export const publicScenarioReaderSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_SCENARIO_VERSION),
    slug: publicScenarioSlugSchema,
    templateHash: digest,
    template: scenarioTemplateSchema,
    allowPersonalization: z.boolean(),
    officialScenario: z.literal(true),
    officialLifeApproved: z.literal(false),
    publishedAt: z.iso.datetime(),
  })
  .strict();
export const publicScenarioModerationSchema = z
  .object({
    status: z.enum(['hidden', 'removed']),
    reason: z.enum([
      'privacy',
      'content',
      'quality',
      'meaning',
      'origin',
      'other',
    ]),
    actorLabel: z.string().trim().min(3).max(80),
  })
  .strict();
export type PublicScenarioPreview = z.infer<typeof publicScenarioPreviewSchema>;
export type PublicScenarioReader = z.infer<typeof publicScenarioReaderSchema>;
