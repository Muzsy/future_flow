import { DomainError, hash } from '@future-flow/core';
import {
  publicCollectionKeySchema,
  publicCollectionRequestSchema,
  publicCollectionReceiptSchema,
  publicCollectionPageSchema,
  publicCollectionTitles,
  discoveryCardSchema,
} from '@future-flow/contracts';
import type { Database } from './index';
import { PublicationRepository, type PublicationConfig } from './publications';
import { OfficialPublicationRepository } from './official-publications';
import type { DiscoveryConfig } from './discovery';
export interface PublicCollectionsConfig {
  enabled: boolean;
}
export function publicCollectionsConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PublicCollectionsConfig {
  const flag = env.PUBLIC_COLLECTIONS_ENABLED ?? 'false';
  if (!['true', 'false'].includes(flag))
    throw Error('Invalid collections flag');
  return { enabled: flag === 'true' };
}
const off = { enabled: false, linkSecret: '' },
  missing = () =>
    new DomainError(
      'RESOURCE_NOT_FOUND',
      'This collection entry is unavailable.',
      404,
    ),
  conflict = () =>
    new DomainError(
      'PUBLIC_COLLECTION_CONFLICT',
      'The collection or publication changed.',
      409,
    );
export class PublicCollectionsRepository {
  constructor(
    private readonly db: Database,
    private readonly config: PublicCollectionsConfig = { enabled: false },
    private readonly discovery: DiscoveryConfig = { enabled: false },
    private readonly community: PublicationConfig = off,
    private readonly official: PublicationConfig = off,
  ) {}
  private read(tx: Database, slug: string) {
    return slug.startsWith('official-')
      ? new OfficialPublicationRepository(tx, this.official).readPublic(slug)
      : new PublicationRepository(tx, this.community).readPublic(slug);
  }
  // Trusted operator only. Full replacement is bound to the exact copy and collection revisions.
  async set(raw: unknown) {
    const input = publicCollectionRequestSchema.parse(raw),
      requestHash = hash(input);
    return this.db.transaction(async (tx) => {
      const seeds = await tx.query<{
        id: string;
        user_id: string;
        slug: string;
        classification: 'official' | 'community';
      }>(
        `SELECT id,user_id,slug,'community'::text AS classification FROM aw_publications WHERE slug=ANY($1::text[]) UNION ALL SELECT id,user_id,slug,'official'::text FROM aw_official_publications WHERE slug=ANY($1::text[])`,
        [input.entries.map((e) => e.slug)],
      );
      if (seeds.length !== input.entries.length) throw missing();
      for (const owner of [...new Set(seeds.map((s) => s.user_id))].sort()) {
        const [row] = await tx.query<{ status: string }>(
          'SELECT status FROM ff_users WHERE id=$1 FOR SHARE',
          [owner],
        );
        if (row?.status !== 'active') throw missing();
      }
      for (const entry of [...input.entries].sort((a, b) =>
        a.slug.localeCompare(b.slug),
      )) {
        const reader = await this.read(tx, entry.slug),
          seed = seeds.find((s) => s.slug === entry.slug)!;
        const [row] = await tx.query<{
          revision: number;
          snapshot_hash: string;
        }>(
          `SELECT revision,snapshot_hash FROM ${seed.classification === 'official' ? 'aw_official_publications' : 'aw_publications'} WHERE id=$1 FOR SHARE`,
          [seed.id],
        );
        if (
          !row ||
          row.revision !== entry.publicationRevision ||
          row.snapshot_hash !== entry.snapshotHash
        )
          throw conflict();
        if (
          reader.snapshot.contentLocale !== 'en' ||
          (input.collectionId === 'community-picks' &&
            seed.classification !== 'community') ||
          (input.collectionId === 'turning-points' &&
            !reader.snapshot.checkpoints.length)
        )
          throw new DomainError(
            'PUBLIC_COLLECTION_INELIGIBLE',
            'This life does not fit this collection.',
            422,
          );
      }
      const [current] = await tx.query<{
        revision: number;
        last_request_hash: string | null;
      }>(
        'SELECT revision,last_request_hash FROM aw_public_collections WHERE collection_key=$1 FOR UPDATE',
        [input.collectionId],
      );
      if (!current) throw missing();
      if (
        current.revision === input.revision + 1 &&
        current.last_request_hash === requestHash
      )
        return publicCollectionReceiptSchema.parse({
          collectionId: input.collectionId,
          revision: current.revision,
          applied: true,
        });
      if (current.revision !== input.revision) throw conflict();
      await tx.query(
        'DELETE FROM aw_public_collection_entries WHERE collection_key=$1',
        [input.collectionId],
      );
      for (const [position, entry] of input.entries.entries()) {
        const seed = seeds.find((s) => s.slug === entry.slug)!;
        await tx.query(
          `INSERT INTO aw_public_collection_entries(collection_key,position,${seed.classification === 'official' ? 'official_publication_id' : 'community_publication_id'}) VALUES($1,$2,$3)`,
          [input.collectionId, position, seed.id],
        );
      }
      await tx.query(
        'UPDATE aw_public_collections SET revision=revision+1,last_request_hash=$2,updated_at=now() WHERE collection_key=$1',
        [input.collectionId, requestHash],
      );
      await tx.query(
        'INSERT INTO aw_public_collection_actions(collection_key,revision,request_hash,actor_label) VALUES($1,$2,$3,$4)',
        [
          input.collectionId,
          current.revision + 1,
          requestHash,
          input.actorLabel,
        ],
      );
      return publicCollectionReceiptSchema.parse({
        collectionId: input.collectionId,
        revision: current.revision + 1,
        applied: true,
      });
    });
  }
  async queue() {
    return this.db.query(
      `SELECT c.collection_key,c.revision,COALESCE(jsonb_agg(jsonb_build_object('slug',COALESCE(p.slug,o.slug),'publicationRevision',COALESCE(p.revision,o.revision),'snapshotHash',COALESCE(p.snapshot_hash,o.snapshot_hash)) ORDER BY e.position) FILTER(WHERE e.id IS NOT NULL),'[]'::jsonb) AS entries FROM aw_public_collections c LEFT JOIN aw_public_collection_entries e ON e.collection_key=c.collection_key LEFT JOIN aw_publications p ON p.id=e.community_publication_id LEFT JOIN aw_official_publications o ON o.id=e.official_publication_id GROUP BY c.collection_key,c.revision ORDER BY c.collection_key`,
    );
  }
  async list(rawKey: unknown) {
    if (!this.config.enabled || !this.discovery.enabled)
      throw new DomainError(
        'PUBLIC_COLLECTIONS_DISABLED',
        'Collections are not open yet.',
        404,
      );
    const key = publicCollectionKeySchema.parse(rawKey),
      rows = await this.db.query<{ slug: string }>(
        `SELECT COALESCE(c.slug,o.slug) AS slug FROM aw_public_collection_entries e LEFT JOIN aw_publications c ON c.id=e.community_publication_id LEFT JOIN aw_official_publications o ON o.id=e.official_publication_id WHERE e.collection_key=$1 ORDER BY e.position LIMIT 24`,
        [key],
      ),
      items = [];
    for (const row of rows) {
      try {
        const reader = await this.read(this.db, row.slug),
          s = reader.snapshot;
        items.push(
          discoveryCardSchema.parse({
            slug: reader.slug,
            classification: s.classification,
            contentLocale: s.contentLocale,
            title: s.story.title,
            summary: s.story.summary,
            category: s.story.category,
            periodCount: s.story.periods.length,
            publishedAt: reader.publishedAt,
            aiGenerated: s.story.origin.aiGenerated,
            userEdited: s.story.origin.userEdited,
          }),
        );
      } catch (e) {
        if (!(e instanceof DomainError) || e.status !== 404) throw e;
      }
    }
    return publicCollectionPageSchema.parse({
      schemaVersion: 'public-collections-1',
      collectionId: key,
      title: publicCollectionTitles[key],
      contentLocale: 'en',
      ranking: 'curated',
      items,
    });
  }
}
