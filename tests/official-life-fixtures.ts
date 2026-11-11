// Isolated simulated receipts/accounting only. No provider call, real Official story or seed.
import { randomUUID } from 'node:crypto';
import type { LifeAiProvider, AiReceipt } from '@future-flow/ai';
import { hash } from '@future-flow/core';
import {
  OfficialLifeRepository,
  DatabaseAiBudget,
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
import { periodFixture, chapterFixture, lifeTestAi } from './life-fixtures';
import {
  scenarioReleaseFixture,
  completeScenarioFixture,
  scenarioDecision,
  scenarioGrant,
  scenarioReleaseTestConfig,
} from './scenario-release-fixtures';
export async function officialLifeFixture(db: Database, owner?: string) {
  const f = await scenarioReleaseFixture(db, owner);
  const completed = await completeScenarioFixture(db, f, true);
  const curated = await f.release.decide(scenarioDecision(f, completed.view));
  const source = await f.release.grant(scenarioGrant(f, curated));
  const official = new OfficialLifeRepository(db, true);
  const request = {
    scenarioVersionId: f.version.id,
    scenarioGrantId: source.sourceGrant!.id,
    templateHash: f.version.templateHash,
    acknowledged: true,
  };
  return { ...f, official, source, startRequest: request };
}
export async function simulatedReceipt(
  db: Database,
  userId: string,
  jobId: string,
  task: AiReceipt['task'],
  input: unknown,
  output: unknown,
) {
  const budget = new DatabaseAiBudget(
    db,
    userId,
    jobId,
    scenarioReleaseTestConfig,
  );
  const reservation = await budget.reserve({
    model: 'gpt-6.1-sol',
    max_output_tokens: 2200,
    text: { format: { name: task } },
  });
  await budget.settle(reservation, { input_tokens: 32, output_tokens: 12 });
  return {
    task,
    promptVersion: `${task}.${task === 'life_fidelity' ? 'v3' : task === 'public_content_review' ? 'v1' : 'v4'}.en`,
    locale: 'en' as const,
    model: 'gpt-6.1-sol',
    requestId: `isolated-technical-${randomUUID()}`,
    inputHash: hash(input),
    outputHash: hash(output),
    inputTokens: 32,
    outputTokens: 12,
    latencyMs: 0,
  };
}
export async function processOfficialFixture(
  db: Database,
  userId: string,
  jobId: string,
  accounted = true,
  repair = false,
) {
  const [job] = await db.query<LifeJob>(
    "UPDATE aw_jobs SET status='running',attempt=1,lease_token=$1,lease_until=now()+interval '10 minutes' WHERE id=$2 AND user_id=$3 AND status='queued' RETURNING *",
    [randomUUID(), jobId, userId],
  );
  if (!job) throw Error('Technical job missing');
  let firstChapter = true;
  const ai: LifeAiProvider = {
    period: async (input, repair) => {
      const output = periodFixture(input);
      return {
        output,
        receipt: await simulatedReceipt(
          db,
          userId,
          job.id,
          'life_period',
          { ...input, repair: repair ?? null },
          output,
        ),
      };
    },
    periodChapter: async (input, repair) => {
      const output = chapterFixture(input);
      if (repair === undefined && firstChapter && repairMode)
        output.decisionId = randomUUID();
      firstChapter = false;
      return {
        output,
        receipt: await simulatedReceipt(
          db,
          userId,
          job.id,
          'life_chapter',
          { ...input, repair: repair ?? null },
          output,
        ),
      };
    },
    checkPeriodChapter: async (input, chapter) => {
      const output = { valid: true, issues: [] };
      return {
        output,
        receipt: await simulatedReceipt(
          db,
          userId,
          job.id,
          'life_fidelity',
          { ...input, chapter },
          output,
        ),
      };
    },
  };
  const repairMode = repair;
  await processLifeJob(
    job,
    new LifeJobRepository(db),
    accounted ? ai : lifeTestAi,
  );
  return job;
}
export async function officialBundleFixture(
  db: Database,
  f: Awaited<ReturnType<typeof officialLifeFixture>>,
  created: { branchId: string },
  reviewAccounted = true,
  editedTitle?: string,
  includeCheckpoint = false,
) {
  const lives = new LifeRepository(db),
    drafts = new PublicDraftRepository(db),
    workspace = await drafts.workspace(f.owner, created.branchId);
  const copy = structuredClone(workspace.source.copy);
  if (editedTitle !== undefined) copy.title = editedTitle;
  const preview = await drafts.prepare(
    f.owner,
    created.branchId,
    workspace.source.sourceRevision,
    copy,
    randomUUID(),
  );
  const selectedCheckpointIds: string[] = [];
  if (includeCheckpoint) {
    const forks = new PublicForkCheckpointRepository(db, true),
      [candidate] = await forks.candidates(f.owner, preview.draftId);
    if (!candidate) throw Error('Technical fork checkpoint missing');
    const saved = await forks.save(
      f.owner,
      preview.draftId,
      {
        snapshotHash: preview.snapshotHash,
        sourceRevision: preview.sourceRevision,
        checkpoint: candidate.checkpoint,
      },
      randomUUID(),
    );
    selectedCheckpointIds.push(saved.checkpointId);
  }
  const bundle = await new PublicContentRepository(db, true).save(
    f.owner,
    preview.draftId,
    {
      snapshotHash: preview.snapshotHash,
      sourceRevision: preview.sourceRevision,
      selectedCheckpointIds,
      acknowledged: true,
    },
    randomUUID(),
  );
  const reviews = new PublicContentReviewJobRepository(db, {
      enabled: true,
      ...scenarioReleaseTestConfig,
    }),
    curations = new PublicContentCurationRepository(db, true);
  const queued = await reviews.enqueue(
    f.owner,
    bundle.bundleId,
    {
      contentHash: bundle.contentHash,
      policyVersion: 'public-content-review-1',
      acknowledged: true,
    },
    randomUUID(),
  );
  const [job] = await db.query<PublicContentReviewJob>(
    "UPDATE aw_public_content_reviews SET status='running',lease_token=$1,lease_until=now()+interval '10 minutes' WHERE id=$2 AND status='queued' RETURNING *",
    [randomUUID(), queued.job!.id],
  );
  if (!job) throw Error('Review missing');
  const input = await reviews.input(job),
    output = {
      policyVersion: 'public-content-review-1',
      scope: 'story_and_selected_checkpoints',
      publicationApproved: false,
      contentHash: bundle.contentHash,
      verdict: 'no_findings',
      findings: [],
    };
  const receipt = reviewAccounted
    ? await simulatedReceipt(
        db,
        f.owner,
        job.id,
        'public_content_review',
        input,
        output,
      )
    : {
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
      };
  await reviews.complete(job, output, receipt);
  const submitted = await curations.submit(
    f.owner,
    bundle.bundleId,
    {
      contentHash: bundle.contentHash,
      reviewId: job.id,
      reviewHash: hash(output),
      policyVersion: 'public-content-review-1',
      curationVersion: 'public-content-curation-1',
      acknowledged: true,
    },
    randomUUID(),
  );
  await curations.decide({
    curationId: submitted.curation!.id,
    bundleId: bundle.bundleId,
    draftId: bundle.draftId,
    snapshotHash: bundle.snapshotHash,
    sourceRevision: bundle.sourceRevision,
    contentHash: bundle.contentHash,
    reviewId: job.id,
    reviewHash: hash(output),
    policyVersion: 'public-content-review-1',
    curationVersion: 'public-content-curation-1',
    status: 'content_reviewed',
    reasonCode: null,
    actorLabel: 'Isolated technical curator',
    privacyChecked: true,
    contentChecked: true,
    consistencyChecked: true,
  });
  return { lives, drafts, preview, bundle, reviews, curations };
}
export function officialGrant(
  inspected: Awaited<ReturnType<OfficialLifeRepository['inspect']>>,
) {
  return {
    sourceVersion: 'official-life-source-1',
    binding: inspected.evidence.binding,
    evidenceHash: inspected.evidenceHash,
    fictionalSourceChecked: true,
    rightsChecked: true,
    qualityChecked: true,
    acknowledged: true,
    actorLabel: 'Isolated technical origin review',
  };
}
