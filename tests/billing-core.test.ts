import { createHmac } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  addChapterGrant,
  applyBillingEvent,
  chapterAllowanceForCycle,
  consumeChapter,
  defaultBillingOfferConfig,
  deriveEntitlement,
  emptyChapterLedger,
  mayAttachFounderDiscount,
  normalizeStripeEvent,
  offerVersionForCycle,
  paidChaptersAvailable,
  releaseChapter,
  reserveChapter,
  revokeUnspentGrants,
  tasterChaptersAvailable,
  validateBillingOfferConfig,
  validateDiscountedUserIds,
  verifyStripeSignature,
  BillingEventFormatError,
  type BillingEvent,
  type BillingSubscription,
  type ChapterLedger,
  type Entitlement,
} from '@future-flow/core';

const USER = '11111111-1111-4111-8111-111111111111';
const T0 = Date.parse('2026-11-01T00:00:00Z');
const sec = (ms: number) => Math.floor(ms / 1000);
const day = 86_400_000;

const synced = (
  over: Partial<Extract<BillingEvent, { type: 'subscription_synced' }>> = {},
): BillingEvent => ({
  type: 'subscription_synced',
  eventId: 'evt_s1',
  created: sec(T0),
  subscriptionId: 'sub_1',
  customerId: 'cus_1',
  userId: USER,
  status: 'active',
  periodStart: new Date(T0).toISOString(),
  periodEnd: new Date(T0 + 30 * day).toISOString(),
  cancelAtPeriodEnd: false,
  discounted: true,
  ...over,
});
const paid = (
  n: number,
  over: Partial<Extract<BillingEvent, { type: 'invoice_paid' }>> = {},
): BillingEvent => ({
  type: 'invoice_paid',
  eventId: `evt_i${n}`,
  created: sec(T0) + n,
  subscriptionId: 'sub_1',
  invoiceId: `in_${n}`,
  billingReason: n === 1 ? 'subscription_create' : 'subscription_cycle',
  periodStart: new Date(T0 + (n - 1) * 30 * day).toISOString(),
  periodEnd: new Date(T0 + n * 30 * day).toISOString(),
  ...over,
});
function run(events: BillingEvent[]) {
  let sub: BillingSubscription | null = null;
  let ledger: ChapterLedger = emptyChapterLedger;
  for (const e of events) {
    const t = applyBillingEvent(sub, e);
    sub = t.next;
    if (t.revokeGrants) ledger = revokeUnspentGrants(ledger);
    if (t.grant) ledger = addChapterGrant(ledger, t.grant);
  }
  return { sub, ledger };
}

describe('offer configuration', () => {
  it('moves 5 -> 8 chapters from our own cycle counter', () => {
    expect(
      [1, 2, 3, 4, 5].map((c) => chapterAllowanceForCycle(c, true)),
    ).toEqual([5, 5, 5, 8, 8]);
    expect(offerVersionForCycle(3, true)).toBe('launch_v1');
    expect(offerVersionForCycle(4, true)).toBe('standard_v1');
  });
  it('gives the standard allowance from cycle 1 without the discount', () => {
    expect(chapterAllowanceForCycle(1, false)).toBe(8);
  });
  it('gives nothing for an invalid cycle', () => {
    expect(chapterAllowanceForCycle(0, true)).toBe(0);
    expect(chapterAllowanceForCycle(1.5, true)).toBe(0);
  });
  it('validates the configuration and rejects garbage', () => {
    expect(validateBillingOfferConfig(defaultBillingOfferConfig)).toEqual(
      defaultBillingOfferConfig,
    );
    expect(() =>
      validateBillingOfferConfig({
        ...defaultBillingOfferConfig,
        standardChapters: -1,
      }),
    ).toThrow();
    expect(() =>
      validateBillingOfferConfig({
        ...defaultBillingOfferConfig,
        discountedCycles: 1.2,
      }),
    ).toThrow();
    expect(() =>
      validateBillingOfferConfig({
        ...defaultBillingOfferConfig,
        standardChapters: 1000,
      }),
    ).toThrow();
  });
});

describe('founder discount designation', () => {
  it('accepts up to 10 unique user UUIDs and normalises case', () => {
    expect(validateDiscountedUserIds([USER.toUpperCase()])).toEqual([USER]);
  });
  it('rejects e-mails, duplicates and more than 10 accounts', () => {
    expect(() => validateDiscountedUserIds(['a@example.com'])).toThrow();
    expect(() => validateDiscountedUserIds([USER, USER])).toThrow();
    const many = Array.from(
      { length: 11 },
      (_, i) =>
        `11111111-1111-4111-8111-1111111111${String(i).padStart(2, '0')}`,
    );
    expect(() => validateDiscountedUserIds(many)).toThrow();
  });
  it('attaches only for a designated, not yet redeemed account', () => {
    expect(mayAttachFounderDiscount([USER], USER, false)).toBe(true);
    expect(mayAttachFounderDiscount([USER], USER, true)).toBe(false);
    expect(
      mayAttachFounderDiscount(
        [USER],
        '22222222-2222-4222-8222-222222222222',
        false,
      ),
    ).toBe(false);
    expect(mayAttachFounderDiscount([], USER, false)).toBe(false);
  });
});

describe('subscription state machine', () => {
  it('grants 5,5,5 then 8 chapters, once per paid invoice', () => {
    const { ledger } = run([synced(), paid(1), paid(2), paid(3), paid(4)]);
    expect(ledger.grants.map((g) => g.amount)).toEqual([5, 5, 5, 8]);
    expect(ledger.grants.map((g) => g.cycleIndex)).toEqual([1, 2, 3, 4]);
  });
  it('treats a replayed invoice.paid as a duplicate', () => {
    const first = run([synced(), paid(1)]);
    const again = applyBillingEvent(first.sub, paid(1));
    expect(again.outcome).toBe('duplicate');
    expect(again.grant).toBeNull();
    expect(
      run([synced(), paid(1), paid(1), paid(1)]).ledger.grants,
    ).toHaveLength(1);
  });
  it('ignores invoice.paid without a known subscription', () => {
    expect(applyBillingEvent(null, paid(1)).outcome).toBe('ignored');
  });
  it('ignores invoices that are not a create/cycle payment', () => {
    const t = applyBillingEvent(
      run([synced()]).sub,
      paid(1, { billingReason: 'manual' }),
    );
    expect(t.grant).toBeNull();
    expect(t.outcome).toBe('ignored');
  });
  it('ignores events of a different subscription', () => {
    const sub = run([synced()]).sub;
    expect(
      applyBillingEvent(sub, paid(1, { subscriptionId: 'sub_other' })).outcome,
    ).toBe('ignored');
    expect(
      applyBillingEvent(sub, synced({ subscriptionId: 'sub_other' })).outcome,
    ).toBe('ignored');
  });
  it('does not let an older state event overwrite a newer one', () => {
    const sub = run([
      synced({ created: sec(T0) + 100, status: 'canceled' }),
    ]).sub;
    const t = applyBillingEvent(
      sub,
      synced({ created: sec(T0) + 10, status: 'active' }),
    );
    expect(t.outcome).toBe('stale');
    expect(t.next?.status).toBe('canceled');
  });
  it('keeps the discount designation set at the first sync', () => {
    const sub = run([synced({ discounted: true })]).sub;
    expect(
      applyBillingEvent(
        sub,
        synced({ created: sec(T0) + 5, discounted: false }),
      ).next?.discounted,
    ).toBe(true);
    const plain = run([synced({ discounted: false }), paid(1)]);
    expect(plain.ledger.grants[0].amount).toBe(8);
  });
  it('deletion ends the subscription', () => {
    const sub = run([synced()]).sub;
    const t = applyBillingEvent(sub, {
      type: 'subscription_deleted',
      eventId: 'e',
      created: sec(T0) + 50,
      subscriptionId: 'sub_1',
    });
    expect(deriveEntitlement(t.next, new Date(T0 + day)).canGenerate).toBe(
      false,
    );
  });
});

describe('refund and dispute', () => {
  const revocation = (
    reason: 'refund' | 'dispute',
    over: Record<string, unknown> = {},
  ): BillingEvent =>
    ({
      type: 'revocation',
      eventId: 'evt_r',
      created: sec(T0) + 200,
      reason,
      subscriptionId: 'sub_1',
      customerId: 'cus_1',
      paymentIntentId: null,
      chargeId: null,
      invoiceId: null,
      ...over,
    }) as BillingEvent;
  it('revokes access at once and zeroes the unspent allowance', () => {
    const { sub, ledger } = run([synced(), paid(1), revocation('refund')]);
    expect(sub?.revoked).toBe('refund');
    expect(deriveEntitlement(sub, new Date(T0 + day))).toEqual({
      state: 'revoked',
      canGenerate: false,
    });
    expect(paidChaptersAvailable(ledger, new Date(T0 + day))).toBe(0);
  });
  it('matches by customer when the subscription is unknown', () => {
    const { sub } = run([
      synced(),
      revocation('dispute', { subscriptionId: null }),
    ]);
    expect(sub?.revoked).toBe('dispute');
  });
  it('does not match a different customer', () => {
    const { sub } = run([
      synced(),
      revocation('refund', { subscriptionId: null, customerId: 'cus_x' }),
    ]);
    expect(sub?.revoked).toBeNull();
  });
  it('is never reopened by later sync or payment events', () => {
    const { sub, ledger } = run([
      synced(),
      paid(1),
      revocation('refund'),
      synced({ created: sec(T0) + 900 }),
      paid(2),
    ]);
    expect(deriveEntitlement(sub, new Date(T0 + 31 * day)).canGenerate).toBe(
      false,
    );
    expect(paidChaptersAvailable(ledger, new Date(T0 + 31 * day))).toBe(0);
  });
  it('treats a repeated revocation as a duplicate', () => {
    const { sub } = run([synced(), revocation('refund')]);
    expect(applyBillingEvent(sub, revocation('refund')).outcome).toBe(
      'duplicate',
    );
  });
});

describe('entitlement derivation (fail closed)', () => {
  const sub = (over: Partial<BillingSubscription> = {}) =>
    ({ ...run([synced()]).sub!, ...over }) as BillingSubscription;
  const at = (ms: number) => new Date(T0 + ms);
  it('no subscription means none', () => {
    expect(deriveEntitlement(null, at(0))).toEqual({
      state: 'none',
      canGenerate: false,
    });
  });
  it('active inside the period', () => {
    expect(deriveEntitlement(sub(), at(day))).toEqual({
      state: 'active',
      canGenerate: true,
    });
  });
  it('active with a missing renewal lapses after the slack', () => {
    expect(deriveEntitlement(sub(), at(30 * day + 3_600_000)).canGenerate).toBe(
      true,
    );
    expect(deriveEntitlement(sub(), at(32 * day)).state).toBe('ended');
  });
  it('cancel at period end keeps access until the period ends', () => {
    expect(
      deriveEntitlement(sub({ cancelAtPeriodEnd: true }), at(10 * day)),
    ).toEqual({ state: 'canceling', canGenerate: true });
    expect(
      deriveEntitlement(
        sub({ cancelAtPeriodEnd: true, status: 'canceled' }),
        at(10 * day),
      ).canGenerate,
    ).toBe(false);
  });
  it('past_due keeps access only inside the hard bound', () => {
    expect(
      deriveEntitlement(sub({ status: 'past_due' }), at(35 * day)),
    ).toEqual({ state: 'past_due', canGenerate: true });
    expect(
      deriveEntitlement(sub({ status: 'past_due' }), at(50 * day)).canGenerate,
    ).toBe(false);
  });
  it.each([
    'incomplete',
    'incomplete_expired',
    'unpaid',
    'paused',
    'canceled',
  ] as const)('%s never grants access', (status) => {
    expect(deriveEntitlement(sub({ status }), at(day)).canGenerate).toBe(false);
  });
  it('an unusable period or clock denies', () => {
    expect(
      deriveEntitlement(sub({ periodEnd: null }), at(day)).canGenerate,
    ).toBe(false);
    expect(
      deriveEntitlement(sub({ periodEnd: 'garbage' }), at(day)).canGenerate,
    ).toBe(false);
    expect(deriveEntitlement(sub(), new Date(Number.NaN)).canGenerate).toBe(
      false,
    );
  });
});

describe('chapter ledger', () => {
  const now = new Date(T0 + day);
  const active: Entitlement = { state: 'active', canGenerate: true };
  const none: Entitlement = { state: 'none', canGenerate: false };
  const funded = () => run([synced(), paid(1)]).ledger;
  const reserved = (l: ChapterLedger, key: string, e = active) => {
    const r = reserveChapter(l, key, e, now);
    if (!r.ok) throw Error(r.reason);
    return r;
  };

  it('reserves, consumes only after a durable save, and drops the balance by one', () => {
    const r = reserved(funded(), 'k1');
    expect(r.created).toBe(true);
    expect(paidChaptersAvailable(r.ledger, now)).toBe(4);
    expect(paidChaptersAvailable(consumeChapter(r.ledger, 'k1'), now)).toBe(4);
  });
  it('a retried identical request never debits twice', () => {
    const first = reserved(funded(), 'k1');
    const retry = reserved(first.ledger, 'k1');
    expect(retry.created).toBe(false);
    expect(paidChaptersAvailable(retry.ledger, now)).toBe(4);
    const consumed = consumeChapter(retry.ledger, 'k1');
    const afterConsume = reserved(consumed, 'k1');
    expect(afterConsume.created).toBe(false);
    expect(paidChaptersAvailable(afterConsume.ledger, now)).toBe(4);
    expect(consumeChapter(consumed, 'k1')).toBe(consumed);
  });
  it('a failure releases the keret and the same key may be tried again', () => {
    const r = reserved(funded(), 'k1');
    const released = releaseChapter(r.ledger, 'k1');
    expect(paidChaptersAvailable(released, now)).toBe(5);
    const again = reserved(released, 'k1');
    expect(again.created).toBe(true);
    expect(paidChaptersAvailable(again.ledger, now)).toBe(4);
  });
  it('release after consume does not give the chapter back', () => {
    const r = reserved(funded(), 'k1');
    const consumed = consumeChapter(r.ledger, 'k1');
    expect(releaseChapter(consumed, 'k1')).toBe(consumed);
    expect(paidChaptersAvailable(consumed, now)).toBe(4);
  });
  it('closes before generation when the allowance is spent', () => {
    let l = funded();
    for (let i = 0; i < 5; i++) l = reserved(l, `k${i}`).ledger;
    expect(reserveChapter(l, 'k5', active, now)).toEqual({
      ok: false,
      reason: 'allowance_exhausted',
    });
  });
  it('without entitlement only the one free taster is available, once', () => {
    const r = reserved(emptyChapterLedger, 't1', none);
    expect(r.reservation.bucket).toBe('taster');
    expect(tasterChaptersAvailable(r.ledger)).toBe(0);
    expect(reserveChapter(r.ledger, 't2', none, now)).toEqual({
      ok: false,
      reason: 'no_entitlement',
    });
    const consumed = consumeChapter(r.ledger, 't1');
    expect(reserveChapter(consumed, 't3', none, now).ok).toBe(false);
  });
  it('a failed taster attempt does not burn the taster', () => {
    const r = reserved(emptyChapterLedger, 't1', none);
    expect(tasterChaptersAvailable(releaseChapter(r.ledger, 't1'))).toBe(1);
  });
  it('the taster never reduces the paid allowance', () => {
    const t = reserved(funded(), 't1', none);
    expect(paidChaptersAvailable(t.ledger, now)).toBe(5);
  });
  it('an entitled user with an empty allowance does not fall back to the taster', () => {
    let l = funded();
    for (let i = 0; i < 5; i++) l = reserved(l, `k${i}`).ledger;
    expect(reserveChapter(l, 'x', active, now)).toEqual({
      ok: false,
      reason: 'allowance_exhausted',
    });
  });
  it('allowance does not roll over after the period ends', () => {
    const later = new Date(T0 + 31 * day);
    expect(paidChaptersAvailable(funded(), later)).toBe(0);
    expect(reserveChapter(funded(), 'k', active, later)).toEqual({
      ok: false,
      reason: 'allowance_exhausted',
    });
  });
  it('revocation keeps spent chapters spent and removes the rest', () => {
    const r = reserved(funded(), 'k1');
    const revoked = revokeUnspentGrants(r.ledger);
    expect(paidChaptersAvailable(revoked, now)).toBe(0);
    expect(consumeChapter(revoked, 'k1').reservations[0].state).toBe(
      'consumed',
    );
  });
  it('rejects an unusable request key', () => {
    expect(reserveChapter(funded(), '', active, now)).toEqual({
      ok: false,
      reason: 'invalid_key',
    });
    expect(reserveChapter(funded(), 'x'.repeat(201), active, now)).toEqual({
      ok: false,
      reason: 'invalid_key',
    });
  });
  it('the same invoice grant is added only once', () => {
    const l = funded();
    expect(addChapterGrant(l, l.grants[0])).toBe(l);
  });
  it('draws from the grant that expires first', () => {
    const l = run([synced(), paid(1), paid(2)]).ledger;
    const r = reserved(l, 'k1');
    expect(r.reservation.grantKey).toBe('in_1');
  });
});

describe('stripe webhook signature', () => {
  const secret = 'whsec_test_secret';
  const payload = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
  const now = 1_800_000_000;
  const sign = (ts: number, body: string, key = secret) =>
    createHmac('sha256', key).update(`${ts}.${body}`).digest('hex');
  const header = (ts = now, sig = sign(ts, payload)) => `t=${ts},v1=${sig}`;
  const verify = (
    over: Partial<Parameters<typeof verifyStripeSignature>[0]> = {},
  ) =>
    verifyStripeSignature({
      payload,
      header: header(),
      secret,
      nowSeconds: now,
      ...over,
    });

  it('accepts a correct signature, string or bytes', () => {
    expect(verify()).toBe(true);
    expect(verify({ payload: Buffer.from(payload) })).toBe(true);
  });
  it('accepts when any of several v1 signatures matches', () => {
    expect(
      verify({
        header: `t=${now},v1=${'0'.repeat(64)},v1=${sign(now, payload)}`,
      }),
    ).toBe(true);
  });
  it('rejects a modified body, wrong secret or wrong timestamp binding', () => {
    expect(verify({ payload: payload + ' ' })).toBe(false);
    expect(verify({ secret: 'whsec_other' })).toBe(false);
    expect(verify({ header: `t=${now + 1},v1=${sign(now, payload)}` })).toBe(
      false,
    );
  });
  it('rejects outside the tolerance in both directions', () => {
    expect(verify({ nowSeconds: now + 301 })).toBe(false);
    expect(verify({ nowSeconds: now - 301 })).toBe(false);
    expect(verify({ nowSeconds: now + 300 })).toBe(true);
  });
  it.each([
    ['missing header', undefined],
    ['empty header', ''],
    ['no signature', `t=${now}`],
    ['no timestamp', `v1=${sign(now, payload)}`],
    ['non-hex signature', `t=${now},v1=zz`],
    ['short signature', `t=${now},v1=abcd`],
    ['only a v0 signature', `t=${now},v0=${sign(now, payload)}`],
    ['non-numeric timestamp', `t=abc,v1=${sign(now, payload)}`],
  ])('rejects %s', (_name, h) => {
    expect(verify({ header: h })).toBe(false);
  });
  it('rejects an empty secret and never throws', () => {
    expect(verify({ secret: '' })).toBe(false);
    expect(() => verify({ header: 'garbage,,=,t=' })).not.toThrow();
    expect(verify({ header: 'garbage,,=,t=' })).toBe(false);
  });
});

describe('stripe event normalisation', () => {
  const evt = (
    type: string,
    object: unknown,
    over: Record<string, unknown> = {},
  ) => ({
    id: 'evt_1',
    type,
    created: 1_800_000_000,
    data: { object },
    ...over,
  });
  it('ignores event types we do not act on', () => {
    expect(normalizeStripeEvent(evt('customer.created', {}))).toBeNull();
    expect(
      normalizeStripeEvent(evt('payment_intent.succeeded', {})),
    ).toBeNull();
  });
  it('maps a subscription with basil item periods and offer metadata', () => {
    const e = normalizeStripeEvent(
      evt('customer.subscription.created', {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        cancel_at_period_end: false,
        metadata: { user_id: USER, offer_version: 'launch_v1' },
        items: {
          data: [
            {
              current_period_start: 1_800_000_000,
              current_period_end: 1_802_592_000,
            },
          ],
        },
      }),
    );
    expect(e).toMatchObject({
      type: 'subscription_synced',
      subscriptionId: 'sub_1',
      customerId: 'cus_1',
      userId: USER,
      status: 'active',
      discounted: true,
      periodEnd: new Date(1_802_592_000 * 1000).toISOString(),
    });
  });
  it('falls back to top-level periods and treats missing offer metadata as not discounted', () => {
    const e = normalizeStripeEvent(
      evt('customer.subscription.updated', {
        id: 'sub_1',
        customer: { id: 'cus_1' },
        status: 'past_due',
        current_period_start: 1_800_000_000,
        current_period_end: 1_802_592_000,
      }),
    );
    expect(e).toMatchObject({
      discounted: false,
      userId: null,
      status: 'past_due',
      customerId: 'cus_1',
    });
  });
  it('maps a deletion', () => {
    expect(
      normalizeStripeEvent(
        evt('customer.subscription.deleted', { id: 'sub_1' }),
      ),
    ).toMatchObject({
      type: 'subscription_deleted',
      subscriptionId: 'sub_1',
    });
  });
  it('maps invoice.paid with the basil parent subscription and line period', () => {
    const e = normalizeStripeEvent(
      evt('invoice.paid', {
        id: 'in_1',
        billing_reason: 'subscription_create',
        parent: { subscription_details: { subscription: 'sub_1' } },
        lines: {
          data: [{ period: { start: 1_800_000_000, end: 1_802_592_000 } }],
        },
      }),
    );
    expect(e).toMatchObject({
      type: 'invoice_paid',
      subscriptionId: 'sub_1',
      invoiceId: 'in_1',
      billingReason: 'subscription_create',
    });
  });
  it('maps invoice.paid with the legacy top-level subscription', () => {
    const e = normalizeStripeEvent(
      evt('invoice.paid', {
        id: 'in_1',
        billing_reason: 'subscription_cycle',
        subscription: 'sub_1',
        period_start: 1_800_000_000,
        period_end: 1_802_592_000,
      }),
    );
    expect(e).toMatchObject({ type: 'invoice_paid', subscriptionId: 'sub_1' });
  });
  it('maps a full refund to a revocation and ignores a partial refund', () => {
    expect(
      normalizeStripeEvent(
        evt('charge.refunded', {
          id: 'ch_1',
          refunded: true,
          customer: 'cus_1',
          payment_intent: 'pi_1',
        }),
      ),
    ).toMatchObject({
      type: 'revocation',
      reason: 'refund',
      customerId: 'cus_1',
      paymentIntentId: 'pi_1',
      chargeId: 'ch_1',
    });
    expect(
      normalizeStripeEvent(
        evt('charge.refunded', {
          id: 'ch_1',
          refunded: false,
          customer: 'cus_1',
        }),
      ),
    ).toBeNull();
  });
  it('maps a dispute to a revocation', () => {
    expect(
      normalizeStripeEvent(
        evt('charge.dispute.created', {
          id: 'dp_1',
          charge: 'ch_1',
          payment_intent: 'pi_1',
        }),
      ),
    ).toMatchObject({
      type: 'revocation',
      reason: 'dispute',
      chargeId: 'ch_1',
    });
  });
  it.each([
    ['not an object', 'x'],
    ['no type', { id: 'e', created: 1, data: { object: {} } }],
    ['no id', { type: 'invoice.paid', created: 1, data: { object: {} } }],
    ['bad created', evt('invoice.paid', {}, { created: 'now' })],
    ['no object', { id: 'e', type: 'invoice.paid', created: 1, data: {} }],
    [
      'unknown subscription status',
      evt('customer.subscription.updated', {
        id: 's',
        customer: 'c',
        status: 'weird',
      }),
    ],
    [
      'subscription without customer',
      evt('customer.subscription.updated', { id: 's', status: 'active' }),
    ],
    [
      'invoice without subscription',
      evt('invoice.paid', {
        id: 'i',
        billing_reason: 'subscription_cycle',
        period_start: 1,
        period_end: 2,
      }),
    ],
    [
      'invoice without period',
      evt('invoice.paid', {
        id: 'i',
        billing_reason: 'subscription_cycle',
        subscription: 's',
      }),
    ],
  ])('throws on a malformed handled event: %s', (_name, input) => {
    expect(() => normalizeStripeEvent(input)).toThrow(BillingEventFormatError);
  });
  it('end to end: a refund after payments leaves no entitlement', () => {
    const events = [
      normalizeStripeEvent(
        evt('customer.subscription.created', {
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          metadata: { offer_version: 'launch_v1', user_id: USER },
          items: {
            data: [
              {
                current_period_start: sec(T0),
                current_period_end: sec(T0 + 30 * day),
              },
            ],
          },
        }),
      )!,
      normalizeStripeEvent(
        evt(
          'invoice.paid',
          {
            id: 'in_1',
            billing_reason: 'subscription_create',
            subscription: 'sub_1',
            period_start: sec(T0),
            period_end: sec(T0 + 30 * day),
          },
          { id: 'evt_2' },
        ),
      )!,
      normalizeStripeEvent(
        evt(
          'charge.refunded',
          { id: 'ch_1', refunded: true, customer: 'cus_1' },
          { id: 'evt_3' },
        ),
      )!,
    ];
    const { sub, ledger } = run(events);
    expect(deriveEntitlement(sub, new Date(T0 + day)).canGenerate).toBe(false);
    expect(paidChaptersAvailable(ledger, new Date(T0 + day))).toBe(0);
  });
});
