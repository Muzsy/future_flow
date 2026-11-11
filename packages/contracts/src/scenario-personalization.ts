import { z } from 'zod';
import { lifeInputV2Schema } from './life-v2';
import { scenarioTemplateSchema } from './public-scenarios';

export const SCENARIO_PERSONALIZATION_VERSION = 'scenario-personalization-1';
const digest = z.string().regex(/^[a-f0-9]{64}$/);

// Private, explicitly supplied facts. Placeholder keys are not private UUIDs.
// These values must never become part of a public Scenario snapshot.
export const scenarioPersonalProfileSchema = z
  .object({
    identity: lifeInputV2Schema.shape.identity.omit({
      baseProfileVersionId: true,
    }),
    goals: scenarioTemplateSchema.shape.goals.max(4),
    startingState: scenarioTemplateSchema.shape.startingState,
    constraints: scenarioTemplateSchema.shape.constraints,
    context: z.string().trim().min(1).max(1000).nullable(),
  })
  .strict();
export type ScenarioPersonalProfile = z.infer<
  typeof scenarioPersonalProfileSchema
>;

export const scenarioPersonalizationFactsSchema = z
  .object({
    identity: scenarioPersonalProfileSchema.shape.identity,
    environment: lifeInputV2Schema.shape.environment,
    goals: scenarioTemplateSchema.shape.goals,
    startingState: scenarioTemplateSchema.shape.startingState,
    constraints: scenarioTemplateSchema.shape.constraints,
  })
  .strict();
export const scenarioPersonalizationPreviewSchema = z
  .object({
    schemaVersion: z.literal(SCENARIO_PERSONALIZATION_VERSION),
    templateHash: digest,
    profileHash: digest,
    previewHash: digest,
    scenario: z
      .object({
        title: scenarioTemplateSchema.shape.title,
        summary: scenarioTemplateSchema.shape.summary,
      })
      .strict(),
    facts: scenarioPersonalizationFactsSchema,
    changes: z
      .object({
        startingFacts: z.literal('replaced_with_approved_profile'),
        constraints: z.literal('replaced_with_approved_profile'),
        primaryGoal: z.literal('approved_personal_goal'),
        scenarioGoal: z.literal('retained_as_secondary'),
        retainedScenarioGoalKey: z.string().regex(/^goal-[1-9][0-9]{0,2}$/),
        omittedScenarioGoals: z.number().int().min(0).max(4),
        omittedScenarioConstraints: z.number().int().min(0).max(20),
        omittedScenarioAssets: z.number().int().min(0).max(30),
        omittedScenarioActors: z.number().int().min(0).max(30),
        omittedScenarioOpportunities: z.number().int().min(0).max(30),
      })
      .strict(),
    visibility: z.literal('private'),
    publicationApproved: z.literal(false),
    officialLifeApproved: z.literal(false),
  })
  .strict();
export type ScenarioPersonalizationPreview = z.infer<
  typeof scenarioPersonalizationPreviewSchema
>;
export const scenarioPersonalizationApprovalSchema = z
  .object({ previewHash: digest, acknowledged: z.literal(true) })
  .strict();
