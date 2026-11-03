import { randomUUID } from 'node:crypto';
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
import {
  LEGACY_BETA_CHAPTER_EXEMPTION_ENDS_AT,
  LifeJobRepository,
  LifeRepository,
  Repository,
  assertGenerationChapterDispatch,
  closedBetaConfigFromEnv,
  configureGenerationGate,
  createGenerationGate,
  legacyBetaChapterExemption,
  reserveGenerationChapter,
  applicationAiBudgetConfigFromEnv,
  type Database,
} from '@future-flow/database';
import { configureWorkerChapterBilling } from '../apps/worker/src/chapter-billing';
import { applyMigrations } from '../scripts/lib/migrations';
import { setupFixture } from './life-fixtures';

// The three original closed-beta accounts are exempt from chapter counting only
// until the proven original tester window ends: 2026-11-28 01:17:38 CET.
const END = '2026-11-28T00:17:38.000Z';
const CLOCK = 'SELECT clock_timestamp() AS billing_now';

let engine: PGlite, db: Database, repo: Repository;
let lives: LifeRepository, jobs: LifeJobRepository;
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
// Only the exemption clock read is replaced, so every other query (the job
// lease, the reservation) still runs against the real database.
function clockedAt(instant: string, target: Database = db): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) =>
      sql === CLOCK
        ? [{ billing_now: instant } as unknown as T]
        : target.query<T>(sql, values),
    transaction: (run) =>
      target.transaction((tx) => run(clockedAt(instant, tx))),
  };
}
const reservations = (owner: string) =>
  db.query('SELECT * FROM aw_billing_reservations WHERE user_id=$1', [owner]);
async function person() {
  const id = randomUUID();
  await repo.ensureUser(id);
  await repo.acceptPrivacy(id);
  return id;
}
async function runningJob(owner: string) {
  configureGenerationGate(null);
  await lives.create(owner, setupFixture(), randomUUID());
  const job = await jobs.claim();
  expect(job?.user_id).toBe(owner);
  return job!;
}
const env = (over: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  BILLING_ENABLED: 'true',
  BILLING_ENFORCEMENT: 'true',
  STRIPE_SECRET_KEY: 'sk_test_exemptionkey12345',
  STRIPE_WEBHOOK_SECRET: 'whsec_exemptionsecret123',
  STRIPE_PRICE_ID: 'price_exemption123',
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

describe('time-bounded exemption configuration', () => {
  it('ends exactly with the proven original tester window, in CET and UTC', () => {
    expect(LEGACY_BETA_CHAPTER_EXEMPTION_ENDS_AT).toBe(END);
    expect(Date.parse(END)).toBe(Date.parse('2026-11-28T01:17:38+01:00'));
  });
  it('grants nothing without a running closed beta and always carries the fixed end', () => {
    const id = randomUUID();
    expect(
      legacyBetaChapterExemption({ enabled: false, userIds: [id] }),
    ).toEqual({ exemptUserIds: [], exemptEndsAt: END });
    expect(
      legacyBetaChapterExemption({ enabled: true, userIds: [id] }),
    ).toEqual({ exemptUserIds: [id], exemptEndsAt: END });
  });
  it('cannot construct an unbounded or malformed exemption', () => {
    const id = randomUUID();
    for (const exemptEndsAt of [
      undefined,
      'not-a-date',
      new Date(NaN),
    ] as const)
      expect(() =>
        createGenerationGate({
          ready: true,
          exemptUserIds: [id],
          exemptEndsAt,
        }),
      ).toThrow('A chapter exemption needs a valid end');
    // No exempt accounts: no end is needed and nobody is ever exempt.
    expect(() =>
      createGenerationGate({ ready: true, exemptUserIds: [] }),
    ).not.toThrow();
  });
  it('is not extended by a new USD period or a successor beta configuration', () => {
    const id = randomUUID(),
      source = env({
        CLOSED_BETA_ENABLED: 'true',
        CLOSED_BETA_USER_IDS: id,
        AI_PROJECT_BUDGET_USD: '10',
        AI_USER_BUDGET_USD: '3.34',
        AI_BUDGET_WINDOW_START: '2026-12-01T00:00:00Z',
        AI_BUDGET_WINDOW_END: '2026-12-31T00:00:00Z',
      });
    // A later, valid 30-day USD period exists for the same accounts ...
    expect(applicationAiBudgetConfigFromEnv(source).window?.endsAt).toBe(
      '2026-12-31T00:00:00.000Z',
    );
    // ... yet the chapter exemption derived from the same environment is unchanged.
    expect(legacyBetaChapterExemption(closedBetaConfigFromEnv(source))).toEqual(
      {
        exemptUserIds: [id],
        exemptEndsAt: END,
      },
    );
  });
});

describe('queue-time reservation', () => {
  it('stays exempt strictly before the end and is an ordinary account from the end on', async () => {
    const owner = await person();
    configureGenerationGate(
      createGenerationGate({
        ready: true,
        exemptUserIds: [owner.toUpperCase()],
        exemptEndsAt: END,
      }),
    );
    const before = new Date(Date.parse(END) - 1);
    await reserveGenerationChapter(db, owner, randomUUID(), before);
    expect(await reservations(owner)).toEqual([]);
    // From the end the same account takes the normal path: a fresh taster chapter.
    await reserveGenerationChapter(db, owner, randomUUID(), new Date(END));
    expect(await reservations(owner)).toHaveLength(1);
    expect((await reservations(owner))[0]!.bucket).toBe('taster');
  });
  it('closes an expired exempt account when billing is unusable instead of leaving it free', async () => {
    const owner = await person();
    configureGenerationGate(
      createGenerationGate({
        ready: false,
        exemptUserIds: [owner],
        exemptEndsAt: END,
      }),
    );
    await reserveGenerationChapter(
      db,
      owner,
      randomUUID(),
      new Date(Date.parse(END) - 1),
    );
    await expect(
      reserveGenerationChapter(db, owner, randomUUID(), new Date(END)),
    ).rejects.toMatchObject({ code: 'BILLING_UNAVAILABLE', status: 503 });
    expect(await reservations(owner)).toEqual([]);
  });
});

describe('physical dispatch', () => {
  async function dispatch(
    instant: string,
    job: Awaited<ReturnType<typeof runningJob>>,
  ) {
    await assertGenerationChapterDispatch(
      clockedAt(instant),
      job.user_id,
      job.id,
      job.lease_token!,
    );
  }
  it('re-checks the database clock before every dispatch and fails closed at and after the end', async () => {
    const owner = await person(),
      job = await runningJob(owner);
    configureWorkerChapterBilling(
      env({ CLOSED_BETA_ENABLED: 'true', CLOSED_BETA_USER_IDS: owner }),
    );
    // Same job, same lease: allowed one millisecond before the end ...
    await expect(
      dispatch('2026-11-28T00:17:37.999Z', job),
    ).resolves.toBeUndefined();
    await expect(
      dispatch('2026-10-29T00:17:38.000Z', job),
    ).resolves.toBeUndefined();
    // ... and denied without any reservation from the exact (exclusive) end.
    for (const instant of [
      END,
      '2026-11-28T00:17:38.001Z',
      '2026-12-31T00:00:00.000Z',
      '2027-06-01T00:00:00.000Z',
    ])
      await expect(dispatch(instant, job)).rejects.toMatchObject({
        code: 'BILLING_RESERVATION_REQUIRED',
      });
    expect(await reservations(owner)).toEqual([]);
  });
  it('does not treat an unreadable, invalid or missing clock as exempt', async () => {
    const owner = await person(),
      job = await runningJob(owner);
    configureWorkerChapterBilling(
      env({ CLOSED_BETA_ENABLED: 'true', CLOSED_BETA_USER_IDS: owner }),
    );
    for (const instant of ['invalid', '', 'Infinity'])
      await expect(dispatch(instant, job)).rejects.toMatchObject({
        code: 'BILLING_RESERVATION_REQUIRED',
      });
    const broken: Database = {
      ...db,
      query: async (sql, values) => {
        if (sql === CLOCK) throw Error('clock unavailable');
        return db.query(sql, values);
      },
    } as Database;
    await expect(
      assertGenerationChapterDispatch(broken, owner, job.id, job.lease_token!),
    ).rejects.toThrow('clock unavailable');
    const empty = {
      ...db,
      query: async (sql: string, values?: unknown[]) =>
        sql === CLOCK ? [] : db.query(sql, values),
    } as Database;
    await expect(
      assertGenerationChapterDispatch(empty, owner, job.id, job.lease_token!),
    ).rejects.toMatchObject({ code: 'BILLING_RESERVATION_REQUIRED' });
  });
  it('lets a new USD period run without extending the exemption', async () => {
    const owner = await person(),
      job = await runningJob(owner);
    configureWorkerChapterBilling(
      env({
        CLOSED_BETA_ENABLED: 'true',
        CLOSED_BETA_USER_IDS: owner,
        AI_PROJECT_BUDGET_USD: '10',
        AI_USER_BUDGET_USD: '3.34',
        AI_BUDGET_WINDOW_START: '2026-12-01T00:00:00Z',
        AI_BUDGET_WINDOW_END: '2026-12-31T00:00:00Z',
      }),
    );
    await expect(
      dispatch('2026-12-05T00:00:00.000Z', job),
    ).rejects.toMatchObject({
      code: 'BILLING_RESERVATION_REQUIRED',
    });
  });
  it('does not exempt other accounts or issue a clock read for them', async () => {
    const owner = await person(),
      other = await person(),
      job = await runningJob(other);
    configureWorkerChapterBilling(
      env({ CLOSED_BETA_ENABLED: 'true', CLOSED_BETA_USER_IDS: owner }),
    );
    const query = vi.spyOn(db, 'query');
    await expect(
      assertGenerationChapterDispatch(db, other, job.id, job.lease_token!),
    ).rejects.toMatchObject({ code: 'BILLING_RESERVATION_REQUIRED' });
    expect(query.mock.calls.some(([sql]) => sql === CLOCK)).toBe(false);
  });
  it('keeps the reservation requirement for a former exempt account with unusable billing', async () => {
    const owner = await person(),
      job = await runningJob(owner);
    configureWorkerChapterBilling(
      env({
        BILLING_ENABLED: 'false',
        CLOSED_BETA_ENABLED: 'true',
        CLOSED_BETA_USER_IDS: owner,
      }),
    );
    await expect(dispatch(END, job)).rejects.toMatchObject({
      code: 'BILLING_UNAVAILABLE',
      status: 503,
    });
  });
  it('lets a former exempt account with a valid reserved chapter continue after the end', async () => {
    const owner = await person();
    // Queued after the end: the normal path reserves the taster, so the later
    // dispatch is authorised by that reservation (not by the exemption).
    configureGenerationGate(
      createGenerationGate({
        ready: true,
        exemptUserIds: [owner],
        exemptEndsAt: END,
      }),
    );
    const created = await lives.create(owner, setupFixture(), randomUUID());
    const job = (await jobs.claim())!;
    expect(job.id).toBe(created.jobId);
    expect(await reservations(owner)).toEqual([]);
    await expect(dispatch(END, job)).rejects.toMatchObject({
      code: 'BILLING_RESERVATION_REQUIRED',
    });
    await db.query(
      "INSERT INTO aw_billing_reservations(user_id,key,bucket,grant_key,state) VALUES($1,$2,'taster',NULL,'reserved')",
      [owner, job.id],
    );
    await expect(dispatch(END, job)).resolves.toBeUndefined();
  });
});
