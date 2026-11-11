import { z } from 'zod';
import { discoveryCardSchema } from './discovery';
import { officialPublicationSlugSchema } from './official-publication';

export const PUBLIC_EXPOSURE_VERSION = 'public-exposure-1';
export const publicExposureSlugSchema = z
  .string()
  .regex(/^(life|official)-[a-f0-9]{32}$/);
export const publicExposureModeSchema = z.enum(['none', 'preview', 'index']);
export const publicExposureRequestSchema = z
  .object({
    publicationRevision: z.number().int().positive(),
    snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    permissionRevision: z.number().int().nonnegative(),
    mode: publicExposureModeSchema,
    acknowledged: z.literal(true),
  })
  .strict();
export const officialExposureRequestSchema = publicExposureRequestSchema
  .extend({
    slug: officialPublicationSlugSchema,
    actorLabel: z.string().trim().min(1).max(80),
  })
  .strict();
export const publicExposureOwnerViewSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_EXPOSURE_VERSION),
    slug: publicExposureSlugSchema,
    publicationRevision: z.number().int().positive(),
    snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    permissionRevision: z.number().int().nonnegative(),
    mode: publicExposureModeSchema,
    effectiveMode: publicExposureModeSchema,
    enabled: z.boolean(),
    authority: z.enum(['owner', 'curator']),
  })
  .strict();
export const publicExposureSchema = discoveryCardSchema
  .safeExtend({
    schemaVersion: z.literal(PUBLIC_EXPOSURE_VERSION),
    mode: z.enum(['preview', 'index']),
    indexable: z.boolean(),
  })
  .strict()
  .refine((v) => v.indexable === (v.mode === 'index'));
export const publicExposureSitemapQuerySchema = z
  .object({
    cursor: publicExposureSlugSchema.optional(),
    limit: z.number().int().min(1).max(100).default(100),
  })
  .strict();
export const publicExposureSitemapSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_EXPOSURE_VERSION),
    items: z.array(publicExposureSchema).max(100),
    nextCursor: publicExposureSlugSchema.nullable(),
  })
  .strict()
  .refine((v) => v.items.every((i) => i.indexable));
export type PublicExposure = z.infer<typeof publicExposureSchema>;
export type PublicExposureOwnerView = z.infer<
  typeof publicExposureOwnerViewSchema
>;
