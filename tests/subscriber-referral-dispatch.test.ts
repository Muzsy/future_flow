import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TERMS_ACCEPTANCE_VERSION } from '@future-flow/contracts';
import { referralGrantKey } from '@future-flow/core';
import {
  LifeJobRepository,
  LifeRepository,
  Repository,
  ServiceAccessRepository,
  admitReferredAccount,
  assertGenerationChapterDispatch,
  configureGenerationGate,
  createGenerationGate,
  reserveGenerationChapter,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { setupFixture } from './life-fixtures';

// The gift chapter is an ordinary `paid` reservation, so the worker's physical
// dispatch check (the same assertGenerationChapterDispatch every provider call
// goes through) must close it exactly when the subscription is revoked or under
// reconciliation, and must keep honouring it after a plain cancellation.

const NOW = new Date('2026-11-02T00:00:00Z');
const day = 86_400_000;

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
  await new ServiceAccessRepository(db).replacePolicy(0, {
    mode: 'invitation',
    generationEnabled: true,
    checkoutEnabled: true,
  });
  await db.query(
    'UPDATE aw_service_policy SET reconcile_required=false,revision=revision+1',
  );
});
afterEach(async () => {
  configureGenerationGate(null);
  await db.query(
    "UPDATE aw_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE status IN ('running','queued')",
  );
});
afterAll(async () => {
  await engine?.close();
});

// An admitted subscriber with one paid invoice and a five-chapter month, whose
// invite was redeemed (so the gift grant exists), plus a running job.
async function giftHolder() {
  const id = randomUUID();
  await repo.ensureUser(id);
  await repo.acceptPrivacy(id);
  await db.query(
    "INSERT INTO aw_service_admissions(user_id,revision,state) VALUES($1,1,'active')",
    [id],
  );
  const sub = 'sub_' + id,
    invoice = 'in_' + id;
  await db.query(
    "INSERT INTO aw_billing_subscriptions(subscription_id,user_id,customer_id,status,period_start,period_end,last_state_event_created,paid_invoice_ids) VALUES($1,$2,$3,'active',$4,$5,1,ARRAY[$6]::text[])",
    [
      sub,
      id,
      'cus_' + id,
      new Date(NOW.getTime() - day),
      new Date(NOW.getTime() + 29 * day),
      invoice,
    ],
  );
  await db.query(
    'INSERT INTO aw_billing_grants(key,subscription_id,user_id,cycle_index,amount,expires_at) VALUES($1,$2,$3,1,5,$4)',
    [invoice, sub, id, new Date(NOW.getTime() + 29 * day)],
  );
  const outcome = await admitReferredAccount(
    db,
    randomUUID(),
    TERMS_ACCEPTANCE_VERSION,
    id,
    { now: NOW },
  );
  expect(outcome.status).toBe('admitted');
  configureGenerationGate(null);
  await lives.create(id, setupFixture(), randomUUID());
  const job = await jobs.claim();
  expect(job?.user_id).toBe(id);
  return { id, sub, job: job! };
}
const gate = () =>
  configureGenerationGate(
    createGenerationGate({ ready: true, exemptUserIds: [] }),
  );
// Spends the five monthly chapters, then reserves the job's own chapter: with
// an active subscription that one is the gift.
async function reserveGift(h: Awaited<ReturnType<typeof giftHolder>>) {
  gate();
  for (let i = 0; i < 5; i++)
    await reserveGenerationChapter(db, h.id, `month-${i}`, NOW);
  await reserveGenerationChapter(db, h.id, h.job.id, NOW);
  const [row] = await db.query<{ grant_key: string; bucket: string }>(
    'SELECT grant_key,bucket FROM aw_billing_reservations WHERE user_id=$1 AND key=$2',
    [h.id, h.job.id],
  );
  expect(row).toEqual({ grant_key: referralGrantKey(h.id), bucket: 'paid' });
}
const dispatch = (h: Awaited<ReturnType<typeof giftHolder>>) =>
  assertGenerationChapterDispatch(db, h.id, h.job.id, h.job.lease_token!);

describe('gift chapter at the worker dispatch check', () => {
  it('lets a reserved gift chapter through and closes it for a refund, a dispute and a quarantine', async () => {
    const h = await giftHolder();
    await reserveGift(h);
    await expect(dispatch(h)).resolves.toBeUndefined();
    for (const closed of [
      "revoked='refund'",
      "revoked='dispute'",
      'reconcile_required=true',
    ]) {
      await db.query(
        `UPDATE aw_billing_subscriptions SET ${closed} WHERE subscription_id=$1`,
        [h.sub],
      );
      await expect(dispatch(h)).rejects.toMatchObject({
        code: 'BILLING_RESERVATION_REQUIRED',
      });
      await db.query(
        'UPDATE aw_billing_subscriptions SET revoked=NULL,reconcile_required=false WHERE subscription_id=$1',
        [h.sub],
      );
      await expect(dispatch(h)).resolves.toBeUndefined();
    }
  });
  it('keeps honouring a gift reserved before a plain cancellation, and also reserves one afterwards', async () => {
    const h = await giftHolder();
    await reserveGift(h);
    // Cancelled and past its period end, but not revoked.
    await db.query(
      "UPDATE aw_billing_subscriptions SET status='canceled',period_end=$2 WHERE subscription_id=$1",
      [h.sub, new Date(NOW.getTime() - day)],
    );
    await expect(dispatch(h)).resolves.toBeUndefined();
    // A new request with no active subscription draws the gift before the taster.
    await db.query("UPDATE aw_billing_reservations SET state='released'");
    await reserveGenerationChapter(db, h.id, h.job.id, NOW);
    const [row] = await db.query<{ grant_key: string | null; bucket: string }>(
      "SELECT grant_key,bucket FROM aw_billing_reservations WHERE user_id=$1 AND key=$2 AND state='reserved'",
      [h.id, h.job.id],
    );
    expect(row).toEqual({ grant_key: referralGrantKey(h.id), bucket: 'paid' });
    await expect(dispatch(h)).resolves.toBeUndefined();
  });
  it('never reserves the gift for a quarantined or refunded subscription', async () => {
    for (const closed of ["revoked='refund'", 'reconcile_required=true']) {
      const h = await giftHolder();
      await db.query(
        `UPDATE aw_billing_subscriptions SET ${closed},status='canceled' WHERE subscription_id=$1`,
        [h.sub],
      );
      gate();
      // The free taster may still apply; the gift grant must never be drawn.
      await reserveGenerationChapter(db, h.id, h.job.id, NOW).catch(() => {});
      expect(
        await db.query(
          'SELECT 1 FROM aw_billing_reservations WHERE user_id=$1 AND grant_key=$2',
          [h.id, referralGrantKey(h.id)],
        ),
      ).toHaveLength(0);
    }
  });
});
