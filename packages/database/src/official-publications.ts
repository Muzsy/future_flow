import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  officialPublicationPrepareRequestSchema,
  officialPublicationConfirmRequestSchema,
  officialPublicationPreviewSchema,
  officialPublicationOwnerViewSchema,
  officialPublicationReaderSchema,
  officialPublicationActionRequestSchema,
  officialPublicationModerationRequestSchema,
  officialPublicationBindingSchema,
  officialLifeEvidenceSchema,
  type PublicationSettings,
  type OfficialPublicationPreview,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  releaseOfficialPublicContent,
  validateOfficialPublicationSnapshot,
  reviewedOfficialPublicationContent,
} from '@future-flow/core';
import type { Database } from './index';
import { OfficialLifeRepository } from './official-life';

export interface OfficialPublicationConfig {
  enabled: boolean;
  linkSecret: string;
}
export function officialPublicationConfigFromEnv(): OfficialPublicationConfig {
  const flag = process.env.OFFICIAL_PUBLICATIONS_ENABLED ?? 'false';
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
    'OFFICIAL_PUBLICATION_UNAVAILABLE',
    'This publication is unavailable.',
    404,
  );
const conflict = () =>
  new DomainError(
    'OFFICIAL_PUBLICATION_CONFLICT',
    'The publication copy or status changed. Reload it.',
    409,
  );
const iso = (date: Date | string) => new Date(date).toISOString();
export class OfficialPublicationRepository {
  constructor(
    private readonly db: Database,
    private readonly config: OfficialPublicationConfig = {
      enabled: false,
      linkSecret: '',
    },
  ) {}
  private enabled() {
    if (!this.config.enabled || !/^[a-f0-9]{64}$/.test(this.config.linkSecret))
      throw new DomainError(
        'OFFICIAL_PUBLICATION_DISABLED',
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
      .update(`official-publication-1:${id}:${revision}`)
      .digest('base64url');
  }
  private async bound(tx: Database, userId: string, raw: unknown) {
    const input = officialPublicationPrepareRequestSchema.parse(raw);
    const verified = await new OfficialLifeRepository(tx).forPublication(
      userId,
      input.binding.bundleId,
    );
    const bundle = verified.bundle;
    if (hash(input.binding) !== hash(verified.binding)) throw conflict();
    let handle: string | null = null;
    if (input.settings.authorMode === 'handle') {
      const [profile] = await tx.query<{ handle: string }>(
        'SELECT handle FROM aw_social_profiles WHERE user_id=$1',
        [userId],
      );
      if (!profile)
        throw new DomainError(
          'OFFICIAL_PUBLICATION_HANDLE_REQUIRED',
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
      snapshot: releaseOfficialPublicContent(bundle.content, handle),
      expiresAt: source.expires_at,
    };
  }
  private preview(row: PreviewRow): OfficialPublicationPreview {
    const snapshot = validateOfficialPublicationSnapshot(row.snapshot);
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
    return officialPublicationPreviewSchema.parse({
      ...value,
      previewHash: row.preview_hash,
    });
  }
  private view(row: Row) {
    const snapshot = validateOfficialPublicationSnapshot(row.snapshot);
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
    return officialPublicationOwnerViewSchema.parse({
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
    const input = officialPublicationPrepareRequestSchema.parse(raw),
      inputHash = hash(input),
      scope = 'official-publication-prepare';
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      const prior = await this.prior(tx, userId, scope, key, inputHash),
        bound = await this.bound(tx, userId, input);
      const [published] = await tx.query(
        'SELECT id FROM aw_official_publications WHERE user_id=$1 AND bundle_id=$2',
        [userId, input.binding.bundleId],
      );
      if (published) throw conflict();
      let [row] = prior
        ? await tx.query<PreviewRow>(
            'SELECT * FROM aw_official_publication_previews WHERE id=$1 AND user_id=$2',
            [prior, userId],
          )
        : await tx.query<PreviewRow>(
            'SELECT * FROM aw_official_publication_previews WHERE user_id=$1 AND bundle_id=$2 AND binding=$3 AND settings=$4 AND snapshot_hash=$5 AND expires_at>now() ORDER BY created_at DESC LIMIT 1',
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
          'INSERT INTO aw_official_publication_previews(id,user_id,bundle_id,curation_id,binding,settings,snapshot,snapshot_hash,preview_hash,expires_at,source_grant_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
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
            input.binding.grantId,
          ],
        );
      }
      if (!row || hash(bound.snapshot) !== row.snapshot_hash) throw conflict();
      await this.remember(tx, userId, scope, key, inputHash, row.id);
      return this.preview(row);
    });
  }
  async confirm(userId: string, raw: unknown, key: string) {
    const input = officialPublicationConfirmRequestSchema.parse(raw),
      inputHash = hash(input),
      scope = 'official-publication-confirm';
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      const prior = await this.prior(tx, userId, scope, key, inputHash);
      const [candidate] = await tx.query<PreviewRow>(
        'SELECT * FROM aw_official_publication_previews WHERE id=$1 AND user_id=$2',
        [input.previewId, userId],
      );
      if (!candidate) throw missing();
      const preview = this.preview(candidate);
      if (input.previewHash !== preview.previewHash) throw conflict();
      const [existing] = await tx.query<Row>(
        'SELECT * FROM aw_official_publications WHERE user_id=$1 AND bundle_id=$2',
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
          'OFFICIAL_PUBLICATION_PREVIEW_EXPIRED',
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
        'INSERT INTO aw_official_publications(id,user_id,bundle_id,preview_id,slug,visibility,author_mode,snapshot,snapshot_hash,token_hash,source_grant_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
        [
          id,
          userId,
          candidate.bundle_id,
          preview.previewId,
          `official-${randomBytes(16).toString('hex')}`,
          preview.settings.visibility,
          preview.settings.authorMode,
          preview.snapshot,
          preview.snapshotHash,
          preview.settings.visibility === 'unlisted'
            ? hash(this.token(id, 1))
            : null,
          preview.binding.grantId,
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
          'SELECT * FROM aw_official_publications WHERE user_id=$1 ORDER BY published_at DESC,id',
          [userId],
        )
      ).map((row) => this.view(row));
    });
  }
  async forBundle(userId: string, bundleId: string) {
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      const [row] = await tx.query<Row>(
        'SELECT * FROM aw_official_publications WHERE user_id=$1 AND bundle_id=$2',
        [userId, bundleId],
      );
      return row ? this.view(row) : null;
    });
  }
  async sourceForBundle(userId: string, bundleId: string) {
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      const [grant] = await tx.query(
        "SELECT id FROM aw_official_life_sources WHERE user_id=$1 AND bundle_id=$2 AND status='active'",
        [userId, bundleId],
      );
      if (!grant) return null;
      try {
        return (
          await new OfficialLifeRepository(tx).forPublication(userId, bundleId)
        ).view;
      } catch (error) {
        if (error instanceof DomainError) return null;
        throw error;
      }
    });
  }
  async action(
    userId: string,
    id: string,
    action: 'withdraw' | 'rotate',
    raw: unknown,
    key: string,
  ) {
    const input = officialPublicationActionRequestSchema.parse(raw),
      scope = `official-publication-${action}`,
      inputHash = hash({ id, ...input });
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      const prior = await this.prior(tx, userId, scope, key, inputHash);
      const [row] = await tx.query<Row>(
        'SELECT * FROM aw_official_publications WHERE id=$1 AND user_id=$2 FOR UPDATE',
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
        'UPDATE aw_official_publications SET status=$1,revision=revision+1,token_hash=$2 WHERE id=$3 RETURNING *',
        [
          action === 'withdraw' ? 'withdrawn' : 'active',
          action === 'rotate' ? hash(this.token(id, row.revision + 1)) : null,
          id,
        ],
      );
      await tx.query(
        'INSERT INTO aw_official_publication_actions(id,user_id,publication_id,revision,action,actor_label) VALUES($1,$2,$3,$4,$5,$6)',
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
      'SELECT id AS "publicationId",revision,snapshot_hash AS "snapshotHash",status,visibility,snapshot FROM aw_official_publications WHERE status IN (\'active\',\'hidden\') ORDER BY published_at,id LIMIT 100',
    );
  }
  async moderate(raw: unknown) {
    const input = officialPublicationModerationRequestSchema.parse(raw);
    return this.db.transaction(async (tx) => {
      const [seed] = await tx.query<Row>(
        'SELECT * FROM aw_official_publications WHERE id=$1',
        [input.publicationId],
      );
      if (!seed) throw missing();
      await this.owner(tx, seed.user_id);
      const [row] = await tx.query<Row>(
        'SELECT * FROM aw_official_publications WHERE id=$1 FOR UPDATE',
        [seed.id],
      );
      if (!row || row.snapshot_hash !== input.snapshotHash) throw conflict();
      const status = input.action === 'hide' ? 'hidden' : 'removed';
      if (row.revision === input.revision + 1 && row.status === status) {
        const [audit] = await tx.query(
          'SELECT id FROM aw_official_publication_actions WHERE publication_id=$1 AND revision=$2 AND action=$3 AND reason_code=$4 AND actor_label=$5',
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
        'UPDATE aw_official_publications SET status=$1,revision=revision+1,token_hash=NULL WHERE id=$2',
        [status, row.id],
      );
      await tx.query(
        'INSERT INTO aw_official_publication_actions(id,user_id,publication_id,revision,action,reason_code,actor_label) VALUES($1,$2,$3,$4,$5,$6,$7)',
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
        `SELECT * FROM aw_official_publications WHERE ${field}=$1 AND visibility=$2 AND status='active'`,
        [value, visibility],
      );
      if (!seed) throw missing();
      // Same owner-first order as withdrawal/deletion. Recheck permission after locking.
      await this.owner(tx, seed.user_id, true);
      const [row] = await tx.query<Row>(
        `SELECT * FROM aw_official_publications WHERE id=$1 AND ${field}=$2 AND visibility=$3 AND status='active' FOR SHARE`,
        [seed.id, value, visibility],
      );
      if (!row) throw missing();
      const [source] = await tx.query<{
        id: string;
        content_hash: string;
        evidence: unknown;
        evidence_hash: string;
        binding: unknown;
      }>(
        "SELECT g.id,g.content_hash,g.evidence,g.evidence_hash,v.binding FROM aw_official_life_sources g JOIN aw_official_life_starts s ON s.life_id=g.life_id AND s.user_id=g.user_id JOIN aw_official_scenario_sources p ON p.id=s.scenario_grant_id JOIN aw_official_publication_previews v ON v.id=$4 AND v.source_grant_id=g.id AND v.user_id=g.user_id AND v.bundle_id=g.bundle_id WHERE g.id=$1 AND g.user_id=$2 AND g.bundle_id=$3 AND g.status='active' AND p.status='active' FOR SHARE OF g,p",
        [row.source_grant_id, row.user_id, row.bundle_id, row.preview_id],
      );
      if (!source) throw missing();
      const view = this.view(row);
      const binding = officialPublicationBindingSchema.parse(source.binding);
      const evidence = officialLifeEvidenceSchema.parse(source.evidence);
      const {
        sourceVersion: _version,
        grantId,
        evidenceHash,
        ...copyBinding
      } = binding;
      if (
        grantId !== source.id ||
        evidenceHash !== source.evidence_hash ||
        hash(evidence) !== source.evidence_hash ||
        hash(copyBinding) !== hash(evidence.binding) ||
        binding.bundleId !== row.bundle_id ||
        binding.contentHash !== source.content_hash ||
        hash(reviewedOfficialPublicationContent(view.snapshot)) !==
          source.content_hash
      )
        throw missing();
      return officialPublicationReaderSchema.parse({
        slug: row.slug,
        publishedAt: view.publishedAt,
        visibility: row.visibility,
        indexable: false,
        snapshot: view.snapshot,
      });
    });
  }
}
