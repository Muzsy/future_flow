import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DatabaseAiBudget,
  LifeJobRepository,
  LifeRepository,
  Repository,
  connectDatabase,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import { DomainError } from '@future-flow/core';
import { configureGenerationGate } from '@future-flow/database';
import { configureWorkerChapterBilling } from '../apps/worker/src/chapter-billing';
import { applyMigrations } from '../scripts/lib/migrations';
import { runJobPool } from '../apps/worker/src/job-pool';
import { setupFixture } from './life-fixtures';

// Real multi-connection PostgreSQL proof for the bounded worker pool. Skipped
// unless SERVICE_ADMISSION_PG_URL points at a DISPOSABLE local database whose
// name starts with ff_admission_test, exactly like
// tests/service-admission-postgres.test.ts. It builds its own sibling database
// (ff_admission_test_pool) so it can run in parallel with that file. No provider is ever called: the
// "model" is a timer; claim, lease, USD reservation and settlement are real.
const url = process.env.SERVICE_ADMISSION_PG_URL ?? '';
const parsed = url ? new URL(url) : null;
const disposable =
  !!parsed &&
  ['localhost', '127.0.0.1', ''].includes(parsed.hostname) &&
  /^\/ff_admission_test/.test(parsed.pathname);
if (url && !disposable)
  throw Error(
    'SERVICE_ADMISSION_PG_URL must be a local ff_admission_test* database',
  );

const billingEnv = {
  BILLING_ENABLED: 'true',
  BILLING_ENFORCEMENT: 'true',
  STRIPE_SECRET_KEY: 'sk_test_poolkey1234567',
  STRIPE_WEBHOOK_SECRET: 'whsec_poolsecret12345',
  STRIPE_PRICE_ID: 'price_pool123',
  STRIPE_FOUNDER_COUPON_ID: 'founder_launch',
  STRIPE_API_VERSION: '2025-03-31.basil',
  BILLING_SUCCESS_URL: 'https://alterward.example/billing/success',
  BILLING_CANCEL_URL: 'https://alterward.example/billing/cancel',
};
const request = { model: 'gpt-6.1-sol', max_output_tokens: 100, input: [] };

describe.skipIf(!disposable)(
  'worker pool on real PostgreSQL connections',
  () => {
    let admin: Database & { close(): Promise<void> };
    let workerDb: Database & { close(): Promise<void> };
    let lives: LifeRepository;
    let repo: Repository;

    beforeAll(async () => {
      const base = connectDatabase(url, false);
      await base.query('DROP DATABASE IF EXISTS ff_admission_test_pool');
      await base.query('CREATE DATABASE ff_admission_test_pool');
      await base.close();
      const own = new URL(url);
      own.pathname = '/ff_admission_test_pool';
      admin = connectDatabase(own.href, false);
      await applyMigrations({ exec: (sql) => admin.query(sql) });
      // The worker's pool: six jobs plus headroom.
      workerDb = connectDatabase(own.href, false, { defaultPoolMax: 10 });
      repo = new Repository(admin);
      lives = new LifeRepository(admin, { daily: 100, concurrent: 10 });
    }, 120000);
    afterAll(async () => {
      await workerDb?.close();
      await admin?.close();
    });

    async function queueJobs(count: number) {
      const ids: string[] = [];
      for (let i = 0; i < count; i++) {
        const owner = randomUUID();
        await repo.ensureUser(owner);
        await repo.acceptPrivacy(owner);
        ids.push(
          (await lives.create(owner, setupFixture(), randomUUID())).jobId,
        );
      }
      return ids;
    }

    async function drain(concurrency: number, expected: string[]) {
      const jobs = new LifeJobRepository(workerDb, 180);
      const claimed: string[] = [];
      let running = 0,
        peak = 0,
        stop = false;
      await runJobPool<LifeJob>({
        concurrency,
        pollMs: 20,
        stopping: () => stop,
        claim: () => jobs.claim(),
        run: async (job) => {
          claimed.push(job.id);
          running++;
          peak = Math.max(peak, running);
          try {
            const budget = new DatabaseAiBudget(
              workerDb,
              job.user_id,
              job.id,
              { projectUsd: 50, userUsd: 5 },
              job.lease_token,
            );
            for (let call = 0; call < 3; call++) {
              await jobs.heartbeat(job);
              const id = await budget.reserve(request);
              await new Promise((resolve) => setTimeout(resolve, 40));
              await budget.settle(id, { input_tokens: 10, output_tokens: 20 });
            }
            await workerDb.query(
              "UPDATE aw_jobs SET status='completed',lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2",
              [job.id, job.lease_token],
            );
          } finally {
            running--;
            if (claimed.length === expected.length && running === 0)
              stop = true;
          }
        },
      });
      return { claimed, peak };
    }

    it('claims every job exactly once with parallel slots and stays inside the bound', async () => {
      const ids = await queueJobs(14);
      const { claimed, peak } = await drain(6, ids);
      expect([...claimed].sort()).toEqual([...ids].sort());
      expect(new Set(claimed).size).toBe(14);
      expect(peak).toBeGreaterThan(1);
      expect(peak).toBeLessThanOrEqual(6);
      const rows = await admin.query<{ status: string; n: number }>(
        'SELECT status, count(*)::int AS n FROM aw_jobs GROUP BY status',
      );
      expect(rows).toEqual([{ status: 'completed', n: 14 }]);
      // Every reservation settled; nothing left reserved or unknown.
      const left = await admin.query<{ status: string; n: number }>(
        'SELECT status, count(*)::int AS n FROM aw_budget_reservations GROUP BY status',
      );
      expect(left).toEqual([{ status: 'completed', n: 42 }]);
    }, 60000);

    it('is serial with a bound of one', async () => {
      const ids = await queueJobs(4);
      const { claimed, peak } = await drain(1, ids);
      expect([...claimed].sort()).toEqual([...ids].sort());
      expect(peak).toBe(1);
    }, 60000);

    it('runs the real chapter-dispatch check per job: reservations are honoured and a missing one fails only its own job', async () => {
      // Real gate, real reservations (taster and paid), no mocked dispatch.
      configureWorkerChapterBilling(billingEnv);
      try {
        const owners: { owner: string; kind: 'taster' | 'paid' | 'missing' }[] =
          [];
        const kinds = [
          'taster',
          'paid',
          'taster',
          'paid',
          'missing',
          'paid',
        ] as const;
        for (const kind of kinds) {
          const owner = randomUUID();
          await repo.ensureUser(owner);
          await repo.acceptPrivacy(owner);
          if (kind === 'paid') {
            const subscription = `sub_${owner}`,
              grant = `in_${owner}`;
            await admin.query(
              "INSERT INTO aw_billing_subscriptions(subscription_id,user_id,customer_id,status,period_start,period_end,last_state_event_created,paid_invoice_ids) VALUES($1,$2,$3,'active',now()-interval '1 day',now()+interval '29 days',1,ARRAY[$4]::text[])",
              [subscription, owner, `cus_${owner}`, grant],
            );
            await admin.query(
              "INSERT INTO aw_billing_grants(key,subscription_id,user_id,cycle_index,amount,expires_at) VALUES($1,$2,$3,1,5,now()+interval '29 days')",
              [grant, subscription, owner],
            );
          }
          await lives.create(owner, setupFixture(), randomUUID());
          if (kind === 'missing')
            await admin.query(
              'DELETE FROM aw_billing_reservations WHERE user_id=$1',
              [owner],
            );
          owners.push({ owner, kind });
        }
        const jobs = new LifeJobRepository(workerDb, 180);
        const outcome = new Map<string, string>();
        let remaining = owners.length,
          stop = false;
        await runJobPool<LifeJob>({
          concurrency: 4,
          pollMs: 20,
          stopping: () => stop,
          claim: () => jobs.claim(),
          run: async (job) => {
            try {
              for (let call = 0; call < 2; call++) {
                await jobs.verifyChapterReservation(job);
                await new Promise((resolve) => setTimeout(resolve, 30));
              }
              await workerDb.query(
                "UPDATE aw_jobs SET status='completed',lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2",
                [job.id, job.lease_token],
              );
              outcome.set(job.user_id, 'completed');
            } catch (error) {
              await jobs.fail(job, error);
              outcome.set(
                job.user_id,
                error instanceof DomainError ? error.code : 'JOB_FAILED',
              );
            } finally {
              if (--remaining === 0) stop = true;
            }
          },
        });
        for (const { owner, kind } of owners)
          expect(outcome.get(owner), kind).toBe(
            kind === 'missing' ? 'BILLING_RESERVATION_REQUIRED' : 'completed',
          );
        const failed = await admin.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM aw_jobs WHERE status='failed'",
        );
        expect(failed[0]!.n).toBe(1);
      } finally {
        configureGenerationGate(null);
      }
    }, 60000);
  },
);
