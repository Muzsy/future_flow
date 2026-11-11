import { z } from 'zod';
import { publicScenarioSlugSchema } from './public-scenario-publication';
import { scenarioTemplateSchema } from './public-scenarios';

export const SCENARIO_DISCOVERY_VERSION = 'scenario-discovery-1';
export const scenarioDiscoveryQuerySchema = z
  .object({
    q: z.string().trim().max(80).default(''),
    locale: z.literal('en').default('en'),
    page: z.number().int().min(1).max(100).default(1),
    pageSize: z.number().int().min(1).max(24).default(12),
  })
  .strict();
export const scenarioDiscoveryCardSchema = z
  .object({
    slug: publicScenarioSlugSchema,
    contentLocale: z.literal('en'),
    title: scenarioTemplateSchema.shape.title,
    summary: scenarioTemplateSchema.shape.summary,
    goalDescription:
      scenarioTemplateSchema.shape.goals.element.shape.description,
    officialScenario: z.literal(true),
    officialLifeApproved: z.literal(false),
    allowPersonalization: z.boolean(),
    publishedAt: z.iso.datetime(),
  })
  .strict();
export const scenarioDiscoveryPageSchema = z
  .object({
    schemaVersion: z.literal(SCENARIO_DISCOVERY_VERSION),
    contentLocale: z.literal('en'),
    ranking: z.literal('newest'),
    page: scenarioDiscoveryQuerySchema.shape.page,
    pageSize: scenarioDiscoveryQuerySchema.shape.pageSize,
    hasMore: z.boolean(),
    items: z.array(scenarioDiscoveryCardSchema).max(24),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.items.length > value.pageSize ||
      new Set(value.items.map((i) => i.slug)).size !== value.items.length ||
      (value.page === 100 && value.hasMore)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'Invalid Scenario page',
      });
  });
const wireSchema = z
  .object({
    q: z.string().optional(),
    locale: z.string().optional(),
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
export function parseScenarioDiscoveryWireQuery(raw: unknown) {
  const query = wireSchema.parse(raw);
  return scenarioDiscoveryQuerySchema.parse({
    ...query,
    ...(query.page === undefined ? {} : { page: Number(query.page) }),
    ...(query.pageSize === undefined
      ? {}
      : { pageSize: Number(query.pageSize) }),
  });
}
export type ScenarioDiscoveryQuery = z.infer<
  typeof scenarioDiscoveryQuerySchema
>;
export type ScenarioDiscoveryCard = z.infer<typeof scenarioDiscoveryCardSchema>;
export type ScenarioDiscoveryPage = z.infer<typeof scenarioDiscoveryPageSchema>;
