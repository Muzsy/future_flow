import { z } from 'zod';
import { publicForkCapabilitySchema } from './public-fork-permission';
export const PUBLIC_FORK_START_VERSION = 'public-fork-start-1';
export const publicForkStartRequestSchema = z
  .object({
    capabilityHash: publicForkCapabilitySchema.shape.capabilityHash,
    checkpointIndex: z.number().int().min(0).max(11),
    optionKey: z.string().regex(/^option-[1-9][0-9]{0,2}$/),
    acknowledged: z.literal(true),
  })
  .strict();
export const publicForkStartReceiptSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_FORK_START_VERSION),
    lifeId: z.uuid(),
    branchId: z.uuid(),
    jobId: z.uuid(),
    status: z.literal('queued'),
  })
  .strict();
export const publicForkAttributionSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_FORK_START_VERSION),
    lifeId: z.uuid(),
    origin: z.literal('public_checkpoint'),
    source: z
      .object({
        slug: publicForkCapabilitySchema.shape.slug,
        classification: publicForkCapabilitySchema.shape.classification,
        title: publicForkCapabilitySchema.shape.title,
      })
      .strict()
      .refine(
        (v) =>
          v.slug.startsWith('official-') === (v.classification === 'official'),
      )
      .nullable(),
  })
  .strict();
export const publicForkInitialChoiceSchema = z
  .object({
    decisionId: z.uuid(),
    optionId: z.uuid(),
    prompt: z.string().min(5).max(400),
    label: z.string().min(3).max(160),
    description: z.string().min(3).max(500),
    chosenAt: z.iso.datetime(),
  })
  .strict();
export type PublicForkAttribution = z.infer<typeof publicForkAttributionSchema>;
export type PublicForkInitialChoice = z.infer<
  typeof publicForkInitialChoiceSchema
>;
