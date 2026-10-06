import { z } from 'zod';
import { publicationBindingSchema } from './publication';

export const OFFICIAL_LIFE_SOURCE_VERSION = 'official-life-source-1';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const actor = z.string().trim().min(3).max(80);
const reason = z.enum([
  'privacy',
  'content',
  'quality',
  'meaning',
  'origin',
  'other',
]);
export const officialLifeStartRequestSchema = z
  .object({
    scenarioVersionId: z.uuid(),
    scenarioGrantId: z.uuid(),
    templateHash: digest,
    acknowledged: z.literal(true),
  })
  .strict();
export const officialLifeGenerationBindingSchema = z
  .object({
    sourceHash: digest,
    periodInputHash: digest,
    chapterInputHash: digest,
    fidelityInputHash: digest,
  })
  .strict();
export const officialLifeReceiptSchema = z
  .object({
    task: z.enum([
      'life_period',
      'life_chapter',
      'life_fidelity',
      'public_content_review',
    ]),
    promptVersion: z.string().min(1).max(120),
    locale: z.literal('en'),
    model: z.string().min(1).max(120),
    requestId: z.string().min(1).max(200),
    inputHash: digest,
    outputHash: digest,
    inputTokens: z.number().int().positive(),
    outputTokens: z.number().int().positive(),
    cachedInputTokens: z.number().int().nonnegative().optional(),
    cacheWriteTokens: z.number().int().nonnegative().optional(),
    reasoningTokens: z.number().int().nonnegative().optional(),
    latencyMs: z.number().nonnegative(),
  })
  .strict();
export const officialLifeEvidenceSchema = z
  .object({
    sourceVersion: z.literal(OFFICIAL_LIFE_SOURCE_VERSION),
    lifeId: z.uuid(),
    branchId: z.uuid(),
    scenarioVersionId: z.uuid(),
    scenarioGrantId: z.uuid(),
    templateHash: digest,
    initialInputHash: digest,
    choicesHash: digest,
    binding: publicationBindingSchema,
    periods: z
      .array(
        z
          .object({
            periodId: z.uuid(),
            jobId: z.uuid(),
            position: z.number().int().positive(),
            canonHash: digest,
            chapterHash: digest,
            generation: officialLifeGenerationBindingSchema,
            receipts: z.array(officialLifeReceiptSchema).min(3).max(5),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    reviewReceipt: officialLifeReceiptSchema,
  })
  .strict();
export const officialLifeGrantRequestSchema = z
  .object({
    sourceVersion: z.literal(OFFICIAL_LIFE_SOURCE_VERSION),
    binding: publicationBindingSchema,
    evidenceHash: digest,
    fictionalSourceChecked: z.literal(true),
    rightsChecked: z.literal(true),
    qualityChecked: z.literal(true),
    acknowledged: z.literal(true),
    actorLabel: actor,
  })
  .strict();
export const officialLifeRevokeRequestSchema = z
  .object({
    grantId: z.uuid(),
    contentHash: digest,
    reasonCode: reason,
    actorLabel: actor,
    acknowledged: z.literal(true),
  })
  .strict();
export const officialLifeSourceViewSchema = z
  .object({
    sourceVersion: z.literal(OFFICIAL_LIFE_SOURCE_VERSION),
    bundleId: z.uuid(),
    contentHash: digest,
    publicationApproved: z.literal(false),
    grant: z
      .object({
        id: z.uuid(),
        status: z.enum(['active', 'revoked']),
        evidenceHash: digest,
        usable: z.boolean(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type OfficialLifeReceipt = z.infer<typeof officialLifeReceiptSchema>;
export type OfficialLifeEvidence = z.infer<typeof officialLifeEvidenceSchema>;
