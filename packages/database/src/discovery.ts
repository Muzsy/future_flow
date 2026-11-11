import {
  discoveryQuerySchema,
  discoveryCardSchema,
  discoveryPageSchema,
} from '@future-flow/contracts';
import { DomainError } from '@future-flow/core';
import type { Database } from './index';
import { PublicationRepository, type PublicationConfig } from './publications';
import { OfficialPublicationRepository } from './official-publications';

export interface DiscoveryConfig {
  enabled: boolean;
}
export function discoveryConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): DiscoveryConfig {
  const value = env.DISCOVERY_ENABLED ?? 'false';
  if (!['true', 'false'].includes(value)) throw Error('Invalid Discovery flag');
  return { enabled: value === 'true' };
}
const off = { enabled: false, linkSecret: '' };
// Candidate SQL is never an anonymous DTO. Every hit goes through its full live
// publication reader, including Official provenance and withdrawal/deletion gates.
export class DiscoveryRepository {
  constructor(
    private readonly db: Database,
    private readonly config: DiscoveryConfig = { enabled: false },
    private readonly community: PublicationConfig = off,
    private readonly official: PublicationConfig = off,
  ) {}
  async list(raw: unknown = {}) {
    if (!this.config.enabled)
      throw new DomainError(
        'DISCOVERY_DISABLED',
        'Discovery is unavailable.',
        404,
      );
    const query = discoveryQuerySchema.parse(raw),
      pattern = '%' + query.q.replace(/[\\%_]/g, '\\$&') + '%';
    const rows = await this.db.query<{
      slug: string;
      classification: 'official' | 'community';
    }>(
      `SELECT slug,classification FROM (
        SELECT p.slug,p.published_at,p.snapshot,'official'::text AS classification
        FROM aw_official_publications p JOIN ff_users u ON u.id=p.user_id
        WHERE $6::boolean AND p.status='active' AND p.visibility='public' AND u.status='active'
        UNION ALL
        SELECT p.slug,p.published_at,p.snapshot,'community'::text AS classification
        FROM aw_publications p JOIN ff_users u ON u.id=p.user_id
        WHERE $7::boolean AND p.status='active' AND p.visibility='public' AND u.status='active'
      ) candidates
      WHERE snapshot->>'contentLocale'='en'
        AND ($1::text='all' OR classification=$1)
        AND ($3::text IS NULL OR snapshot->'story'->>'category'=$3)
        AND ((snapshot->'story'->>'title')||' '||(snapshot->'story'->>'summary')) ILIKE $2 ESCAPE E'\\\\'
      ORDER BY published_at DESC,slug ASC LIMIT $4 OFFSET $5`,
      [
        query.classification,
        pattern,
        query.category,
        query.pageSize + 1,
        (query.page - 1) * query.pageSize,
        this.official.enabled,
        this.community.enabled,
      ],
    );
    const items = [];
    for (const row of rows.slice(0, query.pageSize)) {
      try {
        const reader =
          row.classification === 'official'
            ? await new OfficialPublicationRepository(
                this.db,
                this.official,
              ).readPublic(row.slug)
            : await new PublicationRepository(
                this.db,
                this.community,
              ).readPublic(row.slug);
        const snapshot = reader.snapshot;
        items.push(
          discoveryCardSchema.parse({
            slug: reader.slug,
            classification: snapshot.classification,
            contentLocale: snapshot.contentLocale,
            title: snapshot.story.title,
            summary: snapshot.story.summary,
            category: snapshot.story.category,
            periodCount: snapshot.story.periods.length,
            publishedAt: reader.publishedAt,
            aiGenerated: snapshot.story.origin.aiGenerated,
            userEdited: snapshot.story.origin.userEdited,
          }),
        );
      } catch (error) {
        // A publication can disappear between candidate lookup and reader check.
        if (!(error instanceof DomainError) || error.status !== 404)
          throw error;
      }
    }
    return discoveryPageSchema.parse({
      schemaVersion: 'discovery-1',
      contentLocale: 'en',
      ranking: 'newest',
      page: query.page,
      pageSize: query.pageSize,
      hasMore: query.page < 100 && rows.length > query.pageSize,
      items,
    });
  }
}
