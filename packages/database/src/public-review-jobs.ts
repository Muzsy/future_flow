import { randomUUID } from 'node:crypto';
import {
  PUBLIC_REVIEW_VERSION,
  publicReviewJobRequestSchema,
  publicReviewJobViewSchema,
  type PublicReviewJobRequest,
} from '@future-flow/contracts';
import { DomainError, hash, preparePublicReviewInput } from '@future-flow/core';
import type { Database } from './index';
import { PublicDraftRepository } from './public-drafts';
import { PublicReviewRepository } from './public-reviews';

export type PublicReviewJobConfig = {
  enabled: boolean;
  daily: number;
  projectUsd: number;
  userUsd: number;
};
export function publicReviewJobConfigFromEnv(): PublicReviewJobConfig {
  const flag = process.env.PUBLIC_REVIEW_JOBS_ENABLED ?? 'false';
  if (!['true', 'false'].includes(flag))
    throw new Error('Invalid public review flag');
  const config = {
    enabled: flag === 'true',
    daily: Number(process.env.PUBLIC_REVIEW_DAILY_LIMIT ?? 5),
    projectUsd: Number(process.env.AI_PROJECT_BUDGET_USD ?? 0),
    userUsd: Number(process.env.AI_USER_BUDGET_USD ?? 0),
  };
  validateConfig(config);
  return config;
}
function validateConfig(config: PublicReviewJobConfig) {
  if (
    !Number.isInteger(config.daily) ||
    config.daily < 1 ||
    config.daily > 100 ||
    !Number.isFinite(config.projectUsd) ||
    config.projectUsd < 0 ||
    !Number.isFinite(config.userUsd) ||
    config.userUsd < 0
  )
    throw new Error('Invalid public review configuration');
}
export type PublicReviewJob = Record<string, unknown> & {
  id: string;
  user_id: string;
  draft_id: string;
  review_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  lease_token: string | null;
  lease_until: Date | null;
};
const disabled = { enabled: false, daily: 5, projectUsd: 0, userUsd: 0 };
export class PublicReviewJobRepository {
  constructor(
    private readonly db: Database,
    private readonly config: PublicReviewJobConfig = disabled,
    private readonly leaseSeconds = 180,
  ) {
    validateConfig(config);
    if (!Number.isFinite(leaseSeconds) || leaseSeconds < 60)
      throw new Error('Invalid public review lease');
  }
  private get enabled() {
    return (
      this.config.enabled &&
      this.config.projectUsd > 0 &&
      this.config.userUsd > 0
    );
  }
  private view(
    preview: { snapshotHash: string; sourceRevision: number },
    job?: PublicReviewJob,
  ) {
    return publicReviewJobViewSchema.parse({
      ...preview,
      policyVersion: PUBLIC_REVIEW_VERSION,
      publicationApproved: false,
      enabled: this.enabled,
      job: job ? { id: job.id, status: job.status } : null,
    });
  }
  private async stop(tx: Database, job: PublicReviewJob, cancelled = false) {
    await tx.query(
      "UPDATE aw_public_review_jobs SET status=$1,lease_token=NULL,lease_until=NULL,finished_at=now() WHERE id=$2 AND status IN ('queued','running')",
      [cancelled ? 'cancelled' : 'failed', job.id],
    );
    await tx.query(
      "UPDATE aw_public_draft_reviews SET status='failed',failure_code='PUBLIC_REVIEW_INTERRUPTED',finished_at=now() WHERE id=$1 AND status='running'",
      [job.review_id],
    );
  }
  // Caller holds the owner lock. Expired work is failed, never requeued or charged again.
  private async expire(tx: Database, userId: string) {
    const stale = await tx.query<PublicReviewJob>(
      `SELECT j.* FROM aw_public_review_jobs j JOIN aw_publication_drafts d ON d.id=j.draft_id
      JOIN aw_branches b ON b.id=d.branch_id WHERE j.user_id=$1 AND
      ((j.status='running' AND j.lease_until<=now()) OR (j.status='queued' AND (d.expires_at<=now() OR d.source_revision<>b.revision))) FOR UPDATE OF j`,
      [userId],
    );
    for (const job of stale) await this.stop(tx, job);
  }
  async get(userId: string, draftId: string) {
    return this.db.transaction(async (tx) => {
      // Review validation takes owner -> source-branch locks and checks English/Shared/expiry/hash.
      await new PublicReviewRepository(tx).get(userId, draftId);
      const preview = await new PublicDraftRepository(tx).get(userId, draftId);
      await this.expire(tx, userId);
      const [job] = await tx.query<PublicReviewJob>(
        'SELECT * FROM aw_public_review_jobs WHERE draft_id=$1 AND user_id=$2',
        [draftId, userId],
      );
      return this.view(
        {
          snapshotHash: preview.snapshotHash,
          sourceRevision: preview.sourceRevision,
        },
        job,
      );
    });
  }
  async enqueue(
    userId: string,
    draftId: string,
    raw: PublicReviewJobRequest,
    key: string,
  ) {
    const request = publicReviewJobRequestSchema.parse(raw);
    if (!/^[a-zA-Z0-9_-]{8,120}$/.test(key))
      throw new DomainError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'A request key is required.',
        400,
      );
    return this.db.transaction(async (tx) => {
      const reviews = new PublicReviewRepository(tx);
      const review = await reviews.get(userId, draftId);
      const preview = await new PublicDraftRepository(tx).get(userId, draftId);
      const binding = {
        snapshotHash: preview.snapshotHash,
        sourceRevision: preview.sourceRevision,
      };
      if (
        request.snapshotHash !== binding.snapshotHash ||
        request.sourceRevision !== binding.sourceRevision
      )
        throw new DomainError(
          'PUBLIC_REVIEW_INVALID',
          'Review request does not match this copy.',
          409,
        );
      const requestHash = hash({ draftId, ...request });
      const [prior] = await tx.query<{ input_hash: string }>(
        'SELECT input_hash FROM ff_idempotency WHERE user_id=$1 AND scope=$2 AND key=$3',
        [userId, 'public-review-job', key],
      );
      if (prior && prior.input_hash !== requestHash)
        throw new DomainError(
          'IDEMPOTENCY_CONFLICT',
          'Request key was reused.',
          409,
        );
      await this.expire(tx, userId);
      const [existing] = await tx.query<PublicReviewJob>(
        'SELECT * FROM aw_public_review_jobs WHERE draft_id=$1 AND user_id=$2',
        [draftId, userId],
      );
      if (existing || review.status === 'completed') {
        if (!prior)
          await tx.query(
            'INSERT INTO ff_idempotency(user_id,scope,key,input_hash,response) VALUES($1,$2,$3,$4,$5)',
            [userId, 'public-review-job', key, requestHash, { draftId }],
          );
        return this.view(binding, existing);
      }
      if (review.status !== 'not_started')
        throw new DomainError(
          'PUBLIC_REVIEW_ALREADY_STARTED',
          'Prepare a new copy.',
          409,
        );
      if (!this.enabled)
        throw new DomainError(
          'PUBLIC_REVIEW_DISABLED',
          'Paid reviews are disabled.',
          503,
        );
      const [limits] = await tx.query<{ daily: string; concurrent: string }>(
        `SELECT count(*) FILTER(WHERE created_at>now()-interval '24 hours')::text AS daily,
        count(*) FILTER(WHERE status IN ('queued','running'))::text AS concurrent FROM aw_public_review_jobs WHERE user_id=$1`,
        [userId],
      );
      if (
        Number(limits!.daily) >= this.config.daily ||
        Number(limits!.concurrent) >= 1
      )
        throw new DomainError(
          'PUBLIC_REVIEW_LIMIT',
          'Review limit reached.',
          429,
        );
      const started = await reviews.start(userId, draftId);
      const [job] = await tx.query<PublicReviewJob>(
        'INSERT INTO aw_public_review_jobs(id,user_id,draft_id,review_id) VALUES($1,$2,$3,$4) RETURNING *',
        [randomUUID(), userId, draftId, started.reviewId],
      );
      await tx.query(
        'INSERT INTO ff_idempotency(user_id,scope,key,input_hash,response) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,scope,key) DO NOTHING',
        [userId, 'public-review-job', key, requestHash, { draftId }],
      );
      return this.view(binding, job);
    });
  }
  private async lock(tx: Database, candidate: PublicReviewJob, skip = false) {
    const [user] = await tx.query<{ status: string }>(
      `SELECT status FROM ff_users WHERE id=$1 FOR UPDATE${skip ? ' SKIP LOCKED' : ''}`,
      [candidate.user_id],
    );
    if (!user) return null;
    await tx.query(
      'SELECT b.id FROM aw_branches b JOIN aw_publication_drafts d ON d.branch_id=b.id WHERE d.id=$1 AND d.user_id=$2 FOR UPDATE OF b',
      [candidate.draft_id, candidate.user_id],
    );
    const [job] = await tx.query<PublicReviewJob>(
      'SELECT * FROM aw_public_review_jobs WHERE id=$1 AND user_id=$2 FOR UPDATE',
      [candidate.id, candidate.user_id],
    );
    return job ? { job, active: user.status === 'active' } : null;
  }
  async claim(): Promise<PublicReviewJob | null> {
    if (!this.enabled) return null;
    const candidates = await this.db.query<PublicReviewJob>(
      "SELECT * FROM aw_public_review_jobs WHERE status='queued' OR (status='running' AND lease_until<=now()) ORDER BY created_at LIMIT 20",
    );
    for (const candidate of candidates) {
      const claimed = await this.db.transaction(async (tx) => {
        const locked = await this.lock(tx, candidate, true);
        if (!locked || !['queued', 'running'].includes(locked.job.status))
          return null;
        const job = locked.job;
        if (job.status === 'running') {
          const [expired] = await tx.query(
            'SELECT id FROM aw_public_review_jobs WHERE id=$1 AND lease_until<=now()',
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
          if (!(error instanceof DomainError)) throw error;
          await this.stop(tx, job);
          return null;
        }
        const [running] = await tx.query<PublicReviewJob>(
          "UPDATE aw_public_review_jobs SET status='running',lease_token=$1,lease_until=now()+$2*interval '1 second' WHERE id=$3 RETURNING *",
          [randomUUID(), this.leaseSeconds, job.id],
        );
        return running!;
      });
      if (claimed) return claimed;
    }
    return null;
  }
  private async validInput(tx: Database, job: PublicReviewJob) {
    const review = await new PublicReviewRepository(tx).get(
      job.user_id,
      job.draft_id,
    );
    if (review.status !== 'running')
      throw new DomainError(
        'PUBLIC_REVIEW_INVALID',
        'Review is not pending.',
        409,
      );
    const preview = await new PublicDraftRepository(tx).get(
      job.user_id,
      job.draft_id,
    );
    return preparePublicReviewInput(preview.snapshot);
  }
  private async leased(tx: Database, job: PublicReviewJob) {
    const locked = await this.lock(tx, job);
    const [lease] = await tx.query(
      'SELECT id FROM aw_public_review_jobs WHERE id=$1 AND status=$2 AND lease_token=$3 AND lease_until>now()',
      [job.id, 'running', job.lease_token],
    );
    if (!locked?.active || !lease)
      throw new DomainError('JOB_LEASE_LOST', 'Review lease was lost.', 409);
    return locked.job;
  }
  async input(job: PublicReviewJob) {
    return this.db.transaction(async (tx) => {
      await this.leased(tx, job);
      return this.validInput(tx, job);
    });
  }
  async heartbeat(job: PublicReviewJob) {
    const rows = await this.db.query(
      "UPDATE aw_public_review_jobs j SET lease_until=now()+$1*interval '1 second' FROM ff_users u WHERE j.id=$2 AND j.lease_token=$3 AND j.status='running' AND j.lease_until>now() AND u.id=j.user_id AND u.status='active' RETURNING j.id",
      [this.leaseSeconds, job.id, job.lease_token],
    );
    if (!rows.length)
      throw new DomainError('JOB_LEASE_LOST', 'Review lease was lost.', 409);
  }
  async complete(job: PublicReviewJob, report: unknown, receipt: unknown) {
    await this.db.transaction(async (tx) => {
      await this.leased(tx, job);
      await new PublicReviewRepository(tx).complete(
        job.user_id,
        job.draft_id,
        job.review_id,
        report,
        receipt,
      );
      await tx.query(
        "UPDATE aw_public_review_jobs SET status='completed',lease_token=NULL,lease_until=NULL,finished_at=now() WHERE id=$1",
        [job.id],
      );
    });
  }
  async fail(job: PublicReviewJob) {
    await this.db.transaction(async (tx) => {
      const locked = await this.lock(tx, job);
      if (
        locked?.job.status !== 'running' ||
        locked.job.lease_token !== job.lease_token
      )
        return;
      await this.stop(tx, locked.job);
    });
  }
}
