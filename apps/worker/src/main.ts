import { connectDatabase, JobRepository } from '@future-flow/database';
import { OpenAiProvider } from '@future-flow/ai';
import { processJob } from './processor';

async function main() {
  const db = connectDatabase(
    process.env.DATABASE_URL ?? '',
    process.env.DATABASE_SSL === 'true',
  );
  const ai = new OpenAiProvider({
    apiKey: process.env.OPENAI_API_KEY ?? '',
    eventModel: process.env.AI_EVENT_MODEL ?? '',
    storyModel: process.env.AI_STORY_MODEL ?? '',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 90000),
    maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 12000),
  });
  const leaseSeconds = Number(process.env.JOB_LEASE_SECONDS ?? 180);
  if (!Number.isFinite(leaseSeconds) || leaseSeconds < 60)
    throw new Error('JOB_LEASE_SECONDS must be at least 60');
  const jobs = new JobRepository(db, leaseSeconds);
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
      const job = await jobs.claim();
      if (!job) {
        await new Promise((resolve) =>
          setTimeout(resolve, Number(process.env.WORKER_POLL_MS ?? 2000)),
        );
        continue;
      }
      let leaseLost = false;
      const heartbeat = setInterval(
        () => {
          void jobs.heartbeat(job).catch(() => {
            leaseLost = true;
          });
        },
        Math.floor((leaseSeconds * 1000) / 3),
      );
      try {
        await processJob(job, jobs, ai);
        console.log(JSON.stringify({ jobId: job.id, status: 'completed' }));
      } catch (error) {
        if (!leaseLost) await jobs.fail(job, error);
        console.error(JSON.stringify({ jobId: job.id, status: 'failed' }));
      } finally {
        clearInterval(heartbeat);
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
