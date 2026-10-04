import {
  connectDatabase,
  JobRepository,
  LifeJobRepository,
  SharedJobRepository,
  DatabaseAiBudget,
} from '@future-flow/database';
import {
  OpenAiProvider,
  ExperimentAiBudget,
  combineAiGuards,
} from '@future-flow/ai';
import { processJob } from './processor';
import { processLifeJob } from './life-processor';
import { processSharedJob } from './shared-processor';
import { claimFairQueue } from './fair-queue';

async function main() {
  const db = connectDatabase(
    process.env.DATABASE_URL ?? '',
    process.env.DATABASE_SSL === 'true',
  );
  const aiConfig = {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    eventModel: process.env.AI_EVENT_MODEL ?? '',
    storyModel: process.env.AI_STORY_MODEL ?? '',
    checkModel: process.env.AI_CHECK_MODEL || undefined,
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 90000),
    maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 12000),
  };
  // Validate configuration before accepting jobs. Actual calls always reserve
  // the shared application budget, including legacy generation and SDK retries.
  new OpenAiProvider(aiConfig);
  const leaseSeconds = Number(process.env.JOB_LEASE_SECONDS ?? 180);
  if (!Number.isFinite(leaseSeconds) || leaseSeconds < 60)
    throw new Error('JOB_LEASE_SECONDS must be at least 60');
  const jobs = new JobRepository(db, leaseSeconds);
  const lifeJobs = new LifeJobRepository(db, leaseSeconds);
  const sharedJobs = new SharedJobRepository(db, undefined, leaseSeconds);
  for (const name of ['SHARED_CONTEXTS_ENABLED', 'SHARED_FRIEND_ENABLED'])
    if (!['true', 'false'].includes(process.env[name] ?? 'false'))
      throw new Error('Invalid Shared feature flag');
  const sharedEnabled =
    process.env.SHARED_CONTEXTS_ENABLED === 'true' &&
    process.env.SHARED_FRIEND_ENABLED === 'true';
  let queueStart = 0;
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });
  console.log('AI worker started');
  try {
    while (!stopping) {
      type Claimed =
        | import('@future-flow/database').LifeJob
        | import('@future-flow/database').SharedJob
        | import('@future-flow/database').Job;
      const selection = await claimFairQueue<Claimed>(
        [
          () => lifeJobs.claim(),
          () => (sharedEnabled ? sharedJobs.claim() : Promise.resolve(null)),
          () => jobs.claim(),
        ],
        queueStart,
      );
      queueStart = selection.next;
      const job = selection.job;
      const v2 = selection.index === 0,
        shared = selection.index === 1;
      if (!job) {
        await new Promise((resolve) =>
          setTimeout(resolve, Number(process.env.WORKER_POLL_MS ?? 2000)),
        );
        continue;
      }
      let leaseLost = false;
      const claimed = job;
      const heartbeatJob = () =>
        shared
          ? sharedJobs.heartbeat(
              claimed as import('@future-flow/database').SharedJob,
            )
          : v2
            ? lifeJobs.heartbeat(
                claimed as import('@future-flow/database').LifeJob,
              )
            : jobs.heartbeat(claimed as import('@future-flow/database').Job);
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
        {
          projectUsd: Number(process.env.AI_PROJECT_BUDGET_USD ?? 0),
          userUsd: Number(process.env.AI_USER_BUDGET_USD ?? 0),
          initialProjectSpentUsd: Number(
            process.env.AI_PROJECT_INITIAL_SPENT_USD ?? 0,
          ),
        },
      );
      let experiment: ExperimentAiBudget | undefined;
      const heartbeat = setInterval(
        () => {
          void heartbeatJob().catch(() => {
            leaseLost = true;
          });
        },
        Math.floor((leaseSeconds * 1000) / 3),
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
        const ai = new OpenAiProvider({ ...aiConfig, guard });
        if (shared)
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
          await processJob(
            job as import('@future-flow/database').Job,
            jobs,
            ai,
          );
        console.log(JSON.stringify({ jobId: job.id, status: 'completed' }));
      } catch (error) {
        if (!leaseLost) {
          if (shared)
            await sharedJobs.fail(
              job as import('@future-flow/database').SharedJob,
              error,
            );
          else if (v2)
            await lifeJobs.fail(
              job as import('@future-flow/database').LifeJob,
              error,
            );
          else
            await jobs.fail(job as import('@future-flow/database').Job, error);
        }
        console.error(JSON.stringify({ jobId: job.id, status: 'failed' }));
      } finally {
        clearInterval(heartbeat);
        experiment?.close();
      }
    }
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error(
    'Worker startup failed. Check the server environment and database.',
  );
  process.exitCode = 1;
});
