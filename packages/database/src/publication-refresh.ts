import { randomUUID } from 'node:crypto';
import { DomainError, hash } from '@future-flow/core';
import {
  publicationRefreshOriginSchema,
  publicationRefreshRequestSchema,
  publicationRefreshTargetsSchema,
  publicationRefreshReceiptSchema,
} from '@future-flow/contracts';
import type { Database } from './index';
import { PublicationRepository, type PublicationConfig } from './publications';
import { OfficialPublicationRepository } from './official-publications';
import { assertPublicationAllowed } from './publication-safety';
import {
  publicMetricsConfigFromEnv,
  type PublicMetricsConfig,
} from './public-metric-recording';
export interface PublicationRefreshConfig {
  enabled: boolean;
}
export function publicationRefreshConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PublicationRefreshConfig {
  const flag = env.PUBLICATION_REFRESH_ENABLED ?? 'false';
  if (!['true', 'false'].includes(flag))
    throw Error('Invalid publication refresh flag');
  return { enabled: flag === 'true' };
}
type Origin = 'community' | 'official';
type Copy = Record<string, unknown> & {
  id: string;
  bundle_id: string;
  preview_id: string;
  revision: number;
  snapshot_hash: string;
  status: string;
  slug: string;
};
type Refresh = Record<string, unknown> & {
  id: string;
  request_hash: string;
  previous_community_id: string | null;
  next_community_id: string | null;
  previous_official_id: string | null;
  next_official_id: string | null;
};
const off = { enabled: false, linkSecret: '' },
  missing = () =>
    new DomainError(
      'RESOURCE_NOT_FOUND',
      'This publication is unavailable.',
      404,
    ),
  conflict = () =>
    new DomainError(
      'PUBLICATION_REFRESH_CONFLICT',
      'The previous copy or new preview changed. Reload them.',
      409,
    );
export class PublicationRefreshRepository {
  constructor(
    private readonly db: Database,
    private readonly config: PublicationRefreshConfig = { enabled: false },
    private readonly community: PublicationConfig = off,
    private readonly official: PublicationConfig = off,
    private readonly metrics: PublicMetricsConfig = publicMetricsConfigFromEnv(),
  ) {}
  private table(origin: Origin) {
    return origin === 'official'
      ? 'aw_official_publications'
      : 'aw_publications';
  }
  private previews(origin: Origin) {
    return origin === 'official'
      ? 'aw_official_publication_previews'
      : 'aw_publication_previews';
  }
  private publications(tx: Database, origin: Origin) {
    return origin === 'official'
      ? new OfficialPublicationRepository(tx, this.official, this.metrics)
      : new PublicationRepository(tx, this.community, this.metrics);
  }
  private async owner(tx: Database, userId: string, write = false) {
    const [u] = await tx.query<{ status: string }>(
      `SELECT status FROM ff_users WHERE id=$1 FOR ${write ? 'UPDATE' : 'SHARE'}`,
      [userId],
    );
    if (u?.status !== 'active') throw missing();
  }
  async targets(userId: string, rawBundle: unknown, rawOrigin: unknown) {
    const origin = publicationRefreshOriginSchema.parse(rawOrigin),
      bundleId =
        publicationRefreshTargetsSchema.shape.bundleId.parse(rawBundle);
    return this.db.transaction(async (tx) => {
      // Existing owner projection takes UPDATE; acquire it before loading candidates to avoid SHARE upgrades.
      await this.owner(tx, userId, true);
      const [source] = await tx.query<{ branch_id: string }>(
        'SELECT d.branch_id FROM aw_public_content_bundles b JOIN aw_publication_drafts d ON d.id=b.draft_id AND d.user_id=b.user_id WHERE b.id=$1 AND b.user_id=$2',
        [bundleId, userId],
      );
      if (!source) throw missing();
      const rows = this.config.enabled
        ? await tx.query<Copy>(
            `SELECT p.* FROM ${this.table(origin)} p JOIN aw_public_content_bundles b ON b.id=p.bundle_id AND b.user_id=p.user_id JOIN aw_publication_drafts d ON d.id=b.draft_id AND d.user_id=b.user_id WHERE p.user_id=$1 AND d.branch_id=$2 AND p.bundle_id<>$3 AND p.status='active' ORDER BY p.published_at DESC,p.id LIMIT 24`,
            [userId, source.branch_id, bundleId],
          )
        : [];
      const items = [];
      for (const p of rows) {
        const owned = await this.publications(tx, origin).forBundle(
          userId,
          p.bundle_id,
        );
        if (!owned) throw missing();
        items.push({
          publicationId: p.id,
          bundleId: p.bundle_id,
          slug: p.slug,
          revision: p.revision,
          snapshotHash: p.snapshot_hash,
          title: owned.snapshot.story.title,
          visibility: p.visibility,
          classification: origin,
          publishedAt: owned.publishedAt,
        });
      }
      return publicationRefreshTargetsSchema.parse({
        schemaVersion: 'publication-refresh-1',
        enabled: this.config.enabled,
        classification: origin,
        bundleId,
        items,
      });
    });
  }
  async refresh(userId: string, rawOrigin: unknown, raw: unknown, key: string) {
    const origin = publicationRefreshOriginSchema.parse(rawOrigin),
      input = publicationRefreshRequestSchema.parse(raw),
      requestHash = hash({ origin, ...input }),
      scope = 'publication-refresh:' + origin;
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(key))
      throw new DomainError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Request key required.',
        400,
      );
    const previousColumn =
        origin === 'official'
          ? 'previous_official_id'
          : 'previous_community_id',
      nextColumn =
        origin === 'official' ? 'next_official_id' : 'next_community_id';
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId, true);
      const [prior] = await tx.query<{
        input_hash: string;
        response: { id: string };
      }>(
        'SELECT input_hash,response FROM ff_idempotency WHERE user_id=$1 AND scope=$2 AND key=$3',
        [userId, scope, key],
      );
      if (prior && prior.input_hash !== requestHash)
        throw new DomainError(
          'IDEMPOTENCY_CONFLICT',
          'Request key was reused.',
          409,
        );
      const [existing] = await tx.query<Refresh>(
        `SELECT * FROM aw_publication_refreshes WHERE user_id=$1 AND ${prior ? 'id=$2' : previousColumn + '=$2'}`,
        [userId, prior?.response.id ?? input.previousPublicationId],
      );
      const remember = async (id: string) => {
        await tx.query(
          'INSERT INTO ff_idempotency(user_id,scope,key,input_hash,response) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,scope,key) DO NOTHING',
          [userId, scope, key, requestHash, { id }],
        );
      };
      const receipt = async (row: Refresh) => {
        const nextId =
            origin === 'official'
              ? row.next_official_id
              : row.next_community_id,
          [next] = await tx.query<Copy>(
            `SELECT * FROM ${this.table(origin)} WHERE id=$1 AND user_id=$2`,
            [nextId, userId],
          );
        if (!next) throw missing();
        const publication = await this.publications(tx, origin).forBundle(
          userId,
          next.bundle_id,
        );
        if (!publication) throw missing();
        return publicationRefreshReceiptSchema.parse({
          schemaVersion: 'publication-refresh-1',
          previousPublicationId: input.previousPublicationId,
          previousStatus: 'withdrawn',
          publication,
        });
      };
      if (existing) {
        if (existing.request_hash !== requestHash) throw conflict();
        await remember(existing.id);
        return receipt(existing);
      }
      if (prior) throw missing();
      if (!this.config.enabled)
        throw new DomainError(
          'PUBLICATION_REFRESH_DISABLED',
          'Publication refresh is not open yet.',
          404,
        );
      await assertPublicationAllowed(tx, userId);
      const [previous] = await tx.query<Copy>(
        `SELECT * FROM ${this.table(origin)} WHERE id=$1 AND user_id=$2 FOR UPDATE`,
        [input.previousPublicationId, userId],
      );
      if (!previous) throw missing();
      if (
        previous.status !== 'active' ||
        previous.revision !== input.previousRevision ||
        previous.snapshot_hash !== input.previousSnapshotHash
      )
        throw conflict();
      const [preview] = await tx.query<{
        bundle_id: string;
        preview_hash: string;
      }>(
        `SELECT bundle_id,preview_hash FROM ${this.previews(origin)} WHERE id=$1 AND user_id=$2 FOR SHARE`,
        [input.previewId, userId],
      );
      if (!preview) throw missing();
      if (
        preview.preview_hash !== input.previewHash ||
        preview.bundle_id === previous.bundle_id
      )
        throw conflict();
      const sources = await tx.query<{ id: string; branch_id: string }>(
        'SELECT b.id,d.branch_id FROM aw_public_content_bundles b JOIN aw_publication_drafts d ON d.id=b.draft_id AND d.user_id=b.user_id WHERE b.user_id=$1 AND b.id=ANY($2::uuid[])',
        [userId, [previous.bundle_id, preview.bundle_id]],
      );
      if (
        sources.length !== 2 ||
        sources[0]!.branch_id !== sources[1]!.branch_id
      )
        throw conflict();
      if (
        (
          await tx.query(
            `SELECT id FROM ${this.table(origin)} WHERE bundle_id=$1`,
            [preview.bundle_id],
          )
        ).length
      )
        throw conflict();
      const publications = this.publications(tx, origin),
        publication = await publications.confirm(
          userId,
          {
            previewId: input.previewId,
            previewHash: input.previewHash,
            acknowledged: true,
          },
          hash({ scope: 'refresh-confirm', key, requestHash }),
        );
      if (publication.status !== 'active') throw conflict();
      await publications.action(
        userId,
        previous.id,
        'withdraw',
        {
          revision: previous.revision,
          snapshotHash: previous.snapshot_hash,
          acknowledged: true,
        },
        hash({ scope: 'refresh-withdraw', key, requestHash }),
      );
      const [row] = await tx.query<Refresh>(
        `INSERT INTO aw_publication_refreshes(id,user_id,classification,${previousColumn},${nextColumn},previous_revision,previous_snapshot_hash,preview_id,preview_hash,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          randomUUID(),
          userId,
          origin,
          previous.id,
          publication.publicationId,
          previous.revision,
          previous.snapshot_hash,
          input.previewId,
          input.previewHash,
          requestHash,
        ],
      );
      if (!row) throw conflict();
      await remember(row.id);
      return receipt(row);
    });
  }
}
