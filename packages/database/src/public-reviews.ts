import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  PUBLIC_REVIEW_VERSION,
  publicReviewReportSchema,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  preparePublicReviewInput,
  validatePublicReview,
} from '@future-flow/core';
import type { Database } from './index';
import { lifeRow, LifeRepository } from './lives';
import { PublicDraftRepository } from './public-drafts';

const receiptSchema = z
  .object({
    task: z.literal('public_review'),
    promptVersion: z.string().min(1).max(120),
    locale: z.literal('en'),
    model: z.string().min(1).max(120),
    requestId: z.string().max(200).nullable(),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    outputHash: z.string().regex(/^[a-f0-9]{64}$/),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cachedInputTokens: z.number().int().nonnegative().optional(),
    cacheWriteTokens: z.number().int().nonnegative().optional(),
    reasoningTokens: z.number().int().nonnegative().optional(),
    latencyMs: z.number().nonnegative(),
  })
  .strict();
type ReviewRow = {
  id: string;
  user_id: string;
  draft_id: string;
  status: 'running' | 'completed' | 'failed';
  snapshot_hash: string;
  source_revision: number;
  input_hash: string;
  report: unknown;
  report_hash: string | null;
  policy_version: string;
};
// Only server/operator code can create or finish a review. There is no client approval route.
export class PublicReviewRepository {
  constructor(private readonly db: Database) {}
  private async preview(tx: Database, userId: string, draftId: string) {
    const user = lifeRow(
      await tx.query<{ status: string }>(
        'SELECT status FROM ff_users WHERE id=$1 FOR UPDATE',
        [userId],
      ),
    );
    if (user.status !== 'active')
      throw new DomainError('ACCOUNT_DELETING', 'Account is deleting.', 403);
    const row = lifeRow(
      await tx.query<{ branch_id: string }>(
        'SELECT branch_id FROM aw_publication_drafts WHERE id=$1 AND user_id=$2',
        [draftId, userId],
      ),
    );
    await new LifeRepository(tx).branch(userId, row.branch_id, tx, true);
    const preview = await new PublicDraftRepository(tx).get(userId, draftId);
    if (hash(preview.snapshot) !== preview.snapshotHash)
      throw new DomainError(
        'PUBLIC_REVIEW_INVALID',
        'Preview hash is invalid.',
        409,
      );
    return preview;
  }
  async start(userId: string, draftId: string) {
    return this.db.transaction(async (tx) => {
      const preview = await this.preview(tx, userId, draftId);
      const input = preparePublicReviewInput(preview.snapshot);
      const [existing] = await tx.query<ReviewRow>(
        'SELECT * FROM aw_public_draft_reviews WHERE draft_id=$1 AND user_id=$2 AND policy_version=$3',
        [draftId, userId, PUBLIC_REVIEW_VERSION],
      );
      if (existing) {
        if (existing.status !== 'completed')
          throw new DomainError(
            'PUBLIC_REVIEW_ALREADY_STARTED',
            'Prepare a new preview after a failed or interrupted review.',
            409,
          );
        this.validateStored(existing, preview, input);
        return { reviewId: existing.id, reused: true as const, input };
      }
      const id = randomUUID();
      await tx.query(
        'INSERT INTO aw_public_draft_reviews(id,user_id,draft_id,source_revision,snapshot_hash,input_hash,policy_version) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          id,
          userId,
          draftId,
          preview.sourceRevision,
          preview.snapshotHash,
          hash(input),
          PUBLIC_REVIEW_VERSION,
        ],
      );
      return { reviewId: id, reused: false as const, input };
    });
  }
  private validateStored(
    row: ReviewRow,
    preview: { snapshotHash: string; sourceRevision: number },
    input: ReturnType<typeof preparePublicReviewInput>,
  ) {
    if (
      row.policy_version !== PUBLIC_REVIEW_VERSION ||
      row.snapshot_hash !== preview.snapshotHash ||
      row.source_revision !== preview.sourceRevision ||
      row.input_hash !== hash(input)
    )
      throw new DomainError(
        'PUBLIC_REVIEW_INVALID',
        'Review binding is invalid.',
        409,
      );
    if (
      row.status === 'completed' &&
      hash(validatePublicReview(input, row.report)) !== row.report_hash
    )
      throw new DomainError(
        'PUBLIC_REVIEW_INVALID',
        'Review result is invalid.',
        409,
      );
  }
  async complete(
    userId: string,
    draftId: string,
    reviewId: string,
    rawReport: unknown,
    rawReceipt: unknown,
  ) {
    return this.db.transaction(async (tx) => {
      const preview = await this.preview(tx, userId, draftId);
      const input = preparePublicReviewInput(preview.snapshot);
      const row = lifeRow(
        await tx.query<ReviewRow>(
          'SELECT * FROM aw_public_draft_reviews WHERE id=$1 AND draft_id=$2 AND user_id=$3 FOR UPDATE',
          [reviewId, draftId, userId],
        ),
      );
      this.validateStored(row, preview, input);
      const report = validatePublicReview(input, rawReport),
        receipt = receiptSchema.parse(rawReceipt);
      if (
        receipt.inputHash !== row.input_hash ||
        receipt.outputHash !== hash(report)
      )
        throw new DomainError(
          'PUBLIC_REVIEW_INVALID',
          'Receipt does not match the reviewed content.',
          409,
        );
      if (row.status === 'completed') {
        if (row.report_hash !== hash(report))
          throw new DomainError(
            'PUBLIC_REVIEW_INVALID',
            'Review result is immutable.',
            409,
          );
        return { completed: true as const };
      }
      if (row.status !== 'running')
        throw new DomainError(
          'PUBLIC_REVIEW_ALREADY_STARTED',
          'Review cannot be restarted.',
          409,
        );
      await tx.query(
        "UPDATE aw_public_draft_reviews SET status='completed',report=$1,report_hash=$2,receipt=$3,finished_at=now() WHERE id=$4",
        [report, hash(report), receipt, reviewId],
      );
      return { completed: true as const };
    });
  }
  async fail(userId: string, draftId: string, reviewId: string) {
    // Do not persist provider error messages, prompts or any private data.
    await this.db.query(
      "UPDATE aw_public_draft_reviews SET status='failed',failure_code='PUBLIC_REVIEW_FAILED',finished_at=now() WHERE id=$1 AND draft_id=$2 AND user_id=$3 AND status='running'",
      [reviewId, draftId, userId],
    );
  }
  async get(userId: string, draftId: string) {
    return this.db.transaction(async (tx) => {
      const preview = await this.preview(tx, userId, draftId);
      const input = preparePublicReviewInput(preview.snapshot);
      const [row] = await tx.query<ReviewRow>(
        'SELECT * FROM aw_public_draft_reviews WHERE draft_id=$1 AND user_id=$2 AND policy_version=$3',
        [draftId, userId, PUBLIC_REVIEW_VERSION],
      );
      if (!row)
        return {
          status: 'not_started' as const,
          publicationApproved: false as const,
        };
      this.validateStored(row, preview, input);
      return {
        status: row.status,
        policyVersion: PUBLIC_REVIEW_VERSION,
        snapshotHash: row.snapshot_hash,
        sourceRevision: row.source_revision,
        publicationApproved: false as const,
        report:
          row.status === 'completed'
            ? publicReviewReportSchema.parse(row.report)
            : null,
        fields: input.fields.map(({ key, path }) => ({ key, path })),
      };
    });
  }
}
