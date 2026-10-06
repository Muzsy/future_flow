import { z } from 'zod';
import { discoveryCardSchema } from './discovery';
import { publicationSlugSchema } from './publication';
import { officialPublicationSlugSchema } from './official-publication';

export const SAVED_LIVES_VERSION = 'saved-lives-1';
export const publicLifeSlugSchema = publicationSlugSchema.or(
  officialPublicationSlugSchema,
);
export const savedLifeStatusSchema = z
  .object({
    schemaVersion: z.literal(SAVED_LIVES_VERSION),
    slug: publicLifeSlugSchema,
    saved: z.boolean(),
  })
  .strict();
export const savedLivesQuerySchema = z
  .object({
    page: z.number().int().min(1).max(100).default(1),
    pageSize: z.number().int().min(1).max(24).default(12),
  })
  .strict();
export function parseSavedLivesWireQuery(raw: unknown) {
  const wire = z
    .object({
      page: z
        .string()
        .regex(/^[1-9][0-9]{0,2}$/)
        .optional(),
      pageSize: z
        .string()
        .regex(/^[1-9][0-9]?$/)
        .optional(),
    })
    .strict()
    .parse(raw);
  return savedLivesQuerySchema.parse({
    ...(wire.page === undefined ? {} : { page: Number(wire.page) }),
    ...(wire.pageSize === undefined ? {} : { pageSize: Number(wire.pageSize) }),
  });
}
export const savedLifeEntrySchema = z
  .object({
    slug: publicLifeSlugSchema,
    savedAt: z.iso.datetime(),
    card: discoveryCardSchema.nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.card && v.card.slug !== v.slug)
      ctx.addIssue({
        code: 'custom',
        path: ['card', 'slug'],
        message: 'Saved publication mismatch.',
      });
  });
export const savedLivesPageSchema = z
  .object({
    schemaVersion: z.literal(SAVED_LIVES_VERSION),
    page: z.number().int().min(1).max(100),
    pageSize: z.number().int().min(1).max(24),
    hasMore: z.boolean(),
    items: z.array(savedLifeEntrySchema).max(24),
  })
  .strict();
export const savedLifeMutationSchema = z.object({}).strict();
export type SavedLivesPage = z.infer<typeof savedLivesPageSchema>;
