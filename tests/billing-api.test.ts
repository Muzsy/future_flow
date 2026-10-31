import { createHmac, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { questionnaire } from '@future-flow/contracts';
import {
  DomainError,
  billingConfigFromEnv,
  hash,
  type BillingAlert,
  type BillingProvider,
} from '@future-flow/core';
import { Repository, type Database } from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { createApp } from '../apps/api/src/app';
import {
  createBillingAlertSink,
  createBillingRuntime,
} from '../apps/api/src/billing';

const SECRET = 'whsec_apitestsecret123';
const PRICE = 'price_apitest123';
const API_VERSION = '2025-03-31.basil';
const T0 = Date.parse('2026-11-01T00:00:00Z');
const NOW = new Date(T0 + 86_400_000);
const day = 86_400_000;
const sec = (ms: number) => Math.floor(ms / 1000);
const tokenFor = (id: string) =>
  `test.${Buffer.from(JSON.stringify({ amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }] })).toString('base64url')}.${id}`;

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

const env = (over: Record<string, string> = {}) => ({
  BILLING_ENABLED: 'true',
  BILLING_ENFORCEMENT: 'false',
  STRIPE_SECRET_KEY: 'sk_test_apitestkey12345',
  STRIPE_WEBHOOK_SECRET: SECRET,
  STRIPE_PRICE_ID: PRICE,
  STRIPE_FOUNDER_COUPON_ID: 'founder_launch',
  STRIPE_API_VERSION: API_VERSION,
  BILLING_SUCCESS_URL: 'https://alterward.example/billing/success',
  BILLING_CANCEL_URL: 'https://alterward.example/billing/cancel',
  ...over,
});

// createApp takes 24 optional positional settings before the billing runtime.
const undefinedArgs = Array<undefined>(24).fill(undefined) as unknown as [
  undefined,
];

async function boot(config: ReturnType<typeof billingConfigFromEnv>) {
  const engine = new PGlite();
  await applyMigrations(engine);
  const db = adapter(engine);
  await db.query(
    'INSERT INTO ff_questionnaires(version,definition,definition_hash) VALUES($1,$2,$3)',
    [questionnaire.version, JSON.stringify(questionnaire), hash(questionnaire)],
  );
  const cancelled: string[] = [];
  const alerts: BillingAlert[] = [];
  const provider: BillingProvider = {
    createCheckoutSession: async () => ({
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    }),
    cancelSubscription: async (id) => {
      cancelled.push(id);
    },
    resolveRevocation: async (event) => event as never,
  };
  const runtime = createBillingRuntime(db, config, {
    provider,
    alert: (a) => alerts.push(a),
    now: () => NOW,
  });
  const repo = new Repository(db);
  const app = await createApp(
    repo,
    {
      verify: async (value) => {
        const id = value.split('.')[2];
        if (!id || !/^[0-9a-f-]{36}$/.test(id))
          throw new DomainError('AUTH_INVALID_TOKEN', 'Invalid token.', 401);
        return { id };
      },
      deleteUser: async () => {},
    },
    // @ts-expect-error spread of a fixed-size undefined tuple
    ...undefinedArgs,
    runtime,
  );
  await app.listen(0, '127.0.0.1');
  return {
    engine,
    db,
    app: app as INestApplication,
    base: await app.getUrl(),
    runtime,
    cancelled,
    alerts,
  };
}
type Harness = Awaited<ReturnType<typeof boot>>;
const close = async (h?: Harness) => {
  await h?.app.close();
  await h?.engine.close();
};

const stripeEvent = (type: string, object: unknown, created = sec(T0)) => ({
  id: `evt_${randomUUID().replaceAll('-', '').slice(0, 20)}`,
  type,
  created,
  livemode: false,
  api_version: API_VERSION,
  data: { object },
});
const subscriptionEvent = (userId: string, sub = 'sub_apitest1') =>
  stripeEvent('customer.subscription.created', {
    id: sub,
    customer: 'cus_apitest1',
    status: 'active',
    cancel_at_period_end: false,
    metadata: { user_id: userId, offer_version: 'standard_v1' },
    items: {
      data: [
        {
          price: { id: PRICE },
          current_period_start: sec(T0),
          current_period_end: sec(T0 + 30 * day),
        },
      ],
    },
  });
const invoiceEvent = (sub = 'sub_apitest1') =>
  stripeEvent('invoice.paid', {
    id: `in_${sub}`,
    billing_reason: 'subscription_create',
    amount_paid: 1499,
    subscription: sub,
    lines: {
      data: [
        {
          pricing: { price_details: { price: PRICE } },
          period: { start: sec(T0), end: sec(T0 + 30 * day) },
        },
      ],
    },
  });
function webhook(
  h: Harness,
  body: unknown,
  over: { secret?: string; header?: string | null } = {},
) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const ts = sec(NOW.getTime());
  const sig = createHmac('sha256', over.secret ?? SECRET)
    .update(`${ts}.${raw}`)
    .digest('hex');
  const header = over.header === undefined ? `t=${ts},v1=${sig}` : over.header;
  return fetch(`${h.base}/api/v1/billing/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(header ? { 'Stripe-Signature': header } : {}),
    },
    body: raw,
  });
}
const authed = (user: string) => ({
  Authorization: `Bearer ${tokenFor(user)}`,
  'Content-Type': 'application/json',
});

describe('billing disabled (the default)', () => {
  let h: Harness;
  const user = randomUUID();
  beforeAll(async () => {
    h = await boot(billingConfigFromEnv({}));
  });
  afterAll(() => close(h));
  it('keeps every billing route closed', async () => {
    expect((await webhook(h, subscriptionEvent(user))).status).toBe(404);
    for (const [method, path] of [
      ['POST', '/api/v1/billing/checkout'],
      ['GET', '/api/v1/billing/status'],
    ] as const)
      expect(
        (
          await fetch(`${h.base}${path}`, {
            method,
            headers: authed(user),
            ...(method === 'POST' ? { body: '{}' } : {}),
          })
        ).status,
      ).toBe(404);
    expect(
      (await fetch(`${h.base}/api/v1/billing/checkout`, { method: 'POST' }))
        .status,
    ).toBe(401);
    expect(h.runtime.provider).toBeNull();
  });
  it('deletes an account without billing state exactly as before', async () => {
    const res = await fetch(`${h.base}/api/v1/me`, {
      method: 'DELETE',
      headers: authed(user),
      body: JSON.stringify({ confirmation: 'DELETE ACCOUNT' }),
    });
    expect(res.status).toBe(200);
  });
  it('refuses to delete an account that still has a charging subscription (fail closed)', async () => {
    const other = randomUUID();
    await new Repository(h.db).ensureUser(other);
    await h.runtime.store.transaction((tx) =>
      tx.saveSubscription({
        subscriptionId: 'sub_orphan1',
        customerId: 'cus_orphan1',
        userId: other,
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
    );
    const res = await fetch(`${h.base}/api/v1/me`, {
      method: 'DELETE',
      headers: authed(other),
      body: JSON.stringify({ confirmation: 'DELETE ACCOUNT' }),
    });
    expect(res.status).toBe(503);
    const [row] = await h.db.query<{ status: string }>(
      'SELECT status FROM ff_users WHERE id=$1',
      [other],
    );
    expect(row!.status).toBe('deleting');
  });
});

describe('billing enabled (test mode, fake provider)', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await boot(billingConfigFromEnv(env()));
    expect(h.runtime.config.enabled).toBe(true);
  });
  afterAll(() => close(h));

  it('verifies the signature over the raw body before anything else', async () => {
    const user = randomUUID();
    const event = subscriptionEvent(user, 'sub_sig1');
    expect(
      (await webhook(h, event, { secret: 'whsec_wrongsecret99' })).status,
    ).toBe(400);
    expect((await webhook(h, event, { header: null })).status).toBe(400);
    expect((await webhook(h, event, { header: 't=1,v1=00' })).status).toBe(400);
    expect(
      await h.db.query(
        'SELECT 1 FROM aw_billing_subscriptions WHERE subscription_id=$1',
        ['sub_sig1'],
      ),
    ).toHaveLength(0);
    expect(
      h.alerts.filter((a) => a.kind === 'invalid_signature').length,
    ).toBeGreaterThanOrEqual(3);
  });
  it('rejects a wrong mode, a wrong API version, an empty and an oversized body', async () => {
    const user = randomUUID();
    expect(
      (
        await webhook(h, {
          ...subscriptionEvent(user, 'sub_m1'),
          livemode: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await webhook(h, {
          ...subscriptionEvent(user, 'sub_v1'),
          api_version: '2020-01-01',
        })
      ).status,
    ).toBe(400);
    expect((await webhook(h, '')).status).toBe(400);
    const big = JSON.stringify({ pad: 'x'.repeat(300_000) });
    expect((await webhook(h, big)).status).toBe(413);
  });
  it('applies a signed lifecycle, reports status, refuses a second checkout and deletes with cancellation', async () => {
    const user = randomUUID();
    await new Repository(h.db).ensureUser(user);
    const headers = authed(user);
    const checkout = await fetch(`${h.base}/api/v1/billing/checkout`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    expect(checkout.status).toBe(201);
    expect(await checkout.json()).toEqual({
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    });
    expect(
      (await webhook(h, subscriptionEvent(user, 'sub_life1'))).status,
    ).toBe(200);
    expect((await webhook(h, invoiceEvent('sub_life1'))).status).toBe(200);
    const status = await (
      await fetch(`${h.base}/api/v1/billing/status`, { headers })
    ).json();
    expect(status).toMatchObject({
      state: 'active',
      canGenerate: true,
      paidChaptersAvailable: 8,
      tasterChaptersAvailable: 1,
    });
    const again = await fetch(`${h.base}/api/v1/billing/checkout`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    expect(again.status).toBe(409);
    expect(
      (
        await fetch(`${h.base}/api/v1/billing/checkout`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ priceId: 'price_x' }),
        })
      ).status,
    ).toBe(422);
    const removed = await fetch(`${h.base}/api/v1/me`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ confirmation: 'DELETE ACCOUNT' }),
    });
    expect(removed.status).toBe(200);
    expect(h.cancelled).toContain('sub_life1');
    expect(
      await h.db.query(
        'SELECT 1 FROM aw_billing_subscriptions WHERE user_id=$1',
        [user],
      ),
    ).toHaveLength(0);
  });
  it('keeps the account when the provider cannot cancel on deletion', async () => {
    const user = randomUUID();
    await new Repository(h.db).ensureUser(user);
    expect(
      (await webhook(h, subscriptionEvent(user, 'sub_fail1'))).status,
    ).toBe(200);
    const original = h.runtime.provider!.cancelSubscription;
    (h.runtime.provider as { cancelSubscription: unknown }).cancelSubscription =
      async () => {
        throw Error('provider down');
      };
    const res = await fetch(`${h.base}/api/v1/me`, {
      method: 'DELETE',
      headers: authed(user),
      body: JSON.stringify({ confirmation: 'DELETE ACCOUNT' }),
    });
    (h.runtime.provider as { cancelSubscription: unknown }).cancelSubscription =
      original;
    expect(res.status).toBe(500);
    expect(
      await h.db.query(
        'SELECT 1 FROM aw_billing_subscriptions WHERE user_id=$1',
        [user],
      ),
    ).toHaveLength(1);
  });
});

describe('alert sink', () => {
  it('writes one line per kind per window with the suppressed count and no payload', () => {
    const lines: string[] = [];
    let t = 0;
    const sink = createBillingAlertSink(
      (l) => lines.push(l),
      () => t,
      60_000,
    );
    sink({ kind: 'foreign_object', eventId: 'evt_1' });
    sink({ kind: 'foreign_object', eventId: 'evt_2' });
    sink({ kind: 'invalid_signature' });
    t = 61_000;
    sink({ kind: 'foreign_object', eventId: 'evt_3' });
    expect(lines.map((l) => JSON.parse(l))).toEqual([
      { billingAlert: 'foreign_object', eventId: 'evt_1', suppressed: 0 },
      { billingAlert: 'invalid_signature', suppressed: 0 },
      { billingAlert: 'foreign_object', eventId: 'evt_3', suppressed: 1 },
    ]);
  });
});
