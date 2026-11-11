import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import type OpenAI from 'openai';
import {
  Repository,
  LifeRepository,
  LifeJobRepository,
  DatabaseAiBudget,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import { OpenAiProvider, type LifeAiProvider } from '@future-flow/ai';
import { DomainError } from '@future-flow/core';
import { applyMigrations } from '../scripts/lib/migrations';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { setupFixture, lifeTestAi } from './life-fixtures';

let engine: PGlite,
  db: Database,
  repo: Repository,
  lives: LifeRepository,
  jobs: LifeJobRepository;
// Use the same SDK module boundary as the compiled provider for APIError identity.
const ProviderSdk = createRequire(
  new URL('../packages/ai/package.json', import.meta.url),
)('openai').default as typeof OpenAI;
function adapter(client: Pick<PGlite, 'query' | 'transaction'>): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) => (await client.query<T>(sql, values)).rows,
    transaction: (run) =>
      client.transaction((tx) => run(adapter(tx as unknown as PGlite))),
  };
}
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await applyMigrations(engine);
  db = adapter(engine);
  repo = new Repository(db);
  lives = new LifeRepository(db, { daily: 100, concurrent: 10 });
  jobs = new LifeJobRepository(db);
});
afterEach(async () => {
  await db.query(
    "UPDATE aw_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE status IN ('queued','running')",
  );
});
afterAll(async () => {
  await engine?.close();
});
async function fixture() {
  const owner = randomUUID();
  await repo.ensureUser(owner);
  await repo.acceptPrivacy(owner);
  const created = await lives.create(owner, setupFixture(), randomUUID());
  const job = (await jobs.claim())!;
  expect(job.id).toBe(created.jobId);
  return { owner, created, job };
}
async function expire(job: LifeJob) {
  await db.query(
    "UPDATE aw_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
    [job.id],
  );
}
const request = { model: 'gpt-6.1-sol', max_output_tokens: 100, input: [] };
function budget(
  job: LifeJob,
  projectUsd = 10,
  window?: { startsAt: string; endsAt: string },
) {
  return new DatabaseAiBudget(
    db,
    job.user_id,
    job.id,
    { projectUsd, userUsd: 0.5, window },
    job.lease_token,
  );
}
function chargingAi(job: LifeJob): LifeAiProvider {
  const guard = budget(job);
  async function call<T>(run: () => Promise<T>) {
    const id = await guard.reserve(request);
    const result = await run();
    await guard.settle(id, { input_tokens: 10, output_tokens: 20 });
    return result;
  }
  return {
    period: (input, repair) => call(() => lifeTestAi.period(input, repair)),
    periodChapter: (input, repair) =>
      call(() => lifeTestAi.periodChapter(input, repair)),
    checkPeriodChapter: (input, chapter) =>
      call(() => lifeTestAi.checkPeriodChapter(input, chapter)),
  };
}
class InterruptedJobs extends LifeJobRepository {
  constructor(private readonly stopAt: string) {
    super(db);
  }
  override async checkpoint(
    job: LifeJob,
    stage: string,
    patch: Record<string, unknown>,
  ) {
    await super.checkpoint(job, stage, patch);
    if (stage === this.stopAt) {
      await expire(job);
      throw new DomainError('JOB_LEASE_LOST', 'Synthetic interruption.');
    }
  }
}
describe.sequential(
  'paid life lease, retry and durable repair recovery',
  () => {
    it.each(['AI_BUDGET_EXCEEDED', 'AI_BUDGET_WINDOW_CLOSED'])(
      'keeps a life retryable after six noncharged %s failures',
      async (code) => {
        const { owner, created, job: first } = await fixture();
        let job = first;
        for (let i = 0; i < 6; i++) {
          const closed =
            code === 'AI_BUDGET_EXCEEDED'
              ? budget(job, 0)
              : budget(job, 10, {
                  startsAt: '2090-01-01T00:00:00Z',
                  endsAt: '2090-01-31T00:00:00Z',
                });
          await expect(closed.reserve(request)).rejects.toMatchObject({ code });
          await jobs.fail(
            job,
            new DomainError(code, 'Synthetic unavailable budget.'),
          );
          expect(
            (
              await db.query('SELECT attempt FROM aw_jobs WHERE id=$1', [
                job.id,
              ])
            )[0]!.attempt,
          ).toBe(0);
          await lives.retry(owner, job.id, 0, `no-charge-${i}`);
          job = (await jobs.claim())!;
        }
        expect(
          await db.query(
            'SELECT id FROM aw_budget_reservations WHERE job_id=$1',
            [job.id],
          ),
        ).toHaveLength(0);
        await processLifeJob(job, jobs, chargingAi(job));
        expect((await lives.branch(owner, created.branchId)).revision).toBe(1);
        expect(
          (
            await db.query('SELECT attempt FROM aw_jobs WHERE id=$1', [job.id])
          )[0]!.attempt,
        ).toBe(1);
      },
    );
    it('survives seven lease takeovers without charging an attempt before a provider reservation', async () => {
      const { owner, created, job: first } = await fixture();
      let job = first;
      for (let i = 0; i < 7; i++) {
        await expire(job);
        const next = (await jobs.claim())!;
        expect(next.id).toBe(job.id);
        expect(next.lease_token).not.toBe(job.lease_token);
        expect(next.attempt).toBe(0);
        job = next;
      }
      await processLifeJob(job, jobs, chargingAi(job));
      expect((await lives.branch(owner, created.branchId)).revision).toBe(1);
    });
    it('bounds automatic unfunded takeovers without consuming paid attempts or starving newer jobs', async () => {
      const { owner, job: first } = await fixture();
      const other = randomUUID();
      await repo.ensureUser(other);
      await repo.acceptPrivacy(other);
      const newer = await lives.create(other, setupFixture(), randomUUID());
      let job = first;
      for (let i = 0; i < 49; i++) {
        await expire(job);
        job = (await jobs.claim())!;
        expect(job.id).toBe(first.id);
        expect(job.attempt).toBe(0);
      }
      await expire(job);
      expect(await jobs.claim()).toBeNull();
      const [stopped] = await db.query(
        'SELECT status,error_code,attempt FROM aw_jobs WHERE id=$1',
        [first.id],
      );
      expect(stopped).toMatchObject({
        status: 'failed',
        error_code: 'JOB_RECOVERY_EXHAUSTED',
        attempt: 0,
      });
      expect((await jobs.claim())!.id).toBe(newer.jobId);
      await lives.retry(owner, first.id, 0, 'explicit-recovery-retry');
      const retried = (await jobs.claim())!;
      expect(retried.id).toBe(first.id);
      expect(retried.checkpoints.leaseRecoveryCount).toBe(0);
      await processLifeJob(retried, jobs, chargingAi(retried));
    });
    it('fences expired and stolen leases before allocation while settling an earlier call after takeover', async () => {
      const { job } = await fixture(),
        old = budget(job),
        first = await old.reserve(request);
      await expire(job);
      const before = await db.query(
        'SELECT * FROM aw_budget_reservations WHERE job_id=$1',
        [job.id],
      );
      await expect(old.reserve(request)).rejects.toMatchObject({
        code: 'JOB_LEASE_LOST',
      });
      const current = (await jobs.claim())!;
      await expect(old.reserve(request)).rejects.toMatchObject({
        code: 'JOB_LEASE_LOST',
      });
      expect(
        await db.query('SELECT * FROM aw_budget_reservations WHERE job_id=$1', [
          job.id,
        ]),
      ).toEqual(before);
      await old.settle(first, null);
      const second = await budget(current).reserve(request);
      await budget(current).settle(second, {
        input_tokens: 10,
        output_tokens: 20,
      });
      expect(
        (
          await db.query('SELECT attempt FROM aw_jobs WHERE id=$1', [job.id])
        )[0]!.attempt,
      ).toBe(2);
    });
    it('counts one funded attempt per claim and preserves the five-funded-attempt ceiling', async () => {
      const { owner, job: first } = await fixture();
      let job = first;
      for (let i = 1; i <= 5; i++) {
        const guard = budget(job);
        for (let call = 0; call < 2; call++) {
          await guard.settle(await guard.reserve(request), null);
        }
        expect(
          (
            await db.query('SELECT attempt FROM aw_jobs WHERE id=$1', [job.id])
          )[0]!.attempt,
        ).toBe(i);
        await jobs.fail(
          job,
          new DomainError('AI_PROVIDER_FAILED', 'Synthetic funded failure.'),
        );
        if (i < 5) {
          await lives.retry(owner, job.id, 0, `funded-retry-${i}`);
          job = (await jobs.claim())!;
        }
      }
      await expect(
        lives.retry(owner, job.id, 0, 'sixth-funded-attempt'),
      ).rejects.toMatchObject({ code: 'LIFE_RETRY_UNAVAILABLE' });
      expect(
        await db.query(
          'SELECT id FROM aw_budget_reservations WHERE job_id=$1',
          [job.id],
        ),
      ).toHaveLength(10);
    });
    it('does not let a late worker fail an expired claim before another worker takes over', async () => {
      const { owner, created, job } = await fixture();
      await expire(job);
      await jobs.fail(
        job,
        new DomainError('AI_PROVIDER_FAILED', 'Late synthetic result.'),
      );
      expect((await lives.branch(owner, created.branchId)).status).toBe(
        'generating',
      );
      expect((await jobs.claim())!.id).toBe(job.id);
    });
    it('rolls back a complete period when the lease expires before the final commit fence', async () => {
      const { owner, created, job } = await fixture();
      const delayed: Database = {
        query: db.query,
        transaction: (run) =>
          db.transaction((tx) =>
            run({
              ...tx,
              query: async <T extends Record<string, unknown>>(
                sql: string,
                values: unknown[] = [],
              ) => {
                if (sql.startsWith("UPDATE aw_jobs SET status='completed'"))
                  await tx.query(
                    "UPDATE aw_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
                    [job.id],
                  );
                return tx.query<T>(sql, values);
              },
            }),
          ),
      };
      await expect(
        processLifeJob(job, new LifeJobRepository(delayed), lifeTestAi),
      ).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
      const detail = await lives.detail(owner, created.branchId);
      expect(detail.periods).toHaveLength(0);
      expect(detail.branch.revision).toBe(0);
      expect(detail.branch.status).toBe('generating');
    });
    it('rechecks the lease after waiting for the budget-account lock and rolls back allocation', async () => {
      const { job } = await fixture();
      const delayed: Database = {
        query: db.query,
        transaction: (run) =>
          db.transaction((tx) =>
            run({
              ...tx,
              query: async <T extends Record<string, unknown>>(
                sql: string,
                values: unknown[] = [],
              ) => {
                const result = await tx.query<T>(sql, values);
                if (
                  sql.startsWith(
                    'SELECT limit_micro,accounted_micro FROM aw_budget_accounts',
                  )
                )
                  await tx.query(
                    "UPDATE aw_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
                    [job.id],
                  );
                return result;
              },
            }),
          ),
      };
      const guard = new DatabaseAiBudget(
        delayed,
        job.user_id,
        job.id,
        { projectUsd: 10, userUsd: 0.5 },
        job.lease_token,
      );
      await expect(guard.reserve(request)).rejects.toMatchObject({
        code: 'JOB_LEASE_LOST',
      });
      expect(
        await db.query(
          'SELECT id FROM aw_budget_reservations WHERE job_id=$1',
          [job.id],
        ),
      ).toHaveLength(0);
      expect(
        (
          await db.query('SELECT attempt FROM aw_jobs WHERE id=$1', [job.id])
        )[0]!.attempt,
      ).toBe(0);
    });
    it('stops a transient OpenAI transport retry after lease loss without a second reservation', async () => {
      const { job } = await fixture();
      const parse = vi.fn(async () => {
        await expire(job);
        throw new ProviderSdk.APIError(
          503,
          {},
          'Synthetic provider interruption.',
          new Headers({ 'retry-after': '0' }),
        );
      });
      const ai = new OpenAiProvider(
        {
          apiKey: 'test-only',
          eventModel: request.model,
          storyModel: request.model,
          timeoutMs: 1000,
          maxOutputTokens: 100,
          guard: budget(job),
        },
        { responses: { parse } } as unknown as OpenAI,
      );
      await expect(ai.period(job.payload)).rejects.toMatchObject({
        code: 'JOB_LEASE_LOST',
      });
      expect(parse).toHaveBeenCalledTimes(1);
      const rows = await db.query(
        'SELECT status,reserved_micro,accounted_micro FROM aw_budget_reservations WHERE job_id=$1',
        [job.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe('unknown');
      expect(rows[0]!.accounted_micro).toBe(rows[0]!.reserved_micro);
    });
    it.each(['EVENT_REJECTED', 'EVENT_REPAIR'])(
      'resumes the same event repair after interruption at %s',
      async (stage) => {
        const { owner, created, job } = await fixture();
        const initial = await lifeTestAi.period(job.payload);
        const period = vi
          .fn()
          .mockResolvedValueOnce({
            ...initial,
            output: { ...initial.output, periodId: randomUUID() },
          })
          .mockImplementation(lifeTestAi.period);
        await expect(
          processLifeJob(job, new InterruptedJobs(stage), {
            ...lifeTestAi,
            period,
          }),
        ).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
        const resumed = (await jobs.claim())!;
        await processLifeJob(resumed, jobs, { ...lifeTestAi, period });
        expect(period).toHaveBeenCalledTimes(2);
        expect(period.mock.calls[1]![1]).toContain('LIFE_PERIOD_INTERVAL');
        expect((await lives.branch(owner, created.branchId)).revision).toBe(1);
        expect(
          (
            await db.query('SELECT checkpoints FROM aw_jobs WHERE id=$1', [
              job.id,
            ])
          )[0]!.checkpoints,
        ).toMatchObject({ repairUsed: true, repairKind: 'events' });
      },
    );
    it('reuses a persisted provider event response after a validation-stage restart', async () => {
      const { job } = await fixture(),
        period = vi.fn(lifeTestAi.period);
      await expect(
        processLifeJob(job, new InterruptedJobs('EVENT_VALIDATION'), {
          ...lifeTestAi,
          period,
        }),
      ).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
      await processLifeJob((await jobs.claim())!, jobs, {
        ...lifeTestAi,
        period,
      });
      expect(period).toHaveBeenCalledTimes(1);
    });
    it('reuses the persisted fidelity result after a checker-stage interruption', async () => {
      const { job } = await fixture(),
        check = vi.fn(lifeTestAi.checkPeriodChapter);
      await expect(
        processLifeJob(job, new InterruptedJobs('FIDELITY_CHECK'), {
          ...lifeTestAi,
          checkPeriodChapter: check,
        }),
      ).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
      await processLifeJob((await jobs.claim())!, jobs, {
        ...lifeTestAi,
        checkPeriodChapter: check,
      });
      expect(check).toHaveBeenCalledTimes(1);
    });
    it.each(['FIDELITY_CHECK', 'VALIDATED'])(
      'rechecks a changed cached chapter after restart at %s',
      async (stage) => {
        const { job } = await fixture();
        const check = vi.fn(lifeTestAi.checkPeriodChapter);
        await expect(
          processLifeJob(job, new InterruptedJobs(stage), {
            ...lifeTestAi,
            checkPeriodChapter: check,
          }),
        ).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
        await db.query(
          "UPDATE aw_jobs SET checkpoints=jsonb_set(checkpoints,'{chapter,body}',to_jsonb((checkpoints#>>'{chapter,body}')||' changed')) WHERE id=$1",
          [job.id],
        );
        await processLifeJob((await jobs.claim())!, jobs, {
          ...lifeTestAi,
          checkPeriodChapter: check,
        });
        expect(check).toHaveBeenCalledTimes(2);
      },
    );
    it.each(['FIDELITY_CHECK', 'VALIDATED'])(
      'refuses a changed fifth-attempt chapter after restart at %s without another paid call',
      async (stage) => {
        const { owner, created, job } = await fixture();
        await db.query('UPDATE aw_jobs SET attempt=4 WHERE id=$1', [job.id]);
        await expect(
          processLifeJob(job, new InterruptedJobs(stage), chargingAi(job)),
        ).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
        await db.query(
          "UPDATE aw_jobs SET checkpoints=jsonb_set(checkpoints,'{chapter,body}',to_jsonb((checkpoints#>>'{chapter,body}')||' changed')) WHERE id=$1",
          [job.id],
        );
        const resumed = (await jobs.claim())!;
        await expect(
          processLifeJob(resumed, jobs, chargingAi(resumed)),
        ).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
        expect((await lives.branch(owner, created.branchId)).revision).toBe(0);
        expect(
          await db.query(
            'SELECT id FROM aw_budget_reservations WHERE job_id=$1',
            [job.id],
          ),
        ).toHaveLength(3);
        expect(resumed.checkpoints.fidelityPassed).toBe(false);
      },
    );
    it('ignores a malformed cached verdict and rechecks the exact chapter', async () => {
      const { job } = await fixture();
      const check = vi.fn(lifeTestAi.checkPeriodChapter);
      await expect(
        processLifeJob(job, new InterruptedJobs('FIDELITY_CHECK'), {
          ...lifeTestAi,
          checkPeriodChapter: check,
        }),
      ).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
      await db.query(
        'UPDATE aw_jobs SET checkpoints=jsonb_set(checkpoints,\'{fidelityResult}\',\'{"valid":true,"issues":null}\'::jsonb) WHERE id=$1',
        [job.id],
      );
      await processLifeJob((await jobs.claim())!, jobs, {
        ...lifeTestAi,
        checkPeriodChapter: check,
      });
      expect(check).toHaveBeenCalledTimes(2);
    });
    it.each(['FIDELITY_CHECK', 'VALIDATED'])(
      'commits cached fifth-attempt results after a restart at %s without a sixth paid attempt',
      async (stage) => {
        const { owner, created, job } = await fixture();
        await db.query('UPDATE aw_jobs SET attempt=4 WHERE id=$1', [job.id]);
        await expect(
          processLifeJob(job, new InterruptedJobs(stage), chargingAi(job)),
        ).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
        const resumed = (await jobs.claim())!;
        expect(resumed.id).toBe(job.id);
        expect(resumed.attempt).toBe(5);
        const calls = {
          period: vi.fn(lifeTestAi.period),
          periodChapter: vi.fn(lifeTestAi.periodChapter),
          checkPeriodChapter: vi.fn(lifeTestAi.checkPeriodChapter),
        };
        await processLifeJob(resumed, jobs, calls);
        for (const call of Object.values(calls))
          expect(call).not.toHaveBeenCalled();
        expect((await lives.branch(owner, created.branchId)).revision).toBe(1);
        expect(
          await db.query(
            'SELECT id FROM aw_budget_reservations WHERE job_id=$1',
            [job.id],
          ),
        ).toHaveLength(3);
      },
    );
    it('does not earn a second automatic story repair after restarting a rejected chapter', async () => {
      const { job } = await fixture();
      const invalid = vi.fn(
        async (input: Parameters<LifeAiProvider['periodChapter']>[0]) => {
          const result = await lifeTestAi.periodChapter(input);
          return {
            ...result,
            output: {
              ...result.output,
              eventIds: result.output.eventIds.map(() => randomUUID()),
            },
          };
        },
      );
      await expect(
        processLifeJob(job, new InterruptedJobs('CHAPTER_REJECTED'), {
          ...lifeTestAi,
          periodChapter: invalid,
        }),
      ).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
      await expect(
        processLifeJob((await jobs.claim())!, jobs, {
          ...lifeTestAi,
          periodChapter: invalid,
        }),
      ).rejects.toMatchObject({ code: 'STORY_FIDELITY_FAILED' });
      expect(invalid).toHaveBeenCalledTimes(2);
    });
  },
);
