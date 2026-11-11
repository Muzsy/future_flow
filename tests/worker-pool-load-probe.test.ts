import { randomUUID } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import {
  DatabaseAiBudget,
  LifeJobRepository,
  LifeRepository,
  Repository,
  connectDatabase,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import type { LifeAiProvider } from '@future-flow/ai';
import {
  createLeaseGuard,
  runJobPool,
  startHeartbeat,
  workerPoolDefault,
} from '../apps/worker/src/job-pool';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { applyMigrations } from '../scripts/lib/migrations';
import { lifeTestAi, setupFixture } from './life-fixtures';

// Synthetic load probe for the bounded worker pool. NOT part of the normal
// suite: it runs only with WORKER_LOAD_PROBE=1 and a disposable local
// SERVICE_ADMISSION_PG_URL (ff_admission_test*), builds its own database and
// prints one line per concurrency level. Claim, lease, heartbeat, USD
// reservation/settlement and the real life processor run on real connections;
// the "model" is a timer that returns the deterministic test fixtures and
// holds a request-sized buffer. It therefore bounds the worker's own
// CPU/heap/connection behaviour from below and says nothing about OpenAI or
// the Supabase pooler. No provider is ever called.
//   WORKER_LOAD_PROBE=1 SERVICE_ADMISSION_PG_URL=postgres://localhost/ff_admission_test \
//     pnpm vitest run tests/worker-pool-load-probe.test.ts
const url = process.env.SERVICE_ADMISSION_PG_URL ?? '';
const parsed = url ? new URL(url) : null;
const enabled =
  process.env.WORKER_LOAD_PROBE === '1' &&
  !!parsed &&
  ['localhost', '127.0.0.1', ''].includes(parsed.hostname) &&
  /^\/ff_admission_test/.test(parsed.pathname);

const JOBS = Number(process.env.WORKER_LOAD_JOBS ?? 24);
const CALL_MS = Number(process.env.WORKER_LOAD_CALL_MS ?? 400);
const REQUEST_BYTES = 196_608;
const request = { model: 'gpt-6.1-sol', max_output_tokens: 100, input: [] };
const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.floor(values.length * p))
  ] ?? 0;

describe.skipIf(!enabled)('worker pool synthetic load probe', () => {
  it.each([1, 6, 12])(
    'concurrency %i',
    async (concurrency) => {
      const base = connectDatabase(url, false);
      await base.query('DROP DATABASE IF EXISTS ff_admission_test_load');
      await base.query('CREATE DATABASE ff_admission_test_load');
      await base.close();
      const own = new URL(url);
      own.pathname = '/ff_admission_test_load';
      const admin = connectDatabase(own.href, false);
      await applyMigrations({ exec: (sql) => admin.query(sql) });
      const repo = new Repository(admin);
      const lives = new LifeRepository(admin, { daily: 100, concurrent: 10 });
      for (let i = 0; i < JOBS; i++) {
        const owner = randomUUID();
        await repo.ensureUser(owner);
        await repo.acceptPrivacy(owner);
        await lives.create(owner, setupFixture(), randomUUID());
      }
      const rawDb = connectDatabase(own.href, false, {
        defaultPoolMax: workerPoolDefault(concurrency),
      });
      const latencies: number[] = [];
      const timed = async <T>(run: () => Promise<T>) => {
        const start = performance.now();
        try {
          return await run();
        } finally {
          latencies.push(performance.now() - start);
        }
      };
      // Every database operation is timed from checkout request to result.
      const db: Database = {
        query: (sql, values) => timed(() => rawDb.query(sql, values)),
        transaction: (run) => timed(() => rawDb.transaction(run)),
      } as Database;
      const leaseSeconds = 6;
      const jobs = new LifeJobRepository(db, leaseSeconds);
      const leases = createLeaseGuard(leaseSeconds * 1000);
      const delay = monitorEventLoopDelay({ resolution: 10 });
      delay.enable();
      let rssPeak = 0,
        heapPeak = 0,
        running = 0,
        peak = 0,
        done = 0,
        failed = 0,
        stop = false;
      const sampler = setInterval(() => {
        const m = process.memoryUsage();
        rssPeak = Math.max(rssPeak, m.rss);
        heapPeak = Math.max(heapPeak, m.heapUsed);
      }, 25);
      const rssStart = process.memoryUsage().rss;
      const started = performance.now();
      const aiFor = (job: LifeJob): LifeAiProvider => {
        const guard = new DatabaseAiBudget(
          db,
          job.user_id,
          job.id,
          { projectUsd: 500, userUsd: 50 },
          job.lease_token,
        );
        async function call<T>(run: () => Promise<T>) {
          const id = await guard.reserve(request);
          const held = Buffer.alloc(REQUEST_BYTES, 1);
          await new Promise((resolve) => setTimeout(resolve, CALL_MS));
          const result = await run();
          held.fill(0);
          await guard.settle(id, { input_tokens: 10, output_tokens: 20 });
          return result;
        }
        return {
          period: (input, repair) =>
            call(() => lifeTestAi.period(input, repair)),
          periodChapter: (input, repair) =>
            call(() => lifeTestAi.periodChapter(input, repair)),
          checkPeriodChapter: (input, chapter) =>
            call(() => lifeTestAi.checkPeriodChapter(input, chapter)),
        };
      };
      await runJobPool<LifeJob>({
        concurrency,
        pollMs: 50,
        stopping: () => stop,
        claimAllowed: leases.claimAllowed,
        claim: () => jobs.claim(),
        run: async (job) => {
          const ticket = leases.begin();
          const stopBeat = startHeartbeat(
            ticket,
            () => jobs.heartbeat(job),
            leaseSeconds * 1000,
          );
          running++;
          peak = Math.max(peak, running);
          try {
            await processLifeJob(job, jobs, aiFor(job));
            done++;
          } catch {
            failed++;
          } finally {
            running--;
            stopBeat();
            ticket.end();
            if (done + failed === JOBS) stop = true;
          }
        },
      });
      const seconds = (performance.now() - started) / 1000;
      clearInterval(sampler);
      delay.disable();
      await rawDb.close();
      await admin.close();
      console.log(
        'LOAD_PROBE ' +
          JSON.stringify({
            concurrency,
            poolMax: workerPoolDefault(concurrency),
            jobs: JOBS,
            callMs: CALL_MS,
            completed: done,
            failed,
            peakRunning: peak,
            wallSeconds: Number(seconds.toFixed(1)),
            jobsPerMinute: Number(((done / seconds) * 60).toFixed(1)),
            rssGrowthMiB: Number(((rssPeak - rssStart) / 2 ** 20).toFixed(0)),
            rssPeakMiB: Number((rssPeak / 2 ** 20).toFixed(0)),
            heapPeakMiB: Number((heapPeak / 2 ** 20).toFixed(0)),
            dbOps: latencies.length,
            dbOpP95Ms: Number(percentile(latencies, 0.95).toFixed(0)),
            dbOpMaxMs: Number(Math.max(...latencies).toFixed(0)),
            eventLoopDelayP99Ms: Number(
              (delay.percentile(99) / 1e6).toFixed(1),
            ),
            eventLoopDelayMaxMs: Number((delay.max / 1e6).toFixed(1)),
          }),
      );
      expect(done + failed).toBe(JOBS);
      expect(peak).toBeLessThanOrEqual(concurrency);
    },
    600000,
  );
});
