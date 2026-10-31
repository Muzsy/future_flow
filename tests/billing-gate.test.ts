import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DomainError } from '@future-flow/core';
import {
  Repository,
  LifeRepository,
  LifeJobRepository,
  configureGenerationGate,
  createBillingStore,
  createGenerationGate,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { setupFixture, lifeTestAi } from './life-fixtures';

// The chapter allowance gate over the real life repositories (migration 039).
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
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await applyMigrations(engine);
  db = adapter(engine);
  repo = new Repository(db);
  lives = new LifeRepository(db, { daily: 100, concurrent: 10 });
  jobs = new LifeJobRepository(db);
});
afterEach(() => configureGenerationGate(null));
afterAll(async () => engine?.close());

async function person() {
  const id = randomUUID();
  await repo.ensureUser(id);
  await repo.acceptPrivacy(id);
  return id;
}
const reservations = (userId: string) =>
  db.query<{ key: string; bucket: string; state: string }>(
    'SELECT key,bucket,state FROM aw_billing_reservations WHERE user_id=$1 ORDER BY created_at',
    [userId],
  );
async function finishNext() {
  const job = (await jobs.claim())!;
  expect(job).toBeTruthy();
  await processLifeJob(job, jobs, lifeTestAi);
  return job;
}
async function nextChapter(userId: string, branchId: string, key: string) {
  const detail = await lives.detail(userId, branchId);
  const b = detail.branch,
    d = b.pending_decision!;
  const chosen = await lives.choose(
    userId,
    b.id,
    b.revision,
    d.id,
    d.options[0]!.id,
    `${key}-choice`,
  );
  return lives.continue(userId, branchId, chosen.revision, `${key}-continue`);
}
async function subscribe(userId: string, chapters: number) {
  const store = createBillingStore(db);
  const sub = `sub_${randomUUID().slice(0, 8)}`;
  const start = new Date(Date.now() - 86_400_000).toISOString();
  const end = new Date(Date.now() + 20 * 86_400_000).toISOString();
  await store.transaction(async (tx) => {
    await tx.saveSubscription({
      subscriptionId: sub,
      customerId: `cus_${sub}`,
      userId,
      status: 'active',
      periodStart: start,
      periodEnd: end,
      cancelAtPeriodEnd: false,
      discounted: false,
      paidInvoiceIds: [],
      refundedInvoiceIds: [],
      revoked: null,
      lastStateEventCreated: 1,
      reconcileRequired: false,
      cancelPending: false,
    });
    await tx.insertGrant(
      { key: `${sub}:1`, cycleIndex: 1, amount: chapters, expiresAt: end },
      { subscriptionId: sub, userId },
    );
  });
}

describe.sequential('generation gate', () => {
  it('is a complete no-op while enforcement is off', async () => {
    const u = await person();
    const created = await lives.create(u, setupFixture(), 'off-create');
    await finishNext();
    await nextChapter(u, created.branchId, 'off-next');
    await finishNext();
    expect(await reservations(u)).toEqual([]);
  });

  it('gives a new account its one taster chapter, consumed with the saved chapter', async () => {
    configureGenerationGate(
      createGenerationGate({ ready: true, exemptUserIds: [] }),
    );
    const u = await person();
    const created = await lives.create(u, setupFixture(), 'taster-create');
    // An identical retry returns the same job and reserves nothing more.
    expect(await lives.create(u, setupFixture(), 'taster-create')).toEqual(
      created,
    );
    expect(await reservations(u)).toMatchObject([
      { bucket: 'taster', state: 'reserved' },
    ]);
    const job = await finishNext();
    expect(await reservations(u)).toMatchObject([
      { key: job.id, bucket: 'taster', state: 'consumed' },
    ]);
    // The second chapter needs a subscription: refused (402), nothing half-done.
    const before = await lives.detail(u, created.branchId);
    await expect(
      nextChapter(u, created.branchId, 'taster-next'),
    ).rejects.toMatchObject({
      code: 'BILLING_NO_ENTITLEMENT',
      status: 402,
    });
    const after = await lives.detail(u, created.branchId);
    // The choice itself stays saved; only the new chapter was refused.
    expect(after.branch.pending_decision).toBeNull();
    expect(after.branch.revision).toBe(before.branch.revision + 1);
    expect(after.periods).toHaveLength(1);
    expect(await reservations(u)).toHaveLength(1);
    expect(
      await db.query(
        "SELECT 1 FROM aw_jobs WHERE user_id=$1 AND status='queued'",
        [u],
      ),
    ).toHaveLength(0);
  });

  it('enforces the paid allowance exactly and keeps reading available', async () => {
    configureGenerationGate(
      createGenerationGate({ ready: true, exemptUserIds: [] }),
    );
    const u = await person();
    await subscribe(u, 2);
    const created = await lives.create(u, setupFixture(), 'paid-create');
    await finishNext();
    await nextChapter(u, created.branchId, 'paid-next');
    await finishNext();
    await expect(
      nextChapter(u, created.branchId, 'paid-over'),
    ).rejects.toMatchObject({
      code: 'BILLING_ALLOWANCE_EXHAUSTED',
      status: 402,
    });
    expect((await reservations(u)).map((r) => [r.bucket, r.state])).toEqual([
      ['paid', 'consumed'],
      ['paid', 'consumed'],
    ]);
    expect((await lives.detail(u, created.branchId)).periods).toHaveLength(2);
  });

  it('releases a failed attempt and reserves again on retry (one chapter, one debit)', async () => {
    configureGenerationGate(
      createGenerationGate({ ready: true, exemptUserIds: [] }),
    );
    const u = await person();
    const created = await lives.create(u, setupFixture(), 'retry-create');
    const job = (await jobs.claim())!;
    await jobs.fail(
      job,
      new DomainError('AI_PROVIDER_FAILED', 'Test interruption.'),
    );
    expect(await reservations(u)).toMatchObject([
      { key: job.id, state: 'released' },
    ]);
    await lives.retry(u, job.id, 0, 'retry-key');
    expect(await reservations(u)).toMatchObject([
      { key: job.id, state: 'reserved' },
    ]);
    await finishNext();
    expect(await reservations(u)).toMatchObject([
      { key: job.id, state: 'consumed' },
    ]);
    expect(created.jobId).toBe(job.id);
  });

  it('never gates or debits the closed-beta accounts', async () => {
    const u = await person();
    configureGenerationGate(
      createGenerationGate({ ready: false, exemptUserIds: [u.toUpperCase()] }),
    );
    const created = await lives.create(u, setupFixture(), 'exempt-create');
    await finishNext();
    await nextChapter(u, created.branchId, 'exempt-next');
    await finishNext();
    await nextChapter(u, created.branchId, 'exempt-third');
    expect(await reservations(u)).toEqual([]);
  });

  it('fails closed for everyone else when enforcement is on but billing is unusable', async () => {
    configureGenerationGate(
      createGenerationGate({ ready: false, exemptUserIds: [] }),
    );
    const u = await person();
    await expect(
      lives.create(u, setupFixture(), 'closed-create'),
    ).rejects.toMatchObject({
      code: 'BILLING_UNAVAILABLE',
      status: 503,
    });
    expect(
      await db.query('SELECT 1 FROM aw_jobs WHERE user_id=$1', [u]),
    ).toHaveLength(0);
  });
});
