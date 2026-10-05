import { z } from 'zod';
import { scenarioTemplateSchema } from './public-scenarios';

export const FORK_CHECKPOINT_VERSION = 'fork-checkpoint-1';
const template = scenarioTemplateSchema.shape;
const state = template.startingState.shape;
const key = (kind: string) =>
  z.string().regex(new RegExp(`^${kind}-[1-9][0-9]{0,2}$`));
const predicate = template.constraints.element.shape.predicate;
export const forkFactChangeSchema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('employment_set'), value: state.employment })
    .strict(),
  z.object({ type: z.literal('location_set'), value: state.location }).strict(),
  z.object({ type: z.literal('finance_set'), value: state.finance }).strict(),
  z
    .object({ type: z.literal('asset_add'), value: state.ownedAssets.element })
    .strict(),
  z
    .object({ type: z.literal('asset_remove'), assetKey: key('asset') })
    .strict(),
  z
    .object({ type: z.literal('actor_add'), value: state.actors.element })
    .strict(),
  z
    .object({
      type: z.literal('skill_add'),
      value: z.string().trim().min(1).max(160),
    })
    .strict(),
  z
    .object({
      type: z.literal('goal_progress_set'),
      value: z
        .object({
          goalKey: key('goal'),
          status: template.goals.element.shape.status,
          note: template.goals.element.shape.note,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('opportunity_set'),
      value: state.opportunities.element,
    })
    .strict(),
  z
    .object({ type: z.literal('resources_set'), value: state.resources })
    .strict(),
]);
export type ForkFactChange = z.infer<typeof forkFactChangeSchema>;

// Executable structure only. Public permissions and full review remain separate.
export const forkCheckpointSchema = z
  .object({
    schemaVersion: z.literal(FORK_CHECKPOINT_VERSION),
    contentLocale: z.literal('en'),
    requiresFullReview: z.literal(true),
    readyForPublicFork: z.literal(false),
    identity: template.identity,
    environment: template.environment,
    goals: template.goals,
    startingState: template.startingState,
    referenceCatalog: z
      .object({
        assetKeys: z.array(key('asset')).max(128),
        actorKeys: z.array(key('actor')).max(128),
        opportunityKeys: z.array(key('opportunity')).max(128),
      })
      .strict(),
    constraints: z
      .array(
        template.constraints.element.extend({
          endsOnDecisionKey: key('decision').nullable(),
        }),
      )
      .max(20),
    decision: z
      .object({
        key: key('decision'),
        prompt: z.string().trim().min(5).max(400),
        options: z
          .array(
            z
              .object({
                key: key('option'),
                label: z.string().trim().min(3).max(160),
                description: z.string().trim().min(3).max(500),
                preconditions: z.array(predicate).max(10),
                changes: z.array(forkFactChangeSchema).max(10),
              })
              .strict(),
          )
          .min(2)
          .max(4),
      })
      .strict(),
  })
  .strict();
export type ForkCheckpoint = z.infer<typeof forkCheckpointSchema>;
export const forkCheckpointRequestSchema = z
  .object({
    snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceRevision: z.number().int().nonnegative(),
    checkpoint: forkCheckpointSchema,
  })
  .strict();
export const forkCheckpointViewSchema = z
  .object({
    checkpointId: z.uuid(),
    draftId: z.uuid(),
    snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceRevision: z.number().int().nonnegative(),
    checkpointHash: z.string().regex(/^[a-f0-9]{64}$/),
    checkpoint: forkCheckpointSchema,
    status: z.literal('awaiting_review'),
    publicationApproved: z.literal(false),
  })
  .strict();
export const forkCheckpointCandidateSchema = z
  .object({
    decisionKey: key('decision'),
    checkpoint: forkCheckpointSchema.nullable(),
    unavailableReason: z
      .enum(['privacy', 'reference', 'consistency'])
      .nullable(),
  })
  .strict();
