import { z } from 'zod';
import { publicSnapshotDraftSchema } from './public-draft';
import { forkCheckpointSchema } from './public-fork';
import { PUBLIC_CONTENT_REVIEW_VERSION } from './public-content';
import { PUBLIC_CONTENT_CURATION_VERSION } from './public-content-curation';

export const PUBLICATION_VERSION = 'publication-1';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const publicationSlugSchema = z.string().regex(/^life-[a-f0-9]{32}$/);
export const publicationSettingsSchema = z
  .object({
    visibility: z.enum(['public', 'unlisted']),
    authorMode: z.enum(['anonymous', 'handle']),
    // Search indexing is enabled separately when Discovery/SEO is implemented.
    indexable: z.literal(false),
  })
  .strict();
export const publicationSnapshotSchema = z
  .object({
    schemaVersion: z.literal(PUBLICATION_VERSION),
    contentLocale: z.literal('en'),
    classification: z.literal('community'),
    author: z
      .object({
        mode: z.enum(['anonymous', 'handle']),
        handle: z
          .string()
          .regex(/^[a-z0-9][a-z0-9_]{2,29}$/)
          .nullable(),
      })
      .strict(),
    story: publicSnapshotDraftSchema
      .omit({ snapshotKey: true, origin: true })
      .extend({
        locale: z.literal('en'),
        origin: publicSnapshotDraftSchema.shape.origin.omit({
          classification: true,
        }),
      }),
    checkpoints: z
      .array(
        forkCheckpointSchema.omit({
          schemaVersion: true,
          requiresFullReview: true,
          readyForPublicFork: true,
        }),
      )
      .max(12),
    forkEnabled: z.literal(false),
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
export const publicationBindingSchema = z
  .object({
    bundleId: z.uuid(),
    contentHash: digest,
    sourceRevision: z.number().int().nonnegative(),
    reviewId: z.uuid(),
    reviewHash: digest,
    policyVersion: z.literal(PUBLIC_CONTENT_REVIEW_VERSION),
    curationId: z.uuid(),
    curationVersion: z.literal(PUBLIC_CONTENT_CURATION_VERSION),
  })
  .strict();
export const publicationPrepareRequestSchema = z
  .object({
    binding: publicationBindingSchema,
    settings: publicationSettingsSchema,
  })
  .strict();
export const publicationPreviewSchema = z
  .object({
    previewId: z.uuid(),
    previewHash: digest,
    snapshotHash: digest,
    binding: publicationBindingSchema,
    settings: publicationSettingsSchema,
    snapshot: publicationSnapshotSchema,
    expiresAt: z.iso.datetime(),
    published: z.literal(false),
  })
  .strict();
export const publicationConfirmRequestSchema = z
  .object({
    previewId: z.uuid(),
    previewHash: digest,
    acknowledged: z.literal(true),
  })
  .strict();
export const publicationOwnerViewSchema = z
  .object({
    publicationId: z.uuid(),
    bundleId: z.uuid(),
    slug: publicationSlugSchema,
    revision: z.number().int().positive(),
    status: z.enum(['active', 'withdrawn', 'hidden', 'removed']),
    settings: publicationSettingsSchema,
    snapshotHash: digest,
    snapshot: publicationSnapshotSchema,
    publishedAt: z.iso.datetime(),
    // Only an authenticated owner receives the fragment credential.
    unlistedToken: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .nullable(),
  })
  .strict();
export const publicationActionRequestSchema = z
  .object({
    revision: z.number().int().positive(),
    snapshotHash: digest,
    acknowledged: z.literal(true),
  })
  .strict();
export const publicationModerationRequestSchema = publicationActionRequestSchema
  .extend({
    publicationId: z.uuid(),
    action: z.enum(['hide', 'remove']),
    reasonCode: z.enum(['privacy', 'content', 'other']),
    actorLabel: z.string().trim().min(3).max(80),
  })
  .strict();
// Deliberately independent of owner/private DTOs: no internal IDs, hashes or tokens.
export const publicationReaderSchema = z
  .object({
    slug: publicationSlugSchema,
    publishedAt: z.iso.datetime(),
    visibility: z.enum(['public', 'unlisted']),
    indexable: z.literal(false),
    snapshot: publicationSnapshotSchema,
  })
  .strict();
export type PublicationSnapshot = z.infer<typeof publicationSnapshotSchema>;
export type PublicationSettings = z.infer<typeof publicationSettingsSchema>;
export type PublicationPreview = z.infer<typeof publicationPreviewSchema>;
export type PublicationOwnerView = z.infer<typeof publicationOwnerViewSchema>;
export type PublicationReader = z.infer<typeof publicationReaderSchema>;
export const publicationStatusSchema = z
  .object({
    enabled: z.boolean(),
    publication: publicationOwnerViewSchema.nullable(),
  })
  .strict();
