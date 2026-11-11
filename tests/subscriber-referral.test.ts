import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { TERMS_ACCEPTANCE_VERSION } from '@future-flow/contracts';
import {
  DomainError,
  REFERRAL_GRANT_EXPIRES_AT,
  billingConfigFromEnv,
  emptyChapterLedger,
  paidChaptersAvailable,
  referralChaptersAvailable,
  referralGrantKey,
  referralInviteKey,
  reserveChapter,
  signReferralInvite,
  tasterChaptersAvailable,
  verifyReferralInvite,
  type ChapterLedger,
  type Entitlement,
} from '@future-flow/core';
import {
  Repository,
  ServiceAccessRepository,
  admitReferredAccount,
  billingTx,
  configureGenerationGate,
  createGenerationGate,
  reserveGenerationChapter,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { createApp } from '../apps/api/src/app';
import { createBillingRuntime } from '../apps/api/src/billing';
import { handlePreAdmission } from '../apps/api/src/service-admission';

// Subscriber referral: a stateless signed invite token, and a gift chapter that
// is one non-expiring grant row keyed by the inviter. No schema of its own.

const SECRET = 'whsec_referraltestsecret123';
const key = referralInviteKey(SECRET)!;
const NOW = new Date('2026-11-02T00:00:00Z');
const day = 86_400_000;
const ACK = {
  adult: true,
  acknowledged: true,
  termsVersion: TERMS_ACCEPTANCE_VERSION,
};

describe('invite token', () => {
  const inviter = randomUUID();
  it('round-trips and names only the inviter', () => {
    const token = signReferralInvite(key, inviter, NOW);
    expect(token).toMatch(/^aw1\.[A-Za-z0-9_-]{49}$/);
    expect(verifyReferralInvite(key, token, NOW)).toEqual({
      inviterUserId: inviter,
    });
  });
  it('fails closed for tamper, other key, expiry, junk and a missing key', () => {
    const token = signReferralInvite(key, inviter, NOW);
    const flipped = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    const mid = token.length - 8;
    const midFlipped =
      token.slice(0, mid) +
      (token[mid] === 'A' ? 'B' : 'A') +
      token.slice(mid + 1);
    const swapped = signReferralInvite(key, randomUUID(), NOW);
    const forged = token.slice(0, 4) + swapped.slice(4, 31) + token.slice(31);
    for (const bad of [
      flipped,
      midFlipped,
      forged,
      '',
      'aw1.',
      token.slice(0, -2),
      token + 'x',
      `${token}`.replace('aw1.', 'aw2.'),
      undefined,
      null,
      42,
      {},
    ])
      expect(verifyReferralInvite(key, bad, NOW)).toBeNull();
    expect(
      verifyReferralInvite(
        referralInviteKey('whsec_anotherkey123456'),
        token,
        NOW,
      ),
    ).toBeNull();
    expect(verifyReferralInvite(null, token, NOW)).toBeNull();
    expect(
      verifyReferralInvite(key, token, new Date(NOW.getTime() + 31 * day)),
    ).toBeNull();
    expect(
      verifyReferralInvite(key, token, new Date(NOW.getTime() + 29 * day)),
    ).not.toBeNull();
    expect(referralInviteKey(undefined)).toBeNull();
    expect(referralInviteKey('short')).toBeNull();
    expect(() => signReferralInvite(key, 'not-a-uuid', NOW)).toThrow();
  });
});

describe('gift chapter order in the ledger', () => {
  const entitled: Entitlement = { state: 'active', canGenerate: true } as never;
  const lapsed: Entitlement = { state: 'ended', canGenerate: false } as never;
  const gift = (revoked = false) => ({
    key: referralGrantKey(randomUUID()),
    cycleIndex: 1,
    amount: 1,
    expiresAt: REFERRAL_GRANT_EXPIRES_AT,
    revoked,
  });
  const monthly = (amount: number, daysLeft = 10) => ({
    key: 'in_' + randomUUID(),
    cycleIndex: 1,
    amount,
    expiresAt: new Date(NOW.getTime() + daysLeft * day).toISOString(),
    revoked: false,
  });
  function reserveAll(
    ledger: ChapterLedger,
    entitlement: Entitlement,
    times: number,
  ) {
    const buckets: string[] = [];
    for (let i = 0; i < times; i++) {
      const r = reserveChapter(ledger, `k${i}`, entitlement, NOW);
      if (!r.ok) {
        buckets.push(r.reason);
        continue;
      }
      ledger = r.ledger;
      buckets.push(
        r.reservation.bucket + ':' + (r.reservation.grantKey ?? '-'),
      );
    }
    return buckets;
  }
  it('spends the monthly allowance first, then the gift, never the taster', () => {
    const m = monthly(2),
      g = gift();
    const out = reserveAll(
      { ...emptyChapterLedger, grants: [g, m] },
      entitled,
      4,
    );
    expect(out).toEqual([
      `paid:${m.key}`,
      `paid:${m.key}`,
      `paid:${g.key}`,
      'allowance_exhausted',
    ]);
  });
  it('keeps the gift after the monthly allowance has expired, before the taster', () => {
    const g = gift();
    const expired = monthly(5, -1);
    const ledger = { ...emptyChapterLedger, grants: [expired, g] };
    expect(paidChaptersAvailable(ledger, NOW)).toBe(0);
    expect(referralChaptersAvailable(ledger, NOW)).toBe(1);
    expect(reserveAll(ledger, lapsed, 3)).toEqual([
      `paid:${g.key}`,
      'taster:-',
      'no_entitlement',
    ]);
  });
  it('never offers a revoked gift and reports it separately from the monthly count', () => {
    const g = gift(true);
    const ledger = { ...emptyChapterLedger, grants: [g] };
    expect(referralChaptersAvailable(ledger, NOW)).toBe(0);
    expect(reserveAll(ledger, entitled, 1)).toEqual(['allowance_exhausted']);
    expect(reserveAll(ledger, lapsed, 2)).toEqual([
      'taster:-',
      'no_entitlement',
    ]);
    const open = { ...emptyChapterLedger, grants: [gift(), monthly(3)] };
    expect(paidChaptersAvailable(open, NOW)).toBe(3);
    expect(referralChaptersAvailable(open, NOW)).toBe(1);
    expect(tasterChaptersAvailable(open)).toBe(1);
  });
});

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
const tokenFor = (id: string) =>
  `test.${Buffer.from(JSON.stringify({ amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }] })).toString('base64url')}.${id}`;

describe('referral over the real schema', () => {
  let engine: PGlite,
    db: Database,
    repo: Repository,
    access: ServiceAccessRepository,
    app: INestApplication,
    base: string;
  const options = { now: NOW };
  const headers = (id: string) => ({
    Authorization: `Bearer ${tokenFor(id)}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': randomUUID(),
  });
  const api = (id: string, method: string, path: string) =>
    fetch(base + path, {
      method,
      headers: headers(id),
      ...(method === 'POST' ? { body: '{}' } : {}),
    });

  async function setPolicy(mode: 'open' | 'invitation', capacity: number) {
    await db.query('DELETE FROM ff_users');
    await db.query(
      "UPDATE aw_service_policy SET mode='invitation',admission_capacity=0,admission_used=0,generation_enabled=true,checkout_enabled=true,reconcile_required=false,revision=revision+1",
    );
    const [row] = await db.query<{ revision: number }>(
      'SELECT revision::int AS revision FROM aw_service_policy',
    );
    await access.configureAdmission(row!.revision, {
      capacity,
      open: mode === 'open',
    });
  }
  // An admitted, paying account (active subscription with one paid invoice).
  async function subscriber(over: { revoked?: 'refund' | 'dispute' } = {}) {
    const id = randomUUID();
    await repo.ensureUser(id);
    await db.query(
      "INSERT INTO aw_service_admissions(user_id,revision,state) VALUES($1,1,'active')",
      [id],
    );
    const sub = 'sub_' + id,
      invoice = 'in_' + id;
    await db.query(
      "INSERT INTO aw_billing_subscriptions(subscription_id,user_id,customer_id,status,period_start,period_end,last_state_event_created,paid_invoice_ids,revoked) VALUES($1,$2,$3,'active',$4,$5,1,ARRAY[$6]::text[],$7)",
      [
        sub,
        id,
        'cus_' + id,
        new Date(NOW.getTime() - day),
        new Date(NOW.getTime() + 29 * day),
        invoice,
        over.revoked ?? null,
      ],
    );
    await db.query(
      'INSERT INTO aw_billing_grants(key,subscription_id,user_id,cycle_index,amount,expires_at) VALUES($1,$2,$3,1,5,$4)',
      [invoice, sub, id, new Date(NOW.getTime() + 29 * day)],
    );
    return { id, sub, invoice };
  }
  const invite = (id: string) => signReferralInvite(key, id, NOW);
  const rows = async (sql: string, values: unknown[] = []) =>
    db.query(sql, values);
  const counter = async () =>
    Number(
      (
        await db.query<{ n: string }>(
          'SELECT admission_used AS n FROM aw_service_policy',
        )
      )[0]!.n,
    );
  // Runs the pre-admission handler the way the API middleware does.
  async function preAdmission(
    id: string,
    request: {
      method: 'GET' | 'POST';
      query?: Record<string, unknown>;
      body?: unknown;
    },
    at = NOW,
  ) {
    let status = 0;
    let json: unknown;
    const res = {
      status(code: number) {
        status = code;
        return res;
      },
      json(payload: unknown) {
        json = payload;
        return res;
      },
    };
    try {
      await handlePreAdmission(
        db,
        id,
        { path: '/api/v1/me/consent', ...request } as never,
        res as never,
        { key, now: () => at },
      );
      return { status, json };
    } catch (error) {
      return {
        status: (error as DomainError).status,
        code: (error as DomainError).code,
      };
    }
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
    const runtime = createBillingRuntime(
      db,
      billingConfigFromEnv({
        BILLING_ENABLED: 'true',
        BILLING_ENFORCEMENT: 'false',
        STRIPE_SECRET_KEY: 'sk_test_referraltestkey12345',
        STRIPE_WEBHOOK_SECRET: SECRET,
        STRIPE_PRICE_ID: 'price_referral123',
        STRIPE_FOUNDER_COUPON_ID: 'founder_launch',
        STRIPE_API_VERSION: '2025-03-31.basil',
        BILLING_SUCCESS_URL: 'https://alterward.example/billing/success',
        BILLING_CANCEL_URL: 'https://alterward.example/billing/cancel',
      }),
      {
        provider: {
          createCheckoutSession: async () => ({ url: 'https://x.invalid/c' }),
          createPortalSession: async () => ({ url: 'https://x.invalid/p' }),
          cancelSubscription: async () => {},
          resolveRevocation: async (e) => e as never,
        },
        now: () => NOW,
      },
    );
    const loose = createApp as unknown as (
      ...a: unknown[]
    ) => ReturnType<typeof createApp>;
    app = await loose(
      repo,
      {
        verify: async (value: string) => {
          const id = value.split('.')[2];
          if (!id || !/^[0-9a-f-]{36}$/.test(id))
            throw new DomainError('AUTH_INVALID_TOKEN', 'Invalid token.', 401);
          return { id };
        },
        deleteUser: async () => {},
      },
      ...Array<undefined>(23).fill(undefined),
      undefined,
      runtime,
    );
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  }, 60000);
  afterAll(async () => {
    configureGenerationGate(null);
    await app?.close();
    await engine?.close();
  });
  beforeEach(async () => {
    await setPolicy('invitation', 3);
  });

  it('lets only an eligible subscriber sign an invite and reports only the fact of redemption', async () => {
    const free = randomUUID();
    await repo.ensureUser(free);
    const denied = await api(free, 'POST', '/api/v1/billing/referral-invite');
    expect(denied.status).toBe(403);
    expect(
      ((await denied.json()) as { error: { code: string } }).error.code,
    ).toBe('BILLING_REFERRAL_INELIGIBLE');
    expect(
      await (await api(free, 'GET', '/api/v1/billing/status')).json(),
    ).toMatchObject({
      referralInvite: { eligible: false, state: 'none' },
      referralChaptersAvailable: 0,
    });

    const s = await subscriber();
    expect(
      await (await api(s.id, 'GET', '/api/v1/billing/status')).json(),
    ).toMatchObject({
      paidChaptersAvailable: 5,
      referralChaptersAvailable: 0,
      referralInvite: { eligible: true, state: 'none' },
    });
    const made = await api(s.id, 'POST', '/api/v1/billing/referral-invite');
    expect(made.status).toBe(201);
    const { inviteToken } = (await made.json()) as { inviteToken: string };
    expect(verifyReferralInvite(key, inviteToken, NOW)).toEqual({
      inviterUserId: s.id,
    });
    // Nothing was stored for the link itself.
    expect(
      await rows("SELECT 1 FROM aw_billing_grants WHERE key LIKE 'referral:%'"),
    ).toHaveLength(0);
  });

  it('refuses a revoked or unpaid subscriber', async () => {
    const refunded = await subscriber({ revoked: 'refund' });
    expect(
      (await api(refunded.id, 'POST', '/api/v1/billing/referral-invite'))
        .status,
    ).toBe(403);
  });

  it('admits the invitee while the public wave is closed, credits the gift and leaves the counter alone', async () => {
    const s = await subscriber();
    const friend = randomUUID();
    const token = invite(s.id);
    // Without the token the closed wave answers as before.
    expect(await preAdmission(friend, { method: 'GET' })).toMatchObject({
      status: 403,
      code: 'SERVICE_ADMISSION_CLOSED',
    });
    expect(
      await preAdmission(friend, { method: 'GET', query: { invite: token } }),
    ).toMatchObject({ status: 200, json: { acknowledged: false } });
    const before = await counter();
    expect(
      await preAdmission(friend, {
        method: 'POST',
        body: { ...ACK, inviteToken: token },
      }),
    ).toMatchObject({ status: 201 });
    expect(await counter()).toBe(before);
    const [admission] = await rows(
      'SELECT state,launch_discount_eligible FROM aw_service_admissions WHERE user_id=$1',
      [friend],
    );
    expect(admission).toEqual({
      state: 'active',
      launch_discount_eligible: false,
    });
    expect(
      await rows(
        'SELECT consent_type FROM ff_consents WHERE user_id=$1 ORDER BY consent_type',
        [friend],
      ),
    ).toHaveLength(2);
    const ledger = await billingTx(db).loadLedger(s.id);
    expect(referralChaptersAvailable(ledger, NOW)).toBe(1);
    expect(paidChaptersAvailable(ledger, NOW)).toBe(5);
    // The invitee's own free chapter is untouched and no gift is theirs.
    expect(
      referralChaptersAvailable(await billingTx(db).loadLedger(friend), NOW),
    ).toBe(0);
    expect(
      await (await api(s.id, 'GET', '/api/v1/billing/status')).json(),
    ).toMatchObject({
      referralChaptersAvailable: 1,
      referralInvite: { eligible: false, state: 'redeemed' },
    });
    expect(
      (await api(s.id, 'POST', '/api/v1/billing/referral-invite')).status,
    ).toBe(409);
  });

  it('redeems exactly once: a second invitee on the same link is refused and writes nothing', async () => {
    const s = await subscriber();
    const first = randomUUID(),
      second = randomUUID();
    const token = invite(s.id);
    expect(
      await preAdmission(first, {
        method: 'POST',
        body: { ...ACK, inviteToken: token },
      }),
    ).toMatchObject({ status: 201 });
    const again = await preAdmission(second, {
      method: 'POST',
      body: { ...ACK, inviteToken: token },
    });
    expect(again).toMatchObject({
      status: 403,
      code: 'SERVICE_INVITE_INVALID',
    });
    expect(
      await preAdmission(second, { method: 'GET', query: { invite: token } }),
    ).toMatchObject({ status: 403, code: 'SERVICE_INVITE_INVALID' });
    expect(
      await rows('SELECT 1 FROM ff_users WHERE id=$1', [second]),
    ).toHaveLength(0);
    expect(
      await rows('SELECT 1 FROM ff_consents WHERE user_id=$1', [second]),
    ).toHaveLength(0);
    expect(
      await rows('SELECT 1 FROM aw_billing_grants WHERE key=$1', [
        referralGrantKey(s.id),
      ]),
    ).toHaveLength(1);
  });

  it('keeps the gift when the invitee deletes their account and does not reopen the slot', async () => {
    const s = await subscriber();
    const friend = randomUUID();
    await preAdmission(friend, {
      method: 'POST',
      body: { ...ACK, inviteToken: invite(s.id) },
    });
    await db.query('DELETE FROM ff_users WHERE id=$1', [friend]);
    expect(
      referralChaptersAvailable(await billingTx(db).loadLedger(s.id), NOW),
    ).toBe(1);
    expect(
      (await api(s.id, 'POST', '/api/v1/billing/referral-invite')).status,
    ).toBe(409);
  });

  it('fails closed for bad tokens, self invites, unpaid or revoked inviters and the already admitted', async () => {
    const s = await subscriber();
    const friend = randomUUID();
    // Bad or expired token on a closed wave is "invalid", not a leak of state.
    for (const bad of [
      'aw1.' + 'A'.repeat(49),
      invite(s.id).slice(0, -1),
      signReferralInvite(key, s.id, new Date(NOW.getTime() - 40 * day)),
    ])
      expect(
        await preAdmission(friend, {
          method: 'POST',
          body: { ...ACK, inviteToken: bad },
        }),
      ).toMatchObject({ code: 'SERVICE_INVITE_INVALID' });
    // The inviter cannot redeem their own link.
    expect(
      await admitReferredAccount(
        db,
        s.id,
        TERMS_ACCEPTANCE_VERSION,
        s.id,
        options,
      ),
    ).toEqual({ status: 'invite-invalid' });
    // An account that was never a subscriber cannot be an inviter.
    const free = randomUUID();
    await repo.ensureUser(free);
    expect(
      await preAdmission(friend, {
        method: 'POST',
        body: { ...ACK, inviteToken: invite(free) },
      }),
    ).toMatchObject({ code: 'SERVICE_INVITE_INVALID' });
    // A refunded or disputed subscription cannot hand out an invite.
    const refunded = await subscriber({ revoked: 'dispute' });
    expect(
      await preAdmission(friend, {
        method: 'POST',
        body: { ...ACK, inviteToken: invite(refunded.id) },
      }),
    ).toMatchObject({ code: 'SERVICE_INVITE_INVALID' });
    // Nothing was written for the invitee by any of the refusals.
    expect(
      await rows('SELECT 1 FROM ff_users WHERE id=$1', [friend]),
    ).toHaveLength(0);
    expect(
      await rows("SELECT 1 FROM aw_billing_grants WHERE key LIKE 'referral:%'"),
    ).toHaveLength(0);
    // An already admitted account cannot use a link.
    const admitted = await subscriber();
    expect(
      await admitReferredAccount(
        db,
        admitted.id,
        TERMS_ACCEPTANCE_VERSION,
        s.id,
        options,
      ),
    ).toEqual({ status: 'already-admitted' });
  });

  it('rolls the gift back with the admission when the invitee account cannot be admitted', async () => {
    const s = await subscriber();
    const friend = randomUUID();
    await db.query("INSERT INTO ff_users(id,status) VALUES($1,'deleting')", [
      friend,
    ]);
    await expect(
      admitReferredAccount(db, friend, TERMS_ACCEPTANCE_VERSION, s.id, options),
    ).rejects.toMatchObject({ code: 'SERVICE_ACCESS_ACCOUNT_INACTIVE' });
    expect(
      await rows('SELECT 1 FROM aw_billing_grants WHERE key=$1', [
        referralGrantKey(s.id),
      ]),
    ).toHaveLength(0);
  });

  it('takes no public slot and gives no launch discount even while the wave is open', async () => {
    await setPolicy('open', 3);
    const s = await subscriber();
    const friend = randomUUID();
    expect(
      await preAdmission(friend, {
        method: 'POST',
        body: { ...ACK, inviteToken: invite(s.id) },
      }),
    ).toMatchObject({ status: 201 });
    expect(await counter()).toBe(0);
    expect(
      (
        await rows(
          'SELECT launch_discount_eligible FROM aw_service_admissions WHERE user_id=$1',
          [friend],
        )
      )[0],
    ).toEqual({ launch_discount_eligible: false });
    // An open-wave visitor whose token is spent falls back to an ordinary slot.
    const late = randomUUID();
    expect(
      await preAdmission(late, {
        method: 'POST',
        body: { ...ACK, inviteToken: invite(s.id) },
      }),
    ).toMatchObject({ status: 201 });
    expect(await counter()).toBe(1);
  });

  it('revokes the unused gift with the subscription (refund/dispute) and spends it after the monthly allowance', async () => {
    const s = await subscriber();
    const friend = randomUUID();
    await preAdmission(friend, {
      method: 'POST',
      body: { ...ACK, inviteToken: invite(s.id) },
    });
    // Reserve through the real gate: monthly first, the gift last.
    configureGenerationGate(
      createGenerationGate({ ready: true, exemptUserIds: [] }),
    );
    const picks = async () =>
      (
        await db.query<{ grant_key: string }>(
          "SELECT grant_key FROM aw_billing_reservations WHERE user_id=$1 AND state='reserved' ORDER BY created_at,key",
          [s.id],
        )
      ).map((r) => r.grant_key);
    for (let i = 0; i < 6; i++)
      await reserveGenerationChapter(db, s.id, `job-${i}`, NOW);
    expect(await picks()).toEqual([
      ...Array(5).fill(s.invoice),
      referralGrantKey(s.id),
    ]);
    await expect(
      reserveGenerationChapter(db, s.id, 'job-7', NOW),
    ).rejects.toMatchObject({ code: 'BILLING_ALLOWANCE_EXHAUSTED' });

    // A revoked subscription closes the unused gift in the ledger itself.
    const t = await subscriber();
    await preAdmission(randomUUID(), {
      method: 'POST',
      body: { ...ACK, inviteToken: invite(t.id) },
    });
    expect(
      referralChaptersAvailable(await billingTx(db).loadLedger(t.id), NOW),
    ).toBe(1);
    await db.query(
      "UPDATE aw_billing_subscriptions SET revoked='refund' WHERE subscription_id=$1",
      [t.sub],
    );
    expect(
      referralChaptersAvailable(await billingTx(db).loadLedger(t.id), NOW),
    ).toBe(0);
    await db.query(
      'UPDATE aw_billing_subscriptions SET revoked=NULL,reconcile_required=true WHERE subscription_id=$1',
      [t.sub],
    );
    expect(
      referralChaptersAvailable(await billingTx(db).loadLedger(t.id), NOW),
    ).toBe(0);
  });

  it('cascades the gift away with the inviter account', async () => {
    const s = await subscriber();
    await preAdmission(randomUUID(), {
      method: 'POST',
      body: { ...ACK, inviteToken: invite(s.id) },
    });
    await db.query('DELETE FROM ff_users WHERE id=$1', [s.id]);
    expect(
      await rows('SELECT 1 FROM aw_billing_grants WHERE key=$1', [
        referralGrantKey(s.id),
      ]),
    ).toHaveLength(0);
  });
});
