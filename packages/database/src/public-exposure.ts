import { DomainError, hash } from '@future-flow/core';
import {
  publicExposureSlugSchema,
  publicExposureRequestSchema,
  officialExposureRequestSchema,
  publicExposureOwnerViewSchema,
  publicExposureSchema,
  publicExposureSitemapQuerySchema,
  publicExposureSitemapSchema,
} from '@future-flow/contracts';
import type { Database } from './index';
import { PublicationRepository, type PublicationConfig } from './publications';
import { OfficialPublicationRepository } from './official-publications';
import { assertPublicationAllowed } from './publication-safety';

export interface PublicExposureConfig {
  enabled: boolean;
}
export function publicExposureConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PublicExposureConfig {
  const flag = env.PUBLIC_EXTERNAL_EXPOSURE_ENABLED ?? 'false';
  if (!['true', 'false'].includes(flag))
    throw Error('Invalid external exposure flag');
  return { enabled: flag === 'true' };
}
type Copy = Record<string, unknown> & {
  id: string;
  user_id: string;
  slug: string;
  revision: number;
  snapshot_hash: string;
  status: string;
  visibility: string;
};
type Permission = Record<string, unknown> & {
  id: string;
  publication_revision: number;
  snapshot_hash: string;
  permission_revision: number;
  mode: 'none' | 'preview' | 'index';
  last_request_hash: string;
};
const off = { enabled: false, linkSecret: '' },
  missing = () =>
    new DomainError(
      'RESOURCE_NOT_FOUND',
      'External sharing is unavailable.',
      404,
    ),
  conflict = () =>
    new DomainError(
      'PUBLIC_EXPOSURE_CONFLICT',
      'The copy or permission changed. Reload it.',
      409,
    );
export class PublicExposureRepository {
  constructor(
    private readonly db: Database,
    private readonly config: PublicExposureConfig = { enabled: false },
    private readonly community: PublicationConfig = off,
    private readonly official: PublicationConfig = off,
  ) {}
  private table(slug: string) {
    return slug.startsWith('official-')
      ? 'aw_official_publications'
      : 'aw_publications';
  }
  private column(slug: string) {
    return slug.startsWith('official-')
      ? 'official_publication_id'
      : 'community_publication_id';
  }
  private read(tx: Database, slug: string) {
    return slug.startsWith('official-')
      ? new OfficialPublicationRepository(tx, this.official).readPublic(slug)
      : new PublicationRepository(tx, this.community).readPublic(slug);
  }
  private async effective(
    tx: Database,
    copy: Copy,
    permission: Permission | undefined,
  ) {
    if (
      !this.config.enabled ||
      !permission ||
      permission.mode === 'none' ||
      permission.publication_revision !== copy.revision ||
      permission.snapshot_hash !== copy.snapshot_hash
    )
      return 'none' as const;
    try {
      await this.read(tx, copy.slug);
      return permission.mode;
    } catch (e) {
      if (!(e instanceof DomainError) || e.status !== 404) throw e;
      return 'none' as const;
    }
  }
  private async view(tx: Database, copy: Copy, p?: Permission) {
    return publicExposureOwnerViewSchema.parse({
      schemaVersion: 'public-exposure-1',
      slug: copy.slug,
      publicationRevision: copy.revision,
      snapshotHash: copy.snapshot_hash,
      permissionRevision: p?.permission_revision ?? 0,
      mode: p?.mode ?? 'none',
      effectiveMode: await this.effective(tx, copy, p),
      enabled: this.config.enabled,
      authority: copy.slug.startsWith('official-') ? 'curator' : 'owner',
    });
  }
  // Owner-first order matches publication withdrawal, source revocation and account deletion.
  private async lockedCopy(
    tx: Database,
    slug: string,
    owner?: string,
    write = false,
  ) {
    const [seed] = await tx.query<Copy>(
      `SELECT * FROM ${this.table(slug)} WHERE slug=$1`,
      [slug],
    );
    if (!seed || (owner && seed.user_id !== owner)) throw missing();
    const [user] = await tx.query<{ status: string }>(
      `SELECT status FROM ff_users WHERE id=$1 FOR ${write ? 'UPDATE' : 'SHARE'}`,
      [seed.user_id],
    );
    if (user?.status !== 'active') throw missing();
    const [copy] = await tx.query<Copy>(
      `SELECT * FROM ${this.table(slug)} WHERE id=$1 AND slug=$2 FOR SHARE`,
      [seed.id, slug],
    );
    if (!copy) throw missing();
    return copy;
  }
  async ownerView(owner: string, rawSlug: unknown) {
    const slug = publicExposureSlugSchema.parse(rawSlug);
    return this.db.transaction(async (tx) => {
      const copy = await this.lockedCopy(tx, slug, owner),
        [permission] = await tx.query<Permission>(
          `SELECT * FROM aw_public_exposures WHERE ${this.column(slug)}=$1 FOR SHARE`,
          [copy.id],
        );
      return this.view(tx, copy, permission);
    });
  }
  async setOwner(owner: string, rawSlug: unknown, raw: unknown) {
    const slug = publicExposureSlugSchema.parse(rawSlug),
      input = publicExposureRequestSchema.parse(raw);
    // Official expansion is a trusted curator decision. An owner can always revoke.
    if (slug.startsWith('official-') && input.mode !== 'none')
      throw new DomainError(
        'PUBLIC_EXPOSURE_CURATOR_REQUIRED',
        'Official exposure requires a curator.',
        403,
      );
    return this.set(slug, input, 'owner', owner);
  }
  async setOfficial(raw: unknown) {
    const { slug, actorLabel, ...input } =
      officialExposureRequestSchema.parse(raw);
    return this.set(slug, input, actorLabel);
  }
  private async set(
    slug: string,
    input: ReturnType<typeof publicExposureRequestSchema.parse>,
    actorLabel: string,
    owner?: string,
  ) {
    const requestHash = hash({ slug, ...input, actorLabel });
    return this.db.transaction(async (tx) => {
      const copy = await this.lockedCopy(tx, slug, owner, true);
      if (
        copy.revision !== input.publicationRevision ||
        copy.snapshot_hash !== input.snapshotHash
      )
        throw conflict();
      const [current] = await tx.query<Permission>(
        `SELECT * FROM aw_public_exposures WHERE ${this.column(slug)}=$1 FOR UPDATE`,
        [copy.id],
      );
      if (
        current?.permission_revision === input.permissionRevision + 1 &&
        current.last_request_hash === requestHash
      )
        return this.view(tx, copy, current);
      if ((current?.permission_revision ?? 0) !== input.permissionRevision)
        throw conflict();
      if (input.mode !== 'none') {
        if (!this.config.enabled)
          throw new DomainError(
            'PUBLIC_EXPOSURE_DISABLED',
            'External exposure is not open yet.',
            404,
          );
        await assertPublicationAllowed(tx, copy.user_id);
        await this.read(tx, slug); // Full live public EN copy and Official source evidence, never unlisted.
      }
      const [next] = await tx.query<Permission>(
        current
          ? `UPDATE aw_public_exposures SET publication_revision=$2,snapshot_hash=$3,permission_revision=permission_revision+1,mode=$4,last_request_hash=$5,updated_at=now() WHERE id=$1 RETURNING *`
          : `INSERT INTO aw_public_exposures(${this.column(slug)},publication_revision,snapshot_hash,permission_revision,mode,last_request_hash) VALUES($1,$2,$3,1,$4,$5) RETURNING *`,
        [
          current?.id ?? copy.id,
          copy.revision,
          copy.snapshot_hash,
          input.mode,
          requestHash,
        ],
      );
      if (!next) throw conflict();
      await tx.query(
        'INSERT INTO aw_public_exposure_actions(exposure_id,permission_revision,publication_revision,snapshot_hash,mode,request_hash,actor_label) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          next.id,
          next.permission_revision,
          copy.revision,
          copy.snapshot_hash,
          input.mode,
          requestHash,
          actorLabel,
        ],
      );
      return this.view(tx, copy, next);
    });
  }
  async project(rawSlug: unknown) {
    if (!this.config.enabled) throw missing();
    const slug = publicExposureSlugSchema.parse(rawSlug);
    return this.db.transaction(async (tx) => {
      const copy = await this.lockedCopy(tx, slug),
        reader = await this.read(tx, slug),
        [permission] = await tx.query<Permission>(
          `SELECT * FROM aw_public_exposures WHERE ${this.column(slug)}=$1 FOR SHARE`,
          [copy.id],
        );
      if (
        !permission ||
        permission.mode === 'none' ||
        permission.publication_revision !== copy.revision ||
        permission.snapshot_hash !== copy.snapshot_hash
      )
        throw missing();
      const s = reader.snapshot;
      return publicExposureSchema.parse({
        schemaVersion: 'public-exposure-1',
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
        mode: permission.mode,
        indexable: permission.mode === 'index',
      });
    });
  }
  async sitemap(raw: unknown) {
    const input = publicExposureSitemapQuerySchema.parse(raw);
    if (!this.config.enabled)
      return publicExposureSitemapSchema.parse({
        schemaVersion: 'public-exposure-1',
        items: [],
        nextCursor: null,
      });
    const rows = await this.db.query<{ slug: string }>(
        `SELECT COALESCE(c.slug,o.slug) AS slug FROM aw_public_exposures e LEFT JOIN aw_publications c ON c.id=e.community_publication_id LEFT JOIN aw_official_publications o ON o.id=e.official_publication_id WHERE e.mode='index' AND ($1::text IS NULL OR COALESCE(c.slug,o.slug)>$1) ORDER BY slug LIMIT $2`,
        [input.cursor ?? null, input.limit + 1],
      ),
      items = [];
    for (const row of rows.slice(0, input.limit)) {
      try {
        const item = await this.project(row.slug);
        if (item.indexable) items.push(item);
      } catch (e) {
        if (!(e instanceof DomainError) || e.status !== 404) throw e;
      }
    }
    return publicExposureSitemapSchema.parse({
      schemaVersion: 'public-exposure-1',
      items,
      nextCursor:
        rows.length > input.limit ? rows[input.limit - 1]!.slug : null,
    });
  }
  async officialQueue() {
    return this.db.query(
      `SELECT p.slug,p.revision AS publication_revision,p.snapshot_hash,p.status,p.visibility,COALESCE(e.permission_revision,0) AS permission_revision,COALESCE(e.mode,'none') AS mode FROM aw_official_publications p LEFT JOIN aw_public_exposures e ON e.official_publication_id=p.id ORDER BY p.slug LIMIT 1000`,
    );
  }
}
