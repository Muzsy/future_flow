import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type OpenAIClient from 'openai';
import { PGlite } from '@electric-sql/pglite';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { OpenAiProvider, type AiRequestGuard } from '@future-flow/ai';
import { DomainError } from '@future-flow/core';
import {
  DatabaseAiBudget,
  LifeJobRepository,
  LifeRepository,
  Repository,
  configureGenerationGate,
  releaseStaleBillingReservations,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import {
  configureWorkerChapterBilling,
  personalRequestAdmission,
  personalChapterGuard,
} from '../apps/worker/src/chapter-billing';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { applyMigrations } from '../scripts/lib/migrations';
import { prepareFictionJobFixture } from './fiction-storage-fixtures';
import { setupFixture, lifeTestAi } from './life-fixtures';

const SDK = createRequire(
  new URL('../packages/ai/package.json', import.meta.url),
)('openai').default as typeof import('openai').default;
let engine: PGlite,
  db: Database,
  repo: Repository,
  lives: LifeRepository,
  jobs: LifeJobRepository;
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
const enabled = (over: NodeJS.ProcessEnv = {}) => ({
  BILLING_ENABLED: 'true',
  BILLING_ENFORCEMENT: 'true',
  STRIPE_SECRET_KEY: 'sk_test_dispatchkey12345',
  STRIPE_WEBHOOK_SECRET: 'whsec_dispatchsecret123',
  STRIPE_PRICE_ID: 'price_dispatch123',
  STRIPE_FOUNDER_COUPON_ID: 'founder_launch',
  STRIPE_API_VERSION: '2025-03-31.basil',
  BILLING_SUCCESS_URL: 'https://alterward.example/billing/success',
  BILLING_CANCEL_URL: 'https://alterward.example/billing/cancel',
  ...over,
});
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
  configureGenerationGate(null);
  vi.restoreAllMocks();
  await db.query(
    "UPDATE aw_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE status IN ('running','queued')",
  );
});
afterAll(async () => {
  await engine?.close();
});

async function fixture(
  bucket: 'old' | 'taster' | 'paid' = 'old',
  narrative = false,
) {
  configureGenerationGate(null);
  const owner = randomUUID();
  await repo.ensureUser(owner);
  await repo.acceptPrivacy(owner);
  const subscription = `sub_${owner}`,
    grant = `in_${owner}`;
  if (bucket === 'paid') {
    await db.query(
      "INSERT INTO aw_billing_subscriptions(subscription_id,user_id,customer_id,status,period_start,period_end,last_state_event_created,paid_invoice_ids) VALUES($1,$2,$3,'active',now()-interval '1 day',now()+interval '29 days',1,ARRAY[$4]::text[])",
      [subscription, owner, `cus_${owner}`, grant],
    );
    await db.query(
      "INSERT INTO aw_billing_grants(key,subscription_id,user_id,cycle_index,amount,expires_at) VALUES($1,$2,$3,1,5,now()+interval '29 days')",
      [grant, subscription, owner],
    );
  }
  if (bucket !== 'old') configureWorkerChapterBilling(enabled());
  const created = await lives.create(owner, setupFixture(), randomUUID());
  const job = (await jobs.claim())!;
  expect(job.id).toBe(created.jobId);
  if (narrative) await prepareFictionJobFixture(db, job, 'v9');
  if (bucket !== 'old')
    expect((await reservations(owner))[0]?.bucket).toBe(bucket);
  return { owner, job, subscription, grant };
}
function provider(
  job: LifeJob,
  narrative = false,
  injectedGuard?: AiRequestGuard,
) {
  const parse = vi
    .fn()
    .mockRejectedValue(
      new DomainError('TEST_VENDOR_REACHED', 'Local transport boundary.', 503),
    );
  const guard = injectedGuard ?? {
    reserve: vi.fn(async () => 'local-usd-ticket'),
    settle: vi.fn(async () => {}),
  };
  const ai = new OpenAiProvider(
    {
      apiKey: 'test-only-key',
      eventModel: 'gpt-6.1-sol',
      storyModel: 'gpt-6.1-sol',
      timeoutMs: 1000,
      maxOutputTokens: 12000,
      beforePhysicalRequest: personalRequestAdmission(jobs, job, narrative),
      guard: personalChapterGuard(guard, jobs, job),
    },
    { responses: { parse } } as unknown as OpenAIClient,
  );
  return { ai, parse, guard };
}
const reservations = (owner: string) =>
  db.query(
    'SELECT * FROM aw_billing_reservations WHERE user_id=$1 ORDER BY key',
    [owner],
  );
// The old-beta exemption ends at a fixed instant (2026-11-28 01:17:38 CET). Tests
// that need it to be live pin the clock inside the original window, so they do
// not start failing once the real date passes it. PGlite reads the same Date.
async function insideOriginalBetaWindow<T>(run: () => Promise<T>) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
  try {
    return await run();
  } finally {
    vi.useRealTimers();
  }
}
async function blocked(
  f: Awaited<ReturnType<typeof fixture>>,
  code = 'BILLING_RESERVATION_REQUIRED',
  narrative = false,
) {
  const p = provider(f.job, narrative),
    before = await reservations(f.owner);
  await expect(p.ai.period(f.job.payload)).rejects.toMatchObject({ code });
  expect(p.parse).not.toHaveBeenCalled();
  expect(p.guard.reserve).not.toHaveBeenCalled();
  expect(await reservations(f.owner)).toEqual(before);
}

describe('personal provider dispatch checks over migration039 and the actual SDK wrapper', () => {
  it('blocks an old unreserved job without creating a taster or USD reservation', async () => {
    const f = await fixture();
    configureWorkerChapterBilling(enabled());
    await blocked(f);
    expect(await reservations(f.owner)).toEqual([]);
  });
  it('preserves the old payload and makes reservation adoption an explicit user retry', async () => {
    const f = await fixture();
    configureWorkerChapterBilling(enabled());
    const p = provider(f.job);
    let failure: unknown;
    try {
      await p.ai.period(f.job.payload);
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: 'BILLING_RESERVATION_REQUIRED' });
    await jobs.fail(f.job, failure);
    const failed = (
      await db.query(
        'SELECT payload,status,error_code FROM aw_jobs WHERE id=$1',
        [f.job.id],
      )
    )[0]!;
    expect(failed.payload).toEqual(f.job.payload);
    expect(failed.status).toBe('failed');
    expect(failed.error_code).toBe('BILLING_RESERVATION_REQUIRED');
    expect(await reservations(f.owner)).toEqual([]);
    const branch = (
      await db.query<{ revision: number }>(
        'SELECT revision FROM aw_branches WHERE id=$1',
        [f.job.branch_id],
      )
    )[0]!;
    const key = randomUUID();
    await lives.retry(f.owner, f.job.id.toUpperCase(), branch.revision, key);
    await lives.retry(f.owner, f.job.id.toUpperCase(), branch.revision, key);
    const resumed = (await jobs.claim())!;
    expect(resumed.id).toBe(f.job.id);
    const next = provider(resumed);
    await expect(next.ai.period(resumed.payload)).rejects.toMatchObject({
      code: 'TEST_VENDOR_REACHED',
    });
    expect(next.parse).toHaveBeenCalledTimes(1);
    expect(
      (await reservations(f.owner)).map((r) => [r.key, r.bucket, r.state]),
    ).toEqual([[f.job.id, 'taster', 'reserved']]);
  });
  it('fails closed on a database error before reserving USD or contacting the provider', async () => {
    const f = await fixture('taster'),
      p = provider(f.job),
      before = await reservations(f.owner);
    vi.spyOn(db, 'query').mockRejectedValueOnce(
      Error('Local dispatch database unavailable.'),
    );
    await expect(p.ai.period(f.job.payload)).rejects.toMatchObject({
      code: 'AI_REQUEST_FAILED',
    });
    expect(p.parse).not.toHaveBeenCalled();
    expect(p.guard.reserve).not.toHaveBeenCalled();
    expect(await reservations(f.owner)).toEqual(before);
  });
  it.each(['released', 'consumed'])(
    'blocks a %s reservation before any physical request',
    async (state) => {
      const f = await fixture('taster');
      await db.query(
        'UPDATE aw_billing_reservations SET state=$2 WHERE user_id=$1',
        [f.owner, state],
      );
      await blocked(f);
    },
  );
  it.each(['taster', 'paid'] as const)(
    'honours an existing %s reservation without another debit',
    async (bucket) => {
      const f = await fixture(bucket),
        p = provider(f.job),
        before = await reservations(f.owner);
      for (let n = 0; n < 2; n++)
        await expect(p.ai.period(f.job.payload)).rejects.toMatchObject({
          code: 'TEST_VENDOR_REACHED',
        });
      expect(p.parse).toHaveBeenCalledTimes(2);
      expect(p.guard.reserve).toHaveBeenCalledTimes(2);
      expect(await reservations(f.owner)).toEqual(before);
    },
  );
  it('does not borrow another account reservation with the same job id', async () => {
    const f = await fixture('taster'),
      other = randomUUID();
    await repo.ensureUser(other);
    const before = await reservations(f.owner);
    await blocked(
      { ...f, owner: other, job: { ...f.job, user_id: other } },
      'JOB_LEASE_LOST',
    );
    expect(await reservations(f.owner)).toEqual(before);
  });
  it('blocks unusable billing without calling the provider or USD guard', async () => {
    const f = await fixture('taster');
    configureWorkerChapterBilling(enabled({ BILLING_ENABLED: 'false' }));
    await blocked(f, 'BILLING_UNAVAILABLE');
  });
  it.each(['expired', 'replaced'])(
    'rejects a %s worker lease even with a held chapter',
    async (state) => {
      const f = await fixture('taster');
      await db.query(
        state === 'expired'
          ? "UPDATE aw_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1"
          : 'UPDATE aw_jobs SET lease_token=$2 WHERE id=$1',
        state === 'expired' ? [f.job.id] : [f.job.id, randomUUID()],
      );
      await blocked(f, 'JOB_LEASE_LOST');
    },
  );
  it('blocks an actual stale release and gives an explicit retry a fresh reservation TTL', async () => {
    const f = await fixture('taster');
    await db.query(
      "UPDATE aw_billing_reservations SET created_at=now()-interval '3 hours' WHERE user_id=$1",
      [f.owner],
    );
    expect(
      await releaseStaleBillingReservations(db, { olderThanMs: 3600000 }),
    ).toEqual({ released: 1 });
    await blocked(f);
    await jobs.fail(
      f.job,
      new DomainError(
        'BILLING_RESERVATION_REQUIRED',
        'Local released fixture.',
        503,
      ),
    );
    const [branch] = await db.query<{ revision: number }>(
      'SELECT revision FROM aw_branches WHERE id=$1',
      [f.job.branch_id],
    );
    await lives.retry(f.owner, f.job.id, branch!.revision, randomUUID());
    expect(
      await releaseStaleBillingReservations(db, { olderThanMs: 3600000 }),
    ).toEqual({ released: 0 });
    const job = (await jobs.claim())!,
      p = provider(job);
    expect(job.id).toBe(f.job.id);
    await expect(p.ai.period(job.payload)).rejects.toMatchObject({
      code: 'TEST_VENDOR_REACHED',
    });
    expect(p.parse).toHaveBeenCalledTimes(1);
    expect((await reservations(f.owner))[0]?.state).toBe('reserved');
  });
  it.each(['refund', 'lease'])(
    'rechecks %s after real USD allocation and returns known-unused funding',
    async (change) => {
      const f = await fixture('paid');
      const real = new DatabaseAiBudget(
        db,
        f.owner,
        f.job.id,
        { projectUsd: 10, userUsd: 3.34 },
        f.job.lease_token,
      );
      const before = await db.query(
        'SELECT id,accounted_micro FROM aw_budget_accounts ORDER BY id',
      );
      const racing: AiRequestGuard = {
        reserve: async (parameters) => {
          const ticket = await real.reserve(parameters);
          await db.query(
            change === 'refund'
              ? 'UPDATE aw_billing_grants SET revoked=true WHERE user_id=$1'
              : "UPDATE aw_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE user_id=$1",
            [f.owner],
          );
          return ticket;
        },
        settle: (ticket, usage) => real.settle(ticket, usage),
      };
      const p = provider(f.job, false, racing);
      await expect(p.ai.period(f.job.payload)).rejects.toMatchObject({
        code:
          change === 'refund'
            ? 'BILLING_RESERVATION_REQUIRED'
            : 'JOB_LEASE_LOST',
      });
      expect(p.parse).not.toHaveBeenCalled();
      const [ticket] = await db.query(
        'SELECT status,accounted_micro,input_tokens,output_tokens FROM aw_budget_reservations WHERE job_id=$1',
        [f.job.id],
      );
      expect(ticket).toEqual({
        status: 'completed',
        accounted_micro: 0,
        input_tokens: 0,
        output_tokens: 0,
      });
      const after = await db.query(
        'SELECT id,accounted_micro FROM aw_budget_accounts ORDER BY id',
      );
      for (const account of before)
        expect(after.find((row) => row.id === account.id)).toEqual(account);
      expect(
        after
          .filter((row) => !before.some((old) => old.id === row.id))
          .every((row) => Number(row.accounted_micro) === 0),
      ).toBe(true);
      expect((await reservations(f.owner))[0]?.state).toBe('reserved');
    },
  );
  it('allows a held chapter through real USD funding without consuming it before durable save', async () => {
    const f = await fixture('paid'),
      real = new DatabaseAiBudget(
        db,
        f.owner,
        f.job.id,
        { projectUsd: 10, userUsd: 3.34 },
        f.job.lease_token,
      );
    const p = provider(f.job, false, real);
    p.parse.mockResolvedValueOnce({
      status: 'completed',
      model: 'gpt-6.1-sol',
      output_parsed: (await lifeTestAi.period(f.job.payload)).output,
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    });
    await p.ai.period(f.job.payload);
    expect(p.parse).toHaveBeenCalledTimes(1);
    const [ticket] = await db.query(
      'SELECT status,accounted_micro FROM aw_budget_reservations WHERE job_id=$1',
      [f.job.id],
    );
    expect(ticket?.status).toBe('completed');
    expect(Number(ticket?.accounted_micro)).toBeGreaterThan(0);
    expect((await reservations(f.owner))[0]?.state).toBe('reserved');
  });
  it.each([
    'UPDATE aw_billing_grants SET revoked=true WHERE user_id=$1',
    'UPDATE aw_billing_subscriptions SET reconcile_required=true WHERE user_id=$1',
    "UPDATE aw_billing_subscriptions SET revoked='refund' WHERE user_id=$1",
  ])(
    'rechecks a changed paid projection at dispatch (case %#)',
    async (change) => {
      const f = await fixture('paid');
      await db.query(change, [f.owner]);
      await blocked(f);
    },
  );
  it('rechecks before an application retry rather than reusing the first authorization', async () => {
    const f = await fixture('paid'),
      p = provider(f.job);
    p.parse.mockImplementationOnce(async () => {
      await db.query(
        'UPDATE aw_billing_grants SET revoked=true WHERE user_id=$1',
        [f.owner],
      );
      throw new SDK.RateLimitError(
        429,
        { code: 'rate_limit_exceeded' },
        'Transient local fixture.',
        new Headers({ 'retry-after': '0' }),
      );
    });
    await expect(p.ai.period(f.job.payload)).rejects.toMatchObject({
      code: 'BILLING_RESERVATION_REQUIRED',
    });
    expect(p.parse).toHaveBeenCalledTimes(1);
    expect(p.guard.reserve).toHaveBeenCalledTimes(1);
  });
  it.each([
    "UPDATE aw_billing_grants SET expires_at=now()-interval '1 hour' WHERE user_id=$1",
    "UPDATE aw_billing_subscriptions SET status='canceled',period_end=now()-interval '1 hour' WHERE user_id=$1",
  ])(
    'honours already-held paid work after natural cycle end (case %#)',
    async (change) => {
      const f = await fixture('paid');
      await db.query(change, [f.owner]);
      const p = provider(f.job),
        before = await reservations(f.owner);
      await expect(p.ai.period(f.job.payload)).rejects.toMatchObject({
        code: 'TEST_VENDOR_REACHED',
      });
      expect(p.parse).toHaveBeenCalledTimes(1);
      expect(await reservations(f.owner)).toEqual(before);
    },
  );
  it('a leftover founder list neither grants a reservation exemption nor a discount', async () => {
    const f = await fixture();
    const config = configureWorkerChapterBilling(
      enabled({ BILLING_FOUNDER_USER_IDS: f.owner }),
    );
    expect(config.enabled).toBe(true);
    expect(config).not.toHaveProperty('designatedUserIds');
    await blocked(f);
  });
  it('enforcement OFF makes the added billing check a query-free no-op', async () => {
    const f = await fixture();
    configureWorkerChapterBilling({ BILLING_ENFORCEMENT: 'false' });
    const query = vi.spyOn(db, 'query'),
      p = provider(f.job);
    await expect(p.ai.period(f.job.payload)).rejects.toMatchObject({
      code: 'TEST_VENDOR_REACHED',
    });
    expect(query).not.toHaveBeenCalled();
    expect(p.parse).toHaveBeenCalledTimes(1);
  });
  it('retains the API-equivalent explicit old-beta exemption inside the original window even with unusable billing', () =>
    insideOriginalBetaWindow(async () => {
      const f = await fixture();
      configureWorkerChapterBilling(
        enabled({
          BILLING_ENABLED: 'false',
          CLOSED_BETA_ENABLED: 'true',
          CLOSED_BETA_USER_IDS: f.owner,
        }),
      );
      const query = vi.spyOn(db, 'query'),
        p = provider(f.job);
      await expect(p.ai.period(f.job.payload)).rejects.toMatchObject({
        code: 'TEST_VENDOR_REACHED',
      });
      // Only the database-clock read of the time-bounded exemption, no billing query.
      expect(new Set(query.mock.calls.map((call) => call[0]))).toEqual(
        new Set(['SELECT clock_timestamp() AS billing_now']),
      );
      expect(p.parse).toHaveBeenCalledTimes(1);
    }));
  it.each([false, true])(
    'does not grant exemption from a leftover or different beta list (enabled=%s)',
    async (on) => {
      const f = await fixture();
      configureWorkerChapterBilling(
        enabled({
          CLOSED_BETA_ENABLED: String(on),
          CLOSED_BETA_USER_IDS: on ? randomUUID() : f.owner,
        }),
      );
      await blocked(f);
    },
  );
  it('the old-beta exemption does not waive the independent original USD window', () =>
    insideOriginalBetaWindow(async () => {
      const f = await fixture();
      configureWorkerChapterBilling(
        enabled({ CLOSED_BETA_ENABLED: 'true', CLOSED_BETA_USER_IDS: f.owner }),
      );
      const p = provider(f.job),
        end = new Date(Date.now() - 60000),
        start = new Date(end.getTime() - 30 * 86400000);
      const budget = new DatabaseAiBudget(
        db,
        f.owner,
        f.job.id,
        {
          projectUsd: 10,
          userUsd: 3.34,
          closedBetaUserIds: [f.owner],
          window: { startsAt: start.toISOString(), endsAt: end.toISOString() },
        },
        f.job.lease_token,
      );
      const ai = new OpenAiProvider(
        {
          apiKey: 'test-only-key',
          eventModel: 'gpt-6.1-sol',
          storyModel: 'gpt-6.1-sol',
          timeoutMs: 1000,
          maxOutputTokens: 12000,
          guard: budget,
          beforePhysicalRequest: personalRequestAdmission(jobs, f.job, false),
        },
        { responses: { parse: p.parse } } as unknown as OpenAIClient,
      );
      await expect(ai.period(f.job.payload)).rejects.toMatchObject({
        code: 'AI_BUDGET_WINDOW_CLOSED',
      });
      expect(p.parse).not.toHaveBeenCalled();
    }));
  it('rejects an unreserved C5 job without advancing the physical-request counter', async () => {
    const f = await fixture('old', true);
    configureWorkerChapterBilling(enabled());
    const before = (
      await db.query('SELECT checkpoints FROM aw_jobs WHERE id=$1', [f.job.id])
    )[0];
    await blocked(f, 'BILLING_RESERVATION_REQUIRED', true);
    expect(
      (
        await db.query('SELECT checkpoints FROM aw_jobs WHERE id=$1', [
          f.job.id,
        ])
      )[0],
    ).toEqual(before);
  });
  it('lets a valid reserved C5 request retain its existing physical-request accounting', async () => {
    const f = await fixture('taster', true),
      p = provider(f.job, true);
    const before = Number(f.job.checkpoints.providerRequestCount ?? 0);
    await expect(p.ai.period(f.job.payload)).rejects.toMatchObject({
      code: 'TEST_VENDOR_REACHED',
    });
    expect(p.parse).toHaveBeenCalledTimes(1);
    expect(f.job.checkpoints.providerRequestCount).toBe(before + 1);
  });
  it('settles an already-ready C5 result without new provider calls while billing is unavailable', async () => {
    const f = await fixture('taster', true);
    await db.query(
      "UPDATE aw_billing_reservations SET state='released' WHERE user_id=$1",
      [f.owner],
    );
    configureWorkerChapterBilling(enabled({ BILLING_ENABLED: 'false' }));
    const p = provider(f.job, true);
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse).not.toHaveBeenCalled();
    expect(p.guard.reserve).not.toHaveBeenCalled();
    expect((await reservations(f.owner))[0]?.state).toBe('consumed');
    expect(
      (
        await db.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM aw_periods WHERE user_id=$1',
          [f.owner],
        )
      )[0]?.count,
    ).toBe(1);
  });
});
