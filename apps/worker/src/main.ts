import {
  configureWorkerChapterBilling,
  personalRequestAdmission,
  personalChapterGuard,
} from './chapter-billing';
import { withServiceUsdAlerts } from './service-budget';
import { generationQueueClaim } from './billing-queues';
import {
  connectDatabase,
  databasePoolConfigFromEnv,
  JobRepository,
  LifeJobRepository,
  SharedJobRepository,
  DatabaseAiBudget,
  applicationAiBudgetConfigFromEnv,
  PublicReviewJobRepository,
  publicReviewJobConfigFromEnv,
  PublicContentReviewJobRepository,
  publicContentReviewJobConfigFromEnv,
  cleanupExpiredPublicReadings,
  cleanupExpiredLifeAdmissions,
  cleanupExpiredPersonalScenarioPreviews,
  narrativeConfigFromEnv,
  fictionMaxRequestBytesFromEnv,
} from '@future-flow/database';
import {
  OpenAiProvider,
  ExperimentAiBudget,
  combineAiGuards,
} from '@future-flow/ai';
import { createBillingMaintenance } from './billing-maintenance';
import { processJob } from './processor';
import { processLifeJob } from './life-processor';
import { processSharedJob } from './shared-processor';
import { claimFairQueue } from './fair-queue';
import {
  createLeaseGuard,
  describeError,
  runJobPool,
  startHeartbeat,
  workerConcurrencyFromEnv,
  workerPollMsFromEnv,
  workerPoolDefault,
} from './job-pool';
import { processPublicReviewJob } from './public-review-processor';
import { processPublicContentReviewJob } from './public-content-review-processor';

async function main() {
  narrativeConfigFromEnv();
  const concurrency = workerConcurrencyFromEnv();
  const pollMs = workerPollMsFromEnv();
  // The experiment ledger takes an exclusive file lock per job: a measured
  // paid run must stay serial.
  if (concurrency > 1 && process.env.AI_EXPERIMENT_LEDGER_PATH)
    throw new Error('AI_EXPERIMENT_LEDGER_PATH requires WORKER_CONCURRENCY=1');
  const db = connectDatabase(
    process.env.DATABASE_URL ?? '',
    process.env.DATABASE_SSL === 'true',
    { defaultPoolMax: workerPoolDefault(concurrency) },
  );
  const aiConfig = {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    eventModel: process.env.AI_EVENT_MODEL ?? '',
    storyModel: process.env.AI_STORY_MODEL ?? '',
    checkModel: process.env.AI_CHECK_MODEL || undefined,
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 90000),
    fictionTimeoutMs: Number(process.env.AI_FICTION_TIMEOUT_MS ?? 180000),
    maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 12000),
  };
  // Validate configuration before accepting jobs. Actual calls always reserve
  // the shared application budget, including legacy generation and SDK retries.
  new OpenAiProvider(aiConfig);
  const budgetConfig = withServiceUsdAlerts(applicationAiBudgetConfigFromEnv());
  const fictionMaxRequestBytes = fictionMaxRequestBytesFromEnv();
  const leaseSeconds = Number(process.env.JOB_LEASE_SECONDS ?? 180);
  if (!Number.isFinite(leaseSeconds) || leaseSeconds < 60)
    throw new Error('JOB_LEASE_SECONDS must be at least 60');
  const jobs = new JobRepository(db, leaseSeconds);
  const lifeJobs = new LifeJobRepository(db, leaseSeconds);
  const sharedJobs = new SharedJobRepository(db, undefined, leaseSeconds);
  const publicReviews = new PublicReviewJobRepository(
    db,
    publicReviewJobConfigFromEnv(),
    leaseSeconds,
  );
  const contentReviews = new PublicContentReviewJobRepository(
    db,
    publicContentReviewJobConfigFromEnv(),
    leaseSeconds,
  );
  for (const name of ['SHARED_CONTEXTS_ENABLED', 'SHARED_FRIEND_ENABLED'])
    if (!['true', 'false'].includes(process.env[name] ?? 'false'))
      throw new Error('Invalid Shared feature flag');
  const sharedEnabled =
    process.env.SHARED_CONTEXTS_ENABLED === 'true' &&
    process.env.SHARED_FRIEND_ENABLED === 'true';
  // The same explicit old-beta exemption as the API; every other personal
  // request must recheck its chapter reservation before reaching the provider.
  const billingConfig = configureWorkerChapterBilling();
  const billingMaintenance = createBillingMaintenance(db);
  let nextBillingMaintenance = 0;
  let queueStart = 0;
  let nextReadingCleanup = 0;
  let maintenanceTask: Promise<void> | undefined;
  let maintenanceStartedAt = 0;
  let maintenanceStallReported = false;
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });
  console.log('AI worker started');
  const poolMax = databasePoolConfigFromEnv(process.env, {
    max: workerPoolDefault(concurrency),
  }).max;
  console.log(JSON.stringify({ workerConcurrency: concurrency, poolMax }));
  if (poolMax < concurrency + 1)
    console.error(
      JSON.stringify({ warning: 'DATABASE_POOL_MAX is below concurrency + 1' }),
    );
  const leaseMs = leaseSeconds * 1000;
  const leases = createLeaseGuard(leaseMs);
  // Cleanup and billing upkeep run beside the jobs and never delay claiming;
  // one task at a time, so freed slots cannot start duplicates.
  const runMaintenance = async () => {
    if (Date.now() >= nextReadingCleanup) {
      try {
        const result = await cleanupExpiredPublicReadings(db);
        const admissions = await cleanupExpiredLifeAdmissions(db);
        const personalPreviews =
          await cleanupExpiredPersonalScenarioPreviews(db);
        nextReadingCleanup =
          Date.now() +
          (result.batchFull ||
          admissions.batchFull ||
          personalPreviews.batchFull
            ? 2000
            : 15 * 60 * 1000);
      } catch {
        // Retry soon without exposing SQL/credentials or starving AI queues.
        nextReadingCleanup = Date.now() + 60000;
        console.error(
          'Expired public reading cleanup failed; retry scheduled.',
        );
      }
    }
    if (billingMaintenance && Date.now() >= nextBillingMaintenance) {
      try {
        await billingMaintenance.run();
        nextBillingMaintenance = Date.now() + 5 * 60 * 1000;
      } catch {
        // Retry soon; never blocks the AI queues or exposes provider detail.
        nextBillingMaintenance = Date.now() + 60000;
        console.error('Billing maintenance failed; retry scheduled.');
      }
    }
  };
  const maintenanceTick = () => {
    if (maintenanceTask) {
      // A hung database call would otherwise stop upkeep without any trace.
      if (
        !maintenanceStallReported &&
        Date.now() - maintenanceStartedAt > 10 * 60 * 1000
      ) {
        maintenanceStallReported = true;
        console.error('Worker maintenance has not returned for 10 minutes.');
      }
      return;
    }
    if (
      Date.now() < nextReadingCleanup &&
      !(billingMaintenance && Date.now() >= nextBillingMaintenance)
    )
      return;
    maintenanceStartedAt = Date.now();
    maintenanceStallReported = false;
    maintenanceTask = runMaintenance()
      .catch(() => {
        console.error('Worker maintenance failed unexpectedly.');
      })
      .finally(() => {
        maintenanceTask = undefined;
      });
  };
  type Claimed =
    | import('@future-flow/database').LifeJob
    | import('@future-flow/database').SharedJob
    | import('@future-flow/database').PublicReviewJob
    | import('@future-flow/database').PublicContentReviewJob
    | import('@future-flow/database').Job;
  type Selected = { job: Claimed; index: number };
  // Claims are awaited one at a time by the pool, so the fair-queue rotation
  // needs no further locking.
  const claimNext = async (): Promise<Selected | null> => {
    const selection = await claimFairQueue<Claimed>(
      [
        generationQueueClaim(billingConfig.enforcement, 'personal', () =>
          lifeJobs.claim(),
        ),
        generationQueueClaim(billingConfig.enforcement, 'shared', () =>
          sharedEnabled ? sharedJobs.claim() : Promise.resolve(null),
        ),
        generationQueueClaim(billingConfig.enforcement, 'legacy', () =>
          jobs.claim(),
        ),
        generationQueueClaim(billingConfig.enforcement, 'public-review', () =>
          publicReviews.claim(),
        ),
        generationQueueClaim(billingConfig.enforcement, 'content-review', () =>
          contentReviews.claim(),
        ),
      ],
      queueStart,
    );
    queueStart = selection.next;
    return selection.job
      ? { job: selection.job, index: selection.index }
      : null;
  };
  const runClaimed = async ({ job, index }: Selected) => {
    const v2 = index === 0,
      shared = index === 1,
      publicReview = index === 3,
      contentReview = index === 4;
    const ticket = leases.begin();
    const claimed = job;
    const heartbeatJob = () =>
      contentReview
        ? contentReviews.heartbeat(
            claimed as import('@future-flow/database').PublicContentReviewJob,
          )
        : publicReview
          ? publicReviews.heartbeat(
              claimed as import('@future-flow/database').PublicReviewJob,
            )
          : shared
            ? sharedJobs.heartbeat(
                claimed as import('@future-flow/database').SharedJob,
              )
            : v2
              ? lifeJobs.heartbeat(
                  claimed as import('@future-flow/database').LifeJob,
                )
              : jobs.heartbeat(claimed as import('@future-flow/database').Job);
    const narrative =
      v2 &&
      ['narrative-v1', 'narrative-fiction-v2'].includes(
        (job as import('@future-flow/database').LifeJob).payload
          .narrativeContext?.policy.mode ?? '',
      );
    const budget = new DatabaseAiBudget(
      db,
      shared
        ? (job as import('@future-flow/database').SharedJob)
            .requested_by_user_id
        : (
            job as
              | import('@future-flow/database').LifeJob
              | import('@future-flow/database').Job
          ).user_id,
      job.id,
      budgetConfig,
      v2
        ? (job as import('@future-flow/database').LifeJob).lease_token
        : undefined,
      narrative ? fictionMaxRequestBytes : undefined,
    );
    let experiment: ExperimentAiBudget | undefined;
    const stopHeartbeat = startHeartbeat(
      ticket,
      heartbeatJob,
      leaseMs,
      (error) =>
        console.error(
          JSON.stringify({
            jobId: job.id,
            status: 'heartbeat-retry',
            error: describeError(error),
          }),
        ),
    );
    try {
      const path = process.env.AI_EXPERIMENT_LEDGER_PATH;
      const guard = path
        ? combineAiGuards(
            (experiment = new ExperimentAiBudget(
              path,
              Number(process.env.SMOKE_BUDGET_USD ?? 1),
              'application',
            )),
            budget,
          )
        : budget;
      const ai = new OpenAiProvider({
        ...aiConfig,
        guard: v2
          ? personalChapterGuard(
              guard,
              lifeJobs,
              job as import('@future-flow/database').LifeJob,
            )
          : guard,
        ...(v2
          ? {
              beforePhysicalRequest: personalRequestAdmission(
                lifeJobs,
                job as import('@future-flow/database').LifeJob,
                narrative,
              ),
            }
          : {}),
      });
      if (contentReview)
        await processPublicContentReviewJob(
          job as import('@future-flow/database').PublicContentReviewJob,
          contentReviews,
          ai,
        );
      else if (publicReview)
        await processPublicReviewJob(
          job as import('@future-flow/database').PublicReviewJob,
          publicReviews,
          ai,
        );
      else if (shared)
        await processSharedJob(
          job as import('@future-flow/database').SharedJob,
          sharedJobs,
          ai,
        );
      else if (v2)
        await processLifeJob(
          job as import('@future-flow/database').LifeJob,
          lifeJobs,
          ai,
        );
      else
        await processJob(job as import('@future-flow/database').Job, jobs, ai);
      console.log(JSON.stringify({ jobId: job.id, status: 'completed' }));
    } catch (error) {
      if (!ticket.leaseLost) {
        if (contentReview)
          await contentReviews.fail(
            job as import('@future-flow/database').PublicContentReviewJob,
          );
        else if (publicReview)
          await publicReviews.fail(
            job as import('@future-flow/database').PublicReviewJob,
          );
        else if (shared)
          await sharedJobs.fail(
            job as import('@future-flow/database').SharedJob,
            error,
          );
        else if (v2)
          await lifeJobs.fail(
            job as import('@future-flow/database').LifeJob,
            error,
          );
        else await jobs.fail(job as import('@future-flow/database').Job, error);
      }
      console.error(JSON.stringify({ jobId: job.id, status: 'failed' }));
    } finally {
      stopHeartbeat();
      ticket.end();
      experiment?.close();
    }
  };
  try {
    await runJobPool<Selected>({
      concurrency,
      pollMs,
      stopping: () => stopping,
      claim: claimNext,
      claimAllowed: leases.claimAllowed,
      run: runClaimed,
      tick: maintenanceTick,
      onClaimError: (error, failures) => {
        console.error(
          JSON.stringify({
            status: 'claim-failed',
            error: describeError(error),
            consecutiveFailures: failures,
          }),
        );
      },
      onRunError: (error) => {
        console.error(
          JSON.stringify({
            status: 'runner-failed',
            error: describeError(error),
          }),
        );
      },
    });
  } finally {
    await maintenanceTask;
    await db.close();
  }
}
main().catch(() => {
  console.error(
    'Worker startup failed. Check the server environment and database.',
  );
  process.exitCode = 1;
});
