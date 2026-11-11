import { z } from 'zod';
import { publicationOwnerViewSchema } from './publication';
import { officialPublicationOwnerViewSchema } from './official-publication';
import { publicExposureSlugSchema } from './public-exposure';
import { discoveryCardSchema } from './discovery';
export const PUBLICATION_REFRESH_VERSION = 'publication-refresh-1';
export const publicationRefreshOriginSchema = z.enum(['community', 'official']);
export const publicationRefreshRequestSchema = z
  .object({
    previousPublicationId: z.uuid(),
    previousRevision: z.number().int().positive(),
    previousSnapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    previewId: z.uuid(),
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    acknowledged: z.literal(true),
  })
  .strict();
export const publicationRefreshTargetSchema = z
  .object({
    publicationId: z.uuid(),
    bundleId: z.uuid(),
    slug: publicExposureSlugSchema,
    revision: z.number().int().positive(),
    snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    title: discoveryCardSchema.shape.title,
    visibility: z.enum(['public', 'unlisted']),
    classification: publicationRefreshOriginSchema,
    publishedAt: z.iso.datetime(),
  })
  .strict()
  .refine(
    (v) => v.slug.startsWith('official-') === (v.classification === 'official'),
  );
export const publicationRefreshTargetsSchema = z
  .object({
    schemaVersion: z.literal(PUBLICATION_REFRESH_VERSION),
    enabled: z.boolean(),
    classification: publicationRefreshOriginSchema,
    bundleId: z.uuid(),
    items: z.array(publicationRefreshTargetSchema).max(24),
  })
  .strict()
  .refine((v) => v.items.every((i) => i.classification === v.classification));
export const publicationRefreshReceiptSchema = z
  .object({
    schemaVersion: z.literal(PUBLICATION_REFRESH_VERSION),
    previousPublicationId: z.uuid(),
    previousStatus: z.literal('withdrawn'),
    publication: publicationOwnerViewSchema.or(
      officialPublicationOwnerViewSchema,
    ),
  })
  .strict()
  .refine((v) => v.previousPublicationId !== v.publication.publicationId);
export type PublicationRefreshTarget = z.infer<
  typeof publicationRefreshTargetSchema
>;
export type PublicationRefreshReceipt = z.infer<
  typeof publicationRefreshReceiptSchema
>;
