import { z } from 'zod';
import {
  SHARED_CONTEXT_CONTRACT_VERSION,
  sharedEventCandidateSchema,
  sharedMemoryEventSchema,
} from './shared-context';

const id = z.uuid();
export const sharedDecisionRulesSchema = z
  .object({
    // Trusted server settings: the AI cannot choose participation or quorum.
    deadlineSeconds: z.number().int().min(60).max(604800).nullable(),
    participatingOptionIds: z.array(id).max(5),
    quorum: z.number().int().min(1).max(20).nullable(),
  })
  .strict();
export type SharedDecisionRules = z.infer<typeof sharedDecisionRulesSchema>;
export const sharedDecisionEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(SHARED_CONTEXT_CONTRACT_VERSION),
    decision: sharedEventCandidateSchema.shape.decision.unwrap(),
    rules: sharedDecisionRulesSchema,
    openedAt: z.iso.datetime(),
    closesAt: z.iso.datetime().nullable(),
  })
  .strict();
export type SharedDecisionEnvelope = z.infer<
  typeof sharedDecisionEnvelopeSchema
>;
export const sharedIntentRequestSchema = z
  .object({
    contextRevision: z.number().int().nonnegative(),
    optionId: id,
  })
  .strict();
export type SharedIntentRequest = z.infer<typeof sharedIntentRequestSchema>;
export const sharedIntentSchema = z
  .object({
    memberId: id,
    optionId: id,
    submittedAt: z.iso.datetime(),
  })
  .strict();
export type SharedIntent = z.infer<typeof sharedIntentSchema>;
export const sharedResolutionResultSchema = z
  .object({
    schemaVersion: z.literal(SHARED_CONTEXT_CONTRACT_VERSION),
    status: z.enum(['waiting', 'resolved', 'unresolved', 'cancelled']),
    reason: z
      .enum([
        'missing_responses',
        'quorum_not_met',
        'tie',
        'no_majority',
        'disagreement',
        'participant_unavailable',
        'context_ended',
      ])
      .nullable(),
    selectedOptionId: id.nullable(),
    participatingMemberIds: z.array(id).max(20),
    responses: z
      .array(z.object({ memberId: id, optionId: id }).strict())
      .max(20),
  })
  .strict();
export type SharedResolutionResult = z.infer<
  typeof sharedResolutionResultSchema
>;
export const sharedMemoryImpactSchema = z
  .object({
    schemaVersion: z.literal(SHARED_CONTEXT_CONTRACT_VERSION),
    eventId: id,
    resolutionId: id.nullable(),
    memberId: id,
    memory: sharedMemoryEventSchema,
    ownOptionId: id.nullable(),
  })
  .strict();
export type SharedMemoryImpact = z.infer<typeof sharedMemoryImpactSchema>;
