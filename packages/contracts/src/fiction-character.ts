import { z } from 'zod';

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
