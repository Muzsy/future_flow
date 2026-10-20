import { z } from 'zod';
import { fictionalActorMemorySchema } from './narrative';

// Recurring-character state of the living-world generation (ADR-009). These
// contracts are standalone: no fiction policy, artifact or request schema
// references them yet, so every v1-v8 byte stays as it was. The state itself is
// never stored; a deterministic fold rebuilds it from per-period deltas.
export const FICTION_CHARACTER_VERSION = '1.0.0' as const;
// Provisional caps (plan appendix C, decisions 8 and 9); finalised after the
// phase 3 request-byte measurement.
export const FICTION_CHARACTER_PROJECTION_BYTES = 8 * 1024;
export const FICTION_CHARACTER_DELTA_ACTORS = 6;
// The delta must stay a small share of the 32 KiB artifact bound (plan 17, 56).
export const FICTION_CHARACTER_DELTA_BYTES = 8 * 1024;
export const FICTION_CHARACTER_PROJECTION_ACTORS = 8;
// A removed actor keeps only a stripped tombstone and only the most recent
// ones are kept, so exits cannot grow the state without bound. With at most 30
// live actors and 100 supplied people the state cap is not reachable by a
// valid history; reaching it is a typed, fail-closed error (appendix D.8).
export const FICTION_CHARACTER_TOMBSTONES = 100;
export const FICTION_CHARACTER_STATE_ACTORS = 300;

const id = z.uuid();
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const byteLength = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length;

// Where a psychological or relational statement comes from. `branch_fiction`
// is fiction of this branch and never a real-world fact about a supplied person.
export const fictionCharacterProvenanceSchema = z.enum([
  'user_supplied',
  'branch_fiction',
  'interaction_derived',
]);
export type FictionCharacterProvenance = z.infer<
  typeof fictionCharacterProvenanceSchema
>;

// Stable layer. Wholly fictional actors only; behaviour-causing cues, not a
// character sheet and no numeric traits (plan 8).
export const fictionCharacterProfileSchema = z
  .object({
    actorId: id,
    originEventId: id,
    socialRole: text(10, 120),
    coreWant: text(20, 200),
    independentConcern: text(20, 200),
    conflictStyle: text(20, 200),
    attentionStyle: text(20, 200),
    valueCue: z.array(text(3, 60)).min(1).max(3),
    voiceCue: text(20, 120),
    establishedAtPeriodId: id,
  })
  .strict();
export type FictionCharacterProfile = z.infer<
  typeof fictionCharacterProfileSchema
>;

// Changing layer; only fictional actors (a supplied person gets no invented
// private state, plan 11).
export const fictionCharacterDynamicStateSchema = z
  .object({
    actorId: id,
    currentAim: text(20, 200),
    currentPressure: text(20, 200),
    attentionOn: text(10, 160),
    stanceTowardProtagonist: text(20, 200),
    unresolvedMatter: text(20, 200).nullable(),
    lastMeaningfulChangePeriodId: id,
    provenance: fictionCharacterProvenanceSchema,
  })
  .strict();
export type FictionCharacterDynamicState = z.infer<
  typeof fictionCharacterDynamicStateSchema
>;

// Bounded semantic relationship, no scales ("trust = 73", plan 10).
export const fictionRelationshipStateSchema = z
  .object({
    actorId: id,
    currentDynamic: text(20, 240),
    expectation: text(20, 200),
    unresolvedInteraction: text(20, 240).nullable(),
    provenance: fictionCharacterProvenanceSchema,
  })
  .strict();
export type FictionRelationshipState = z.infer<
  typeof fictionRelationshipStateSchema
>;

export const fictionCharacterDeltaSchema = z
  .object({
    version: z.literal(FICTION_CHARACTER_VERSION),
    addedProfiles: z
      .array(fictionCharacterProfileSchema)
      .max(FICTION_CHARACTER_DELTA_ACTORS),
    // A profile update replaces the stored fields; origin and establishment
    // stay fixed (checked by the fold).
    profileUpdates: z
      .array(fictionCharacterProfileSchema)
      .max(FICTION_CHARACTER_DELTA_ACTORS),
    dynamicUpdates: z
      .array(fictionCharacterDynamicStateSchema)
      .max(FICTION_CHARACTER_DELTA_ACTORS),
    relationshipUpdates: z
      .array(fictionRelationshipStateSchema)
      .max(FICTION_CHARACTER_DELTA_ACTORS),
    removedActorIds: z.array(id).max(FICTION_CHARACTER_DELTA_ACTORS),
  })
  .strict()
  .superRefine((delta, ctx) => {
    for (const key of [
      'addedProfiles',
      'profileUpdates',
      'dynamicUpdates',
      'relationshipUpdates',
    ] as const) {
      const ids = delta[key].map((item) => item.actorId);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'A delta lists an actor at most once per update kind.',
        });
    }
    if (new Set(delta.removedActorIds).size !== delta.removedActorIds.length)
      ctx.addIssue({
        code: 'custom',
        path: ['removedActorIds'],
        message: 'A removed actor is listed once.',
      });
    const touched = new Set([
      ...delta.addedProfiles.map((p) => p.actorId),
      ...delta.profileUpdates.map((p) => p.actorId),
      ...delta.dynamicUpdates.map((p) => p.actorId),
      ...delta.relationshipUpdates.map((p) => p.actorId),
      ...delta.removedActorIds,
    ]);
    if (touched.size > FICTION_CHARACTER_DELTA_ACTORS)
      ctx.addIssue({
        code: 'custom',
        message: `A period delta touches at most ${FICTION_CHARACTER_DELTA_ACTORS} actors.`,
      });
    if (byteLength(delta) > FICTION_CHARACTER_DELTA_BYTES)
      ctx.addIssue({
        code: 'custom',
        message: 'Character delta exceeds its byte bound.',
      });
  });
export type FictionCharacterDelta = z.infer<typeof fictionCharacterDeltaSchema>;

export const fictionCharacterRelevanceReasons = [
  'in_candidate',
  'open_thread',
  'goal_or_opportunity',
  'unresolved_matter',
  'overdue_private_life',
  'recent_change',
] as const;
export const fictionCharacterRelevanceSchema = z.enum(
  fictionCharacterRelevanceReasons,
);
export type FictionCharacterRelevance = z.infer<
  typeof fictionCharacterRelevanceSchema
>;

// What the model sees for one relevant actor. Archive-only fields (origin,
// establishment period) stay server-side.
export const fictionCharacterProjectionActorSchema = z
  .object({
    actorId: id,
    kind: z.enum(['fictional', 'supplied']),
    reasons: z.array(fictionCharacterRelevanceSchema).min(1).max(6),
    profile: fictionCharacterProfileSchema
      .omit({
        actorId: true,
        originEventId: true,
        establishedAtPeriodId: true,
      })
      .nullable(),
    dynamic: fictionCharacterDynamicStateSchema
      .omit({ actorId: true, lastMeaningfulChangePeriodId: true })
      .nullable(),
    relationship: fictionRelationshipStateSchema
      .omit({ actorId: true })
      .nullable(),
    // Only a person carried over from an older generation who has no profile:
    // the recorded legacy fields, nothing mined from old prose (ADR-009, 4).
    legacy: fictionalActorMemorySchema
      .pick({ role: true, desire: true, resistance: true, voiceCue: true })
      .optional(),
  })
  .strict();
export type FictionCharacterProjectionActor = z.infer<
  typeof fictionCharacterProjectionActorSchema
>;

export const fictionCharacterProjectionSchema = z
  .object({
    version: z.literal(FICTION_CHARACTER_VERSION),
    actors: z
      .array(fictionCharacterProjectionActorSchema)
      .max(FICTION_CHARACTER_PROJECTION_ACTORS),
    // Relevant actors that did not fit; omission is visible, never silent.
    omittedActors: z.number().int().min(0).max(1000),
  })
  .strict()
  .refine(
    (projection) =>
      byteLength(projection) <= FICTION_CHARACTER_PROJECTION_BYTES,
    'Character projection exceeds its byte bound.',
  );
export type FictionCharacterProjection = z.infer<
  typeof fictionCharacterProjectionSchema
>;

// Planner output: what each relevant person is doing for their own reasons
// before the protagonist's story touches them (plan section 20). Advisory;
// the author may reshape it, and it is not persisted beyond the draft hash.
export const FICTION_CHARACTER_INTENTS = 6;
export const fictionCharacterIntentSchema = z
  .object({
    actorId: id,
    ownAim: text(10, 200),
    attentionOn: text(10, 160),
    interactionPressure: text(10, 200),
    protagonistRelevance: text(5, 120).nullable(),
  })
  .strict();
export type FictionCharacterIntent = z.infer<
  typeof fictionCharacterIntentSchema
>;

// Planner output: what happens to each person whose matter is still open
// (an unresolved matter or an open thread). Silence is not a decision, but its
// absence is diagnostics only, never a hard failure (phase 5 round 1: the
// planner only ever gave an intent to the person it had just introduced).
export const FICTION_CHARACTER_CONTINUITY = 8;
export const fictionContinuityDecisionSchema = z
  .object({
    actorId: id,
    decision: z.enum(['carry', 'defer', 'resolve']),
    reason: text(5, 100),
  })
  .strict();
export type FictionContinuityDecision = z.infer<
  typeof fictionContinuityDecisionSchema
>;

// Folded state, server-side only (never model input); the request carries the
// bounded projection of it. Persisted in the job payload next to the owned
// reference inventories, and bound into the artifact by hash.
export const fictionCharacterEntrySchema = z
  .object({
    actorId: id,
    kind: z.enum(['fictional', 'supplied']),
    // Pre-v9 recorded fields, kept as a seed; never inferred from older prose.
    legacy: fictionalActorMemorySchema.nullable(),
    profile: fictionCharacterProfileSchema.nullable(),
    dynamic: fictionCharacterDynamicStateSchema.nullable(),
    relationship: fictionRelationshipStateSchema.nullable(),
    // Zero-based index of the last period that changed this actor.
    touchedAtIndex: z.number().int().min(0).max(100000).nullable(),
    removedAtPeriodId: id.nullable(),
  })
  .strict();
export type FictionCharacterEntry = z.infer<typeof fictionCharacterEntrySchema>;
export const fictionCharacterStateSchema = z
  .object({
    version: z.literal(FICTION_CHARACTER_VERSION),
    ownedPeriods: z.number().int().min(0).max(100000),
    // Sorted by actorId.
    actors: z
      .array(fictionCharacterEntrySchema)
      .max(FICTION_CHARACTER_STATE_ACTORS),
  })
  .strict();
export type FictionCharacterState = z.infer<typeof fictionCharacterStateSchema>;
// Relevance signals that exist before the planner runs (the candidate does
// not exist yet and the request is hash-bound), computed by the server.
export const fictionCharacterSignalsSchema = z
  .object({
    openThreadActors: z.array(id).max(60),
    goalOrOpportunityActors: z.array(id).max(60),
    overduePrivateLifeActors: z.array(id).max(60),
  })
  .strict();
export type FictionCharacterSignalSet = z.infer<
  typeof fictionCharacterSignalsSchema
>;
export const fictionCharacterEnvelopeSchema = z
  .object({
    version: z.literal(FICTION_CHARACTER_VERSION),
    state: fictionCharacterStateSchema,
    // Wholly fictional actors with their introducing event; every other actor
    // that appears in a delta must be a supplied person listed here.
    fictionalOrigins: z
      .array(z.object({ actorId: id, introducedByEventId: id }).strict())
      .max(1000),
    suppliedActorIds: z.array(id).max(100),
    signals: fictionCharacterSignalsSchema,
  })
  .strict();
export type FictionCharacterEnvelope = z.infer<
  typeof fictionCharacterEnvelopeSchema
>;
