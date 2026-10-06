import { DomainError } from '@future-flow/core';
import {
  publicLifeSlugSchema,
  savedLifeStatusSchema,
  savedLivesQuerySchema,
  savedLivesPageSchema,
  discoveryCardSchema,
} from '@future-flow/contracts';
import type { Database } from './index';
import { PublicationRepository, type PublicationConfig } from './publications';
import { OfficialPublicationRepository } from './official-publications';
import {
  recordPublicMetric,
  publicMetricsConfigFromEnv,
  type PublicMetricsConfig,
} from './public-metric-recording';

export interface SavedLivesConfig {
  enabled: boolean;
}
export function savedLivesConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SavedLivesConfig {
  const value = env.SAVED_LIVES_ENABLED ?? 'false';
  if (!['true', 'false'].includes(value))
    throw Error('Invalid saved lives flag');
  return { enabled: value === 'true' };
}
const off = { enabled: false, linkSecret: '' };
const missing = () =>
  new DomainError('RESOURCE_NOT_FOUND', 'This life is unavailable.', 404);
type Target = { id: string; user_id: string };
export class SavedLivesRepository {
  constructor(
    private readonly db: Database,
    private readonly config: SavedLivesConfig = { enabled: false },
    private readonly community: PublicationConfig = off,
    private readonly official: PublicationConfig = off,
    private readonly metrics: PublicMetricsConfig = publicMetricsConfigFromEnv(),
  ) {}
  private enabled() {
    if (!this.config.enabled)
      throw new DomainError(
        'SAVED_LIVES_DISABLED',
        'Saved lives are unavailable.',
        404,
      );
  }
  private async owner(tx: Database, userId: string, write = false) {
    const [owner] = await tx.query<{ status: string }>(
      `SELECT status FROM ff_users WHERE id=$1 FOR ${write ? 'UPDATE' : 'SHARE'}`,
      [userId],
    );
    if (owner?.status !== 'active') throw missing();
  }
  private target(slug: string) {
    return slug.startsWith('official-')
      ? { table: 'aw_official_publications', column: 'official_publication_id' }
      : { table: 'aw_publications', column: 'community_publication_id' };
  }
  private async card(tx: Database, slug: string) {
    const reader = slug.startsWith('official-')
      ? await new OfficialPublicationRepository(tx, this.official).readPublic(
          slug,
        )
      : await new PublicationRepository(tx, this.community).readPublic(slug);
    const snapshot = reader.snapshot;
    if (snapshot.contentLocale !== 'en') throw missing();
    return discoveryCardSchema.parse({
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
    });
  }
  private status(slug: string, saved: boolean) {
    return savedLifeStatusSchema.parse({
      schemaVersion: 'saved-lives-1',
      slug,
      saved,
    });
  }
  async save(userId: string, rawSlug: unknown) {
    this.enabled();
    const slug = publicLifeSlugSchema.parse(rawSlug),
      target = this.target(slug);
    return this.db.transaction(async (tx) => {
      const [seed] = await tx.query<Target>(
        `SELECT id,user_id FROM ${target.table} WHERE slug=$1 AND visibility='public' AND status='active'`,
        [slug],
      );
      if (!seed) throw missing();
      // One global user order prevents two readers saving each other's lives from
      // deadlocking. The saver update lock also serializes the quota and retries.
      for (const id of [...new Set([userId, seed.user_id])].sort())
        await this.owner(tx, id, id === userId);
      await this.card(tx, slug); // Full permission, immutable-copy and provenance checks under locks.
      const [existing] = await tx.query(
        `SELECT id FROM aw_saved_lives WHERE user_id=$1 AND ${target.column}=$2`,
        [userId, seed.id],
      );
      if (existing) return this.status(slug, true);
      const [count] = await tx.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM aw_saved_lives WHERE user_id=$1',
        [userId],
      );
      if (Number(count?.count) >= 500)
        throw new DomainError(
          'SAVED_LIVES_LIMIT',
          'Saved life limit reached.',
          409,
        );
      await tx.query(
        `INSERT INTO aw_saved_lives(user_id,${target.column}) VALUES($1,$2) ON CONFLICT DO NOTHING`,
        [userId, seed.id],
      );
      await recordPublicMetric(
        tx,
        {
          id: seed.id,
          classification: slug.startsWith('official-')
            ? 'official'
            : 'community',
        },
        'saved',
        this.metrics,
      );
      return this.status(slug, true);
    });
  }
  async remove(userId: string, rawSlug: unknown) {
    this.enabled();
    const slug = publicLifeSlugSchema.parse(rawSlug),
      target = this.target(slug);
    return this.db.transaction(async (tx) => {
      const [seed] = await tx.query<Target>(
        `SELECT id,user_id FROM ${target.table} WHERE slug=$1`,
        [slug],
      );
      // Lock publisher before its publication/save rows even when it is
      // deleting. Unsave needs no content permission; this order protects the
      // aggregate FK from a simultaneous physical publisher deletion.
      for (const id of [
        ...new Set([userId, ...(seed ? [seed.user_id] : [])]),
      ].sort()) {
        if (id === userId) await this.owner(tx, id, true);
        else
          await tx.query('SELECT id FROM ff_users WHERE id=$1 FOR SHARE', [id]);
      }
      if (seed)
        await tx.query(`SELECT id FROM ${target.table} WHERE id=$1 FOR SHARE`, [
          seed.id,
        ]);
      // Removal remains possible after withdrawal or a feature gate closes.
      const deleted = await tx.query<{ target_id: string }>(
        `DELETE FROM aw_saved_lives WHERE user_id=$1 AND ${target.column} IN (SELECT id FROM ${target.table} WHERE slug=$2) RETURNING ${target.column} AS target_id`,
        [userId, slug],
      );
      if (deleted[0])
        await recordPublicMetric(
          tx,
          {
            id: deleted[0].target_id,
            classification: slug.startsWith('official-')
              ? 'official'
              : 'community',
          },
          'unsaved',
          this.metrics,
        );
      return this.status(slug, false);
    });
  }
  async getStatus(userId: string, rawSlug: unknown) {
    this.enabled();
    const slug = publicLifeSlugSchema.parse(rawSlug),
      target = this.target(slug);
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      await this.card(tx, slug);
      const [saved] = await tx.query(
        `SELECT s.id FROM aw_saved_lives s JOIN ${target.table} p ON p.id=s.${target.column} WHERE s.user_id=$1 AND p.slug=$2`,
        [userId, slug],
      );
      return this.status(slug, Boolean(saved));
    });
  }
  async list(userId: string, raw: unknown = {}) {
    this.enabled();
    const query = savedLivesQuerySchema.parse(raw);
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      const rows = await tx.query<{ slug: string; created_at: Date | string }>(
        `SELECT COALESCE(c.slug,o.slug) AS slug,s.created_at FROM aw_saved_lives s
         LEFT JOIN aw_publications c ON c.id=s.community_publication_id
         LEFT JOIN aw_official_publications o ON o.id=s.official_publication_id
         WHERE s.user_id=$1 ORDER BY s.created_at DESC,s.id ASC LIMIT $2 OFFSET $3`,
        [userId, query.pageSize + 1, (query.page - 1) * query.pageSize],
      );
      const items = [];
      for (const row of rows.slice(0, query.pageSize)) {
        let card = null;
        try {
          card = await this.card(tx, row.slug);
        } catch (error) {
          if (!(error instanceof DomainError) || error.status !== 404)
            throw error;
        }
        items.push({
          slug: row.slug,
          savedAt: new Date(row.created_at).toISOString(),
          card,
        });
      }
      return savedLivesPageSchema.parse({
        schemaVersion: 'saved-lives-1',
        ...query,
        hasMore: query.page < 100 && rows.length > query.pageSize,
        items,
      });
    });
  }
}
