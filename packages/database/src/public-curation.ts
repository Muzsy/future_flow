import { randomUUID } from 'node:crypto';
import {
  PUBLIC_CURATION_VERSION,
  PUBLIC_REVIEW_VERSION,
  publicCurationRequestSchema,
  publicCurationDecisionSchema,
  publicCurationViewSchema,
} from '@future-flow/contracts';
import { DomainError, hash } from '@future-flow/core';
import type { Database } from './index';
import { lifeRow } from './lives';
import { PublicReviewRepository } from './public-reviews';
import { PublicDraftRepository } from './public-drafts';

export function publicCurationEnabledFromEnv() {
  const flag = process.env.PUBLIC_CURATION_ENABLED ?? 'false';
  if (!['true', 'false'].includes(flag))
    throw new Error('Invalid curation flag');
  return flag === 'true';
}
type Curation = Record<string, unknown> & {
  id: string;
  user_id: string;
  draft_id: string;
  review_id: string;
  snapshot_hash: string;
  source_revision: number;
  status: 'pending' | 'text_reviewed' | 'changes_requested' | 'rejected';
  curation_version: string;
  reason_code: string | null;
  actor_label: string | null;
};
export class PublicCurationRepository {
  constructor(
    private readonly db: Database,
    private readonly enabled = false,
  ) {}
  private async bound(tx: Database, userId: string, draftId: string) {
    // Existing review reader takes active-owner -> source-branch locks and validates English/Shared/hash/expiry.
    const review = await new PublicReviewRepository(tx).get(userId, draftId);
    const preview = await new PublicDraftRepository(tx).get(userId, draftId);
    return { review, preview };
  }
  private view(
    preview: { snapshotHash: string; sourceRevision: number },
    row?: Curation,
  ) {
    return publicCurationViewSchema.parse({
      snapshotHash: preview.snapshotHash,
      sourceRevision: preview.sourceRevision,
      curationVersion: PUBLIC_CURATION_VERSION,
      enabled: this.enabled,
      scope: 'text_only',
      publicationApproved: false,
      curation: row
        ? { id: row.id, status: row.status, reasonCode: row.reason_code }
        : null,
    });
  }
  async get(userId: string, draftId: string) {
    return this.db.transaction(async (tx) => {
      const { preview } = await this.bound(tx, userId, draftId);
      const [row] = await tx.query<Curation>(
        'SELECT * FROM aw_public_text_curations WHERE user_id=$1 AND draft_id=$2 AND curation_version=$3',
        [userId, draftId, PUBLIC_CURATION_VERSION],
      );
      if (
        row &&
        (row.snapshot_hash !== preview.snapshotHash ||
          row.source_revision !== preview.sourceRevision)
      )
        throw new DomainError(
          'PUBLIC_CURATION_INVALID',
          'Curation binding is invalid.',
          409,
        );
      return this.view(preview, row);
    });
  }
  async submit(userId: string, draftId: string, raw: unknown, key: string) {
    const input = publicCurationRequestSchema.parse(raw);
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key))
      throw new DomainError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Request key required.',
        400,
      );
    return this.db.transaction(async (tx) => {
      const { preview, review } = await this.bound(tx, userId, draftId);
      if (
        input.snapshotHash !== preview.snapshotHash ||
        input.sourceRevision !== preview.sourceRevision
      )
        throw new DomainError(
          'PUBLIC_CURATION_INVALID',
          'Request does not match the copy.',
          409,
        );
      const inputHash = hash({ draftId, ...input });
      const [prior] = await tx.query<{ input_hash: string }>(
        'SELECT input_hash FROM ff_idempotency WHERE user_id=$1 AND scope=$2 AND key=$3',
        [userId, 'public-text-curation', key],
      );
      if (prior && prior.input_hash !== inputHash)
        throw new DomainError(
          'IDEMPOTENCY_CONFLICT',
          'Request key was reused.',
          409,
        );
      let [row] = await tx.query<Curation>(
        'SELECT * FROM aw_public_text_curations WHERE user_id=$1 AND draft_id=$2 AND curation_version=$3',
        [userId, draftId, PUBLIC_CURATION_VERSION],
      );
      if (
        row &&
        (row.snapshot_hash !== preview.snapshotHash ||
          row.source_revision !== preview.sourceRevision)
      )
        throw new DomainError(
          'PUBLIC_CURATION_INVALID',
          'Curation binding is invalid.',
          409,
        );
      if (!row) {
        if (!this.enabled)
          throw new DomainError(
            'PUBLIC_CURATION_DISABLED',
            'Text review submissions are disabled.',
            503,
          );
        if (
          review.status !== 'completed' ||
          review.report?.verdict !== 'no_findings'
        )
          throw new DomainError(
            'PUBLIC_CURATION_AI_REQUIRED',
            'Resolve the AI review first.',
            409,
          );
        const [ai] = await tx.query<{ id: string }>(
          'SELECT id FROM aw_public_draft_reviews WHERE draft_id=$1 AND user_id=$2 AND policy_version=$3 AND status=$4',
          [draftId, userId, PUBLIC_REVIEW_VERSION, 'completed'],
        );
        [row] = await tx.query<Curation>(
          'INSERT INTO aw_public_text_curations(id,user_id,draft_id,review_id,source_revision,snapshot_hash,curation_version) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
          [
            randomUUID(),
            userId,
            draftId,
            lifeRow(ai ? [ai] : []).id,
            preview.sourceRevision,
            preview.snapshotHash,
            PUBLIC_CURATION_VERSION,
          ],
        );
      }
      if (!prior)
        await tx.query(
          'INSERT INTO ff_idempotency(user_id,scope,key,input_hash,response) VALUES($1,$2,$3,$4,$5)',
          [userId, 'public-text-curation', key, inputHash, { draftId }],
        );
      return this.view(preview, row);
    });
  }
  // Trusted server/operator use only. No HTTP/client approval endpoint.
  async decide(raw: unknown) {
    const input = publicCurationDecisionSchema.parse(raw);
    return this.db.transaction(async (tx) => {
      const seed = lifeRow(
        await tx.query<Curation>(
          'SELECT * FROM aw_public_text_curations WHERE id=$1',
          [input.curationId],
        ),
      );
      const { preview, review } = await this.bound(
        tx,
        seed.user_id,
        seed.draft_id,
      );
      const row = lifeRow(
        await tx.query<Curation>(
          'SELECT * FROM aw_public_text_curations WHERE id=$1 FOR UPDATE',
          [input.curationId],
        ),
      );
      if (
        row.curation_version !== PUBLIC_CURATION_VERSION ||
        row.snapshot_hash !== preview.snapshotHash ||
        row.source_revision !== preview.sourceRevision ||
        input.snapshotHash !== preview.snapshotHash ||
        input.sourceRevision !== preview.sourceRevision
      )
        throw new DomainError(
          'PUBLIC_CURATION_INVALID',
          'Decision does not match the copy.',
          409,
        );
      if (
        input.status === 'text_reviewed' &&
        (review.status !== 'completed' ||
          review.report?.verdict !== 'no_findings')
      )
        throw new DomainError(
          'PUBLIC_CURATION_AI_REQUIRED',
          'A completed clear AI review is required.',
          409,
        );
      if (row.status !== 'pending') {
        if (
          row.status !== input.status ||
          row.reason_code !== input.reasonCode ||
          row.actor_label !== input.actorLabel
        )
          throw new DomainError(
            'PUBLIC_CURATION_DECIDED',
            'Text curation is immutable.',
            409,
          );
        return this.view(preview, row);
      }
      const [updated] = await tx.query<Curation>(
        'UPDATE aw_public_text_curations SET status=$1,reason_code=$2,actor_label=$3,decided_at=now() WHERE id=$4 RETURNING *',
        [input.status, input.reasonCode, input.actorLabel, input.curationId],
      );
      return this.view(preview, updated);
    });
  }
  async pending() {
    const rows = await this.db.query<Curation>(
      "SELECT c.* FROM aw_public_text_curations c JOIN aw_publication_drafts d ON d.id=c.draft_id JOIN aw_branches b ON b.id=d.branch_id JOIN ff_users u ON u.id=c.user_id WHERE c.status='pending' AND d.expires_at>now() AND b.revision=c.source_revision AND u.status='active' ORDER BY c.created_at,c.id LIMIT 20",
    );
    const result = [];
    for (const row of rows) {
      try {
        const item = await this.db.transaction(async (tx) => {
          const { preview, review } = await this.bound(
            tx,
            row.user_id,
            row.draft_id,
          );
          const [current] = await tx.query<Curation>(
            'SELECT * FROM aw_public_text_curations WHERE id=$1 AND status=$2',
            [row.id, 'pending'],
          );
          if (!current) return null;
          if (
            current.snapshot_hash !== preview.snapshotHash ||
            current.source_revision !== preview.sourceRevision
          )
            throw new DomainError(
              'PUBLIC_CURATION_INVALID',
              'Curation binding is invalid.',
              409,
            );
          return {
            curationId: row.id,
            ownerId: row.user_id,
            draftId: row.draft_id,
            snapshotHash: preview.snapshotHash,
            sourceRevision: preview.sourceRevision,
            expiresAt: preview.expiresAt,
            snapshot: preview.snapshot,
            review,
          };
        });
        if (item) result.push(item);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        result.push({
          curationId: row.id,
          unavailable: true,
          code: error.code,
        });
      }
    }
    return result;
  }
}
