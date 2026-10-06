import { randomUUID } from 'node:crypto';
import {
  PUBLIC_CONTENT_CURATION_VERSION,
  PUBLIC_CONTENT_REVIEW_VERSION,
  publicContentCurationRequestSchema,
  publicContentCurationDecisionSchema,
  publicContentCurationViewSchema,
} from '@future-flow/contracts';
import { DomainError, hash } from '@future-flow/core';
import type { Database } from './index';
import { lifeRow } from './lives';
import { PublicContentRepository } from './public-content';
import { PublicContentReviewJobRepository } from './public-content-review-jobs';

export function publicContentCurationEnabledFromEnv() {
  const flag = process.env.PUBLIC_CONTENT_CURATION_ENABLED ?? 'false';
  if (!['true', 'false'].includes(flag))
    throw Error('Invalid full curation flag');
  return flag === 'true';
}
type Row = Record<string, unknown> & {
  id: string;
  user_id: string;
  draft_id: string;
  bundle_id: string;
  review_id: string;
  source_revision: number;
  snapshot_hash: string;
  content_hash: string;
  review_hash: string;
  policy_version: string;
  curation_version: string;
  status: string;
  reason_code: string | null;
  actor_label: string | null;
};
const invalid = () =>
  new DomainError(
    'PUBLIC_CONTENT_CURATION_INVALID',
    'Full curation binding is invalid.',
    409,
  );
export class PublicContentCurationRepository {
  constructor(
    private readonly db: Database,
    private readonly enabled = false,
  ) {}
  private async bound(tx: Database, userId: string, bundleId: string) {
    // Review reader validates the complete payload/receipt under owner -> source locks.
    const review = await new PublicContentReviewJobRepository(tx).get(
      userId,
      bundleId,
    );
    const bundle = await new PublicContentRepository(tx).get(userId, bundleId);
    return {
      bundle,
      review,
      reviewHash: review.report ? hash(review.report) : null,
      eligible:
        review.job?.status === 'completed' &&
        review.report?.verdict === 'no_findings',
    };
  }
  private validate(
    row: Row,
    bound: Awaited<ReturnType<PublicContentCurationRepository['bound']>>,
  ) {
    const { bundle, review, reviewHash, eligible } = bound;
    if (
      !eligible ||
      row.bundle_id !== bundle.bundleId ||
      row.draft_id !== bundle.draftId ||
      row.snapshot_hash !== bundle.snapshotHash ||
      row.source_revision !== bundle.sourceRevision ||
      row.content_hash !== bundle.contentHash ||
      row.review_id !== review.job?.id ||
      row.review_hash !== reviewHash ||
      row.policy_version !== PUBLIC_CONTENT_REVIEW_VERSION ||
      row.curation_version !== PUBLIC_CONTENT_CURATION_VERSION
    )
      throw invalid();
  }
  private view(
    bound: Awaited<ReturnType<PublicContentCurationRepository['bound']>>,
    row?: Row,
  ) {
    if (row) this.validate(row, bound);
    const { bundle, review, reviewHash, eligible } = bound;
    return publicContentCurationViewSchema.parse({
      bundleId: bundle.bundleId,
      draftId: bundle.draftId,
      snapshotHash: bundle.snapshotHash,
      sourceRevision: bundle.sourceRevision,
      contentHash: bundle.contentHash,
      policyVersion: PUBLIC_CONTENT_REVIEW_VERSION,
      curationVersion: PUBLIC_CONTENT_CURATION_VERSION,
      scope: 'story_and_selected_checkpoints',
      publicationApproved: false,
      enabled: this.enabled,
      eligible,
      reviewId: review.job?.id ?? null,
      reviewHash,
      curation: row
        ? { id: row.id, status: row.status, reasonCode: row.reason_code }
        : null,
    });
  }
  async get(userId: string, bundleId: string) {
    return this.db.transaction(async (tx) => {
      const bound = await this.bound(tx, userId, bundleId);
      const [row] = await tx.query<Row>(
        'SELECT * FROM aw_public_content_curations WHERE user_id=$1 AND bundle_id=$2 AND curation_version=$3',
        [userId, bundleId, PUBLIC_CONTENT_CURATION_VERSION],
      );
      return this.view(bound, row);
    });
  }
  async submit(userId: string, bundleId: string, raw: unknown, key: string) {
    const input = publicContentCurationRequestSchema.parse(raw);
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(key))
      throw new DomainError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Request key required.',
        400,
      );
    return this.db.transaction(async (tx) => {
      const bound = await this.bound(tx, userId, bundleId);
      if (input.contentHash !== bound.bundle.contentHash) throw invalid();
      const scope = 'public-content-curation',
        inputHash = hash({ bundleId, ...input });
      const [prior] = await tx.query<{ input_hash: string }>(
        'SELECT input_hash FROM ff_idempotency WHERE user_id=$1 AND scope=$2 AND key=$3',
        [userId, scope, key],
      );
      if (prior && prior.input_hash !== inputHash)
        throw new DomainError(
          'IDEMPOTENCY_CONFLICT',
          'Request key was reused.',
          409,
        );
      if (!bound.eligible)
        throw new DomainError(
          'PUBLIC_CONTENT_CURATION_AI_REQUIRED',
          'A clear complete AI review is required.',
          409,
        );
      if (
        input.reviewId !== bound.review.job?.id ||
        input.reviewHash !== bound.reviewHash
      )
        throw invalid();
      let [row] = await tx.query<Row>(
        'SELECT * FROM aw_public_content_curations WHERE user_id=$1 AND bundle_id=$2 AND curation_version=$3',
        [userId, bundleId, PUBLIC_CONTENT_CURATION_VERSION],
      );
      if (!row) {
        if (!this.enabled)
          throw new DomainError(
            'PUBLIC_CONTENT_CURATION_DISABLED',
            'Full content submissions are disabled.',
            503,
          );
        [row] = await tx.query<Row>(
          'INSERT INTO aw_public_content_curations(id,user_id,draft_id,bundle_id,review_id,source_revision,snapshot_hash,content_hash,review_hash,policy_version,curation_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
          [
            randomUUID(),
            userId,
            bound.bundle.draftId,
            bundleId,
            input.reviewId,
            bound.bundle.sourceRevision,
            bound.bundle.snapshotHash,
            input.contentHash,
            input.reviewHash,
            PUBLIC_CONTENT_REVIEW_VERSION,
            PUBLIC_CONTENT_CURATION_VERSION,
          ],
        );
      }
      const view = this.view(bound, row);
      if (!prior)
        await tx.query(
          'INSERT INTO ff_idempotency(user_id,scope,key,input_hash,response) VALUES($1,$2,$3,$4,$5)',
          [userId, scope, key, inputHash, { bundleId }],
        );
      return view;
    });
  }
  // Trusted operator only; never exposed through an HTTP decision endpoint.
  async decide(raw: unknown) {
    const input = publicContentCurationDecisionSchema.parse(raw);
    return this.db.transaction(async (tx) => {
      const seed = lifeRow(
        await tx.query<Row>(
          'SELECT * FROM aw_public_content_curations WHERE id=$1',
          [input.curationId],
        ),
      );
      const bound = await this.bound(tx, seed.user_id, seed.bundle_id);
      const row = lifeRow(
        await tx.query<Row>(
          'SELECT * FROM aw_public_content_curations WHERE id=$1 FOR UPDATE',
          [input.curationId],
        ),
      );
      this.validate(row, bound);
      if (
        input.bundleId !== row.bundle_id ||
        input.draftId !== row.draft_id ||
        input.snapshotHash !== row.snapshot_hash ||
        input.sourceRevision !== row.source_revision ||
        input.contentHash !== row.content_hash ||
        input.reviewId !== row.review_id ||
        input.reviewHash !== row.review_hash
      )
        throw invalid();
      if (row.status !== 'pending') {
        if (
          row.status !== input.status ||
          row.reason_code !== input.reasonCode ||
          row.actor_label !== input.actorLabel
        )
          throw new DomainError(
            'PUBLIC_CONTENT_CURATION_DECIDED',
            'Full curation is immutable.',
            409,
          );
        return this.view(bound, row);
      }
      const [updated] = await tx.query<Row>(
        'UPDATE aw_public_content_curations SET status=$1,reason_code=$2,actor_label=$3,decided_at=now() WHERE id=$4 RETURNING *',
        [input.status, input.reasonCode, input.actorLabel, input.curationId],
      );
      return this.view(bound, updated);
    });
  }
  async pending() {
    const rows = await this.db.query<Row>(
      "SELECT c.* FROM aw_public_content_curations c JOIN aw_publication_drafts d ON d.id=c.draft_id JOIN aw_branches b ON b.id=d.branch_id JOIN ff_users u ON u.id=c.user_id WHERE c.status='pending' AND d.expires_at>now() AND b.revision=c.source_revision AND u.status='active' ORDER BY c.created_at,c.id LIMIT 20",
    );
    const result = [];
    for (const row of rows) {
      try {
        const item = await this.db.transaction(async (tx) => {
          const bound = await this.bound(tx, row.user_id, row.bundle_id);
          const [current] = await tx.query<Row>(
            'SELECT * FROM aw_public_content_curations WHERE id=$1 AND status=$2',
            [row.id, 'pending'],
          );
          if (!current) return null;
          this.validate(current, bound);
          return {
            curationId: row.id,
            ownerId: row.user_id,
            curationVersion: PUBLIC_CONTENT_CURATION_VERSION,
            scope: 'story_and_selected_checkpoints',
            publicationApproved: false,
            bundle: bound.bundle,
            review: bound.review,
            reviewHash: bound.reviewHash,
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
