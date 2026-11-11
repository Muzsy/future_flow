import { z } from 'zod';
import { publicLifeSlugSchema } from './saved-lives';
import { discoveryCardSchema } from './discovery';
export const PUBLIC_COLLECTIONS_VERSION = 'public-collections-1';
export const publicCollectionKeySchema = z.enum([
  'featured',
  'community-picks',
  'turning-points',
]);
export const publicCollectionTitles = {
  featured: 'Featured lives',
  'community-picks': 'Community picks',
  'turning-points': 'Turning points',
} as const;
export const publicCollectionRequestSchema = z
  .object({
    collectionId: publicCollectionKeySchema,
    revision: z.number().int().positive(),
    entries: z
      .array(
        z
          .object({
            slug: publicLifeSlugSchema,
            publicationRevision: z.number().int().positive(),
            snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .max(24),
    actorLabel: z.string().trim().min(1).max(80),
    acknowledged: z.literal(true),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.entries.map((e) => e.slug)).size !== v.entries.length)
      ctx.addIssue({
        code: 'custom',
        path: ['entries'],
        message: 'Duplicate collection entry',
      });
  });
export const publicCollectionPageSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_COLLECTIONS_VERSION),
    collectionId: publicCollectionKeySchema,
    title: z.enum(['Featured lives', 'Community picks', 'Turning points']),
    contentLocale: z.literal('en'),
    ranking: z.literal('curated'),
    items: z.array(discoveryCardSchema).max(24),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.title !== publicCollectionTitles[v.collectionId] ||
      (v.collectionId === 'community-picks' &&
        v.items.some((c) => c.classification !== 'community'))
    )
      ctx.addIssue({
        code: 'custom',
        path: ['collectionId'],
        message: 'Collection mismatch',
      });
  });
export const publicCollectionReceiptSchema = z
  .object({
    collectionId: publicCollectionKeySchema,
    revision: z.number().int().min(2),
    applied: z.literal(true),
  })
  .strict();
export type PublicCollectionKey = z.infer<typeof publicCollectionKeySchema>;
export type PublicCollectionPage = z.infer<typeof publicCollectionPageSchema>;
