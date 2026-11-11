import { createHmac, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TERMS_ACCEPTANCE_VERSION } from '@future-flow/contracts';
import {
  createCheckoutSession,
  defaultEntitlementConfig,
  handleStripeWebhook,
  type BillingAlert,
  type BillingProvider,
  type BillingStore,
} from '@future-flow/core';
import {
  Repository,
  ServiceAccessRepository,
  createBillingStore,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';

// The launch discount belongs to the account's persisted admission fact (one of
// the first ten open admissions), read by checkout and webhook through the real
// billing store. The environment list no longer decides anything. Real SQL
// (PGlite, all migrations), real admission path, fake provider only.
const SECRET = 'whsec_testsecret123';
const PRICE = 'price_ours123';
const T0 = Date.parse('2026-11-01T00:00:00Z');
const now = new Date(T0 + 86_400_000);
const day = 86_400_000;
const sec = (ms: number) => Math.floor(ms / 1000);
const config = { entitlement: defaultEntitlementConfig };

let engine: PGlite,
  db: Database,
  repo: Repository,
  access: ServiceAccessRepository,
  store: BillingStore;
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
  access = new ServiceAccessRepository(db);
  await access.replacePolicy(0, {
    mode: 'invitation',
    generationEnabled: true,
    checkoutEnabled: true,
  });
  store = createBillingStore(db);
});
afterAll(async () => {
  await engine?.close();
});

// Reset to an empty registry and open a wave of the given size.
async function wave(capacity: number) {
  await db.query(
    "UPDATE aw_service_policy SET reconcile_required=false,generation_enabled=true,checkout_enabled=true,mode='invitation',admission_capacity=0,admission_used=0,revision=revision+1",
  );
  await db.query('DELETE FROM ff_users');
  const [row] = await db.query<{ revision: string | number }>(
    'SELECT revision FROM aw_service_policy WHERE id=1',
  );
  await access.configureAdmission(Number(row!.revision), {
    capacity,
    open: true,
  });
}
// Admits sequentially, in order, as the open admission would.
async function admit(count: number) {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = randomUUID();
    expect(
      await access.admitOpenAccount(id, TERMS_ACCEPTANCE_VERSION),
    ).toMatchObject({
      status: 'admitted',
      position: i + 1,
    });
    ids.push(id);
  }
  return ids;
}

let seq = 0;
const tag = (prefix: string) =>
  `${prefix}_${++seq}_${randomUUID().slice(0, 8)}`;
const world = (userId: string) => ({
  userId,
  sub: tag('sub'),
  cus: tag('cus'),
});
const stripeEvent = (type: string, object: unknown) => ({
  id: tag('evt'),
  type,
  created: sec(T0),
  data: { object },
});
// The provider's own claim: the subscription carries the launch offer.
const subscriptionEvent = (w: ReturnType<typeof world>, offer = 'launch_v1') =>
  stripeEvent('customer.subscription.created', {
    id: w.sub,
    customer: w.cus,
    status: 'active',
    cancel_at_period_end: false,
    metadata: { user_id: w.userId, offer_version: offer },
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
function fakeProvider() {
  const checkouts: {
    userId: string;
    offerVersion: string;
    discounted: boolean;
  }[] = [];
  const provider: BillingProvider = {
    createCheckoutSession: async (input) => {
      checkouts.push(input);
      return { url: 'https://checkout.stripe.com/c/pay/cs_test_1' };
    },
    cancelSubscription: async () => undefined,
    resolveRevocation: async (event) => event as never,
  };
  return { provider, checkouts };
}
function send(
  body: unknown,
  provider: BillingProvider,
  alerts: BillingAlert[] = [],
  target: BillingStore = store,
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
    { store: target, provider, alert: (a) => alerts.push(a) },
  );
}
const stored = async (userId: string) =>
  db.query<{ discounted: boolean }>(
    'SELECT discounted FROM aw_billing_subscriptions WHERE user_id=$1',
    [userId],
  );
const checkoutOffer = async (userId: string) => {
  const f = fakeProvider();
  await createCheckoutSession(userId, now, {
    store,
    provider: f.provider,
    config,
  });
  return f.checkouts;
};

describe('checkout reads the persisted admission eligibility', () => {
  beforeEach(async () => {
    await wave(12);
  });

  it('offers the launch price to the first ten open admissions and the standard price to the rest', async () => {
    const ids = await admit(12);
    for (const [index, id] of ids.entries()) {
      const [call] = await checkoutOffer(id);
      expect([index + 1, call!.offerVersion, call!.discounted]).toEqual(
        index < 10
          ? [index + 1, 'launch_v1', true]
          : [index + 1, 'standard_v1', false],
      );
    }
  });

  it('never gives an operator-created or unknown account the discount (fail closed)', async () => {
    const operator = randomUUID();
    await repo.ensureUser(operator);
    await access.replaceAdmission(operator, 0, 'active');
    const noAdmission = randomUUID();
    await repo.ensureUser(noAdmission);
    for (const id of [operator, noAdmission]) {
      const [call] = await checkoutOffer(id);
      expect(call).toMatchObject({
        offerVersion: 'standard_v1',
        discounted: false,
      });
    }
  });

  it('ignores a leftover designation list entirely', async () => {
    const late = (await admit(11)).at(-1);
    const f = fakeProvider();
    await createCheckoutSession(late!, now, {
      store,
      provider: f.provider,
      // A stale caller still passing the old list must not matter.
      config: { ...config, designatedUserIds: [late] } as typeof config,
    });
    expect(f.checkouts[0]).toMatchObject({ discounted: false });
  });

  it('offers the discount at most once per account', async () => {
    const [first] = await admit(1);
    const f = fakeProvider();
    expect(
      (await send(subscriptionEvent(world(first!)), f.provider)).code,
    ).toBe('ok');
    expect(await stored(first!)).toEqual([{ discounted: true }]);
    // Redeemed and since ended: the next checkout is the standard offer.
    await db.query(
      "UPDATE aw_billing_subscriptions SET status='canceled' WHERE user_id=$1",
      [first],
    );
    const [call] = await checkoutOffer(first!);
    expect(call).toMatchObject({
      offerVersion: 'standard_v1',
      discounted: false,
    });
  });

  it('fails the checkout, creating no session, when the eligibility cannot be read', async () => {
    const [id] = await admit(1);
    const broken: BillingStore = {
      transaction: (run) =>
        store.transaction((tx) =>
          run({
            ...tx,
            launchDiscountEligible: async () => {
              throw Error('registry unavailable');
            },
          }),
        ),
    };
    const f = fakeProvider();
    await expect(
      createCheckoutSession(id!, now, {
        store: broken,
        provider: f.provider,
        config,
      }),
    ).rejects.toThrow('registry unavailable');
    expect(f.checkouts).toHaveLength(0);
  });
});

describe('webhook honours the claim only for an eligible account', () => {
  beforeEach(async () => {
    await wave(12);
  });

  it('keeps the launch offer for positions 1-10 and strips it for 11-12 with an alert', async () => {
    const ids = await admit(12);
    const f = fakeProvider();
    for (const [index, id] of ids.entries()) {
      const alerts: BillingAlert[] = [];
      const w = world(id);
      expect((await send(subscriptionEvent(w), f.provider, alerts)).code).toBe(
        'ok',
      );
      const honoured = index < 10;
      expect(await stored(id)).toEqual([{ discounted: honoured }]);
      expect(alerts.map((a) => a.kind).includes('ineligible_discount')).toBe(
        !honoured,
      );
      expect(alerts.map((a) => a.kind)).not.toContain('duplicate_discount');
    }
  });

  it('strips a claimed discount from an account without any admission row', async () => {
    const stranger = randomUUID();
    await repo.ensureUser(stranger);
    const alerts: BillingAlert[] = [];
    const f = fakeProvider();
    await send(subscriptionEvent(world(stranger)), f.provider, alerts);
    expect(await stored(stranger)).toEqual([{ discounted: false }]);
    expect(alerts.map((a) => a.kind)).toContain('ineligible_discount');
  });

  it('strips it from an operator-created admission', async () => {
    const operator = randomUUID();
    await repo.ensureUser(operator);
    await access.replaceAdmission(operator, 0, 'active');
    const f = fakeProvider();
    await send(subscriptionEvent(world(operator)), f.provider);
    expect(await stored(operator)).toEqual([{ discounted: false }]);
  });

  it('honours a second launch subscription of the same account at most once', async () => {
    const [id] = await admit(1);
    const f = fakeProvider();
    await send(subscriptionEvent(world(id!)), f.provider);
    const alerts: BillingAlert[] = [];
    await send(subscriptionEvent(world(id!)), f.provider, alerts);
    const rows = await stored(id!);
    expect(rows.filter((r) => r.discounted)).toHaveLength(1);
    expect(alerts.map((a) => a.kind)).toContain('duplicate_discount');
  });

  it('answers a retryable error and stores nothing when the eligibility cannot be read', async () => {
    const [id] = await admit(1);
    const broken: BillingStore = {
      transaction: (run) =>
        store.transaction((tx) =>
          run({
            ...tx,
            launchDiscountEligible: async () => {
              throw Error('registry unavailable');
            },
          }),
        ),
    };
    const alerts: BillingAlert[] = [];
    const f = fakeProvider();
    const res = await send(
      subscriptionEvent(world(id!)),
      f.provider,
      alerts,
      broken,
    );
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await stored(id!)).toEqual([]);
  });

  it('does not treat a standard-offer subscription as a discount at all', async () => {
    const [id] = await admit(1);
    const f = fakeProvider();
    await send(subscriptionEvent(world(id!), 'standard_v1'), f.provider);
    expect(await stored(id!)).toEqual([{ discounted: false }]);
  });
});

describe('a schema without the service access registry', () => {
  it('stops the checkout with a readable 503, creating no session', async () => {
    const old = new PGlite();
    await old.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    await applyMigrations(old);
    const oldDb = adapter(old);
    // As before migration 040: no admission table at all.
    await old.exec('DROP TABLE aw_service_admissions CASCADE');
    const user = randomUUID();
    await new Repository(oldDb).ensureUser(user);
    const f = fakeProvider();
    await expect(
      createCheckoutSession(user, now, {
        store: createBillingStore(oldDb),
        provider: f.provider,
        config,
      }),
    ).rejects.toMatchObject({
      code: 'SERVICE_ACCESS_UNAVAILABLE',
      status: 503,
    });
    expect(f.checkouts).toHaveLength(0);
    await old.close();
  });
});
