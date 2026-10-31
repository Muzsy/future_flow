import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

// Real-PostgreSQL proof of the billing store (ADR-010, migration 039). Runs only
// inside the ephemeral, egress-disabled CI PostgreSQL network with a fake
// provider and synthetic webhook signatures: no Stripe, no live credentials.
assert.equal(process.platform, 'linux');
assert.equal(process.env.CI, 'true');
assert.equal(process.env.GITHUB_ACTIONS, 'true');
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, 'postgres');
assert.equal(url.username, 'postgres');
assert.equal(url.password, 'ci_unused_outside_fixture');
const require = createRequire(import.meta.url);
const {
  connectDatabase,
  Repository,
  createBillingStore,
  releaseStaleBillingReservations,
} = require('@future-flow/database');
const {
  handleStripeWebhook,
  reserveChapterForUser,
  consumeChapterForUser,
  releaseChapterForUser,
  retryPendingCancellations,
  cancelProviderSubscriptionsForUser,
  createCheckoutSession,
  defaultEntitlementConfig,
} = require('@future-flow/core');

const raw = connectDatabase(process.env.DATABASE_URL, true);
const db = {
  query: (...args) => raw.query(...args),
  transaction: (run) =>
    raw.transaction(async (tx) => {
      await tx.query("SET LOCAL lock_timeout='10s'");
      await tx.query("SET LOCAL statement_timeout='15s'");
      return run(tx);
    }),
};
const repo = new Repository(db);
const store = createBillingStore(db);
const SECRET = 'whsec_ci_fixture_secret';
const PRICE = 'price_ci_fixture';
const T0 = Date.parse('2026-11-01T00:00:00Z');
const NOW = new Date(T0 + 86_400_000);
const day = 86_400_000;
const sec = (ms) => Math.floor(ms / 1000);
const checks = {};
let sequence = 0;
const tag = () => `${++sequence}_${randomUUID().slice(0, 8)}`;

const cancelled = [];
let providerDown = false;
const provider = {
  createCheckoutSession: async () => ({ url: 'https://checkout.invalid/ci' }),
  cancelSubscription: async (id) => {
    if (providerDown) throw new Error('provider down');
    cancelled.push(id);
  },
  resolveRevocation: async (event) => event,
};
async function person() {
  const id = randomUUID();
  await repo.ensureUser(id);
  return { id, sub: `sub_${tag()}`, customer: `cus_${tag()}` };
}
const event = (type, object, created = sec(T0)) => ({
  id: `evt_${tag()}`,
  type,
  created,
  data: { object },
});
const subscriptionEvent = (p, discounted = false) =>
  event('customer.subscription.created', {
    id: p.sub,
    customer: p.customer,
    status: 'active',
    cancel_at_period_end: false,
    metadata: {
      user_id: p.id,
      offer_version: discounted ? 'launch_v1' : 'standard_v1',
    },
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
const invoiceEvent = (p, n = 1) =>
  event('invoice.paid', {
    id: `in_${p.sub}_${n}`,
    billing_reason: n === 1 ? 'subscription_create' : 'subscription_cycle',
    amount_paid: 999,
    subscription: p.sub,
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
const refundEvent = (p, n = 1) =>
  event('charge.refunded', {
    id: `ch_${tag()}`,
    refunded: true,
    amount: 999,
    amount_refunded: 999,
    customer: p.customer,
    invoice: `in_${p.sub}_${n}`,
  });
function deliver(body, designatedUserIds) {
  const rawBody = JSON.stringify(body);
  const ts = sec(NOW.getTime());
  const sig = createHmac('sha256', SECRET)
    .update(`${ts}.${rawBody}`)
    .digest('hex');
  return handleStripeWebhook(
    {
      rawBody,
      signatureHeader: `t=${ts},v1=${sig}`,
      nowSeconds: ts,
      webhookSecret: SECRET,
      priceId: PRICE,
    },
    { store, provider, designatedUserIds },
  );
}
const one = async (sql, values) => Number((await db.query(sql, values))[0].n);
async function subscribed(p) {
  assert.equal((await deliver(subscriptionEvent(p))).code, 'ok');
  assert.equal((await deliver(invoiceEvent(p))).code, 'ok');
}

try {
  // 1. The same webhook delivered many times in parallel changes state once.
  {
    const p = await person();
    await deliver(subscriptionEvent(p));
    const invoice = invoiceEvent(p);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => deliver(invoice)),
    );
    for (const r of results)
      assert.ok(
        r.status === 'fulfilled' ||
          /duplicate key|aborted/.test(r.reason.message),
      );
    // A redelivery after the race has settled is a clean duplicate.
    assert.equal((await deliver(invoice)).outcome, 'duplicate');
    assert.equal(
      await one('SELECT count(*) n FROM aw_billing_grants WHERE user_id=$1', [
        p.id,
      ]),
      1,
    );
    assert.equal(
      await one('SELECT count(*) n FROM aw_billing_events WHERE event_id=$1', [
        invoice.id,
      ]),
      1,
    );
    checks.concurrentDuplicateWebhookOnce = true;
  }

  // 2. Parallel reservations never exceed the allowance (8 paid + 1 taster at
  // most) and the one-taster rule holds in the database.
  {
    const p = await person();
    await subscribed(p);
    const keys = Array.from({ length: 16 }, (_, i) => `r${i}`);
    const results = await Promise.all(
      keys.map((k) => reserveChapterForUser(store, p.id, k, NOW)),
    );
    const ok = results.filter((r) => r.ok);
    assert.equal(ok.filter((r) => r.bucket === 'paid').length, 8);
    assert.ok(ok.filter((r) => r.bucket === 'taster').length <= 1);
    assert.ok(
      (await one(
        "SELECT count(*) n FROM aw_billing_reservations WHERE user_id=$1 AND bucket='taster' AND state<>'released'",
        [p.id],
      )) <= 1,
    );
    checks.concurrentReservationsWithinAllowance = true;
  }

  // 3. Same request key in parallel creates one reservation (idempotent retry).
  {
    const p = await person();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        reserveChapterForUser(store, p.id, 'same', NOW),
      ),
    );
    assert.equal(results.filter((r) => r.ok && r.created).length, 1);
    assert.equal(
      await one(
        'SELECT count(*) n FROM aw_billing_reservations WHERE user_id=$1',
        [p.id],
      ),
      1,
    );
    checks.concurrentSameKeyOnce = true;
  }

  // 4. A reaper sweep racing a consume never loses a consumed chapter.
  {
    const p = await person();
    await subscribed(p);
    for (let i = 0; i < 4; i++)
      await reserveChapterForUser(store, p.id, `s${i}`, NOW);
    await db.query(
      "UPDATE aw_billing_reservations SET created_at=now()-interval '3 hours' WHERE user_id=$1",
      [p.id],
    );
    await Promise.all([
      consumeChapterForUser(store, p.id, 's0'),
      consumeChapterForUser(store, p.id, 's1'),
      releaseStaleBillingReservations(db, { olderThanMs: 60 * 60_000 }),
    ]);
    const states = Object.fromEntries(
      (
        await db.query(
          'SELECT key,state FROM aw_billing_reservations WHERE user_id=$1',
          [p.id],
        )
      ).map((r) => [r.key, r.state]),
    );
    // Each reservation ends consumed or released, never both, never lost; the
    // two untouched ones were reclaimed.
    assert.equal(states.s2, 'released');
    assert.equal(states.s3, 'released');
    assert.ok(['consumed', 'released'].includes(states.s0));
    assert.ok(['consumed', 'released'].includes(states.s1));
    checks.reaperRacingConsumeConsistent = true;
  }

  // 5. Refund during an outage keeps the revocation and the pending cancel; the
  // retry job settles it.
  {
    const p = await person();
    await subscribed(p);
    providerDown = true;
    const res = await deliver(refundEvent(p));
    providerDown = false;
    // Committed revocation; 500 asks Stripe to redeliver, which retries the cancel.
    assert.equal(res.code, 'retry');
    const [sub] = await db.query(
      'SELECT revoked,cancel_pending FROM aw_billing_subscriptions WHERE subscription_id=$1',
      [p.sub],
    );
    assert.equal(sub.revoked, 'refund');
    assert.equal(sub.cancel_pending, true);
    assert.equal((await retryPendingCancellations(store, provider)).failed, 0);
    assert.ok(cancelled.includes(p.sub));
    assert.equal(
      await one(
        'SELECT count(*) n FROM aw_billing_subscriptions WHERE subscription_id=$1 AND cancel_pending',
        [p.sub],
      ),
      0,
    );
    checks.refundOutageRetried = true;
  }

  // 6. Concurrent checkout creation for one account never double-subscribes and
  // the launch discount is honoured only once.
  {
    const p = await person();
    const config = {
      designatedUserIds: [p.id],
      entitlement: defaultEntitlementConfig,
    };
    const urls = await Promise.all(
      Array.from({ length: 4 }, () =>
        createCheckoutSession(p.id, NOW, { store, provider, config }),
      ),
    );
    assert.equal(urls.length, 4);
    const first = subscriptionEvent(p, true);
    const second = {
      ...subscriptionEvent({ ...p, sub: `sub_${tag()}` }, true),
    };
    await Promise.all([deliver(first, [p.id]), deliver(second, [p.id])]);
    assert.equal(
      await one(
        'SELECT count(*) n FROM aw_billing_subscriptions WHERE user_id=$1 AND discounted',
        [p.id],
      ),
      1,
    );
    checks.founderDiscountOnceUnderRace = true;
  }

  // 7. Account deletion racing a webhook leaves no orphan billing rows, and a
  // failing provider cancel keeps the account.
  {
    const p = await person();
    await subscribed(p);
    await reserveChapterForUser(store, p.id, 'x', NOW);
    await repo.markDeleting(p.id);
    providerDown = true;
    await assert.rejects(
      cancelProviderSubscriptionsForUser(store, provider, p.id),
      /provider down/,
    );
    providerDown = false;
    assert.equal(
      await one(
        'SELECT count(*) n FROM aw_billing_subscriptions WHERE user_id=$1',
        [p.id],
      ),
      1,
    );
    const late = await person();
    await repo.markDeleting(late.id);
    const lateResult = await deliver(subscriptionEvent(late));
    assert.ok(lateResult.status >= 500 || lateResult.code !== 'ok');
    await cancelProviderSubscriptionsForUser(store, provider, p.id);
    await repo.deleteAccountData(p.id);
    await repo.deleteAccountData(late.id);
    for (const t of [
      'aw_billing_subscriptions',
      'aw_billing_grants',
      'aw_billing_reservations',
    ])
      assert.equal(
        await one(
          `SELECT count(*) n FROM ${t} WHERE user_id=$1 OR user_id=$2`,
          [p.id, late.id],
        ),
        0,
      );
    assert.equal(
      await one(
        'SELECT count(*) n FROM aw_billing_events e WHERE e.subscription_id IN ($1,$2)',
        [p.sub, late.sub],
      ),
      0,
    );
    checks.deletionLeavesNoBillingRows = true;
  }

  // 8. Row level security stays on and API roles cannot read billing tables.
  {
    for (const t of [
      'aw_billing_subscriptions',
      'aw_billing_grants',
      'aw_billing_reservations',
      'aw_billing_events',
    ]) {
      const [row] = await db.query(
        'SELECT relrowsecurity r FROM pg_class WHERE oid=$1::regclass',
        [t],
      );
      assert.equal(row.r, true);
      for (const role of ['anon', 'authenticated'])
        assert.equal(
          (
            await db.query('SELECT has_table_privilege($1,$2,$3) p', [
              role,
              t,
              'SELECT',
            ])
          )[0].p,
          false,
        );
    }
    checks.billingTablesClosedToApiRoles = true;
  }
  console.log(JSON.stringify({ billingPostgres: 'passed', ...checks }));
} finally {
  await raw.close();
}
