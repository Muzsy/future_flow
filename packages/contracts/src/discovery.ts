import { z } from 'zod';
import {
  publicCategorySchema,
  publicSnapshotDraftSchema,
} from './public-draft';
import { publicationSlugSchema } from './publication';
import { officialPublicationSlugSchema } from './official-publication';

export const DISCOVERY_VERSION = 'discovery-1';
export const discoveryQuerySchema = z
  .object({
    q: z.string().trim().max(80).default(''),
    locale: z.literal('en').default('en'),
    category: publicCategorySchema.nullable().default(null),
    classification: z.enum(['all', 'official', 'community']).default('all'),
    page: z.number().int().min(1).max(100).default(1),
    pageSize: z.number().int().min(1).max(24).default(12),
  })
  .strict();
export const discoveryCardSchema = z
  .object({
    slug: publicationSlugSchema.or(officialPublicationSlugSchema),
    classification: z.enum(['official', 'community']),
    contentLocale: z.literal('en'),
    title: publicSnapshotDraftSchema.shape.title,
    summary: publicSnapshotDraftSchema.shape.summary,
    category: publicCategorySchema,
    periodCount: z.number().int().min(1).max(12),
    publishedAt: z.iso.datetime(),
    aiGenerated: z.literal(true),
    userEdited: z.boolean(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.slug.startsWith('official-') !== (v.classification === 'official'))
      ctx.addIssue({
        code: 'custom',
        path: ['classification'],
        message: 'Publication origin mismatch.',
      });
  });
export const discoveryPageSchema = z
  .object({
    schemaVersion: z.literal(DISCOVERY_VERSION),
    contentLocale: z.literal('en'),
    ranking: z.literal('newest'),
    page: z.number().int().min(1).max(100),
    pageSize: z.number().int().min(1).max(24),
    hasMore: z.boolean(),
    items: z.array(discoveryCardSchema).max(24),
  })
  .strict();
export type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>;
export type DiscoveryCard = z.infer<typeof discoveryCardSchema>;
export type DiscoveryPage = z.infer<typeof discoveryPageSchema>;

// HTTP and search forms share one parser. Arrays, operators and unknown keys
// are rejected before conversion to the normalized typed query contract.
const wireQuerySchema = z
  .object({
    q: z.string().optional(),
    locale: z.string().optional(),
    category: z.string().optional(),
    classification: z.string().optional(),
    page: z
      .string()
      .regex(/^[1-9][0-9]{0,2}$/)
      .optional(),
    pageSize: z
      .string()
      .regex(/^[1-9][0-9]?$/)
      .optional(),
  })
  .strict();
export function parseDiscoveryWireQuery(raw: unknown): DiscoveryQuery {
  const q = wireQuerySchema.parse(raw);
  return discoveryQuerySchema.parse({
    ...q,
    ...(q.category === '' ? { category: null } : {}),
    ...(q.page === undefined ? {} : { page: Number(q.page) }),
    ...(q.pageSize === undefined ? {} : { pageSize: Number(q.pageSize) }),
  });
}
