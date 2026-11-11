import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  PUBLIC_CONTENT_REVIEW_VERSION,
  publicContentReviewJobRequestSchema,
  publicContentReviewJobViewSchema,
  type PublicContentView,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  preparePublicContentScanInput,
  validatePublicContentReviewReport,
} from '@future-flow/core';
import type { Database } from './index';
import { PublicContentRepository } from './public-content';
import { publicReviewLimits } from './public-review-limits';
import type { PublicReviewJobConfig } from './public-review-jobs';

export function publicContentReviewJobConfigFromEnv(): PublicReviewJobConfig {
  const flag = process.env.PUBLIC_CONTENT_REVIEW_JOBS_ENABLED ?? 'false';
  if (!['true', 'false'].includes(flag))
    throw new Error('Invalid full content review flag');
  return {
    enabled: flag === 'true',
    daily: Number(process.env.PUBLIC_REVIEW_DAILY_LIMIT ?? 5),
    projectUsd: Number(process.env.AI_PROJECT_BUDGET_USD ?? 0),
    userUsd: Number(process.env.AI_USER_BUDGET_USD ?? 0),
  };
}
const receiptSchema = z
  .object({
    task: z.literal('public_content_review'),
    promptVersion: z.literal('public_content_review.v1.en'),
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
export type PublicContentReviewJob = Record<string, unknown> & {
  id: string;
  user_id: string;
  draft_id: string;
  bundle_id: string;
  snapshot_hash: string;
  source_revision: number;
  content_hash: string;
  input_hash: string;
  policy_version: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  lease_token: string | null;
  lease_until: Date | null;
  report: unknown;
  report_hash: string | null;
  receipt: unknown;
};
const disabled = { enabled: false, daily: 5, projectUsd: 0, userUsd: 0 };
const invalid = () =>
  new DomainError(
    'PUBLIC_CONTENT_REVIEW_INVALID',
    'Review binding is invalid.',
    409,
  );
// The immutable attempt is also the queue record: one paid attempt per bundle/policy.
export class PublicContentReviewJobRepository {
  constructor(
    private readonly db: Database,
    private readonly config: PublicReviewJobConfig = disabled,
    private readonly leaseSeconds = 180,
  ) {
    if (
      !Number.isInteger(config.daily) ||
      config.daily < 1 ||
      config.daily > 100 ||
      !Number.isFinite(config.projectUsd) ||
      config.projectUsd < 0 ||
      config.projectUsd > 100000 ||
      !Number.isFinite(config.userUsd) ||
      config.userUsd < 0 ||
      config.userUsd > 100000 ||
      !Number.isFinite(leaseSeconds) ||
      leaseSeconds < 60
    )
      throw new Error('Invalid full content review configuration');
  }
  private get enabled() {
    return (
      this.config.enabled &&
      this.config.projectUsd > 0 &&
      this.config.userUsd > 0
    );
  }
  private validate(row: PublicContentReviewJob, bundle: PublicContentView) {
    const input = preparePublicContentScanInput(bundle.content);
    if (
      row.bundle_id !== bundle.bundleId ||
      row.draft_id !== bundle.draftId ||
      row.policy_version !== PUBLIC_CONTENT_REVIEW_VERSION ||
      row.snapshot_hash !== bundle.snapshotHash ||
      row.source_revision !== bundle.sourceRevision ||
      row.content_hash !== bundle.contentHash ||
      row.input_hash !== hash(input)
    )
      throw invalid();
    if (row.status === 'completed') {
      const report = validatePublicContentReviewReport(
          row.report,
          bundle.content,
        ),
        receipt = receiptSchema.parse(row.receipt);
      if (
        row.report_hash !== hash(report) ||
        receipt.outputHash !== row.report_hash ||
        receipt.inputHash !== row.input_hash
      )
        throw invalid();
    }
    return input;
  }
  private view(bundle: PublicContentView, row?: PublicContentReviewJob) {
    const input = row
      ? this.validate(row, bundle)
      : preparePublicContentScanInput(bundle.content);
    return publicContentReviewJobViewSchema.parse({
      bundleId: bundle.bundleId,
      draftId: bundle.draftId,
      snapshotHash: bundle.snapshotHash,
      sourceRevision: bundle.sourceRevision,
      contentHash: bundle.contentHash,
      policyVersion: PUBLIC_CONTENT_REVIEW_VERSION,
      publicationApproved: false,
      enabled: this.enabled,
      job: row ? { id: row.id, status: row.status } : null,
      report: row?.status === 'completed' ? row.report : null,
      fields: input.fields,
    });
  }
  private async stop(
    tx: Database,
    row: PublicContentReviewJob,
    cancelled = false,
  ) {
    await tx.query(
      "UPDATE aw_public_content_reviews SET status=$1,lease_token=NULL,lease_until=NULL,finished_at=now(),failure_code='PUBLIC_CONTENT_REVIEW_INTERRUPTED' WHERE id=$2 AND status IN ('queued','running')",
      [cancelled ? 'cancelled' : 'failed', row.id],
    );
  }
  async get(userId: string, bundleId: string) {
    return this.db.transaction(async (tx) => {
      const bundle = await new PublicContentRepository(tx).get(
        userId,
        bundleId,
      );
      await publicReviewLimits(tx, userId);
      const [row] = await tx.query<PublicContentReviewJob>(
        'SELECT * FROM aw_public_content_reviews WHERE bundle_id=$1 AND user_id=$2 AND policy_version=$3',
        [bundleId, userId, PUBLIC_CONTENT_REVIEW_VERSION],
      );
      return this.view(bundle, row);
    });
  }
  async enqueue(userId: string, bundleId: string, raw: unknown, key: string) {
    const request = publicContentReviewJobRequestSchema.parse(raw);
    if (!/^[a-zA-Z0-9_-]{8,120}$/.test(key))
      throw new DomainError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'A request key is required.',
        400,
      );
    return this.db.transaction(async (tx) => {
      const bundle = await new PublicContentRepository(tx).get(
          userId,
          bundleId,
        ),
        input = preparePublicContentScanInput(bundle.content);
      if (request.contentHash !== bundle.contentHash) throw invalid();
      const requestHash = hash({ bundleId, ...request }),
        scope = 'public-content-review-job';
      const [prior] = await tx.query<{ input_hash: string }>(
        'SELECT input_hash FROM ff_idempotency WHERE user_id=$1 AND scope=$2 AND key=$3',
        [userId, scope, key],
      );
      if (prior && prior.input_hash !== requestHash)
        throw new DomainError(
          'IDEMPOTENCY_CONFLICT',
          'Request key was reused.',
          409,
        );
      const limits = await publicReviewLimits(tx, userId);
      let [row] = await tx.query<PublicContentReviewJob>(
        'SELECT * FROM aw_public_content_reviews WHERE bundle_id=$1 AND user_id=$2 AND policy_version=$3',
        [bundleId, userId, PUBLIC_CONTENT_REVIEW_VERSION],
      );
      if (!row) {
        if (!this.enabled)
          throw new DomainError(
            'PUBLIC_CONTENT_REVIEW_DISABLED',
            'Paid full content reviews are disabled.',
            503,
          );
        if (
          Number(limits.daily) >= this.config.daily ||
          Number(limits.concurrent) >= 1
        )
          throw new DomainError(
            'PUBLIC_REVIEW_LIMIT',
            'Review limit reached.',
            429,
          );
        [row] = await tx.query<PublicContentReviewJob>(
          'INSERT INTO aw_public_content_reviews(id,user_id,draft_id,bundle_id,source_revision,snapshot_hash,content_hash,input_hash,policy_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
          [
            randomUUID(),
            userId,
            bundle.draftId,
            bundleId,
            bundle.sourceRevision,
            bundle.snapshotHash,
            bundle.contentHash,
            hash(input),
            PUBLIC_CONTENT_REVIEW_VERSION,
          ],
        );
      }
      const view = this.view(bundle, row);
      if (!prior)
        await tx.query(
          'INSERT INTO ff_idempotency(user_id,scope,key,input_hash,response) VALUES($1,$2,$3,$4,$5)',
          [userId, scope, key, requestHash, { bundleId }],
        );
      return view;
    });
  }
  private async lock(
    tx: Database,
    candidate: PublicContentReviewJob,
    skip = false,
  ) {
    const [user] = await tx.query<{ status: string }>(
      'SELECT status FROM ff_users WHERE id=$1 FOR UPDATE' +
        (skip ? ' SKIP LOCKED' : ''),
      [candidate.user_id],
    );
    if (!user) return null;
    // Keep the deletion/source-change lock order used by both review queues.
    await tx.query(
      'SELECT b.id FROM aw_branches b JOIN aw_publication_drafts d ON d.branch_id=b.id WHERE d.id=$1 AND d.user_id=$2 FOR UPDATE OF b',
      [candidate.draft_id, candidate.user_id],
    );
    const [job] = await tx.query<PublicContentReviewJob>(
      'SELECT * FROM aw_public_content_reviews WHERE id=$1 AND user_id=$2 FOR UPDATE',
      [candidate.id, candidate.user_id],
    );
    return job ? { job, active: user.status === 'active' } : null;
  }
  private async validInput(tx: Database, job: PublicContentReviewJob) {
    if (job.status !== 'queued' && job.status !== 'running') throw invalid();
    const bundle = await new PublicContentRepository(tx).get(
      job.user_id,
      job.bundle_id,
    );
    return this.validate(job, bundle);
  }
  async claim() {
    if (!this.enabled) return null;
    const candidates = await this.db.query<PublicContentReviewJob>(
      "SELECT * FROM aw_public_content_reviews WHERE status='queued' OR (status='running' AND lease_until<=now()) ORDER BY created_at,id LIMIT 20",
    );
    for (const candidate of candidates) {
      const result = await this.db.transaction(async (tx) => {
        const locked = await this.lock(tx, candidate, true);
        if (!locked || !['queued', 'running'].includes(locked.job.status))
          return null;
        const job = locked.job;
        if (job.status === 'running') {
          const [expired] = await tx.query(
            'SELECT id FROM aw_public_content_reviews WHERE id=$1 AND lease_until<=now()',
            [job.id],
          );
          if (expired) await this.stop(tx, job);
          return null;
        }
        if (!locked.active) {
          await this.stop(tx, job, true);
          return null;
        }
        try {
          await this.validInput(tx, job);
        } catch (error) {
          if (!(error instanceof DomainError) && !(error instanceof z.ZodError))
            throw error;
          await this.stop(tx, job);
          return null;
        }
        const [running] = await tx.query<PublicContentReviewJob>(
          "UPDATE aw_public_content_reviews SET status='running',lease_token=$1,lease_until=now()+$2*interval '1 second' WHERE id=$3 RETURNING *",
          [randomUUID(), this.leaseSeconds, job.id],
        );
        return running!;
      });
      if (result) return result;
    }
    return null;
  }
  private async leased(tx: Database, candidate: PublicContentReviewJob) {
    const locked = await this.lock(tx, candidate);
    const [lease] = await tx.query(
      "SELECT id FROM aw_public_content_reviews WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_until>now()",
      [candidate.id, candidate.lease_token],
    );
    if (!locked?.active || !lease)
      throw new DomainError(
        'JOB_LEASE_LOST',
        'Full content review lease was lost.',
        409,
      );
    return locked.job;
  }
  async input(job: PublicContentReviewJob) {
    return this.db.transaction(async (tx) =>
      this.validInput(tx, await this.leased(tx, job)),
    );
  }
  async heartbeat(job: PublicContentReviewJob) {
    const rows = await this.db.query(
      "UPDATE aw_public_content_reviews j SET lease_until=now()+$1*interval '1 second' FROM ff_users u WHERE j.id=$2 AND j.lease_token=$3 AND j.status='running' AND j.lease_until>now() AND u.id=j.user_id AND u.status='active' RETURNING j.id",
      [this.leaseSeconds, job.id, job.lease_token],
    );
    if (!rows.length)
      throw new DomainError(
        'JOB_LEASE_LOST',
        'Full content review lease was lost.',
        409,
      );
  }
  async complete(
    job: PublicContentReviewJob,
    rawReport: unknown,
    rawReceipt: unknown,
  ) {
    await this.db.transaction(async (tx) => {
      const row = await this.leased(tx, job),
        input = await this.validInput(tx, row),
        report = validatePublicContentReviewReport(rawReport, input.content),
        receipt = receiptSchema.parse(rawReceipt);
      if (
        receipt.inputHash !== row.input_hash ||
        receipt.outputHash !== hash(report)
      )
        throw invalid();
      await tx.query(
        "UPDATE aw_public_content_reviews SET status='completed',lease_token=NULL,lease_until=NULL,report=$1,report_hash=$2,receipt=$3,finished_at=now() WHERE id=$4",
        [report, hash(report), receipt, row.id],
      );
    });
  }
  async fail(job: PublicContentReviewJob) {
    await this.db.transaction(async (tx) => {
      const locked = await this.lock(tx, job);
      if (
        locked?.job.status === 'running' &&
        locked.job.lease_token === job.lease_token
      )
        await this.stop(tx, locked.job);
    });
  }
}
