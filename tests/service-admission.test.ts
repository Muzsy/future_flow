import { TERMS_ACCEPTANCE_VERSION } from '@future-flow/contracts';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { DomainError, billingConfigFromEnv } from '@future-flow/core';
import {
  Repository,
  ServiceAccessRepository,
  assertServiceGeneration,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { createApp } from '../apps/api/src/app';
import { createBillingRuntime } from '../apps/api/src/billing';
import { createServiceAccessRuntime } from '../apps/api/src/service-access';

// Bounded open admission over the real HTTP gate and the PGlite store. The
// real multi-connection PostgreSQL proof is service-admission-postgres.test.ts.
let engine: PGlite,
  db: Database,
  store: ServiceAccessRepository,
  app: INestApplication,
  base: string,
  privateKey: CryptoKey;
const actors = new Map<
  string,
  { id: string; email: string; emailConfirmed: boolean }
>();
const env = {
  SERVICE_ACCESS_ENFORCEMENT: 'true',
  CLOSED_SITE_ENABLED: 'true',
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'fixture.cloudflareaccess.com',
  CLOUDFLARE_ACCESS_AUD: 'a'.repeat(64),
  CLOSED_SITE_ALLOWED_EMAILS: 'legacy@example.invalid',
};
const ACK = {
  adult: true,
  acknowledged: true,
  termsVersion: TERMS_ACCEPTANCE_VERSION,
};
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
function newAccount(emailConfirmed = true) {
  const id = randomUUID();
  actors.set(id, {
    id,
    email: `signup-${id}@example.invalid`,
    emailConfirmed,
  });
  return id;
}
async function access(email: string) {
  return new SignJWT({ type: 'app', email })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
    .setIssuer('https://fixture.cloudflareaccess.com')
    .setAudience(env.CLOUDFLARE_ACCESS_AUD)
    .setSubject('independent-access-subject')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}
function bearer(id: string) {
  return (
    'test.' +
    Buffer.from(
      JSON.stringify({
        amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }],
      }),
    ).toString('base64url') +
    '.' +
    id
  );
}
async function call(
  id: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    assertion?: string | null;
  } = {},
) {
  const assertion =
    options.assertion === undefined
      ? await access(actors.get(id)!.email)
      : options.assertion;
  return fetch(base + path, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: 'Bearer ' + bearer(id),
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
      ...(assertion ? { 'Cf-Access-Jwt-Assertion': assertion } : {}),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
}
const CONSENT = '/api/v1/me/consent';
const accept = (id: string, body: unknown = ACK, assertion?: string | null) =>
  call(id, CONSENT, { method: 'POST', body, assertion });
async function code(response: Response) {
  return ((await response.json()) as { error?: { code?: string } }).error?.code;
}
async function policy() {
  const [row] = await db.query<{
    revision: string | number;
    mode: string;
    admission_capacity: string | number;
    admission_used: string | number;
  }>(
    'SELECT revision,mode,admission_capacity,admission_used FROM aw_service_policy',
  );
  return {
    revision: Number(row!.revision),
    mode: row!.mode,
    admission_capacity: Number(row!.admission_capacity),
    admission_used: Number(row!.admission_used),
  };
}
async function rows(table: string) {
  return (await db.query(`SELECT 1 FROM ${table}`)).length;
}
// Reset to a closed policy and open a fresh wave of the given size.
async function wave(capacity: number, open = true) {
  await db.query(
    "UPDATE aw_service_policy SET reconcile_required=false,generation_enabled=true,checkout_enabled=true,mode='invitation',admission_capacity=0,admission_used=0,revision=revision+1",
  );
  await db.query('DELETE FROM ff_users');
  const current = (await policy()).revision;
  return store.configureAdmission(current, { capacity, open });
}

beforeAll(async () => {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.stubEnv('NARRATIVE_PIPELINE_MODE', 'narrative-fiction-v2');
  vi.stubEnv('NARRATIVE_FICTION_GENERATION', 'v9');
  vi.stubEnv('NARRATIVE_COHORT_USER_IDS', '');
  engine = new PGlite();
  await applyMigrations(engine);
  db = adapter(engine);
  const repo = new Repository(db);
  store = new ServiceAccessRepository(db);
  await store.replacePolicy(0, {
    mode: 'invitation',
    generationEnabled: true,
    checkoutEnabled: true,
  });
  const keys = await generateKeyPair('RS256');
  privateKey = keys.privateKey;
  const jwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: 'fixture',
    alg: 'RS256',
    use: 'sig',
  };
  const billing = createBillingRuntime(
    db,
    billingConfigFromEnv({
      BILLING_ENABLED: 'true',
      BILLING_ENFORCEMENT: 'true',
      STRIPE_SECRET_KEY: 'sk_test_runtimekey12345',
      STRIPE_WEBHOOK_SECRET: 'whsec_runtimesecret123',
      STRIPE_PRICE_ID: 'price_runtime123',
      STRIPE_FOUNDER_COUPON_ID: 'runtime_launch',
      STRIPE_API_VERSION: '2025-03-31.basil',
      BILLING_SUCCESS_URL: 'https://alterward.example/billing?checkout=success',
      BILLING_CANCEL_URL: 'https://alterward.example/billing?checkout=cancel',
    }),
    {
      provider: {
        createCheckoutSession: async () => ({
          url: 'https://checkout.stripe.com/c/pay/synthetic',
        }),
        createPortalSession: async () => ({
          url: 'https://billing.stripe.com/p/session/synthetic',
        }),
        cancelSubscription: async () => {},
        resolveRevocation: async (e) => e,
      },
    },
  );
  const service = createServiceAccessRuntime(db, true, env, (async () =>
    Response.json({ keys: [jwk] })) as typeof fetch);
  const loose = createApp as unknown as (
    ...args: unknown[]
  ) => ReturnType<typeof createApp>;
  app = await loose(
    repo,
    {
      verify: async (token: string) => {
        const a = actors.get(token.split('.').at(-1)!);
        if (!a)
          throw new DomainError('AUTH_INVALID_TOKEN', 'Invalid token.', 401);
        return a;
      },
      deleteUser: async () => {},
    },
    ...Array(23).fill(undefined),
    undefined,
    billing,
    service,
  );
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
}, 60000);
beforeEach(async () => {
  await wave(3);
});
afterAll(async () => {
  await app?.close();
  await engine?.close();
  vi.unstubAllEnvs();
});

describe('bounded open admission over HTTP', () => {
  it('lets an unadmitted verified account only see an empty consent state, without creating a root', async () => {
    const id = newAccount();
    const status = await call(id, CONSENT);
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({
      schemaVersion: 'privacy-consent-status-1',
      acknowledged: false,
      policyVersion: 'alpha-privacy-v1',
    });
    for (const path of ['/api/v2/lives', '/api/v1/me'])
      expect(await code(await call(id, path))).toBe(
        'SERVICE_ADMISSION_REQUIRED',
      );
    expect(await rows('ff_users')).toBe(0);
    expect(await rows('ff_consents')).toBe(0);
    expect(await rows('aw_service_admissions')).toBe(0);
  });

  it('admits on the 18+/AI acknowledgement, atomically creating root, consent and admission', async () => {
    const id = newAccount();
    // A stale or missing terms version is refused before anything is written.
    for (const body of [
      { ...ACK, termsVersion: 'terms-2020-01' },
      { adult: true, acknowledged: true },
    ])
      expect((await accept(id, body)).status).toBe(422);
    expect(await rows('ff_consents')).toBe(0);
    expect((await policy()).admission_used).toBe(0);
    const response = await accept(id);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      accepted: true,
      policyVersion: 'alpha-privacy-v1',
    });
    expect(
      await db.query('SELECT status FROM ff_users WHERE id=$1', [id]),
    ).toEqual([{ status: 'active' }]);
    expect(
      await db.query(
        'SELECT policy_version,consent_type FROM ff_consents WHERE user_id=$1 ORDER BY consent_type',
        [id],
      ),
    ).toEqual([
      {
        policy_version: 'alpha-privacy-v1',
        consent_type: 'adult_and_ai_acknowledgement',
      },
      {
        policy_version: TERMS_ACCEPTANCE_VERSION,
        consent_type: 'terms_and_privacy_acceptance',
      },
    ]);
    expect(
      await db.query(
        'SELECT revision::int,state FROM aw_service_admissions WHERE user_id=$1',
        [id],
      ),
    ).toEqual([{ revision: 1, state: 'active' }]);
    expect((await policy()).admission_used).toBe(1);
    expect((await call(id, '/api/v2/lives')).status).toBe(200);
    // The regular consent route now answers for the admitted account.
    const again = await call(id, CONSENT);
    expect(await again.json()).toMatchObject({ acknowledged: true });
    expect((await accept(id)).status).toBe(201);
    expect((await policy()).admission_used).toBe(1);
  });

  it('refuses an incomplete acknowledgement and an unverified identity without writing anything', async () => {
    const id = newAccount();
    for (const body of [
      {},
      { adult: true },
      { adult: false, acknowledged: true },
      { ...ACK, extra: 1 },
    ])
      expect((await accept(id, body)).status).toBe(422);
    expect((await accept(id, ACK, null)).status).toBe(403);
    expect((await accept(id, ACK, 'unsigned.jwt.attacker')).status).toBe(403);
    const mismatched = await access('someone-else@example.invalid');
    expect((await accept(id, ACK, mismatched)).status).toBe(403);
    actors.get(id)!.emailConfirmed = false;
    expect((await accept(id)).status).toBe(403);
    expect(await rows('ff_users')).toBe(0);
    expect(await rows('ff_consents')).toBe(0);
    expect(await rows('aw_service_admissions')).toBe(0);
    expect((await policy()).admission_used).toBe(0);
  });

  it('refuses to admit at the database layer without the current terms version, writing nothing', async () => {
    const store = new ServiceAccessRepository(db);
    for (const version of [undefined, '', 'stale', null])
      await expect(
        store.admitOpenAccount(newAccount(), version),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await rows('ff_users')).toBe(0);
    expect(await rows('ff_consents')).toBe(0);
    expect((await policy()).admission_used).toBe(0);
  });

  it('records both consent rows through the regular consent route and refuses a stale version there', async () => {
    const repo = new Repository(db);
    const id = newAccount();
    await db.query('INSERT INTO ff_users(id) VALUES($1)', [id]);
    for (const version of [undefined, '', 'stale', null])
      await expect(repo.acceptConsent(id, version)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    expect(await rows('ff_consents')).toBe(0);
    await repo.acceptConsent(id, TERMS_ACCEPTANCE_VERSION);
    await repo.acceptConsent(id, TERMS_ACCEPTANCE_VERSION);
    expect(
      (
        await db.query<{ consent_type: string }>(
          'SELECT consent_type FROM ff_consents WHERE user_id=$1 ORDER BY consent_type',
          [id],
        )
      ).map((r) => r.consent_type),
    ).toEqual(['adult_and_ai_acknowledgement', 'terms_and_privacy_acceptance']);
  });

  it('closes automatically on the last slot and shows the full message without storing the account', async () => {
    const ids = [newAccount(), newAccount(), newAccount()];
    for (const id of ids) expect((await accept(id)).status).toBe(201);
    const after = await policy();
    expect(after).toMatchObject({
      mode: 'invitation',
      admission_capacity: 3,
      admission_used: 3,
    });
    const late = newAccount();
    expect(await code(await call(late, CONSENT))).toBe(
      'SERVICE_ADMISSION_CLOSED',
    );
    const refused = await accept(late);
    expect(refused.status).toBe(403);
    expect(await code(refused)).toBe('SERVICE_ADMISSION_CLOSED');
    expect(await code(await call(late, '/api/v2/lives'))).toBe(
      'SERVICE_ADMISSION_CLOSED',
    );
    expect(
      await db.query('SELECT 1 FROM ff_users WHERE id=$1', [late]),
    ).toHaveLength(0);
    expect(await rows('ff_consents')).toBe(6);
    // Earlier admissions are not affected by the close.
    for (const id of ids)
      expect((await call(id, '/api/v2/lives')).status).toBe(200);
  });

  it('never admits more than the capacity under parallel registrations', async () => {
    await wave(5);
    const ids = Array.from({ length: 14 }, () => newAccount());
    const results = await Promise.all(ids.map((id) => accept(id)));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(5);
    expect(statuses.filter((s) => s === 403)).toHaveLength(9);
    expect(await rows('aw_service_admissions')).toBe(5);
    expect(await rows('ff_users')).toBe(5);
    expect(await rows('ff_consents')).toBe(10);
    expect(await policy()).toMatchObject({
      mode: 'invitation',
      admission_used: 5,
    });
    for (const r of results.filter((x) => x.status === 403))
      expect(await code(r)).toBe('SERVICE_ADMISSION_CLOSED');
  });

  it('treats the same account arriving twice in parallel as one slot', async () => {
    const id = newAccount();
    const results = await Promise.all([accept(id), accept(id), accept(id)]);
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    expect((await policy()).admission_used).toBe(1);
    expect(await rows('aw_service_admissions')).toBe(1);
  });

  it('does not let an unadmitted account generate, check out or use the regular routes', async () => {
    const id = newAccount();
    for (const [path, method] of [
      ['/api/v2/lives', 'POST'],
      ['/api/v1/billing/checkout', 'POST'],
      ['/api/v1/me/consent/other', 'GET'],
    ] as const)
      expect(
        (
          await call(id, path, {
            method,
            body: method === 'POST' ? {} : undefined,
          })
        ).status,
      ).toBe(403);
    await expect(assertServiceGeneration(db, id, true)).rejects.toMatchObject({
      code: 'SERVICE_ADMISSION_REQUIRED',
    });
    expect(await rows('ff_users')).toBe(0);
    expect(await rows('aw_jobs')).toBe(0);
  });

  it('keeps a revocation effective, does not free its slot and does not re-admit the account', async () => {
    const id = newAccount();
    expect((await accept(id)).status).toBe(201);
    await store.replaceAdmission(id, 1, 'revoked');
    expect(await code(await call(id, '/api/v2/lives'))).toBe(
      'SERVICE_INVITATION_REQUIRED',
    );
    const again = await accept(id);
    expect(again.status).toBe(403);
    expect(await code(again)).toBe('SERVICE_INVITATION_REQUIRED');
    expect(await policy()).toMatchObject({ admission_used: 1 });
    expect(await db.query('SELECT state FROM aw_service_admissions')).toEqual([
      { state: 'revoked' },
    ]);
  });

  it('does not free a slot when an account is deleted', async () => {
    const id = newAccount();
    expect((await accept(id)).status).toBe(201);
    await db.query('DELETE FROM ff_users WHERE id=$1', [id]);
    expect(await rows('aw_service_admissions')).toBe(0);
    expect(await policy()).toMatchObject({ admission_used: 1 });
    expect(Number((await store.admissionCapacity())!.remaining)).toBe(2);
  });

  it('does not count operator-created admissions toward the open capacity', async () => {
    const operator = newAccount();
    await new Repository(db).ensureUser(operator);
    await store.replaceAdmission(operator, 0, 'active');
    expect(await policy()).toMatchObject({ admission_used: 0 });
    expect((await call(operator, '/api/v2/lives')).status).toBe(200);
  });

  it('fails closed with a restore quarantine, a missing policy or a store error, writing nothing', async () => {
    const id = newAccount();
    await db.query('UPDATE aw_service_policy SET reconcile_required=true');
    expect((await accept(id)).status).toBe(503);
    expect((await call(id, CONSENT)).status).toBe(503);
    await db.query('UPDATE aw_service_policy SET reconcile_required=false');
    const spy = vi
      .spyOn(db, 'query')
      .mockRejectedValueOnce(Error('Synthetic connection failure'));
    expect((await call(id, CONSENT)).status).toBe(503);
    spy.mockRestore();
    expect(await rows('ff_users')).toBe(0);
    expect(await rows('aw_service_admissions')).toBe(0);
    expect((await policy()).admission_used).toBe(0);
  });

  it('rolls the slot back when the transaction fails after taking it', async () => {
    const id = newAccount();
    const original = db.transaction.bind(db);
    // A failure while writing the consent record must leave no slot, root or
    // admission behind.
    await db.query(
      "ALTER TABLE ff_consents ADD CONSTRAINT synthetic_refusal CHECK(policy_version<>'alpha-privacy-v1')",
    );
    try {
      expect((await accept(id)).status).toBeGreaterThanOrEqual(500);
    } finally {
      await db.query(
        'ALTER TABLE ff_consents DROP CONSTRAINT synthetic_refusal',
      );
    }
    expect(original).toBeTypeOf('function');
    expect(await rows('ff_users')).toBe(0);
    expect(await rows('aw_service_admissions')).toBe(0);
    expect((await policy()).admission_used).toBe(0);
    expect((await accept(id)).status).toBe(201);
  });
});

describe('launch discount eligibility is fixed at admission', () => {
  const eligible = async () =>
    (
      await db.query<{ user_id: string; launch_discount_eligible: boolean }>(
        'SELECT user_id,launch_discount_eligible FROM aw_service_admissions',
      )
    ).filter((r) => r.launch_discount_eligible).length;
  it('marks exactly the first ten open admissions and no later one', async () => {
    await wave(14);
    const ids = Array.from({ length: 14 }, () => newAccount());
    // Sequential, so the order is known; parallel exactness is proven on PostgreSQL.
    for (const id of ids) expect((await accept(id)).status).toBe(201);
    expect(await eligible()).toBe(10);
    for (const [index, id] of ids.entries())
      expect(await store.launchDiscountEligible(id)).toBe(index < 10);
  });

  it('gives a later wave no automatic eligibility, even after reopening', async () => {
    await wave(10);
    for (let i = 0; i < 10; i++) await accept(newAccount());
    expect(await eligible()).toBe(10);
    const state = (await store.admissionCapacity())!;
    await store.configureAdmission(state.revision, {
      capacity: 20,
      open: true,
    });
    const later = newAccount();
    await accept(later);
    expect(await store.launchDiscountEligible(later)).toBe(false);
    expect(await eligible()).toBe(10);
  });

  it('never makes an operator-created admission eligible', async () => {
    const operator = newAccount();
    await new Repository(db).ensureUser(operator);
    await store.replaceAdmission(operator, 0, 'active');
    expect(await store.launchDiscountEligible(operator)).toBe(false);
    expect(await store.launchDiscountEligible(randomUUID())).toBe(false);
    expect(await store.launchDiscountEligible('not-a-uuid')).toBe(false);
  });

  it('keeps eligibility on revocation and does not hand it to another account', async () => {
    await wave(12);
    const first = newAccount();
    await accept(first);
    await store.replaceAdmission(first, 1, 'revoked');
    expect(await store.launchDiscountEligible(first)).toBe(true);
    const others = Array.from({ length: 11 }, () => newAccount());
    for (const id of others) await accept(id);
    // The revoked first account still holds its place: only nine others fit.
    expect(await eligible()).toBe(10);
    expect(await store.launchDiscountEligible(others[8]!)).toBe(true);
    expect(await store.launchDiscountEligible(others[9]!)).toBe(false);
  });

  it("does not give a deleted account's place to anyone else", async () => {
    await wave(11);
    const first = newAccount();
    await accept(first);
    await db.query('DELETE FROM ff_users WHERE id=$1', [first]);
    const rest = Array.from({ length: 10 }, () => newAccount());
    for (const id of rest) await accept(id);
    expect(await eligible()).toBe(9);
    expect(await store.launchDiscountEligible(rest[9]!)).toBe(false);
  });
});

describe('operator wave control and policy interplay', () => {
  it('bumps the policy revision on the automatic close so a stale operator write conflicts', async () => {
    const before = (await policy()).revision;
    for (const id of [newAccount(), newAccount(), newAccount()])
      await accept(id);
    expect((await policy()).revision).toBe(before + 1);
    // Counter changes below capacity do not move the revision, so an
    // operator pause computed before a registration is still valid.
    await expect(
      store.replacePolicy(before, {
        mode: 'open',
        generationEnabled: false,
        checkoutEnabled: true,
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_ACCESS_CONFLICT' });
  });

  it('keeps the revision while slots remain, so pause and resume stay usable during a wave', async () => {
    const start = (await policy()).revision;
    await accept(newAccount());
    expect((await policy()).revision).toBe(start);
    await store.replacePolicy(start, {
      mode: 'open',
      generationEnabled: false,
      checkoutEnabled: false,
    });
    expect(await policy()).toMatchObject({ mode: 'open', admission_used: 1 });
  });

  it('admits during a generation pause but never generates until it is resumed', async () => {
    const revision = (await policy()).revision;
    await store.replacePolicy(revision, {
      mode: 'open',
      generationEnabled: false,
      checkoutEnabled: true,
    });
    const id = newAccount();
    expect((await accept(id)).status).toBe(201);
    expect((await call(id, '/api/v2/lives')).status).toBe(200);
    await expect(assertServiceGeneration(db, id, true)).rejects.toMatchObject({
      code: 'SERVICE_GENERATION_PAUSED',
    });
  });

  it('opens the next wave only with an explicit revision-checked capacity', async () => {
    for (const id of [newAccount(), newAccount(), newAccount()])
      await accept(id);
    const closed = await store.admissionCapacity();
    expect(closed).toMatchObject({ mode: 'invitation', remaining: 0 });
    await expect(
      store.configureAdmission(closed!.revision - 1, {
        capacity: 6,
        open: true,
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_ACCESS_CONFLICT' });
    for (const bad of [
      { capacity: 3, open: true },
      { capacity: 2, open: false },
      { capacity: -1, open: false },
      { capacity: 1.5, open: true },
      { capacity: 100001, open: true },
      { capacity: 6, open: 'yes' },
      { capacity: 6 },
      { capacity: 6, open: true, extra: true },
    ])
      await expect(
        store.configureAdmission(closed!.revision, bad),
      ).rejects.toMatchObject({ code: 'SERVICE_ACCESS_INPUT_INVALID' });
    expect(await store.admissionCapacity()).toEqual(closed);
    const opened = await store.configureAdmission(closed!.revision, {
      capacity: 5,
      open: true,
    });
    expect(opened).toMatchObject({ mode: 'open', used: 3, remaining: 2 });
    const results = await Promise.all(
      Array.from({ length: 4 }, () => accept(newAccount())),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(await policy()).toMatchObject({
      mode: 'invitation',
      admission_used: 5,
    });
  });

  it('can close the wave manually without losing the used count', async () => {
    await accept(newAccount());
    const current = (await store.admissionCapacity())!;
    const closed = await store.configureAdmission(current.revision, {
      capacity: current.capacity,
      open: false,
    });
    expect(closed).toMatchObject({ mode: 'invitation', used: 1 });
    expect(await code(await call(newAccount(), CONSENT))).toBe(
      'SERVICE_ADMISSION_CLOSED',
    );
  });

  it('cannot leave the table open without a remaining slot', async () => {
    await expect(
      db.query(
        "UPDATE aw_service_policy SET mode='open',admission_capacity=admission_used",
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      store.replacePolicy((await policy()).revision, {
        mode: 'open',
        generationEnabled: true,
        checkoutEnabled: true,
      }),
    ).resolves.toMatchObject({ mode: 'open' });
    await wave(0, false);
    await expect(
      store.replacePolicy((await policy()).revision, {
        mode: 'open',
        generationEnabled: true,
        checkoutEnabled: true,
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_ACCESS_INPUT_INVALID' });
  });
});
