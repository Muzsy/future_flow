import { z } from 'zod';
import {
  employmentV2Schema,
  locationV2Schema,
  financeV2Schema,
  lifeInputV2Schema,
  lifeStateV2Schema,
} from './life-v2';

export const SCENARIO_CONTRACT_VERSION = 'scenario-1';
const key = (kind: string) =>
  z.string().regex(new RegExp(`^${kind}-[1-9][0-9]{0,2}$`));
const label = z.string().trim().min(1).max(160);
const goal = lifeInputV2Schema.shape.goals.element.shape;
const state = lifeStateV2Schema.shape;

// Separate allowlist: no private IDs, profile, history, prompt or Shared membership.
export const scenarioTemplateSchema = z
  .object({
    schemaVersion: z.literal(SCENARIO_CONTRACT_VERSION),
    contentLocale: z.literal('en'),
    title: label,
    summary: z.string().trim().min(10).max(800),
    identity: z
      .object({
        mode: z.literal('alternate'),
        label: label.nullable(),
        ageBand: lifeInputV2Schema.shape.identity.shape.ageBand,
      })
      .strict(),
    environment: z
      .object({
        version: z.literal('fictional-neutral-1'),
        description: z.string().trim().min(1).max(1000),
      })
      .strict(),
    goals: z
      .array(
        z
          .object({
            key: key('goal'),
            category: goal.category,
            description: goal.description,
            priority: goal.priority,
            horizonMonths: goal.horizonMonths,
            motivation: goal.motivation,
            acceptableTradeoffs: goal.acceptableTradeoffs,
            unacceptableTradeoffs: goal.unacceptableTradeoffs,
            status: state.goals.element.shape.status,
            note: state.goals.element.shape.note,
          })
          .strict(),
      )
      .min(1)
      .max(5),
    startingState: z
      .object({
        effectiveAt: z.iso.date(),
        employment: employmentV2Schema,
        location: locationV2Schema,
        finance: financeV2Schema,
        ownedAssets: z
          .array(
            z
              .object({
                key: key('asset'),
                kind: state.ownedAssets.element.shape.kind,
                label,
                sharePercent: state.ownedAssets.element.shape.sharePercent,
              })
              .strict(),
          )
          .max(30),
        actors: z
          .array(
            z
              .object({
                key: key('actor'),
                label,
                relationship: state.actors.element.shape.relationship,
              })
              .strict(),
          )
          .max(30),
        skills: z.array(label).max(50),
        opportunities: z
          .array(
            z
              .object({
                key: key('opportunity'),
                title: label,
                status: state.opportunities.element.shape.status,
                expiresAt: z.iso.date().nullable(),
              })
              .strict(),
          )
          .max(30),
        resources: state.resources,
      })
      .strict(),
    constraints: z
      .array(
        z
          .object({
            key: key('constraint'),
            description: z.string().trim().min(1).max(400),
            strength: z.enum(['hard', 'soft']),
            scope: z.enum(['life', 'branch']),
            validFrom: z.iso.date(),
            validUntil: z.iso.date().nullable(),
            predicate: z.discriminatedUnion('type', [
              z
                .object({
                  type: z.literal('employment_status_is'),
                  value: employmentV2Schema.shape.status,
                })
                .strict(),
              z
                .object({
                  type: z.literal('country_is'),
                  value: locationV2Schema.shape.country,
                })
                .strict(),
              z
                .object({
                  type: z.literal('asset_is_owned'),
                  assetKey: key('asset'),
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
            ]),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export type ScenarioTemplate = z.infer<typeof scenarioTemplateSchema>;
export const scenarioCreateRequestSchema = z
  .object({ template: scenarioTemplateSchema })
  .strict();
export const scenarioVersionRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
    template: scenarioTemplateSchema,
  })
  .strict();
export const scenarioVersionSchema = z
  .object({
    id: z.uuid(),
    scenarioId: z.uuid(),
    version: z.number().int().positive(),
    templateHash: z.string().regex(/^[a-f0-9]{64}$/),
    template: scenarioTemplateSchema,
    status: z.literal('awaiting_review'),
    publicationApproved: z.literal(false),
  })
  .strict();
export type ScenarioVersion = z.infer<typeof scenarioVersionSchema>;
export const scenarioStartRequestSchema = z
  .object({
    templateHash: z.string().regex(/^[a-f0-9]{64}$/),
    acknowledged: z.literal(true),
  })
  .strict();
