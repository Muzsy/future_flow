import { z } from 'zod';
import {
  interactionProfileSchema,
  sharedStateSchema,
  sharedEventCandidateSchema,
  sharedImpactProposalSchema,
} from './shared-context';
import { sharedDecisionRulesSchema } from './shared-engine';

const id = z.uuid();
// A server-built allowlist, not a client DTO or a personal branch snapshot.
export const sharedAiInputSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    locale: z.literal('en'),
    context: z
      .object({
        id,
        title: z.string().min(1).max(240),
        revision: z.number().int().nonnegative(),
        simulationAt: z.iso.date(),
        state: sharedStateSchema,
        governance: z.object({ type: z.literal('individual_opt_in') }).strict(),
      })
      .strict(),
    eventId: id,
    members: z
      .array(
        z
          .object({
            memberId: id,
            interactionProfile: interactionProfileSchema,
          })
          .strict(),
      )
      .min(2)
      .max(10),
    decision: z
      .object({
        id,
        participationOptionId: id,
        optOutOptionId: id,
        rules: sharedDecisionRulesSchema,
      })
      .strict(),
    history: z
      .array(
        z
          .object({
            eventId: id,
            effectiveAt: z.iso.date(),
            title: z.string().max(240),
            summary: z.string().max(1200),
            resolutionStatus: z.enum(['resolved', 'cancelled']).nullable(),
            participatingMemberIds: z.array(id).max(10),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export type SharedAiInput = z.infer<typeof sharedAiInputSchema>;
// Friend-only Structured Outputs cannot contain the future dynamic weighted-vote map.
const decision = sharedEventCandidateSchema.shape.decision.unwrap();
export const sharedAiCandidateSchema = sharedEventCandidateSchema
  .extend({
    decision: decision
      .extend({
        policy: z.object({ type: z.literal('individual_opt_in') }).strict(),
        options: z
          .array(
            decision.shape.options.element
              .extend({
                sharedChanges:
                  decision.shape.options.element.shape.sharedChanges.max(0),
                impactProposals: z
                  .array(sharedImpactProposalSchema.options[0])
                  .max(10),
              })
              .strict(),
          )
          .length(2),
      })
      .strict(),
  })
  .strict();
