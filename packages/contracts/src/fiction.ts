import { z } from 'zod';
import { periodCandidateV2Schema, periodChapterV2Schema } from './life-v2';
import {
  narrativeMemorySchema,
  narrativePlanSchema,
  narrativePlanReviewV2Schema,
  narrativeEditorialReportSchema,
} from './narrative';

export const FICTION_MODE = 'narrative-fiction-v2' as const;
export const FICTION_FACT_BYTES = 6 * 1024;
export const storyFactSchema = z
  .object({
    id: z.uuid(),
    introducedByEventId: z.uuid(),
    aboutActorIds: z.array(z.uuid()).max(4),
    kind: z.enum([
      'encounter',
      'artifact',
      'setting',
      'relationship_detail',
      'promise',
      'outcome',
      'observation',
    ]),
    assertion: z.string().trim().min(10).max(300),
    supersedesFactId: z.uuid().nullable(),
    relevance: z.enum(['scene', 'continuity']),
  })
  .strict();
export type StoryFact = z.infer<typeof storyFactSchema>;
export const fictionPolicySchema = z
  .object({
    version: z.literal('2.0.0'),
    mode: z.literal(FICTION_MODE),
    promptVersions: z
      .object({
        planner: z.literal('life_fiction_plan.v1'),
        writer: z.literal('life_fiction_author.v1'),
        planReviewer: z.literal('life_fiction_plan_review.v1'),
        fidelity: z.literal('life_fiction_fidelity.v1'),
        editor: z.literal('life_fiction_editor.v1'),
      })
      .strict(),
    memoryVersion: z.literal('2.0.0'),
    qualityPolicyVersion: z.literal('2.0.0'),
    maxPhysicalRequests: z.literal(9),
    maxContentRepairs: z.literal(1),
    targetWords: z
      .object({ min: z.literal(650), max: z.literal(950) })
      .strict(),
  })
  .strict();
export type FictionPolicy = z.infer<typeof fictionPolicySchema>;
export function fictionPolicy(): FictionPolicy {
  return {
    version: '2.0.0',
    mode: FICTION_MODE,
    promptVersions: {
      planner: 'life_fiction_plan.v1',
      writer: 'life_fiction_author.v1',
      planReviewer: 'life_fiction_plan_review.v1',
      fidelity: 'life_fiction_fidelity.v1',
      editor: 'life_fiction_editor.v1',
    },
    memoryVersion: '2.0.0',
    qualityPolicyVersion: '2.0.0',
    maxPhysicalRequests: 9,
    maxContentRepairs: 1,
    targetWords: { min: 650, max: 950 },
  };
}
// The existing bounded memory remains strict and byte-compatible. New facts are
// a separately versioned projection, included in the SAME total input byte cap.
export const fictionContextSchema = z
  .object({
    policy: fictionPolicySchema,
    memory: narrativeMemorySchema,
    storyFacts: z.array(storyFactSchema).max(24),
  })
  .strict()
  .refine(
    (c) => !c.memory.withheld || c.storyFacts.length === 0,
    'Withheld fiction context cannot contain historical facts.',
  );
export type FictionContext = z.infer<typeof fictionContextSchema>;
export const fictionAuthorResultSchema = z
  .object({
    version: z.literal('2.0.0'),
    candidate: periodCandidateV2Schema,
    plan: narrativePlanSchema,
    storyFacts: z.array(storyFactSchema).max(12),
    chapter: periodChapterV2Schema,
  })
  .strict();
export type FictionAuthorResult = z.infer<typeof fictionAuthorResultSchema>;
// Metadata-only, server-owned full-prefix inventory. Never model input.
export const fictionReferencesSchema = z
  .object({
    facts: z
      .array(z.object({ id: z.uuid(), eventId: z.uuid() }).strict())
      .max(12000),
  })
  .strict();
export type FictionReferences = z.infer<typeof fictionReferencesSchema>;
export const fictionBindingKeys = [
  'policyHash',
  'memoryHash',
  'referenceHash',
  'fictionReferenceHash',
  'draftInputHash',
  'draftOutputHash',
  'authorInputHash',
  'authorOutputHash',
  'candidateHash',
  'canonHash',
  'planHash',
  'storyFactsHash',
  'chapterHash',
  'reviewInputHash',
  'reviewOutputHash',
  'fidelityInputHash',
  'fidelityOutputHash',
  'editorialInputHash',
  'editorialOutputHash',
] as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const bindingsShape = Object.fromEntries(
  fictionBindingKeys.map((key) => [key, digest]),
) as Record<(typeof fictionBindingKeys)[number], typeof digest>;
export const fictionArtifactSchema = z
  .object({
    version: z.literal('2.0.0'),
    pipelineVersion: z.literal(FICTION_MODE),
    policy: fictionPolicySchema,
    validatedPlan: narrativePlanSchema,
    validatedMemoryDelta: narrativePlanSchema.shape.memoryDelta,
    storyFacts: z.array(storyFactSchema).max(12),
    planningReview: narrativePlanReviewV2Schema,
    editorialReport: narrativeEditorialReportSchema,
    bindings: z.object(bindingsShape).strict(),
    provenance: z
      .object({
        receiptRefs: z
          .array(
            z
              .object({
                task: z.enum([
                  'life_narrative_plan',
                  'life_narrative_chapter',
                  'life_narrative_plan_review',
                  'life_fidelity',
                  'life_narrative_editor',
                ]),
                ordinal: z.number().int().min(0).max(8),
                model: z.string().min(1).max(200),
                inputHash: digest,
                outputHash: digest,
              })
              .strict(),
          )
          .min(5)
          .max(9),
      })
      .strict(),
  })
  .strict();
export type FictionArtifact = z.infer<typeof fictionArtifactSchema>;
