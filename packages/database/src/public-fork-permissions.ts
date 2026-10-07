import { DomainError, hash, validateForkCheckpoint } from '@future-flow/core';
import {
  publicExposureSlugSchema,
  publicForkPermissionRequestSchema,
  officialForkPermissionRequestSchema,
  publicForkPermissionOwnerSchema,
  publicForkCapabilitySchema,
} from '@future-flow/contracts';
import { PublicationRepository, type PublicationConfig } from './publications';
import { OfficialPublicationRepository } from './official-publications';
import { assertPublicationAllowed } from './publication-safety';
import type { Database } from './index';
export type PublicForkPermissionConfig = {
  enabled: boolean;
  startsEnabled: boolean;
};
export function publicForkPermissionConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PublicForkPermissionConfig {
  const values = [
    env.PUBLIC_FORK_PERMISSION_ENABLED ?? 'false',
    env.PUBLIC_FORK_STARTS_ENABLED ?? 'false',
  ];
  if (
    values.some((v) => !['true', 'false'].includes(v)) ||
    (values[1] === 'true' && values[0] !== 'true')
  )
    throw Error('Invalid public fork flags');
  // The cross-owner start engine is a separate release gate. Consent alone
  // must not advertise a usable start action before that engine exists.
  if (values[1] === 'true')
    throw Error('Public fork starts are not implemented yet');
  return { enabled: values[0] === 'true', startsEnabled: values[1] === 'true' };
}
type Copy = Record<string, unknown> & {
  id: string;
  user_id: string;
  slug: string;
  revision: number;
  snapshot_hash: string;
};
type Permission = Record<string, unknown> & {
  id: string;
  publication_revision: number;
  snapshot_hash: string;
  permission_revision: number;
  allowed: boolean;
  last_request_hash: string;
};
const off = { enabled: false, linkSecret: '' },
  missing = () =>
    new DomainError(
      'RESOURCE_NOT_FOUND',
      'This fork permission is unavailable.',
      404,
    ),
  conflict = () =>
    new DomainError(
      'PUBLIC_FORK_PERMISSION_CONFLICT',
      'The copy or permission changed. Reload it.',
      409,
    );
export class PublicForkPermissionRepository {
  constructor(
    public readonly db: Database,
    public readonly config: PublicForkPermissionConfig = {
      enabled: false,
      startsEnabled: false,
    },
    private readonly community: PublicationConfig = off,
    private readonly official: PublicationConfig = off,
  ) {
    if (config.startsEnabled)
      throw Error('Public fork starts are not implemented yet');
  }
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
  public read(tx: Database, slug: string) {
    return slug.startsWith('official-')
      ? new OfficialPublicationRepository(tx, this.official).readPublic(slug)
      : new PublicationRepository(tx, this.community).readPublic(slug);
  }
  public async lockedCopy(
    tx: Database,
    slug: string,
    owner?: string,
    write = false,
  ) {
    const [hint] = await tx.query<Copy>(
      `SELECT * FROM ${this.table(slug)} WHERE slug=$1`,
      [slug],
    );
    if (!hint || (owner && hint.user_id !== owner)) throw missing();
    const [user] = await tx.query<{ status: string }>(
      `SELECT status FROM ff_users WHERE id=$1 FOR ${write ? 'UPDATE' : 'SHARE'}`,
      [hint.user_id],
    );
    if (user?.status !== 'active') throw missing();
    const [copy] = await tx.query<Copy>(
      `SELECT * FROM ${this.table(slug)} WHERE id=$1 AND slug=$2 FOR SHARE`,
      [hint.id, slug],
    );
    if (!copy) throw missing();
    return copy;
  }
  private async permitted(tx: Database, copy: Copy, p?: Permission) {
    if (
      !this.config.enabled ||
      !p?.allowed ||
      p.publication_revision !== copy.revision ||
      p.snapshot_hash !== copy.snapshot_hash
    )
      return false;
    try {
      const r = await this.read(tx, copy.slug);
      if (!r.snapshot.checkpoints.length) return false;
      for (const c of r.snapshot.checkpoints)
        validateForkCheckpoint({
          ...c,
          schemaVersion: 'fork-checkpoint-1',
          requiresFullReview: true,
          readyForPublicFork: false,
        });
      return true;
    } catch (e) {
      if (e instanceof DomainError && e.status === 404) return false;
      throw e;
    }
  }
  private async view(tx: Database, copy: Copy, p?: Permission) {
    return publicForkPermissionOwnerSchema.parse({
      schemaVersion: 'public-fork-permission-1',
      slug: copy.slug,
      publicationRevision: copy.revision,
      snapshotHash: copy.snapshot_hash,
      permissionRevision: p?.permission_revision ?? 0,
      allowed: p?.allowed ?? false,
      effectiveAllowed: await this.permitted(tx, copy, p),
      enabled: this.config.enabled,
      startsEnabled: this.config.startsEnabled,
      authority: copy.slug.startsWith('official-') ? 'curator' : 'owner',
    });
  }
  async own(userId: string, rawSlug: unknown) {
    const slug = publicExposureSlugSchema.parse(rawSlug);
    return this.db.transaction(async (tx) => {
      const copy = await this.lockedCopy(tx, slug, userId),
        [p] = await tx.query<Permission>(
          `SELECT * FROM aw_public_fork_permissions WHERE ${this.column(slug)}=$1`,
          [copy.id],
        );
      return this.view(tx, copy, p);
    });
  }
  async setOwner(userId: string, rawSlug: unknown, raw: unknown) {
    const slug = publicExposureSlugSchema.parse(rawSlug),
      input = publicForkPermissionRequestSchema.parse(raw);
    return this.set(slug, input, 'Publisher consent', userId);
  }
  async setOfficial(raw: unknown) {
    const { slug, actorLabel, ...input } =
      officialForkPermissionRequestSchema.parse(raw);
    return this.set(slug, input, actorLabel);
  }
  private async set(
    slug: string,
    input: ReturnType<typeof publicForkPermissionRequestSchema.parse>,
    actorLabel: string,
    owner?: string,
  ) {
    const requestHash = hash({ slug, ...input, actorLabel });
    return this.db.transaction(async (tx) => {
      const copy = await this.lockedCopy(tx, slug, owner, true);
      if (owner && slug.startsWith('official-') && input.allowed)
        throw new DomainError(
          'PUBLIC_FORK_CURATOR_REQUIRED',
          'Official fork consent requires the curator.',
          403,
        );
      if (
        copy.revision !== input.publicationRevision ||
        copy.snapshot_hash !== input.snapshotHash
      )
        throw conflict();
      const [current] = await tx.query<Permission>(
        `SELECT * FROM aw_public_fork_permissions WHERE ${this.column(slug)}=$1 FOR UPDATE`,
        [copy.id],
      );
      if (
        current?.permission_revision === input.permissionRevision + 1 &&
        current.last_request_hash === requestHash
      )
        return this.view(tx, copy, current);
      if ((current?.permission_revision ?? 0) !== input.permissionRevision)
        throw conflict();
      if (input.allowed) {
        if (!this.config.enabled)
          throw new DomainError(
            'PUBLIC_FORK_PERMISSION_DISABLED',
            'Private starts from public lives are not open yet.',
            404,
          );
        await assertPublicationAllowed(tx, copy.user_id);
        const r = await this.read(tx, slug);
        if (!r.snapshot.checkpoints.length)
          throw new DomainError(
            'PUBLIC_FORK_CHECKPOINT_REQUIRED',
            'This copy has no reviewed decision checkpoint.',
            409,
          );
        for (const c of r.snapshot.checkpoints)
          validateForkCheckpoint({
            ...c,
            schemaVersion: 'fork-checkpoint-1',
            requiresFullReview: true,
            readyForPublicFork: false,
          });
      }
      const [next] = await tx.query<Permission>(
        current
          ? 'UPDATE aw_public_fork_permissions SET publication_revision=$2,snapshot_hash=$3,permission_revision=permission_revision+1,allowed=$4,last_request_hash=$5,updated_at=now() WHERE id=$1 RETURNING *'
          : `INSERT INTO aw_public_fork_permissions(${this.column(slug)},publication_revision,snapshot_hash,permission_revision,allowed,last_request_hash) VALUES($1,$2,$3,1,$4,$5) RETURNING *`,
        [
          current?.id ?? copy.id,
          copy.revision,
          copy.snapshot_hash,
          input.allowed,
          requestHash,
        ],
      );
      if (!next) throw conflict();
      await tx.query(
        'INSERT INTO aw_public_fork_permission_actions(permission_id,permission_revision,publication_revision,snapshot_hash,allowed,request_hash,actor_label) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          next.id,
          next.permission_revision,
          copy.revision,
          copy.snapshot_hash,
          input.allowed,
          requestHash,
          actorLabel,
        ],
      );
      return this.view(tx, copy, next);
    });
  }
  async capability(rawSlug: unknown) {
    if (!this.config.enabled) throw missing();
    const slug = publicExposureSlugSchema.parse(rawSlug);
    return this.db.transaction(async (tx) => {
      const copy = await this.lockedCopy(tx, slug),
        [p] = await tx.query<Permission>(
          `SELECT * FROM aw_public_fork_permissions WHERE ${this.column(slug)}=$1 FOR SHARE`,
          [copy.id],
        );
      if (!(await this.permitted(tx, copy, p))) throw missing();
      const r = await this.read(tx, slug);
      return publicForkCapabilitySchema.parse({
        schemaVersion: 'public-fork-permission-1',
        slug,
        classification: r.snapshot.classification,
        contentLocale: 'en',
        title: r.snapshot.story.title,
        permissionRevision: p!.permission_revision,
        startsEnabled: this.config.startsEnabled,
        capabilityHash: hash({
          schemaVersion: 'public-fork-permission-1',
          slug,
          publicationRevision: copy.revision,
          snapshotHash: copy.snapshot_hash,
          permissionRevision: p!.permission_revision,
        }),
        checkpoints: r.snapshot.checkpoints.map((c, index) => ({
          index,
          prompt: c.decision.prompt,
          options: c.decision.options.map((o) => ({
            key: o.key,
            label: o.label,
            description: o.description,
          })),
        })),
      });
    });
  }
  async officialQueue() {
    return this.db.query(
      'SELECT p.slug,p.revision AS publication_revision,p.snapshot_hash,p.status,p.visibility,COALESCE(f.permission_revision,0) AS permission_revision,COALESCE(f.allowed,false) AS allowed FROM aw_official_publications p LEFT JOIN aw_public_fork_permissions f ON f.official_publication_id=p.id ORDER BY p.slug LIMIT 1000',
    );
  }
}
