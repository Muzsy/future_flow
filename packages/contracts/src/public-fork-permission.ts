import { z } from 'zod';
import {
  publicExposureSlugSchema,
  officialExposureRequestSchema,
} from './public-exposure';
import { discoveryCardSchema } from './discovery';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const PUBLIC_FORK_PERMISSION_VERSION = 'public-fork-permission-1';
export const publicForkPermissionRequestSchema = z
  .object({
    publicationRevision: z.number().int().positive(),
    snapshotHash: digest,
    permissionRevision: z.number().int().nonnegative(),
    allowed: z.boolean(),
    acknowledged: z.literal(true),
  })
  .strict();
export const officialForkPermissionRequestSchema =
  publicForkPermissionRequestSchema
    .extend({
      slug: officialExposureRequestSchema.shape.slug,
      actorLabel: officialExposureRequestSchema.shape.actorLabel,
    })
    .strict();
export const publicForkPermissionOwnerSchema = z
  .object({
    schemaVersion: z.literal('public-fork-permission-1'),
    slug: publicExposureSlugSchema,
    publicationRevision: z.number().int().positive(),
    snapshotHash: digest,
    permissionRevision: z.number().int().nonnegative(),
    allowed: z.boolean(),
    effectiveAllowed: z.boolean(),
    enabled: z.boolean(),
    startsEnabled: z.boolean(),
    authority: z.enum(['owner', 'curator']),
  })
  .strict()
  .refine((v) => !v.effectiveAllowed || (v.allowed && v.enabled));
export const publicForkCapabilitySchema = z
  .object({
    schemaVersion: z.literal('public-fork-permission-1'),
    slug: publicExposureSlugSchema,
    classification: z.enum(['community', 'official']),
    contentLocale: z.literal('en'),
    title: discoveryCardSchema.shape.title,
    capabilityHash: digest,
    permissionRevision: z.number().int().positive(),
    startsEnabled: z.boolean(),
    checkpoints: z
      .array(
        z
          .object({
            index: z.number().int().min(0).max(11),
            prompt: z.string().min(5).max(400),
            options: z
              .array(
                z
                  .object({
                    key: z.string().regex(/^option-[1-9][0-9]{0,2}$/),
                    label: z.string().min(3).max(160),
                    description: z.string().min(3).max(500),
                  })
                  .strict(),
              )
              .min(2)
              .max(4),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict()
  .refine(
    (v) =>
      v.checkpoints.every((c, i) => c.index === i) &&
      v.slug.startsWith('official-') === (v.classification === 'official'),
  );
export type PublicForkPermissionOwner = z.infer<
  typeof publicForkPermissionOwnerSchema
>;
export type PublicForkCapability = z.infer<typeof publicForkCapabilitySchema>;
