import { z } from 'zod';
import {
  publicationSnapshotSchema,
  publicationSettingsSchema,
  publicationBindingSchema,
  publicationConfirmRequestSchema,
  publicationActionRequestSchema,
  publicationModerationRequestSchema,
} from './publication';
import {
  OFFICIAL_LIFE_SOURCE_VERSION,
  officialLifeSourceViewSchema,
} from './official-life';

// A separate wire version: publication-1 remains Community-only.
export const OFFICIAL_PUBLICATION_VERSION = 'official-publication-1';
export const officialPublicationSlugSchema = z
  .string()
  .regex(/^official-[a-f0-9]{32}$/);
export const officialPublicationBindingSchema = publicationBindingSchema
  .extend({
    sourceVersion: z.literal(OFFICIAL_LIFE_SOURCE_VERSION),
    grantId: z.uuid(),
    evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const officialPublicationSnapshotSchema = z
  .object({
    ...publicationSnapshotSchema.shape,
    schemaVersion: z.literal(OFFICIAL_PUBLICATION_VERSION),
    classification: z.literal('official'),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.author.mode === 'anonymous') !== (v.author.handle === null))
      ctx.addIssue({
        code: 'custom',
        path: ['author'],
        message: 'Author mode mismatch.',
      });
  });
export const officialPublicationPrepareRequestSchema = z
  .object({
    binding: officialPublicationBindingSchema,
    settings: publicationSettingsSchema,
  })
  .strict();
export const officialPublicationPreviewSchema = z
  .object({
    previewId: z.uuid(),
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    binding: officialPublicationBindingSchema,
    settings: publicationSettingsSchema,
    snapshot: officialPublicationSnapshotSchema,
    expiresAt: z.iso.datetime(),
    published: z.literal(false),
  })
  .strict();
export const officialPublicationConfirmRequestSchema =
  publicationConfirmRequestSchema;
export const officialPublicationOwnerViewSchema = z
  .object({
    publicationId: z.uuid(),
    bundleId: z.uuid(),
    slug: officialPublicationSlugSchema,
    revision: z.number().int().positive(),
    status: z.enum(['active', 'withdrawn', 'hidden', 'removed']),
    settings: publicationSettingsSchema,
    snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    snapshot: officialPublicationSnapshotSchema,
    publishedAt: z.iso.datetime(),
    unlistedToken: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .nullable(),
  })
  .strict();
export const officialPublicationActionRequestSchema =
  publicationActionRequestSchema;
export const officialPublicationModerationRequestSchema =
  publicationModerationRequestSchema;
export const officialPublicationReaderSchema = z
  .object({
    slug: officialPublicationSlugSchema,
    publishedAt: z.iso.datetime(),
    visibility: z.enum(['public', 'unlisted']),
    indexable: z.literal(false),
    snapshot: officialPublicationSnapshotSchema,
  })
  .strict();
export const officialPublicationStatusSchema = z
  .object({
    enabled: z.boolean(),
    source: officialLifeSourceViewSchema.nullable(),
    publication: officialPublicationOwnerViewSchema.nullable(),
  })
  .strict();
export type OfficialPublicationSnapshot = z.infer<
  typeof officialPublicationSnapshotSchema
>;
export type OfficialPublicationPreview = z.infer<
  typeof officialPublicationPreviewSchema
>;
export type OfficialPublicationOwnerView = z.infer<
  typeof officialPublicationOwnerViewSchema
>;
export type OfficialPublicationReader = z.infer<
  typeof officialPublicationReaderSchema
>;
