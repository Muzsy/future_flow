import { z } from 'zod';
import type { LifePeriodInput } from './life-v2';

export const NARRATIVE_CONTEXT_VERSION = '1.0.0';
export const NARRATIVE_MEMORY_BYTES = 12 * 1024;
export const NARRATIVE_WITHHELD_SUMMARY =
  'Recorded personal history. Narrative details are withheld; the current personal state remains authoritative and no past choice is inferred.';
const id = z.uuid();
const short = z.string().trim().min(1).max(80);
export const narrativeMemorySchema = z
  .object({
    version: z.literal(NARRATIVE_CONTEXT_VERSION),
    branchId: id,
    baseRevision: z.number().int().nonnegative(),
    history: z
      .array(
        z
          .object({
            periodId: id,
            startDate: z.iso.date(),
            endDate: z.iso.date(),
            position: z.number().int().positive(),
            summary: z.string().min(80).max(500),
            salientEventIds: z.array(id).max(3),
            excerpt: z.string().max(1200).nullable(),
          })
          .strict(),
      )
      .max(8),
    recentChoices: z
      .array(
        z
          .object({
            decisionId: id,
            optionId: id,
            acceptedAt: z.iso.datetime({ offset: true }),
            label: z.string().min(1).max(200),
            changesSummary: z.string().max(500),
          })
          .strict(),
      )
      .max(10),
    // Context mode has no persisted narrative artifacts yet. Later narrative
    // contracts introduce validated thread/NPC records, never untyped objects.
    openThreads: z.array(z.never()).length(0),
    fictionalActors: z.array(z.never()).length(0),
    recentDecisionPatterns: z.array(short).max(4),
    withheld: z.boolean(),
  })
  .strict()
  .refine(
    (memory) =>
      !memory.withheld ||
      (memory.recentChoices.length === 0 &&
        memory.recentDecisionPatterns.length === 0 &&
        memory.history.every(
          (period) =>
            period.summary === NARRATIVE_WITHHELD_SUMMARY &&
            period.excerpt === null &&
            period.salientEventIds.length === 0,
        )),
    'Withheld narrative memory contains private text.',
  );
export type NarrativeMemory = z.infer<typeof narrativeMemorySchema>;
export const narrativeContextSchema = z
  .object({
    policy: z
      .object({
        version: z.literal(NARRATIVE_CONTEXT_VERSION),
        mode: z.literal('context'),
        promptVersions: z
          .object({
            planner: z.null(),
            writer: z.literal('life_chapter.v5.context'),
            fidelity: z.literal('life_fidelity.v4.context'),
            editor: z.null(),
          })
          .strict(),
        memoryVersion: z.literal(NARRATIVE_CONTEXT_VERSION),
        qualityPolicyVersion: z.null(),
        maxPhysicalRequests: z.null(),
        maxContentRepairs: z.literal(1),
        targetWords: z
          .object({ min: z.literal(250), max: z.literal(600) })
          .strict(),
      })
      .strict(),
    memory: narrativeMemorySchema,
  })
  .strict();
export type NarrativeContext = z.infer<typeof narrativeContextSchema>;
export type NarrativePeriodInput = LifePeriodInput & {
  narrativeContext?: NarrativeContext;
};
export function contextNarrativePolicy(): NarrativeContext['policy'] {
  return {
    version: NARRATIVE_CONTEXT_VERSION,
    mode: 'context',
    promptVersions: {
      planner: null,
      writer: 'life_chapter.v5.context',
      fidelity: 'life_fidelity.v4.context',
      editor: null,
    },
    memoryVersion: NARRATIVE_CONTEXT_VERSION,
    qualityPolicyVersion: null,
    maxPhysicalRequests: null,
    maxContentRepairs: 1,
    targetWords: { min: 250, max: 600 },
  };
}
