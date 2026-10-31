import { createHmac, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cancelProviderSubscriptionsForUser,
  consumeChapterForUser,
  createCheckoutSession,
  defaultEntitlementConfig,
  handleStripeWebhook,
  releaseChapterForUser,
  reserveChapterForUser,
  retryPendingCancellations,
  type BillingAlert,
  type BillingProvider,
  type BillingStore,
} from '@future-flow/core';
import {
  Repository,
  createBillingStore,
  releaseStaleBillingReservations,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { deleteAccount } from '../apps/api/src/account-deletion';

// The real billing service over the real SQL store (migration 039).
const SECRET = 'whsec_testsecret123';
const PRICE = 'price_ours123';
const T0 = Date.parse('2026-11-01T00:00:00Z');
const now = new Date(T0 + 86_400_000);
const day = 86_400_000;
const sec = (ms: number) => Math.floor(ms / 1000);

let engine: PGlite, db: Database, repo: Repository, store: BillingStore;
function adapter(
  client: Pick<PGlite, 'query' | 'transaction'>,
  nested = false,
): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) => (await client.query<T>(sql, values)).rows,
    transaction: (run) =>
      nested
        ? run(adapter(client, true))
        : client.transaction((tx) =>
            run(adapter(tx as unknown as PGlite, true)),
          ),
  };
}
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await applyMigrations(engine);
  db = adapter(engine);
  repo = new Repository(db);
  store = createBillingStore(db);
});
afterAll(async () => {
  await engine?.close();
});
async function user() {
  const id = randomUUID();
  await repo.ensureUser(id);
  return id;
}

let seq = 0;
const id = (prefix: string) => `${prefix}_${++seq}_${randomUUID().slice(0, 8)}`;
function world(userId: string) {
  return { userId, sub: id('sub'), cus: id('cus') };
}
const stripeEvent = (type: string, object: unknown, created = sec(T0)) => ({
  id: id('evt'),
  type,
  created,
  data: { object },
});
const subscriptionEvent = (
  w: ReturnType<typeof world>,
  over: Record<string, unknown> = {},
  created = sec(T0),
  meta: Record<string, string> = { offer_version: 'launch_v1' },
) =>
  stripeEvent(
    'customer.subscription.created',
    {
      id: w.sub,
      customer: w.cus,
      status: 'active',
      cancel_at_period_end: false,
      metadata: { user_id: w.userId, ...meta },
      items: {
        data: [
          {
            price: { id: PRICE },
            current_period_start: sec(T0),
            current_period_end: sec(T0 + 30 * day),
          },
        ],
      },
      ...over,
    },
    created,
  );
const invoiceEvent = (
  w: ReturnType<typeof world>,
  n: number,
  invoice = `in_${w.sub}_${n}`,
) =>
  stripeEvent('invoice.paid', {
    id: invoice,
    billing_reason: n === 1 ? 'subscription_create' : 'subscription_cycle',
    amount_paid: 999,
    subscription: w.sub,
    lines: {
      data: [
        {
          pricing: { price_details: { price: PRICE } },
          period: {
            start: sec(T0 + (n - 1) * 30 * day),
            end: sec(T0 + n * 30 * day),
          },
        },
      ],
    },
  });
const refundEvent = (w: ReturnType<typeof world>, invoice: string) =>
  stripeEvent('charge.refunded', {
    id: id('ch'),
    refunded: true,
    amount: 999,
    amount_refunded: 999,
    customer: w.cus,
    invoice,
  });

function fakeProvider(over: Partial<BillingProvider> = {}) {
  const cancelled: string[] = [];
  const provider: BillingProvider = {
    createCheckoutSession: async () => ({
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    }),
    cancelSubscription: async (subscriptionId) => {
      cancelled.push(subscriptionId);
    },
    resolveRevocation: async (event) => event as never,
    ...over,
  };
  return { provider, cancelled };
}
function send(
  body: unknown,
  provider: BillingProvider,
  alerts: BillingAlert[] = [],
  designatedUserIds?: string[],
) {
  const raw = JSON.stringify(body);
  const ts = sec(now.getTime());
  const sig = createHmac('sha256', SECRET).update(`${ts}.${raw}`).digest('hex');
  return handleStripeWebhook(
    {
      rawBody: raw,
      signatureHeader: `t=${ts},v1=${sig}`,
      nowSeconds: ts,
      webhookSecret: SECRET,
      priceId: PRICE,
    },
    { store, provider, alert: (a) => alerts.push(a), designatedUserIds },
  );
}
const count = async (sql: string, values: unknown[]) =>
  Number((await db.query<{ n: string }>(sql, values))[0]!.n);

describe('SQL billing store', () => {
  it('runs a subscription lifecycle and grants the launch allowance', async () => {
    const u = await user();
    const w = world(u);
    const { provider } = fakeProvider();
    expect((await send(subscriptionEvent(w), provider)).code).toBe('ok');
    expect((await send(invoiceEvent(w, 1), provider)).code).toBe('ok');
    const [grant] = await db.query<{ amount: number; cycle_index: number }>(
      'SELECT amount,cycle_index FROM aw_billing_grants WHERE user_id=$1',
      [u],
    );
    expect(grant!.amount).toBe(5);
    const [row] = await db.query<{ status: string; user_id: string }>(
      'SELECT status,user_id FROM aw_billing_subscriptions WHERE subscription_id=$1',
      [w.sub],
    );
    expect(row).toMatchObject({ status: 'active', user_id: u });
  });

  it('is idempotent for a redelivered event and records it once', async () => {
    const u = await user();
    const w = world(u);
    const { provider } = fakeProvider();
    await send(subscriptionEvent(w), provider);
    const invoice = invoiceEvent(w, 1);
    await send(invoice, provider);
    await send(invoice, provider);
    expect(
      await count('SELECT count(*) n FROM aw_billing_grants WHERE user_id=$1', [
        u,
      ]),
    ).toBe(1);
    expect(
      await count(
        'SELECT count(*) n FROM aw_billing_events WHERE event_id=$1',
        [invoice.id],
      ),
    ).toBe(1);
  });

  it('rolls back an event for an unknown subscription and records nothing', async () => {
    const w = world(await user());
    const { provider } = fakeProvider();
    const alerts: BillingAlert[] = [];
    const res = await send(invoiceEvent(w, 1), provider, alerts);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(
      await count(
        'SELECT count(*) n FROM aw_billing_subscriptions WHERE subscription_id=$1',
        [w.sub],
      ),
    ).toBe(0);
    expect(
      await count(
        'SELECT count(*) n FROM aw_billing_events WHERE subscription_id=$1',
        [w.sub],
      ),
    ).toBe(0);
  });

  it('revokes on refund, keeps the revocation when the provider cancel fails, and retries', async () => {
    const u = await user();
    const w = world(u);
    const ok = fakeProvider();
    await send(subscriptionEvent(w), ok.provider);
    const invoice = invoiceEvent(w, 1);
    await send(invoice, ok.provider);
    const failing = fakeProvider({
      cancelSubscription: async () => {
        throw Error('provider down');
      },
    });
    await send(refundEvent(w, `in_${w.sub}_1`), failing.provider);
    const [sub] = await db.query<{
      revoked: string | null;
      cancel_pending: boolean;
    }>(
      'SELECT revoked,cancel_pending FROM aw_billing_subscriptions WHERE subscription_id=$1',
      [w.sub],
    );
    expect(sub).toMatchObject({ revoked: 'refund', cancel_pending: true });
    expect(
      await count(
        'SELECT count(*) n FROM aw_billing_grants WHERE user_id=$1 AND revoked',
        [u],
      ),
    ).toBe(1);
    const retry = await retryPendingCancellations(store, ok.provider);
    expect(retry.failed).toBe(0);
    expect(ok.cancelled).toContain(w.sub);
    const [after] = await db.query<{ cancel_pending: boolean }>(
      'SELECT cancel_pending FROM aw_billing_subscriptions WHERE subscription_id=$1',
      [w.sub],
    );
    expect(after!.cancel_pending).toBe(false);
  });

  it('reserves, consumes and releases chapters with one taster and the allowance cap', async () => {
    const u = await user();
    const w = world(u);
    const { provider } = fakeProvider();
    // No subscription: only the free taster is available, exactly once.
    const first = await reserveChapterForUser(store, u, 'k1', now);
    expect(first).toMatchObject({ ok: true, bucket: 'taster' });
    expect(await reserveChapterForUser(store, u, 'k1', now)).toMatchObject({
      ok: true,
      created: false,
    });
    expect(await reserveChapterForUser(store, u, 'k2', now)).toMatchObject({
      ok: false,
    });
    await releaseChapterForUser(store, u, 'k1');
    expect(await reserveChapterForUser(store, u, 'k2', now)).toMatchObject({
      ok: true,
      bucket: 'taster',
    });
    await consumeChapterForUser(store, u, 'k2');
    // Subscription with a 5-chapter launch grant.
    await send(subscriptionEvent(w), provider);
    await send(invoiceEvent(w, 1), provider);
    const keys = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    const results = [];
    for (const key of keys) {
      const r = await reserveChapterForUser(store, u, key, now);
      results.push(r);
      if (r.ok) await consumeChapterForUser(store, u, key);
    }
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results[5]).toMatchObject({
      ok: false,
      reason: 'allowance_exhausted',
    });
    expect(
      await count(
        "SELECT count(*) n FROM aw_billing_reservations WHERE user_id=$1 AND bucket='taster' AND state<>'released'",
        [u],
      ),
    ).toBe(1);
  });

  it('keeps reservations of one account invisible to another', async () => {
    const a = await user();
    const b = await user();
    await reserveChapterForUser(store, a, 'same-key', now);
    expect(
      await reserveChapterForUser(store, b, 'same-key', now),
    ).toMatchObject({
      ok: true,
      created: true,
    });
    expect(
      await count(
        'SELECT count(*) n FROM aw_billing_reservations WHERE key=$1',
        ['same-key'],
      ),
    ).toBe(2);
  });

  it('refuses to move a subscription to another account', async () => {
    const a = await user();
    const b = await user();
    const w = world(a);
    const { provider } = fakeProvider();
    await send(subscriptionEvent(w), provider);
    await expect(
      store.transaction((tx) =>
        tx.saveSubscription({
          subscriptionId: w.sub,
          customerId: w.cus,
          userId: b,
          status: 'active',
          periodStart: null,
          periodEnd: null,
          cancelAtPeriodEnd: false,
          discounted: false,
          paidInvoiceIds: [],
          refundedInvoiceIds: [],
          revoked: null,
          lastStateEventCreated: 1,
          reconcileRequired: false,
          cancelPending: false,
        }),
      ),
    ).rejects.toThrow('another account');
    const [row] = await db.query<{ user_id: string }>(
      'SELECT user_id FROM aw_billing_subscriptions WHERE subscription_id=$1',
      [w.sub],
    );
    expect(row!.user_id).toBe(a);
  });

  it('does not attach billing state to a deleting account', async () => {
    const u = await user();
    await repo.markDeleting(u);
    const w = world(u);
    const { provider } = fakeProvider();
    const res = await send(subscriptionEvent(w), provider);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(
      await count(
        'SELECT count(*) n FROM aw_billing_subscriptions WHERE user_id=$1',
        [u],
      ),
    ).toBe(0);
  });

  it('honours the founder discount once and only for designated accounts', async () => {
    const a = await user();
    const b = await user();
    const { provider } = fakeProvider();
    const wa = world(a);
    const wb = world(b);
    await send(subscriptionEvent(wa), provider, [], [a]);
    await send(subscriptionEvent(wb), provider, [], [a]);
    const rows = await db.query<{ user_id: string; discounted: boolean }>(
      'SELECT user_id,discounted FROM aw_billing_subscriptions WHERE user_id IN ($1,$2)',
      [a, b],
    );
    expect(rows.find((r) => r.user_id === a)!.discounted).toBe(true);
    expect(rows.find((r) => r.user_id === b)!.discounted).toBe(false);
  });

  it('refuses a second live checkout for a subscribed account', async () => {
    const u = await user();
    const w = world(u);
    const { provider } = fakeProvider();
    const config = {
      designatedUserIds: [] as string[],
      entitlement: defaultEntitlementConfig,
    };
    await expect(
      createCheckoutSession(u, now, { store, provider, config }),
    ).resolves.toHaveProperty('url');
    await send(subscriptionEvent(w), provider);
    await send(invoiceEvent(w, 1), provider);
    await expect(
      createCheckoutSession(u, now, { store, provider, config }),
    ).rejects.toMatchObject({ code: 'BILLING_ALREADY_SUBSCRIBED' });
  });

  it('serialises concurrent reservations of one account (one taster only)', async () => {
    const u = await user();
    const results = await Promise.all(
      ['c1', 'c2', 'c3', 'c4'].map((k) =>
        reserveChapterForUser(store, u, k, now),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it('releases only stale reserved reservations', async () => {
    const u = await user();
    await reserveChapterForUser(store, u, 'stale', now);
    await db.query(
      "UPDATE aw_billing_reservations SET created_at=now()-interval '3 hours' WHERE user_id=$1 AND key='stale'",
      [u],
    );
    await expect(
      releaseStaleBillingReservations(db, { olderThanMs: 1000 }),
    ).rejects.toThrow('at least one minute');
    const fresh = await user();
    await reserveChapterForUser(store, fresh, 'fresh', now);
    const { released } = await releaseStaleBillingReservations(db, {
      olderThanMs: 60 * 60_000,
    });
    expect(released).toBeGreaterThanOrEqual(1);
    const [s] = await db.query<{ state: string }>(
      "SELECT state FROM aw_billing_reservations WHERE user_id=$1 AND key='stale'",
      [u],
    );
    const [f] = await db.query<{ state: string }>(
      "SELECT state FROM aw_billing_reservations WHERE user_id=$1 AND key='fresh'",
      [fresh],
    );
    expect(s!.state).toBe('released');
    expect(f!.state).toBe('reserved');
    // A consumed reservation is never touched, however old.
    await reserveChapterForUser(store, u, 'old-consumed', now);
    await consumeChapterForUser(store, u, 'old-consumed');
    await db.query(
      "UPDATE aw_billing_reservations SET created_at=now()-interval '3 hours' WHERE user_id=$1",
      [u],
    );
    await releaseStaleBillingReservations(db, { olderThanMs: 60 * 60_000 });
    const [c] = await db.query<{ state: string }>(
      "SELECT state FROM aw_billing_reservations WHERE user_id=$1 AND key='old-consumed'",
      [u],
    );
    expect(c!.state).toBe('consumed');
  });
});

describe('account deletion with billing', () => {
  const auth = {
    assertDeletionConfigured: () => undefined,
    deleteUser: async () => undefined,
  } as never;

  it('cancels provider subscriptions first and then removes every billing row', async () => {
    const u = await user();
    const w = world(u);
    const { provider, cancelled } = fakeProvider();
    await send(subscriptionEvent(w), provider);
    await send(invoiceEvent(w, 1), provider);
    await reserveChapterForUser(store, u, 'd1', now);
    await deleteAccount(repo, auth, u, {
      cancelSubscriptions: (userId) =>
        cancelProviderSubscriptionsForUser(store, provider, userId),
    });
    expect(cancelled).toContain(w.sub);
    for (const table of [
      'aw_billing_subscriptions',
      'aw_billing_grants',
      'aw_billing_reservations',
    ])
      expect(
        await count(`SELECT count(*) n FROM ${table} WHERE user_id=$1`, [u]),
      ).toBe(0);
    expect(
      await count('SELECT count(*) n FROM ff_users WHERE id=$1', [u]),
    ).toBe(0);
  });

  it('keeps the account and its billing state when cancelling fails (fail closed)', async () => {
    const u = await user();
    const w = world(u);
    await send(subscriptionEvent(w), fakeProvider().provider);
    const failing = fakeProvider({
      cancelSubscription: async () => {
        throw Error('provider down');
      },
    });
    await expect(
      deleteAccount(repo, auth, u, {
        cancelSubscriptions: (userId) =>
          cancelProviderSubscriptionsForUser(store, failing.provider, userId),
      }),
    ).rejects.toThrow('provider down');
    expect(
      await count(
        'SELECT count(*) n FROM aw_billing_subscriptions WHERE user_id=$1',
        [u],
      ),
    ).toBe(1);
    const [row] = await db.query<{ status: string }>(
      'SELECT status FROM ff_users WHERE id=$1',
      [u],
    );
    expect(row!.status).toBe('deleting');
  });
});
