// Technical fixtures only: no real provider call, editorial approval or Official seed.
import { randomUUID } from 'node:crypto';
import {
  PUBLIC_CONTENT_CURATION_VERSION,
  PUBLIC_CONTENT_REVIEW_VERSION,
} from '@future-flow/contracts';
import { hash, instantiateScenarioTemplate } from '@future-flow/core';
import {
  Repository,
  LifeRepository,
  LifeJobRepository,
  PublicDraftRepository,
  PublicForkCheckpointRepository,
  PublicContentRepository,
  PublicContentReviewJobRepository,
  PublicContentCurationRepository,
  type Database,
  type LifeJob,
  type PublicContentReviewJob,
} from '@future-flow/database';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { lifeTestAi } from './life-fixtures';
import { scenarioFixture } from './scenario-fixtures';
export const publicationReviewConfig = {
  enabled: true,
  daily: 5,
  projectUsd: 5,
  userUsd: 1,
};
export async function publicationFixture(db: Database, owner = randomUUID()) {
  const repo = new Repository(db);
  await repo.ensureUser(owner);
  await repo.acceptPrivacy(owner);
  const lives = new LifeRepository(db),
    created = await lives.createPrepared(
      owner,
      instantiateScenarioTemplate(scenarioFixture()),
      randomUUID(),
    ),
    jobs = new LifeJobRepository(db);
  const [ownJob] = await db.query<LifeJob>(
    "UPDATE aw_jobs SET status='running',attempt=1,lease_token=$1,lease_until=now()+interval '10 minutes' WHERE id=$2 AND user_id=$3 AND status='queued' RETURNING *",
    [randomUUID(), created.jobId, owner],
  );
  if (!ownJob) throw Error('Technical fixture job unavailable');
  await processLifeJob(ownJob, jobs, lifeTestAi);
  const drafts = new PublicDraftRepository(db),
    workspace = await drafts.workspace(owner, created.branchId),
    preview = await drafts.prepare(
      owner,
      created.branchId,
      workspace.source.sourceRevision,
      workspace.source.copy,
      randomUUID(),
    );
  const forks = new PublicForkCheckpointRepository(db, true),
    [candidate] = await forks.candidates(owner, preview.draftId);
  const checkpoint = await forks.save(
    owner,
    preview.draftId,
    {
      snapshotHash: preview.snapshotHash,
      sourceRevision: preview.sourceRevision,
      checkpoint: candidate!.checkpoint,
    },
    randomUUID(),
  );
  const bundle = await new PublicContentRepository(db, true).save(
    owner,
    preview.draftId,
    {
      snapshotHash: preview.snapshotHash,
      sourceRevision: preview.sourceRevision,
      selectedCheckpointIds: [checkpoint.checkpointId],
      acknowledged: true,
    },
    randomUUID(),
  );
  const reviews = new PublicContentReviewJobRepository(
      db,
      publicationReviewConfig,
    ),
    curations = new PublicContentCurationRepository(db, true);
  return {
    owner,
    lives,
    created,
    preview,
    bundle,
    jobs,
    drafts,
    reviews,
    curations,
  };
}
export async function approvePublicationFixture(
  db: Database,
  f: Awaited<ReturnType<typeof publicationFixture>>,
  verdict: 'no_findings' | 'unable_to_assess' = 'no_findings',
) {
  const queued = await f.reviews.enqueue(
    f.owner,
    f.bundle.bundleId,
    {
      contentHash: f.bundle.contentHash,
      policyVersion: PUBLIC_CONTENT_REVIEW_VERSION,
      acknowledged: true,
    },
    randomUUID(),
  );
  const [job] = await db.query<PublicContentReviewJob>(
    "UPDATE aw_public_content_reviews SET status='running',lease_token=$1,lease_until=now()+interval '10 minutes' WHERE id=$2 AND user_id=$3 AND status='queued' RETURNING *",
    [randomUUID(), queued.job!.id, f.owner],
  );
  if (!job) throw Error('Technical full review job unavailable');
  const input = await f.reviews.input(job);
  const output = {
    policyVersion: PUBLIC_CONTENT_REVIEW_VERSION,
    scope: 'story_and_selected_checkpoints',
    publicationApproved: false,
    contentHash: f.bundle.contentHash,
    verdict,
    findings: [],
  };
  await f.reviews.complete(job, output, {
    task: 'public_content_review',
    promptVersion: 'public_content_review.v1.en',
    locale: 'en',
    model: 'isolated-no-provider',
    requestId: null,
    inputHash: hash(input),
    outputHash: hash(output),
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
  });
  if (verdict !== 'no_findings') return null;
  const binding = {
    bundleId: f.bundle.bundleId,
    contentHash: f.bundle.contentHash,
    sourceRevision: f.bundle.sourceRevision,
    reviewId: job.id,
    reviewHash: hash(output),
    policyVersion: PUBLIC_CONTENT_REVIEW_VERSION,
    curationId: '',
    curationVersion: PUBLIC_CONTENT_CURATION_VERSION,
  };
  const submitted = await f.curations.submit(
    f.owner,
    f.bundle.bundleId,
    {
      contentHash: binding.contentHash,
      reviewId: binding.reviewId,
      reviewHash: binding.reviewHash,
      policyVersion: binding.policyVersion,
      curationVersion: binding.curationVersion,
      acknowledged: true,
    },
    randomUUID(),
  );
  binding.curationId = submitted.curation!.id;
  await f.curations.decide({
    ...binding,
    draftId: f.bundle.draftId,
    snapshotHash: f.bundle.snapshotHash,
    status: 'content_reviewed',
    reasonCode: null,
    actorLabel: 'Isolated technical test',
    privacyChecked: true,
    contentChecked: true,
    consistencyChecked: true,
  });
  return {
    binding,
    settings: {
      visibility: 'unlisted' as 'public' | 'unlisted',
      authorMode: 'anonymous' as const,
      indexable: false as const,
    },
  };
}
