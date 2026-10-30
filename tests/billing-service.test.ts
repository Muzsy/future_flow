import { createHmac } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  billingConfigFromEnv,
  consumeChapterForUser,
  createCheckoutSession,
  createStripeProvider,
  defaultBillingOfferConfig,
  defaultEntitlementConfig,
  entitlementOfSubscriptions,
  handleStripeWebhook,
  redactBillingConfig,
  releaseChapterForUser,
  retryPendingCancellations,
  reserveChapterForUser,
  DomainError,
  FREE_TASTER_CHAPTERS,
  type BillingAlert,
  type BillingEvent,
  type BillingProvider,
  type BillingStore,
  type BillingSubscription,
  type BillingTx,
  type ChapterGrant,
  type ChapterLedger,
  type ChapterReservation,
} from '@future-flow/core';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SECRET = 'whsec_testsecret123';
const PRICE = 'price_ours123';
const T0 = Date.parse('2026-11-01T00:00:00Z');
const now = new Date(T0 + 86_400_000);
const sec = (ms: number) => Math.floor(ms / 1000);
const day = 86_400_000;

type StoredSub = BillingSubscription & { userId: string };
type State = {
  users: Set<string>;
  subs: Map<string, StoredSub>;
  grants: Map<string, ChapterGrant & { userId: string; revoked: boolean }>;
  reservations: Map<string, ChapterReservation & { userId: string }>;
  events: Map<string, { outcome: string; subscriptionId: string | null }>;
};
const clone = (s: State): State => ({
  users: new Set(s.users),
  subs: new Map(s.subs),
  grants: new Map(s.grants),
  reservations: new Map(s.reservations),
  events: new Map(s.events),
});

// In-memory store with serialised, rollback-on-error transactions: the same
// contract a SQL store has to honour.
function memoryStore(users: string[] = [USER, OTHER]) {
  let state: State = {
    users: new Set(users),
    subs: new Map(),
    grants: new Map(),
    reservations: new Map(),
    events: new Map(),
  };
  let chain: Promise<unknown> = Promise.resolve();
  const tx = (): BillingTx => ({
    lockUser: async () => undefined,
    ownerOf: async ({ subscriptionId, customerId }) => {
      if (subscriptionId) return state.subs.get(subscriptionId)?.userId ?? null;
      if (!customerId) return null;
      return (
        [...state.subs.values()].find((x) => x.customerId === customerId)
          ?.userId ?? null
      );
    },
    listCancelPending: async (limit) =>
      [...state.subs.values()]
        .filter((x) => x.cancelPending)
        .slice(0, limit)
        .map((x) => x.subscriptionId),
    hasEvent: async (id) => state.events.has(id),
    recordEvent: async (eventId, _type, subscriptionId, outcome) => {
      state.events.set(eventId, { outcome, subscriptionId });
    },
    findSubscription: async ({ subscriptionId, customerId }) => {
      if (subscriptionId) return state.subs.get(subscriptionId) ?? null;
      if (!customerId) return null;
      return (
        [...state.subs.values()]
          .filter((s) => s.customerId === customerId)
          .sort(
            (a, b) => b.lastStateEventCreated - a.lastStateEventCreated,
          )[0] ?? null
      );
    },
    listSubscriptions: async (userId) =>
      [...state.subs.values()].filter((s) => s.userId === userId),
    saveSubscription: async (sub) => {
      if (!state.users.has(sub.userId)) throw Error('fk');
      state.subs.set(sub.subscriptionId, sub);
    },
    insertGrant: async (grant, owner) => {
      state.grants.set(grant.key, {
        ...grant,
        userId: owner.userId,
        revoked: false,
      });
    },
    revokeGrants: async (keys) => {
      for (const key of keys) {
        const g = state.grants.get(key);
        if (g) state.grants.set(key, { ...g, revoked: true });
      }
    },
    loadLedger: async (userId): Promise<ChapterLedger> => ({
      grants: [...state.grants.values()]
        .filter((g) => g.userId === userId)
        .map(({ userId: _u, ...g }) => g),
      reservations: [...state.reservations.values()]
        .filter((r) => r.userId === userId)
        .map(({ userId: _u, ...r }) => r),
      tasterAmount: FREE_TASTER_CHAPTERS,
    }),
    saveReservation: async (userId, reservation) => {
      state.reservations.set(`${userId}|${reservation.key}`, {
        ...reservation,
        userId,
      });
    },
    hasRedeemedFounderDiscount: async (userId) =>
      [...state.subs.values()].some((s) => s.userId === userId && s.discounted),
    userExists: async (userId) => state.users.has(userId),
  });
  const store: BillingStore = {
    transaction: <T>(run: (t: BillingTx) => Promise<T>) => {
      const result = chain.then(async () => {
        const before = clone(state);
        try {
          return await run(tx());
        } catch (error) {
          state = before;
          throw error;
        }
      });
      chain = result.catch(() => undefined);
      return result;
    },
  };
  return { store, peek: () => state };
}

function fakeProvider(over: Partial<BillingProvider> = {}) {
  const calls = {
    cancel: [] as string[],
    checkout: [] as {
      userId: string;
      offerVersion: string;
      discounted: boolean;
    }[],
  };
  const provider: BillingProvider = {
    createCheckoutSession: async (input) => {
      calls.checkout.push(input);
      return { url: 'https://checkout.stripe.com/c/pay/cs_test_1' };
    },
    cancelSubscription: async (id) => {
      calls.cancel.push(id);
    },
    resolveRevocation: async (event) => event as BillingEvent,
    ...over,
  };
  return { provider, calls };
}

let eventSeq = 0;
function signed(body: unknown, ts = sec(now.getTime()), secret = SECRET) {
  const raw = JSON.stringify(body);
  const sig = createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
  return { rawBody: raw, header: `t=${ts},v1=${sig}` };
}
const stripeEvent = (type: string, object: unknown, created = sec(T0)) => ({
  id: `evt_${++eventSeq}`,
  type,
  created,
  data: { object },
});
const subscriptionEvent = (
  over: Record<string, unknown> = {},
  created = sec(T0),
) =>
  stripeEvent(
    'customer.subscription.created',
    {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: false,
      metadata: { user_id: USER, offer_version: 'launch_v1' },
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
const deletedEvent = (created: number, id = 'sub_1') =>
  stripeEvent(
    'customer.subscription.deleted',
    {
      id,
      customer: 'cus_1',
      status: 'canceled',
      items: { data: [{ price: { id: PRICE } }] },
    },
    created,
  );
const invoiceEvent = (n: number, over: Record<string, unknown> = {}) =>
  stripeEvent('invoice.paid', {
    id: `in_${n}`,
    billing_reason: n === 1 ? 'subscription_create' : 'subscription_cycle',
    amount_paid: 999,
    subscription: 'sub_1',
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
    ...over,
  });
const refundEvent = (over: Record<string, unknown> = {}) =>
  stripeEvent('charge.refunded', {
    id: 'ch_1',
    refunded: true,
    amount: 999,
    amount_refunded: 999,
    customer: 'cus_1',
    invoice: 'in_1',
    ...over,
  });

function harness(provider = fakeProvider(), users?: string[]) {
  const m = memoryStore(users);
  const alerts: BillingAlert[] = [];
  const send = (body: unknown, opts: { secret?: string; ts?: number } = {}) => {
    const s = signed(body, opts.ts, opts.secret);
    return handleStripeWebhook(
      {
        rawBody: s.rawBody,
        signatureHeader: s.header,
        nowSeconds: sec(now.getTime()),
        webhookSecret: SECRET,
        priceId: PRICE,
      },
      {
        store: m.store,
        provider: provider.provider,
        alert: (a) => alerts.push(a),
      },
    );
  };
  const subs = () => [...m.peek().subs.values()];
  return { ...m, ...provider, send, alerts, subs };
}

describe('webhook handling', () => {
  it('applies a subscription lifecycle and grants 5 chapters for the launch cycle', async () => {
    const h = harness();
    expect((await h.send(subscriptionEvent())).code).toBe('ok');
    expect((await h.send(invoiceEvent(1))).code).toBe('ok');
    const grants = [...h.peek().grants.values()];
    expect(grants).toHaveLength(1);
    expect(grants[0].amount).toBe(5);
    expect(h.subs()[0].userId).toBe(USER);
  });
  it('answers 400 and changes nothing for a bad signature, wrong secret or stale time', async () => {
    const h = harness();
    const body = subscriptionEvent();
    expect((await h.send(body, { secret: 'whsec_other12345' })).code).toBe(
      'invalid_signature',
    );
    expect((await h.send(body, { ts: sec(now.getTime()) - 3600 })).code).toBe(
      'invalid_signature',
    );
    const bad = await handleStripeWebhook(
      {
        rawBody: JSON.stringify(body),
        signatureHeader: undefined,
        nowSeconds: sec(now.getTime()),
        webhookSecret: SECRET,
        priceId: PRICE,
      },
      { store: h.store, provider: h.provider },
    );
    expect(bad.status).toBe(400);
    expect(h.subs()).toHaveLength(0);
    expect(h.peek().events.size).toBe(0);
    expect(h.alerts.filter((a) => a.kind === 'invalid_signature')).toHaveLength(
      2,
    );
  });
  it('answers 400 for a validly signed non-JSON body and for a malformed handled event', async () => {
    const h = harness();
    const raw = 'not json';
    const ts = sec(now.getTime());
    const sig = createHmac('sha256', SECRET)
      .update(`${ts}.${raw}`)
      .digest('hex');
    const res = await handleStripeWebhook(
      {
        rawBody: raw,
        signatureHeader: `t=${ts},v1=${sig}`,
        nowSeconds: ts,
        webhookSecret: SECRET,
        priceId: PRICE,
      },
      { store: h.store, provider: h.provider },
    );
    expect(res).toMatchObject({ status: 400, code: 'invalid_json' });
    const malformed = await h.send(
      stripeEvent('customer.subscription.updated', {
        id: 'sub_1',
        status: 'weird',
        items: { data: [{ price: { id: PRICE } }] },
      }),
    );
    expect(malformed).toMatchObject({ status: 400, code: 'malformed_event' });
    expect(h.peek().events.size).toBe(0);
  });
  it('acknowledges event types we do not act on without recording them', async () => {
    const h = harness();
    expect(await h.send(stripeEvent('customer.created', {}))).toMatchObject({
      status: 200,
      code: 'ignored',
    });
    expect(h.peek().events.size).toBe(0);
  });
  it('ignores an invoice for another price', async () => {
    const h = harness();
    await h.send(subscriptionEvent());
    const other = invoiceEvent(1, {
      lines: {
        data: [
          {
            pricing: { price_details: { price: 'price_other' } },
            period: { start: 1, end: 2 },
          },
        ],
      },
    });
    expect(await h.send(other)).toMatchObject({ status: 200, code: 'ignored' });
    expect(h.peek().grants.size).toBe(0);
  });
  it('a replayed delivery has no further effect, even when sent concurrently', async () => {
    const h = harness();
    await h.send(subscriptionEvent());
    const inv = invoiceEvent(1);
    const results = await Promise.all([h.send(inv), h.send(inv), h.send(inv)]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.outcome === 'applied')).toHaveLength(1);
    expect(h.peek().grants.size).toBe(1);
  });
  it('an invoice that arrives before its subscription is not recorded and succeeds on redelivery', async () => {
    const h = harness();
    const inv = invoiceEvent(1);
    const first = await h.send(inv);
    expect(first).toMatchObject({
      status: 500,
      code: 'unresolved',
      outcome: 'unknown_subscription',
    });
    expect(h.peek().events.size).toBe(0);
    expect(h.alerts.some((a) => a.kind === 'unknown_subscription')).toBe(true);
    await h.send(subscriptionEvent());
    expect(await h.send(inv)).toMatchObject({
      status: 200,
      outcome: 'applied',
    });
    expect(h.peek().grants.size).toBe(1);
  });
  it('a subscription whose owner cannot be verified is not stored', async () => {
    const h = harness();
    const noOwner = subscriptionEvent({
      metadata: { offer_version: 'launch_v1' },
    });
    expect(await h.send(noOwner)).toMatchObject({
      status: 500,
      outcome: 'unresolved',
    });
    const unknownUser = subscriptionEvent({
      id: 'sub_2',
      metadata: { user_id: '33333333-3333-4333-8333-333333333333' },
    });
    expect(await h.send(unknownUser)).toMatchObject({
      status: 500,
      outcome: 'unresolved',
    });
    expect(h.subs()).toHaveLength(0);
  });
  it('grants 5, 5, 5 and then 8 chapters over four paid cycles', async () => {
    const h = harness();
    await h.send(subscriptionEvent());
    for (const n of [1, 2, 3, 4]) await h.send(invoiceEvent(n));
    expect([...h.peek().grants.values()].map((g) => g.amount)).toEqual([
      5, 5, 5, 8,
    ]);
  });
  it('revokes on a full refund of the current cycle and cancels the provider subscription once', async () => {
    const h = harness();
    await h.send(subscriptionEvent());
    await h.send(invoiceEvent(1));
    const refund = refundEvent();
    expect(await h.send(refund)).toMatchObject({
      status: 200,
      outcome: 'applied',
    });
    expect(h.calls.cancel).toEqual(['sub_1']);
    expect(h.subs()[0].revoked).toBe('refund');
    expect([...h.peek().grants.values()][0].revoked).toBe(true);
    await h.send(refund);
    expect(h.calls.cancel).toEqual(['sub_1']);
    const gate = await reserveChapterForUser(h.store, USER, 'k1', now);
    expect(gate).toMatchObject({ ok: true, bucket: 'taster' });
  });
  it('commits the revocation, asks for redelivery and retries the cancel when the provider cancel fails', async () => {
    let fail = true;
    const cancelled: string[] = [];
    const h = harness(
      fakeProvider({
        cancelSubscription: async (id) => {
          if (fail) throw Error('network');
          cancelled.push(id);
        },
      }),
    );
    await h.send(subscriptionEvent());
    await h.send(invoiceEvent(1));
    const refund = refundEvent();
    expect(await h.send(refund)).toMatchObject({ status: 500, code: 'retry' });
    // Access is closed at once; only the provider-side cancel is pending.
    expect(h.subs()[0].revoked).toBe('refund');
    expect(h.subs()[0].cancelPending).toBe(true);
    expect(h.alerts.some((a) => a.kind === 'cancel_failed')).toBe(true);
    expect(entitlementOfSubscriptions(h.subs(), now).canGenerate).toBe(false);
    fail = false;
    expect(await h.send(refund)).toMatchObject({ status: 200 });
    expect(h.subs()[0].cancelPending).toBe(false);
    expect(cancelled).toEqual(['sub_1']);
  });
  it('closes only the old invoice allowance on a refund of an older cycle', async () => {
    const h = harness();
    await h.send(subscriptionEvent());
    await h.send(invoiceEvent(1));
    await h.send(invoiceEvent(2));
    await h.send(refundEvent());
    expect(h.subs()[0].revoked).toBeNull();
    expect(h.calls.cancel).toEqual([]);
    expect(
      [...h.peek().grants.values()].map((g) => [g.key, g.revoked]),
    ).toEqual([
      ['in_1', true],
      ['in_2', false],
    ]);
  });
  it('a dispute resolved through the provider revokes and cancels', async () => {
    const h = harness(
      fakeProvider({
        resolveRevocation: async (event) =>
          ({
            ...event,
            subscriptionId: 'sub_1',
            customerId: 'cus_1',
          }) as BillingEvent,
      }),
    );
    await h.send(subscriptionEvent());
    await h.send(invoiceEvent(1));
    const dispute = stripeEvent('charge.dispute.created', {
      id: 'dp_1',
      charge: 'ch_1',
      payment_intent: 'pi_1',
    });
    expect(await h.send(dispute)).toMatchObject({
      status: 200,
      outcome: 'applied',
    });
    expect(h.subs()[0].revoked).toBe('dispute');
    expect(h.calls.cancel).toEqual(['sub_1']);
  });
  it('an unresolvable refund or dispute is alerted and left for redelivery', async () => {
    const h = harness(fakeProvider({ resolveRevocation: async () => null }));
    await h.send(subscriptionEvent());
    await h.send(invoiceEvent(1));
    const dispute = stripeEvent('charge.dispute.created', {
      id: 'dp_1',
      charge: 'ch_1',
    });
    expect(await h.send(dispute)).toMatchObject({
      status: 500,
      code: 'unresolved',
    });
    expect(h.subs()[0].revoked).toBeNull();
    expect(h.alerts.some((a) => a.kind === 'unresolved_event')).toBe(true);
    expect(h.peek().events.has((dispute as { id: string }).id)).toBe(false);
  });
  it('a partial refund only alerts and changes no entitlement', async () => {
    const h = harness();
    await h.send(subscriptionEvent());
    await h.send(invoiceEvent(1));
    const partial = refundEvent({ refunded: false, amount_refunded: 500 });
    expect(await h.send(partial)).toMatchObject({
      status: 200,
      outcome: 'noted',
    });
    expect(h.subs()[0].revoked).toBeNull();
    expect(h.alerts.some((a) => a.kind === 'partial_refund')).toBe(true);
    expect(h.calls.cancel).toEqual([]);
    expect(entitlementOfSubscriptions(h.subs(), now).canGenerate).toBe(true);
  });
  it('an older state event never overwrites a newer one', async () => {
    const h = harness();
    await h.send(subscriptionEvent({}, sec(T0) + 100));
    await h.send(deletedEvent(sec(T0) + 200));
    const stale = subscriptionEvent({ status: 'active' }, sec(T0) + 50);
    expect(await h.send(stale)).toMatchObject({
      status: 200,
      outcome: 'stale',
    });
    expect(h.subs()[0].status).toBe('canceled');
  });
});

describe('webhook hardening', () => {
  it('orders same-second state events by severity, in either arrival order', async () => {
    const active = (id: number) =>
      subscriptionEvent({ status: 'active' }, sec(T0) + id);
    const canceled = (id: number) =>
      subscriptionEvent({ status: 'canceled' }, sec(T0) + id);
    const a = harness();
    await a.send(active(100));
    await a.send(canceled(100));
    expect(a.subs()[0].status).toBe('canceled');
    const b = harness();
    await b.send(canceled(100));
    expect(await b.send(active(100))).toMatchObject({ outcome: 'stale' });
    expect(b.subs()[0].status).toBe('canceled');
  });
  it('ignores a subscription event that carries none of our price', async () => {
    const h = harness();
    const other = subscriptionEvent({
      items: { data: [{ price: { id: 'price_other' } }] },
    });
    expect(await h.send(other)).toMatchObject({ status: 200, code: 'ignored' });
    expect(h.subs()).toHaveLength(0);
    expect(h.peek().events.size).toBe(0);
  });
  it('acknowledges a refund the provider says is not ours without recording it', async () => {
    const h = harness(
      fakeProvider({ resolveRevocation: async () => 'not_ours' }),
    );
    await h.send(subscriptionEvent());
    await h.send(invoiceEvent(1));
    expect(await h.send(refundEvent())).toMatchObject({
      status: 200,
      code: 'ignored',
    });
    expect(h.subs()[0].revoked).toBeNull();
    expect(h.calls.cancel).toEqual([]);
  });
  it('rejects an event from the wrong mode or API version and raises an alert', async () => {
    const h = harness();
    const alerts: BillingAlert[] = [];
    const call = (body: Record<string, unknown>, extra: object) => {
      const sgn = signed(body);
      return handleStripeWebhook(
        {
          rawBody: sgn.rawBody,
          signatureHeader: sgn.header,
          nowSeconds: sec(now.getTime()),
          webhookSecret: SECRET,
          priceId: PRICE,
          ...extra,
        },
        { store: h.store, provider: h.provider, alert: (x) => alerts.push(x) },
      );
    };
    const live = { ...subscriptionEvent(), livemode: true };
    expect(await call(live, { expectedLivemode: false })).toMatchObject({
      status: 400,
      code: 'mode_mismatch',
    });
    const old = { ...subscriptionEvent(), api_version: '2020-01-01' };
    expect(
      await call(old, { expectedApiVersion: '2025-03-31.basil' }),
    ).toMatchObject({ status: 400, code: 'mode_mismatch' });
    expect(alerts.map((x) => x.kind)).toEqual([
      'mode_mismatch',
      'api_version_mismatch',
    ]);
    expect(h.subs()).toHaveLength(0);
    const ok = {
      ...subscriptionEvent(),
      livemode: false,
      api_version: '2025-03-31.basil',
    };
    expect(
      await call(ok, {
        expectedLivemode: false,
        expectedApiVersion: '2025-03-31.basil',
      }),
    ).toMatchObject({ status: 200 });
  });
  it('answers 500 and alerts when the store fails, recording nothing', async () => {
    const h = harness();
    const broken: BillingStore = {
      transaction: async () => {
        throw Error('db down');
      },
    };
    const alerts: BillingAlert[] = [];
    const sgn = signed(subscriptionEvent());
    const res = await handleStripeWebhook(
      {
        rawBody: sgn.rawBody,
        signatureHeader: sgn.header,
        nowSeconds: sec(now.getTime()),
        webhookSecret: SECRET,
        priceId: PRICE,
      },
      { store: broken, provider: h.provider, alert: (x) => alerts.push(x) },
    );
    expect(res).toMatchObject({ status: 500, code: 'retry' });
    expect(alerts.map((x) => x.kind)).toEqual(['processing_failed']);
  });
  it('alerts a repeated launch discount and a second live subscription, and strips the discount', async () => {
    const h = harness();
    await h.send(subscriptionEvent());
    await h.send(invoiceEvent(1));
    await h.send(
      subscriptionEvent({ id: 'sub_2', customer: 'cus_2' }, sec(T0) + 10),
    );
    const kinds = h.alerts.map((a) => a.kind);
    expect(kinds).toContain('duplicate_discount');
    expect(kinds).toContain('second_subscription');
    expect(h.subs().find((x) => x.subscriptionId === 'sub_2')?.discounted).toBe(
      false,
    );
  });
  it('retries a pending provider cancellation from a periodic job', async () => {
    let fail = true;
    const cancelled: string[] = [];
    const h = harness(
      fakeProvider({
        cancelSubscription: async (id) => {
          if (fail) throw Error('network');
          cancelled.push(id);
        },
      }),
    );
    await h.send(subscriptionEvent());
    await h.send(invoiceEvent(1));
    await h.send(refundEvent());
    expect(h.subs()[0].cancelPending).toBe(true);
    expect(await retryPendingCancellations(h.store, h.provider)).toEqual({
      attempted: 1,
      failed: 1,
    });
    fail = false;
    expect(await retryPendingCancellations(h.store, h.provider)).toEqual({
      attempted: 1,
      failed: 0,
    });
    expect(h.subs()[0].cancelPending).toBe(false);
    expect(cancelled).toEqual(['sub_1']);
    expect(await retryPendingCancellations(h.store, h.provider)).toEqual({
      attempted: 0,
      failed: 0,
    });
  });
  it('a later sync does not clear a pending cancellation', async () => {
    const h = harness(
      fakeProvider({
        cancelSubscription: async () => {
          throw Error('network');
        },
      }),
    );
    await h.send(subscriptionEvent());
    await h.send(invoiceEvent(1));
    await h.send(refundEvent());
    await h.send(subscriptionEvent({ status: 'active' }, sec(T0) + 500));
    expect(h.subs()[0].cancelPending).toBe(true);
    expect(h.subs()[0].revoked).toBe('refund');
  });
  it('reports whether a reserved chapter was already consumed', async () => {
    const h = harness();
    await h.send(subscriptionEvent());
    await h.send(invoiceEvent(1));
    expect(await reserveChapterForUser(h.store, USER, 'k1', now)).toMatchObject(
      { ok: true, state: 'reserved' },
    );
    await consumeChapterForUser(h.store, USER, 'k1');
    expect(await reserveChapterForUser(h.store, USER, 'k1', now)).toMatchObject(
      { ok: true, created: false, state: 'consumed' },
    );
  });
});

describe('checkout', () => {
  const cfg = {
    designatedUserIds: [USER],
    entitlement: defaultEntitlementConfig,
  };
  it('offers the launch price only to a designated, not yet redeemed account', async () => {
    const m = memoryStore();
    const p = fakeProvider();
    await createCheckoutSession(USER, now, {
      store: m.store,
      provider: p.provider,
      config: cfg,
    });
    await createCheckoutSession(OTHER, now, {
      store: m.store,
      provider: p.provider,
      config: cfg,
    });
    expect(
      p.calls.checkout.map((c) => [c.userId, c.offerVersion, c.discounted]),
    ).toEqual([
      [USER, 'launch_v1', true],
      [OTHER, 'standard_v1', false],
    ]);
  });
  it('never repeats the launch discount for the same account', async () => {
    const h = harness();
    await h.send(subscriptionEvent());
    await h.send(deletedEvent(sec(T0) + 10));
    await createCheckoutSession(USER, now, {
      store: h.store,
      provider: h.provider,
      config: cfg,
    });
    expect(h.calls.checkout[0]).toMatchObject({
      offerVersion: 'standard_v1',
      discounted: false,
    });
  });
  it('refuses a second live subscription', async () => {
    const h = harness();
    await h.send(subscriptionEvent());
    await h.send(invoiceEvent(1));
    await expect(
      createCheckoutSession(USER, now, {
        store: h.store,
        provider: h.provider,
        config: cfg,
      }),
    ).rejects.toMatchObject({
      code: 'BILLING_ALREADY_SUBSCRIBED',
      status: 409,
    });
    await expect(
      createCheckoutSession(USER, now, {
        store: h.store,
        provider: h.provider,
        config: cfg,
      }),
    ).rejects.toBeInstanceOf(DomainError);
    expect(h.calls.checkout).toHaveLength(0);
  });
});

describe('chapter gate', () => {
  async function funded() {
    const h = harness();
    await h.send(subscriptionEvent());
    await h.send(invoiceEvent(1));
    return h;
  }
  it('serialises concurrent reservations: exactly the allowance is granted', async () => {
    const h = await funded();
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        reserveChapterForUser(h.store, USER, `k${i}`, now),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(
      results
        .filter((r) => !r.ok)
        .every((r) => !r.ok && r.reason === 'allowance_exhausted'),
    ).toBe(true);
  });
  it('an identical retry does not debit again and a consumed key stays consumed', async () => {
    const h = await funded();
    const a = await reserveChapterForUser(h.store, USER, 'k1', now);
    const b = await reserveChapterForUser(h.store, USER, 'k1', now);
    expect(a).toMatchObject({ ok: true, created: true });
    expect(b).toMatchObject({ ok: true, created: false });
    await consumeChapterForUser(h.store, USER, 'k1');
    expect(await reserveChapterForUser(h.store, USER, 'k1', now)).toMatchObject(
      { ok: true, created: false },
    );
    const states = [...h.peek().reservations.values()].map((r) => r.state);
    expect(states).toEqual(['consumed']);
  });
  it('a failure releases the keret so the whole allowance is usable', async () => {
    const h = await funded();
    await reserveChapterForUser(h.store, USER, 'k1', now);
    await releaseChapterForUser(h.store, USER, 'k1');
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        reserveChapterForUser(h.store, USER, `n${i}`, now),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(5);
  });
  it('consuming or releasing an unknown key fails and changes nothing', async () => {
    const h = await funded();
    await expect(
      consumeChapterForUser(h.store, USER, 'nope'),
    ).rejects.toMatchObject({ code: 'BILLING_RESERVATION_MISSING' });
    expect(h.peek().reservations.size).toBe(0);
    await releaseChapterForUser(h.store, USER, 'nope');
  });
  it('a user without subscription gets exactly one free taster, separate from paid keret', async () => {
    const h = harness();
    expect(
      await reserveChapterForUser(h.store, OTHER, 't1', now),
    ).toMatchObject({ ok: true, bucket: 'taster' });
    await consumeChapterForUser(h.store, OTHER, 't1');
    expect(await reserveChapterForUser(h.store, OTHER, 't2', now)).toEqual({
      ok: false,
      reason: 'no_entitlement',
    });
  });
  it('the taster does not reduce the paid allowance of a later subscriber', async () => {
    const h = harness();
    await reserveChapterForUser(h.store, USER, 't1', now);
    await consumeChapterForUser(h.store, USER, 't1');
    await h.send(subscriptionEvent());
    await h.send(invoiceEvent(1));
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        reserveChapterForUser(h.store, USER, `p${i}`, now),
      ),
    );
    expect(results.filter((r) => r.ok && r.bucket === 'paid')).toHaveLength(5);
  });
  it('is closed for a subscription that recovery marked for reconciliation', async () => {
    const h = await funded();
    const sub = h.subs()[0];
    h.peek().subs.set(sub.subscriptionId, { ...sub, reconcileRequired: true });
    expect(await reserveChapterForUser(h.store, USER, 'k1', now)).toMatchObject(
      { ok: true, bucket: 'taster' },
    );
    expect(await reserveChapterForUser(h.store, USER, 'k2', now)).toEqual({
      ok: false,
      reason: 'no_entitlement',
    });
  });
  it('does not roll the allowance over after the period ends', async () => {
    const h = await funded();
    const later = new Date(T0 + 40 * day);
    expect(
      await reserveChapterForUser(h.store, USER, 'k1', later),
    ).toMatchObject({ ok: true, bucket: 'taster' });
  });
});

describe('configuration', () => {
  const valid = {
    BILLING_ENABLED: 'true',
    STRIPE_SECRET_KEY: 'sk_test_abcdefgh12345678',
    STRIPE_WEBHOOK_SECRET: 'whsec_abcdefgh12345678',
    STRIPE_PRICE_ID: 'price_abc123',
    STRIPE_FOUNDER_COUPON_ID: 'founder_coupon',
    STRIPE_API_VERSION: '2025-03-31.basil',
    BILLING_SUCCESS_URL: 'https://app.example.com/billing/success',
    BILLING_CANCEL_URL: 'https://app.example.com/billing/cancel',
    BILLING_FOUNDER_USER_IDS: USER,
  };
  it('is disabled by default and when the flag is explicitly false', () => {
    expect(billingConfigFromEnv({})).toMatchObject({
      enabled: false,
      enforcement: false,
    });
    expect(billingConfigFromEnv({ BILLING_ENABLED: 'false' }).enabled).toBe(
      false,
    );
  });
  it('accepts a complete configuration and keeps enforcement separate', () => {
    const c = billingConfigFromEnv(valid);
    expect(c).toMatchObject({
      enabled: true,
      enforcement: false,
      designatedUserIds: [USER],
    });
    expect(
      billingConfigFromEnv({ ...valid, BILLING_ENFORCEMENT: 'true' }),
    ).toMatchObject({ enabled: true, enforcement: true });
  });
  it.each([
    ['missing secret key', { STRIPE_SECRET_KEY: '' }],
    ['malformed secret key', { STRIPE_SECRET_KEY: 'not-a-key' }],
    ['missing webhook secret', { STRIPE_WEBHOOK_SECRET: '' }],
    ['missing price', { STRIPE_PRICE_ID: '' }],
    ['missing coupon', { STRIPE_FOUNDER_COUPON_ID: '' }],
    ['missing api version', { STRIPE_API_VERSION: '' }],
    [
      'insecure success url',
      { BILLING_SUCCESS_URL: 'http://app.example.com/x' },
    ],
    ['bad cancel url', { BILLING_CANCEL_URL: 'nonsense' }],
    [
      'e-mail instead of user id',
      { BILLING_FOUNDER_USER_IDS: 'a@example.com' },
    ],
    [
      'duplicate designated ids',
      { BILLING_FOUNDER_USER_IDS: `${USER},${USER}` },
    ],
    ['non-boolean enforcement', { BILLING_ENFORCEMENT: 'maybe' }],
  ])('disables billing for an invalid configuration: %s', (_name, over) => {
    const c = billingConfigFromEnv({ ...valid, ...over });
    expect(c.enabled).toBe(false);
  });
  it('disables billing for more than ten designated accounts', () => {
    const ids = Array.from(
      { length: 11 },
      (_, i) =>
        `11111111-1111-4111-8111-1111111111${String(i).padStart(2, '0')}`,
    ).join(',');
    expect(
      billingConfigFromEnv({ ...valid, BILLING_FOUNDER_USER_IDS: ids }).enabled,
    ).toBe(false);
  });
  it('never exposes secrets when redacted', () => {
    const text = JSON.stringify(
      redactBillingConfig(billingConfigFromEnv(valid)),
    );
    expect(text).not.toContain('sk_test');
    expect(text).not.toContain('whsec');
    expect(text).not.toContain(USER);
    expect(JSON.parse(text)).toMatchObject({
      enabled: true,
      mode: 'test',
      designatedAccounts: 1,
    });
  });
  it('reads a restricted live key as live mode', () => {
    const c = billingConfigFromEnv({
      ...valid,
      STRIPE_SECRET_KEY: 'rk_live_abcdefgh12345678',
    });
    expect(redactBillingConfig(c)).toMatchObject({ mode: 'live' });
  });
  it('keeps secrets non-enumerable on the config object', () => {
    const c = billingConfigFromEnv(valid);
    expect(Object.keys(c)).not.toContain('secretKey');
    expect(Object.keys(c)).not.toContain('webhookSecret');
    expect(JSON.stringify(c)).not.toContain('whsec_');
    expect(JSON.stringify(c)).not.toContain('sk_test_');
    expect(c.enabled && c.secretKey).toBe(valid.STRIPE_SECRET_KEY);
  });
  it('keeps the enforcement intent when the configuration is broken', () => {
    expect(
      billingConfigFromEnv({
        ...valid,
        BILLING_ENFORCEMENT: 'true',
        STRIPE_PRICE_ID: '',
      }),
    ).toMatchObject({ enabled: false, enforcement: true });
    expect(
      billingConfigFromEnv({ ...valid, BILLING_ENFORCEMENT: 'maybe' }),
    ).toMatchObject({ enabled: false, enforcement: true });
  });
  it('keeps the offer defaults', () => {
    expect(defaultBillingOfferConfig).toEqual({
      discountedCycles: 3,
      discountedChapters: 5,
      standardChapters: 8,
    });
  });
});

describe('stripe provider', () => {
  type Call = { url: string; init: RequestInit };
  function fakeFetch(
    handler: (
      url: URL,
      init: RequestInit,
    ) => { status?: number; body: unknown },
  ) {
    const calls: Call[] = [];
    const impl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({ url: url.toString(), init: init ?? {} });
      const { status = 200, body } = handler(url, init ?? {});
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
    return { impl, calls };
  }
  const base = {
    secretKey: 'sk_test_abcdefgh12345678',
    apiVersion: '2025-03-31.basil',
    priceId: PRICE,
    couponId: 'founder_coupon',
    successUrl: 'https://app.example.com/ok',
    cancelUrl: 'https://app.example.com/no',
  };
  it('builds a Managed Payments Checkout session without the forbidden fields', async () => {
    const f = fakeFetch(() => ({
      body: { url: 'https://checkout.stripe.com/c/pay/cs_1' },
    }));
    const p = createStripeProvider({ ...base, fetch: f.impl });
    const out = await p.createCheckoutSession({
      userId: USER,
      offerVersion: 'standard_v1',
      discounted: false,
      now,
    });
    expect(out.url).toBe('https://checkout.stripe.com/c/pay/cs_1');
    const call = f.calls[0];
    const form = new URLSearchParams(String(call.init.body));
    expect(call.url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(form.get('mode')).toBe('subscription');
    expect(form.get('managed_payments[enabled]')).toBe('true');
    expect(form.get('line_items[0][price]')).toBe(PRICE);
    expect(form.get('client_reference_id')).toBe(USER);
    expect(form.get('subscription_data[metadata][offer_version]')).toBe(
      'standard_v1',
    );
    expect(form.has('discounts[0][coupon]')).toBe(false);
    for (const key of form.keys())
      expect(key).not.toMatch(
        /automatic_tax|tax_id_collection|adaptive_pricing|payment_method_types|invoice_creation/,
      );
    const headers = call.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${base.secretKey}`);
    expect(headers['Stripe-Version']).toBe('2025-03-31.basil');
    expect(headers['Idempotency-Key']).toMatch(
      /^alterward-checkout-[a-f0-9]{32}$/,
    );
  });
  it('attaches the coupon only for a discounted checkout', async () => {
    const f = fakeFetch(() => ({
      body: { url: 'https://checkout.stripe.com/c/pay/cs_1' },
    }));
    const p = createStripeProvider({ ...base, fetch: f.impl });
    await p.createCheckoutSession({
      userId: USER,
      offerVersion: 'launch_v1',
      discounted: true,
      now,
    });
    const form = new URLSearchParams(String(f.calls[0].init.body));
    expect(form.get('discounts[0][coupon]')).toBe('founder_coupon');
    expect(form.get('subscription_data[metadata][offer_version]')).toBe(
      'launch_v1',
    );
  });
  it('rejects a checkout response without a usable Stripe URL', async () => {
    for (const body of [
      {},
      { url: 'http://checkout.stripe.com/x' },
      { url: 'https://evil.example.com/x' },
    ]) {
      const f = fakeFetch(() => ({ body }));
      const p = createStripeProvider({ ...base, fetch: f.impl });
      await expect(
        p.createCheckoutSession({
          userId: USER,
          offerVersion: 'standard_v1',
          discounted: false,
          now,
        }),
      ).rejects.toThrow('no usable URL');
    }
  });
  it('errors never contain the key or the response body', async () => {
    const f = fakeFetch(() => ({
      status: 401,
      body: {
        error: {
          code: 'invalid_api_key',
          message: 'sk_test_abcdefgh12345678 is wrong',
        },
      },
    }));
    const p = createStripeProvider({ ...base, fetch: f.impl });
    const error = await p
      .createCheckoutSession({
        userId: USER,
        offerVersion: 'standard_v1',
        discounted: false,
        now,
      })
      .catch((e: Error) => e);
    expect((error as Error).message).toBe(
      'Stripe request failed (401, invalid_api_key)',
    );
  });
  it('cancel is idempotent for a missing subscription and strict otherwise', async () => {
    const gone = fakeFetch(() => ({
      status: 404,
      body: { error: { code: 'resource_missing' } },
    }));
    await createStripeProvider({
      ...base,
      fetch: gone.impl,
    }).cancelSubscription('sub_1');
    expect(gone.calls[0]).toMatchObject({
      url: 'https://api.stripe.com/v1/subscriptions/sub_1',
    });
    expect(gone.calls[0].init.method).toBe('DELETE');
    const broken = fakeFetch(() => ({ status: 500, body: {} }));
    await expect(
      createStripeProvider({ ...base, fetch: broken.impl }).cancelSubscription(
        'sub_1',
      ),
    ).rejects.toThrow('500');
    await expect(
      createStripeProvider({ ...base, fetch: gone.impl }).cancelSubscription(
        '../x',
      ),
    ).rejects.toThrow('Invalid subscription id');
  });
  it('traces a dispute from charge to payment, invoice and subscription', async () => {
    const f = fakeFetch((url) => {
      if (url.pathname === '/v1/charges/ch_1')
        return {
          body: { id: 'ch_1', customer: 'cus_1', payment_intent: 'pi_1' },
        };
      if (url.pathname === '/v1/invoice_payments')
        return { body: { data: [{ invoice: 'in_1' }] } };
      if (url.pathname === '/v1/invoices/in_1')
        return {
          body: {
            id: 'in_1',
            customer: 'cus_1',
            parent: { subscription_details: { subscription: 'sub_1' } },
          },
        };
      return { status: 404, body: {} };
    });
    const p = createStripeProvider({ ...base, fetch: f.impl });
    const event: BillingEvent = {
      type: 'revocation',
      eventId: 'evt_d',
      created: 1,
      reason: 'dispute',
      subscriptionId: null,
      customerId: null,
      paymentIntentId: null,
      chargeId: 'ch_1',
      invoiceId: null,
    };
    expect(await p.resolveRevocation(event)).toMatchObject({
      subscriptionId: 'sub_1',
      customerId: 'cus_1',
      invoiceId: 'in_1',
    });
  });
  it('does not call the provider when the event is already complete, and returns null when it cannot trace', async () => {
    const f = fakeFetch(() => ({ status: 404, body: {} }));
    const p = createStripeProvider({ ...base, fetch: f.impl });
    const complete: BillingEvent = {
      type: 'revocation',
      eventId: 'e',
      created: 1,
      reason: 'refund',
      subscriptionId: 'sub_1',
      customerId: 'cus_1',
      paymentIntentId: null,
      chargeId: 'ch_1',
      invoiceId: 'in_1',
    };
    expect(await p.resolveRevocation(complete)).toBe(complete);
    expect(f.calls).toHaveLength(0);
    const lost: BillingEvent = {
      ...complete,
      subscriptionId: null,
      customerId: null,
      invoiceId: null,
    };
    expect(await p.resolveRevocation(lost)).toBeNull();
  });
  it('treats a client error on cancel as done only when the subscription is cancelled', async () => {
    const already = fakeFetch((_url, init) =>
      init.method === 'DELETE'
        ? { status: 400, body: { error: { code: 'resource_invalid' } } }
        : { body: { id: 'sub_1', status: 'canceled' } },
    );
    await createStripeProvider({
      ...base,
      fetch: already.impl,
    }).cancelSubscription('sub_1');
    expect(already.calls.map((c) => c.init.method)).toEqual(['DELETE', 'GET']);
    const live = fakeFetch((_url, init) =>
      init.method === 'DELETE'
        ? { status: 400, body: {} }
        : { body: { id: 'sub_1', status: 'active' } },
    );
    await expect(
      createStripeProvider({ ...base, fetch: live.impl }).cancelSubscription(
        'sub_1',
      ),
    ).rejects.toThrow('400');
  });
  it('sets a checkout expiry so parallel sessions cannot stay open', async () => {
    const f = fakeFetch(() => ({
      body: { url: 'https://checkout.stripe.com/c/pay/cs_1' },
    }));
    await createStripeProvider({
      ...base,
      fetch: f.impl,
    }).createCheckoutSession({
      userId: USER,
      offerVersion: 'standard_v1',
      discounted: false,
      now,
    });
    const form = new URLSearchParams(String(f.calls[0].init.body));
    expect(Number(form.get('expires_at'))).toBe(sec(now.getTime()) + 35 * 60);
  });
  it('answers not_ours for an invoice of another price or a one-off invoice', async () => {
    const dispute = (invoice: Record<string, unknown>) => {
      const f = fakeFetch((url) =>
        url.pathname === '/v1/charges/ch_1'
          ? { body: { id: 'ch_1', customer: 'cus_1', invoice: 'in_9' } }
          : { body: { id: 'in_9', customer: 'cus_1', ...invoice } },
      );
      return createStripeProvider({ ...base, fetch: f.impl }).resolveRevocation(
        {
          type: 'revocation',
          eventId: 'e',
          created: 1,
          reason: 'dispute',
          subscriptionId: null,
          customerId: null,
          paymentIntentId: null,
          chargeId: 'ch_1',
          invoiceId: null,
        },
      );
    };
    const line = (price: string) => ({
      pricing: { price_details: { price } },
    });
    expect(
      await dispute({
        lines: { data: [line('price_other')] },
        parent: { subscription_details: { subscription: 'sub_1' } },
      }),
    ).toBe('not_ours');
    expect(await dispute({ lines: { data: [line(PRICE)] } })).toBe('not_ours');
    expect(
      await dispute({
        lines: { data: [line(PRICE)] },
        parent: { subscription_details: { subscription: 'sub_1' } },
      }),
    ).toMatchObject({ subscriptionId: 'sub_1', invoiceId: 'in_9' });
  });
});
