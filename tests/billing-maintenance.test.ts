import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reserveChapterForUser, type BillingProvider } from '@future-flow/core';
import {
  Repository,
  createBillingStore,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  createBillingMaintenance,
  reservationTtlSeconds,
} from '../apps/worker/src/billing-maintenance';

let engine: PGlite, db: Database;
function adapter(client: Pick<PGlite, 'query' | 'transaction'>): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      text: string,
      values: unknown[] = [],
    ) => (await client.query<T>(text, values)).rows,
    transaction: (run) =>
      client.transaction((tx) => run(adapter(tx as unknown as PGlite))),
  };
}
beforeAll(async () => {
  engine = new PGlite();
  await applyMigrations(engine);
  db = adapter(engine);
});
afterAll(async () => engine?.close());

const enabled = {
  BILLING_ENABLED: 'true',
  STRIPE_SECRET_KEY: 'sk_test_maintenance12345',
  STRIPE_WEBHOOK_SECRET: 'whsec_maintenance12345',
  STRIPE_PRICE_ID: 'price_maintenance1',
  STRIPE_FOUNDER_COUPON_ID: 'founder_launch',
  STRIPE_API_VERSION: '2026-09-30.endive',
  BILLING_SUCCESS_URL: 'https://alterward.example/ok',
  BILLING_CANCEL_URL: 'https://alterward.example/cancel',
};

describe('billing maintenance', () => {
  it('does not exist unless billing is fully configured', () => {
    expect(createBillingMaintenance(db, {})).toBeNull();
    expect(
      createBillingMaintenance(db, { ...enabled, STRIPE_PRICE_ID: 'nope' }),
    ).toBeNull();
    expect(
      createBillingMaintenance(db, { ...enabled, BILLING_ENABLED: 'false' }),
    ).toBeNull();
  });
  it('bounds the reservation timeout', () => {
    expect(reservationTtlSeconds({})).toBe(7200);
    expect(
      reservationTtlSeconds({ BILLING_RESERVATION_TTL_SECONDS: '60' }),
    ).toBe(7200);
    expect(
      reservationTtlSeconds({ BILLING_RESERVATION_TTL_SECONDS: 'x' }),
    ).toBe(7200);
    expect(
      reservationTtlSeconds({ BILLING_RESERVATION_TTL_SECONDS: '1800' }),
    ).toBe(1800);
  });
  it('settles pending cancellations and reclaims stale reservations', async () => {
    const user = randomUUID();
    await new Repository(db).ensureUser(user);
    const store = createBillingStore(db);
    await store.transaction((tx) =>
      tx.saveSubscription({
        subscriptionId: 'sub_maint1',
        customerId: 'cus_maint1',
        userId: user,
        status: 'canceled',
        periodStart: null,
        periodEnd: null,
        cancelAtPeriodEnd: false,
        discounted: false,
        paidInvoiceIds: [],
        refundedInvoiceIds: [],
        revoked: 'refund',
        lastStateEventCreated: 1,
        reconcileRequired: false,
        cancelPending: true,
      }),
    );
    const other = randomUUID();
    await new Repository(db).ensureUser(other);
    await reserveChapterForUser(store, other, 'stale', new Date());
    await db.query(
      "UPDATE aw_billing_reservations SET created_at=now()-interval '5 hours' WHERE user_id=$1",
      [other],
    );
    const cancelled: string[] = [];
    const provider = {
      cancelSubscription: async (id: string) => {
        cancelled.push(id);
      },
    } as unknown as BillingProvider;
    const result = await createBillingMaintenance(db, enabled, {
      provider,
    })!.run();
    expect(result).toMatchObject({ attempted: 1, failed: 0, released: 1 });
    expect(cancelled).toEqual(['sub_maint1']);
    const [sub] = await db.query<{ cancel_pending: boolean }>(
      'SELECT cancel_pending FROM aw_billing_subscriptions WHERE subscription_id=$1',
      ['sub_maint1'],
    );
    expect(sub!.cancel_pending).toBe(false);
  });
});
