import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  publicationPrepareRequestSchema,
  publicationConfirmRequestSchema,
  publicationPreviewSchema,
  publicationOwnerViewSchema,
  publicationReaderSchema,
  publicationActionRequestSchema,
  publicationModerationRequestSchema,
  type PublicationSettings,
  type PublicationPreview,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  releasePublicContent,
  validatePublicationSnapshot,
} from '@future-flow/core';
import type { Database } from './index';
import { PublicContentRepository } from './public-content';
import { PublicContentCurationRepository } from './public-content-curation';

export interface PublicationConfig {
  enabled: boolean;
  linkSecret: string;
}
export function publicationConfigFromEnv(): PublicationConfig {
  const flag = process.env.PUBLICATIONS_ENABLED ?? 'false';
  const linkSecret = process.env.PUBLICATION_LINK_SECRET ?? '';
  if (
    !['true', 'false'].includes(flag) ||
    (linkSecret && !/^[a-f0-9]{64}$/.test(linkSecret)) ||
    (flag === 'true' && !linkSecret)
  )
    throw Error('Invalid publication configuration');
  return { enabled: flag === 'true', linkSecret };
}
type PreviewRow = Record<string, unknown> & {
  id: string;
  user_id: string;
  bundle_id: string;
  binding: unknown;
  settings: PublicationSettings;
  snapshot: unknown;
  snapshot_hash: string;
  preview_hash: string;
  expires_at: Date | string;
};
type Row = Record<string, unknown> & {
  id: string;
  user_id: string;
  bundle_id: string;
  preview_id: string;
  slug: string;
  visibility: 'public' | 'unlisted';
  author_mode: 'anonymous' | 'handle';
  status: string;
  revision: number;
  token_hash: string | null;
  snapshot: unknown;
  snapshot_hash: string;
  published_at: Date | string;
};
const missing = () =>
  new DomainError(
    'PUBLICATION_UNAVAILABLE',
    'This publication is unavailable.',
    404,
  );
const conflict = () =>
  new DomainError(
    'PUBLICATION_CONFLICT',
    'The publication copy or status changed. Reload it.',
    409,
  );
const iso = (date: Date | string) => new Date(date).toISOString();
export class PublicationRepository {
  constructor(
    private readonly db: Database,
    private readonly config: PublicationConfig = {
      enabled: false,
      linkSecret: '',
    },
  ) {}
  private enabled() {
    if (!this.config.enabled || !/^[a-f0-9]{64}$/.test(this.config.linkSecret))
      throw new DomainError(
        'PUBLICATION_DISABLED',
        'Publication is currently disabled.',
        503,
      );
  }
  private async owner(tx: Database, userId: string, read = false) {
    const [user] = await tx.query(
      `SELECT status FROM ff_users WHERE id=$1 FOR ${read ? 'SHARE' : 'UPDATE'}`,
      [userId],
    );
    if (user?.status !== 'active') throw missing();
  }
  private token(id: string, revision: number) {
    return createHmac('sha256', Buffer.from(this.config.linkSecret, 'hex'))
      .update(`publication-1:${id}:${revision}`)
      .digest('base64url');
  }
  private async bound(tx: Database, userId: string, raw: unknown) {
    const input = publicationPrepareRequestSchema.parse(raw);
    const curation = await new PublicContentCurationRepository(tx).get(
      userId,
      input.binding.bundleId,
    );
    const bundle = await new PublicContentRepository(tx).get(
      userId,
      input.binding.bundleId,
    );
    if (
      curation.curation?.status !== 'content_reviewed' ||
      !curation.eligible ||
      hash(input.binding) !==
        hash({
          bundleId: bundle.bundleId,
          contentHash: bundle.contentHash,
          sourceRevision: bundle.sourceRevision,
          reviewId: curation.reviewId,
          reviewHash: curation.reviewHash,
          policyVersion: curation.policyVersion,
          curationId: curation.curation.id,
          curationVersion: curation.curationVersion,
        })
    )
      throw conflict();
    let handle: string | null = null;
    if (input.settings.authorMode === 'handle') {
      const [profile] = await tx.query<{ handle: string }>(
        'SELECT handle FROM aw_social_profiles WHERE user_id=$1',
        [userId],
      );
      if (!profile)
        throw new DomainError(
          'PUBLICATION_HANDLE_REQUIRED',
          'Set a public handle first, or publish anonymously.',
          409,
        );
      handle = profile.handle;
    }
    const [source] = await tx.query<{ expires_at: Date | string }>(
      'SELECT expires_at FROM aw_publication_drafts WHERE id=$1 AND user_id=$2',
      [bundle.draftId, userId],
    );
    if (!source) throw missing();
    return {
      input,
      snapshot: releasePublicContent(bundle.content, handle),
      expiresAt: source.expires_at,
    };
  }
  private preview(row: PreviewRow): PublicationPreview {
    const snapshot = validatePublicationSnapshot(row.snapshot);
    const value = {
      previewId: row.id,
      snapshotHash: row.snapshot_hash,
      binding: row.binding,
      settings: row.settings,
      snapshot,
      expiresAt: iso(row.expires_at),
      published: false as const,
    };
    if (
      hash(snapshot) !== row.snapshot_hash ||
      hash(value) !== row.preview_hash
    )
      throw conflict();
    return publicationPreviewSchema.parse({
      ...value,
      previewHash: row.preview_hash,
    });
  }
  private view(row: Row) {
    const snapshot = validatePublicationSnapshot(row.snapshot);
    if (
      hash(snapshot) !== row.snapshot_hash ||
      snapshot.author.mode !== row.author_mode
    )
      throw conflict();
    const token =
      row.status === 'active' &&
      row.visibility === 'unlisted' &&
      /^[a-f0-9]{64}$/.test(this.config.linkSecret)
        ? this.token(row.id, row.revision)
        : null;
    return publicationOwnerViewSchema.parse({
      publicationId: row.id,
      bundleId: row.bundle_id,
      slug: row.slug,
      revision: row.revision,
      status: row.status,
      settings: {
        visibility: row.visibility,
        authorMode: row.author_mode,
        indexable: false,
      },
      snapshotHash: row.snapshot_hash,
      snapshot,
      publishedAt: iso(row.published_at),
      unlistedToken: token && hash(token) === row.token_hash ? token : null,
    });
  }
  private async prior(
    tx: Database,
    userId: string,
    scope: string,
    key: string,
    inputHash: string,
  ) {
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(key))
      throw new DomainError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Request key required.',
        400,
      );
    const [prior] = await tx.query<{
      input_hash: string;
      response: { id: string };
    }>(
      'SELECT input_hash,response FROM ff_idempotency WHERE user_id=$1 AND scope=$2 AND key=$3',
      [userId, scope, key],
    );
    if (prior && prior.input_hash !== inputHash)
      throw new DomainError(
        'IDEMPOTENCY_CONFLICT',
        'Request key was reused.',
        409,
      );
    return prior?.response.id;
  }
  private async remember(
    tx: Database,
    userId: string,
    scope: string,
    key: string,
    inputHash: string,
    id: string,
  ) {
    // Idempotency storage contains IDs only, never the unlisted credential.
    await tx.query(
      'INSERT INTO ff_idempotency(user_id,scope,key,input_hash,response) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,scope,key) DO NOTHING',
      [userId, scope, key, inputHash, { id }],
    );
  }
  async prepare(userId: string, raw: unknown, key: string) {
    this.enabled();
    const input = publicationPrepareRequestSchema.parse(raw),
      inputHash = hash(input),
      scope = 'publication-prepare';
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      const prior = await this.prior(tx, userId, scope, key, inputHash),
        bound = await this.bound(tx, userId, input);
      const [published] = await tx.query(
        'SELECT id FROM aw_publications WHERE user_id=$1 AND bundle_id=$2',
        [userId, input.binding.bundleId],
      );
      if (published) throw conflict();
      let [row] = prior
        ? await tx.query<PreviewRow>(
            'SELECT * FROM aw_publication_previews WHERE id=$1 AND user_id=$2',
            [prior, userId],
          )
        : await tx.query<PreviewRow>(
            'SELECT * FROM aw_publication_previews WHERE user_id=$1 AND bundle_id=$2 AND binding=$3 AND settings=$4 AND snapshot_hash=$5 AND expires_at>now() ORDER BY created_at DESC LIMIT 1',
            [
              userId,
              input.binding.bundleId,
              input.binding,
              input.settings,
              hash(bound.snapshot),
            ],
          );
      if (!row) {
        const value = {
          previewId: randomUUID(),
          snapshotHash: hash(bound.snapshot),
          ...input,
          snapshot: bound.snapshot,
          expiresAt: new Date(
            Math.min(
              Date.now() + 15 * 60000,
              new Date(bound.expiresAt).getTime(),
            ),
          ).toISOString(),
          published: false,
        };
        [row] = await tx.query<PreviewRow>(
          'INSERT INTO aw_publication_previews(id,user_id,bundle_id,curation_id,binding,settings,snapshot,snapshot_hash,preview_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
          [
            value.previewId,
            userId,
            input.binding.bundleId,
            input.binding.curationId,
            input.binding,
            input.settings,
            bound.snapshot,
            value.snapshotHash,
            hash(value),
            value.expiresAt,
          ],
        );
      }
      if (!row || hash(bound.snapshot) !== row.snapshot_hash) throw conflict();
      await this.remember(tx, userId, scope, key, inputHash, row.id);
      return this.preview(row);
    });
  }
  async confirm(userId: string, raw: unknown, key: string) {
    const input = publicationConfirmRequestSchema.parse(raw),
      inputHash = hash(input),
      scope = 'publication-confirm';
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      const prior = await this.prior(tx, userId, scope, key, inputHash);
      const [candidate] = await tx.query<PreviewRow>(
        'SELECT * FROM aw_publication_previews WHERE id=$1 AND user_id=$2',
        [input.previewId, userId],
      );
      if (!candidate) throw missing();
      const preview = this.preview(candidate);
      if (input.previewHash !== preview.previewHash) throw conflict();
      const [existing] = await tx.query<Row>(
        'SELECT * FROM aw_publications WHERE user_id=$1 AND bundle_id=$2',
        [userId, candidate.bundle_id],
      );
      if (existing) {
        if (
          existing.preview_id !== preview.previewId ||
          (prior && prior !== existing.id)
        )
          throw conflict();
        await this.remember(tx, userId, scope, key, inputHash, existing.id);
        return this.view(existing); // A retry never reactivates a withdrawn/hidden copy.
      }
      this.enabled();
      if (Date.now() >= new Date(preview.expiresAt).getTime())
        throw new DomainError(
          'PUBLICATION_PREVIEW_EXPIRED',
          'Prepare a fresh publication preview.',
          410,
        );
      const bound = await this.bound(tx, userId, {
        binding: preview.binding,
        settings: preview.settings,
      });
      if (hash(bound.snapshot) !== preview.snapshotHash) throw conflict();
      const id = randomUUID();
      const [row] = await tx.query<Row>(
        'INSERT INTO aw_publications(id,user_id,bundle_id,preview_id,slug,visibility,author_mode,snapshot,snapshot_hash,token_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
        [
          id,
          userId,
          candidate.bundle_id,
          preview.previewId,
          `life-${randomBytes(16).toString('hex')}`,
          preview.settings.visibility,
          preview.settings.authorMode,
          preview.snapshot,
          preview.snapshotHash,
          preview.settings.visibility === 'unlisted'
            ? hash(this.token(id, 1))
            : null,
        ],
      );
      if (!row) throw conflict();
      await this.remember(tx, userId, scope, key, inputHash, id);
      return this.view(row);
    });
  }
  async list(userId: string) {
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      return (
        await tx.query<Row>(
          'SELECT * FROM aw_publications WHERE user_id=$1 ORDER BY published_at DESC,id',
          [userId],
        )
      ).map((row) => this.view(row));
    });
  }
  async forBundle(userId: string, bundleId: string) {
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      const [row] = await tx.query<Row>(
        'SELECT * FROM aw_publications WHERE user_id=$1 AND bundle_id=$2',
        [userId, bundleId],
      );
      return row ? this.view(row) : null;
    });
  }
  async action(
    userId: string,
    id: string,
    action: 'withdraw' | 'rotate',
    raw: unknown,
    key: string,
  ) {
    const input = publicationActionRequestSchema.parse(raw),
      scope = `publication-${action}`,
      inputHash = hash({ id, ...input });
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      const prior = await this.prior(tx, userId, scope, key, inputHash);
      const [row] = await tx.query<Row>(
        'SELECT * FROM aw_publications WHERE id=$1 AND user_id=$2 FOR UPDATE',
        [id, userId],
      );
      if (!row) throw missing();
      if (prior) return this.view(row);
      if (
        row.revision !== input.revision ||
        row.snapshot_hash !== input.snapshotHash ||
        (action === 'rotate'
          ? row.status !== 'active' || row.visibility !== 'unlisted'
          : !['active', 'hidden'].includes(row.status))
      )
        throw conflict();
      if (action === 'rotate') this.enabled();
      const [next] = await tx.query<Row>(
        'UPDATE aw_publications SET status=$1,revision=revision+1,token_hash=$2 WHERE id=$3 RETURNING *',
        [
          action === 'withdraw' ? 'withdrawn' : 'active',
          action === 'rotate' ? hash(this.token(id, row.revision + 1)) : null,
          id,
        ],
      );
      await tx.query(
        'INSERT INTO aw_publication_actions(id,user_id,publication_id,revision,action,actor_label) VALUES($1,$2,$3,$4,$5,$6)',
        [
          randomUUID(),
          userId,
          id,
          row.revision + 1,
          action,
          'Publication owner',
        ],
      );
      await this.remember(tx, userId, scope, key, inputHash, id);
      return this.view(next!);
    });
  }
  // Operator-only entry point; there is no HTTP moderation/approval endpoint.
  async moderationQueue() {
    return this.db.query(
      'SELECT id AS "publicationId",revision,snapshot_hash AS "snapshotHash",status,visibility,snapshot FROM aw_publications WHERE status IN (\'active\',\'hidden\') ORDER BY published_at,id LIMIT 100',
    );
  }
  async moderate(raw: unknown) {
    const input = publicationModerationRequestSchema.parse(raw);
    return this.db.transaction(async (tx) => {
      const [seed] = await tx.query<Row>(
        'SELECT * FROM aw_publications WHERE id=$1',
        [input.publicationId],
      );
      if (!seed) throw missing();
      await this.owner(tx, seed.user_id);
      const [row] = await tx.query<Row>(
        'SELECT * FROM aw_publications WHERE id=$1 FOR UPDATE',
        [seed.id],
      );
      if (!row || row.snapshot_hash !== input.snapshotHash) throw conflict();
      const status = input.action === 'hide' ? 'hidden' : 'removed';
      if (row.revision === input.revision + 1 && row.status === status) {
        const [audit] = await tx.query(
          'SELECT id FROM aw_publication_actions WHERE publication_id=$1 AND revision=$2 AND action=$3 AND reason_code=$4 AND actor_label=$5',
          [
            row.id,
            row.revision,
            input.action,
            input.reasonCode,
            input.actorLabel,
          ],
        );
        if (audit)
          return { publicationId: row.id, revision: row.revision, status };
      }
      if (
        row.revision !== input.revision ||
        !['active', 'hidden'].includes(row.status) ||
        (row.status === 'hidden' && input.action === 'hide')
      )
        throw conflict();
      await tx.query(
        'UPDATE aw_publications SET status=$1,revision=revision+1,token_hash=NULL WHERE id=$2',
        [status, row.id],
      );
      await tx.query(
        'INSERT INTO aw_publication_actions(id,user_id,publication_id,revision,action,reason_code,actor_label) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          randomUUID(),
          row.user_id,
          row.id,
          row.revision + 1,
          input.action,
          input.reasonCode,
          input.actorLabel,
        ],
      );
      return { publicationId: row.id, revision: row.revision + 1, status };
    });
  }
  async readPublic(slug: string) {
    return this.read('slug', slug, 'public');
  }
  async readUnlisted(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw missing();
    return this.read('token_hash', hash(token), 'unlisted');
  }
  private async read(
    field: 'slug' | 'token_hash',
    value: string,
    visibility: string,
  ) {
    if (!this.config.enabled) throw missing();
    return this.db.transaction(async (tx) => {
      const [seed] = await tx.query<Row>(
        `SELECT * FROM aw_publications WHERE ${field}=$1 AND visibility=$2 AND status='active'`,
        [value, visibility],
      );
      if (!seed) throw missing();
      // Same owner-first order as withdrawal/deletion. Recheck permission after locking.
      await this.owner(tx, seed.user_id, true);
      const [row] = await tx.query<Row>(
        `SELECT * FROM aw_publications WHERE id=$1 AND ${field}=$2 AND visibility=$3 AND status='active' FOR SHARE`,
        [seed.id, value, visibility],
      );
      if (!row) throw missing();
      const view = this.view(row);
      return publicationReaderSchema.parse({
        slug: row.slug,
        publishedAt: view.publishedAt,
        visibility: row.visibility,
        indexable: false,
        snapshot: view.snapshot,
      });
    });
  }
}
