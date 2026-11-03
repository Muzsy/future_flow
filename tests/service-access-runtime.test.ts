import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  it,
  expect,
  vi,
} from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { DomainError, billingConfigFromEnv, hash } from '@future-flow/core';
import { fictionV9Policy } from '@future-flow/contracts';
import {
  Repository,
  ServiceAccessRepository,
  LifeJobRepository,
  LifeRepository,
  legacyNarrativeConfig,
  configureGenerationGate,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { createApp } from '../apps/api/src/app';
import { createBillingRuntime } from '../apps/api/src/billing';
import { createServiceAccessRuntime } from '../apps/api/src/service-access';
import {
  personalChapterGuard,
  personalRequestAdmission,
} from '../apps/worker/src/chapter-billing';
import { prepareFictionJobFixture } from './fiction-storage-fixtures';
import { setupFixture } from './life-fixtures';
let engine: PGlite,
  db: Database,
  repo: Repository,
  store: ServiceAccessRepository,
  app: INestApplication,
  base: string,
  privateKey: CryptoKey;
const actors = new Map<
  string,
  { id: string; email: string; emailConfirmed: boolean }
>();
let checkoutCalls = 0;
let portalCustomers: string[] = [];
const env = {
  SERVICE_ACCESS_ENFORCEMENT: 'true',
  CLOSED_SITE_ENABLED: 'true',
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'fixture.cloudflareaccess.com',
  CLOUDFLARE_ACCESS_AUD: 'a'.repeat(64),
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
async function actor(admitted = true, root = true) {
  const id = randomUUID();
  actors.set(id, {
    id,
    email: `reader-${id}@example.invalid`,
    emailConfirmed: true,
  });
  if (root) {
    await repo.ensureUser(id);
    await repo.acceptPrivacy(id);
  }
  if (admitted) await store.replaceAdmission(id, 0, 'active');
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
async function request(
  id: string,
  path = '/api/v2/lives',
  options: {
    method?: string;
    body?: unknown;
    assertion?: string | null;
    email?: string;
  } = {},
) {
  const assertion =
    options.assertion === undefined
      ? await access(options.email ?? actors.get(id)!.email)
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
beforeAll(async () => {
  vi.stubEnv('SERVICE_ACCESS_ENFORCEMENT', 'true');
  for (const [key, value] of Object.entries({
    ...env,
    CLOSED_SITE_ALLOWED_EMAILS: Array.from(
      { length: 13 },
      (_, i) => `reader${i}@example.invalid`,
    ).join(','),
  }))
    vi.stubEnv(key, value);
  vi.stubEnv('NARRATIVE_PIPELINE_MODE', 'narrative-fiction-v2');
  vi.stubEnv('NARRATIVE_FICTION_GENERATION', 'v9');
  vi.stubEnv('NARRATIVE_COHORT_USER_IDS', '');
  engine = new PGlite();
  await applyMigrations(engine);
  db = adapter(engine);
  repo = new Repository(db);
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
  const config = billingConfigFromEnv({
    BILLING_ENABLED: 'true',
    BILLING_ENFORCEMENT: 'true',
    STRIPE_SECRET_KEY: 'sk_test_runtimekey12345',
    STRIPE_WEBHOOK_SECRET: 'whsec_runtimesecret123',
    STRIPE_PRICE_ID: 'price_runtime123',
    STRIPE_FOUNDER_COUPON_ID: 'runtime_launch',
    STRIPE_API_VERSION: '2025-03-31.basil',
    BILLING_SUCCESS_URL: 'https://alterward.example/billing?checkout=success',
    BILLING_CANCEL_URL: 'https://alterward.example/billing?checkout=cancel',
  });
  expect(config.enabled).toBe(true);
  const billing = createBillingRuntime(db, config, {
    provider: {
      createCheckoutSession: async () => {
        checkoutCalls++;
        return { url: 'https://checkout.stripe.com/c/pay/synthetic' };
      },
      createPortalSession: async ({ customerId }) => {
        portalCustomers.push(customerId);
        return { url: 'https://billing.stripe.com/p/session/synthetic' };
      },
      cancelSubscription: async () => {},
      resolveRevocation: async (e) => e,
    },
  });
  const service = createServiceAccessRuntime(db, true, env, (async (url) => {
    expect(String(url)).toBe(
      'https://fixture.cloudflareaccess.com/cdn-cgi/access/certs',
    );
    return Response.json({ keys: [jwk] });
  }) as typeof fetch);
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
  checkoutCalls = 0;
  portalCustomers = [];
  await db.query(
    "UPDATE aw_service_policy SET mode='invitation',generation_enabled=true,checkout_enabled=true,reconcile_required=false",
  );
});
afterEach(async () => {
  await db.query(
    "UPDATE aw_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE status IN ('queued','running')",
  );
});
afterAll(async () => {
  await app?.close();
  await engine?.close();
  configureGenerationGate(null);
  vi.unstubAllEnvs();
});
it('admits thirteen independent invited UUIDs without the legacy email/cohort list', async () => {
  for (let i = 0; i < 13; i++) {
    const id = await actor();
    expect((await request(id)).status).toBe(200);
  }
});
it('does not create application roots or jobs for an authenticated but unknown/uninvited account', async () => {
  const unknown = await actor(false, false),
    uninvited = await actor(false);
  // Neither is admitted and the policy is closed: both get the same 403 and
  // an unknown account is not given a root as a side effect of asking.
  expect((await request(unknown)).status).toBe(403);
  expect((await request(uninvited)).status).toBe(403);
  expect(
    await db.query('SELECT id FROM ff_users WHERE id=$1', [unknown]),
  ).toHaveLength(0);
  expect(
    await db.query('SELECT id FROM aw_jobs WHERE user_id=ANY($1::uuid[])', [
      [unknown, uninvited],
    ]),
  ).toHaveLength(0);
});
it('refuses missing/forged Access, mismatched email and unconfirmed provider email', async () => {
  const id = await actor();
  for (const assertion of [null, 'unsigned.jwt.attacker'])
    expect((await request(id, '/api/v2/lives', { assertion })).status).toBe(
      403,
    );
  expect(
    (await request(id, '/api/v2/lives', { email: 'other@example.invalid' }))
      .status,
  ).toBe(403);
  actors.get(id)!.emailConfirmed = false;
  expect((await request(id)).status).toBe(403);
});
it('reads fresh revocation even with a still valid Access assertion and blocks checkout without provider calls', async () => {
  const id = await actor(),
    assertion = await access(actors.get(id)!.email);
  expect((await request(id, '/api/v2/lives', { assertion })).status).toBe(200);
  await store.replaceAdmission(id, 1, 'revoked');
  expect((await request(id, '/api/v2/lives', { assertion })).status).toBe(403);
  expect(
    (
      await request(id, '/api/v1/billing/checkout', {
        method: 'POST',
        body: {},
        assertion,
      })
    ).status,
  ).toBe(403);
  expect(checkoutCalls).toBe(0);
});
it('keeps own export and billing status available without Access while policy is quarantined', async () => {
  const id = await actor();
  await store.replaceAdmission(id, 1, 'revoked');
  await db.query('UPDATE aw_service_policy SET reconcile_required=true');
  expect((await request(id)).status).toBe(503);
  expect(
    (await request(id, '/api/v1/me/export', { assertion: null })).status,
  ).toBe(200);
  expect(
    (await request(id, '/api/v1/billing/status', { assertion: null })).status,
  ).toBe(200);
  const unauth = await fetch(base + '/api/v1/me/export');
  expect(unauth.status).toBe(401);
});
it('pauses new chapters and checkout while retaining own reading', async () => {
  const id = await actor();
  await db.query(
    'UPDATE aw_service_policy SET generation_enabled=false,checkout_enabled=false',
  );
  expect((await request(id)).status).toBe(200);
  const start = await request(id, '/api/v2/lives', {
    method: 'POST',
    body: setupFixture(),
  });
  expect(start.status).toBe(503);
  expect(
    (
      await request(id, '/api/v1/billing/checkout', {
        method: 'POST',
        body: {},
      })
    ).status,
  ).toBe(503);
  expect(checkoutCalls).toBe(0);
  expect(
    await db.query('SELECT id FROM aw_lives WHERE user_id=$1', [id]),
  ).toHaveLength(0);
});
it('creates the frozen v9 job for a new invitee and consumes the single taster only on durable completion', async () => {
  const id = await actor();
  const start = await request(id, '/api/v2/lives', {
    method: 'POST',
    body: setupFixture(),
  });
  expect(start.status).toBe(201);
  const created = (await start.json()) as { jobId: string };
  const jobs = new LifeJobRepository(db);
  const job = (await jobs.claim())!;
  expect(job.id).toBe(created.jobId);
  expect(hash(job.payload.narrativeContext!.policy)).toBe(
    hash(fictionV9Policy()),
  );
  expect(
    (
      await db.query(
        'SELECT state,bucket FROM aw_billing_reservations WHERE user_id=$1',
        [id],
      )
    )[0],
  ).toEqual({ state: 'reserved', bucket: 'taster' });
  const f = await prepareFictionJobFixture(db, job, 'v9');
  await jobs.complete(job, f.candidate, f.chapter, f.receipts, f.commit);
  expect(
    (
      await db.query(
        'SELECT state,bucket FROM aw_billing_reservations WHERE user_id=$1',
        [id],
      )
    )[0],
  ).toEqual({ state: 'consumed', bucket: 'taster' });
  const second = await request(id, '/api/v2/lives', {
    method: 'POST',
    body: setupFixture(),
  });
  expect(second.status).toBeGreaterThanOrEqual(400);
  expect(
    await db.query('SELECT id FROM aw_lives WHERE user_id=$1', [id]),
  ).toHaveLength(1);
});
it('blocks the worker before a new physical request and returns an unused USD reservation after a concurrent pause', async () => {
  const id = await actor();
  const r = await request(id, '/api/v2/lives', {
    method: 'POST',
    body: setupFixture(),
  });
  expect(r.status).toBe(201);
  const jobs = new LifeJobRepository(db),
    job = (await jobs.claim())!;
  await db.query('UPDATE aw_service_policy SET generation_enabled=false');
  await expect(
    personalRequestAdmission(jobs, job, true)(),
  ).rejects.toMatchObject({ code: 'SERVICE_GENERATION_PAUSED' });
  await db.query('UPDATE aw_service_policy SET generation_enabled=true');
  const settled: unknown[] = [];
  const guard = personalChapterGuard(
    {
      reserve: async () => {
        await db.query('UPDATE aw_service_policy SET generation_enabled=false');
        return 'unused-usd';
      },
      settle: async (...args) => {
        settled.push(args);
      },
    },
    jobs,
    job,
  );
  await expect(guard.reserve({} as never)).rejects.toMatchObject({
    code: 'SERVICE_GENERATION_PAUSED',
  });
  expect(settled).toHaveLength(1);
  expect(JSON.stringify(settled)).toContain('unused-usd');
  expect(
    (
      await db.query(
        'SELECT state FROM aw_billing_reservations WHERE user_id=$1',
        [id],
      )
    )[0]?.state,
  ).toBe('reserved');
});

it('allows a CORS preflight without authenticating or serving an application response', async () => {
  const response = await fetch(base + '/api/v2/lives', {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:3000',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Authorization',
    },
  });
  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');
  expect((await fetch(base + '/api/v2/lives')).status).toBe(403);
});
it('fails closed on a registry read error instead of treating it as an absent invitation', async () => {
  const id = await actor();
  const query = db.query.bind(db);
  db.query = async (sql, values) => {
    if (sql.includes('FROM aw_service_policy p'))
      throw Error('synthetic storage failure');
    return query(sql, values);
  };
  try {
    const response = await request(id);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(
      'synthetic storage failure',
    );
  } finally {
    db.query = query;
  }
});

it('opens a new checkout only for the admitted account with current checkout permission', async () => {
  const id = await actor();
  const response = await request(id, '/api/v1/billing/checkout', {
    method: 'POST',
    body: {},
  });
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({
    url: 'https://checkout.stripe.com/c/pay/synthetic',
  });
  expect(checkoutCalls).toBe(1);
});

it('rechecks checkout permission after waiting for the user billing lock, before calling the provider', async () => {
  const id = await actor(),
    transaction = db.transaction.bind(db);
  db.transaction = (run) =>
    transaction(async (tx) => {
      const query = tx.query.bind(tx);
      tx.query = async (sql, values) => {
        const rows = await query(sql, values);
        if (
          sql.includes('pg_advisory_xact_lock') &&
          sql.includes('alterward-billing:')
        )
          await query('UPDATE aw_service_policy SET checkout_enabled=false');
        return rows;
      };
      return run(tx);
    });
  try {
    const response = await request(id, '/api/v1/billing/checkout', {
      method: 'POST',
      body: {},
    });
    expect(response.status).toBe(503);
    expect(checkoutCalls).toBe(0);
  } finally {
    db.transaction = transaction;
  }
});
it('completes five concurrent admitted checkouts on the single-connection SQL fixture without borrowing a second connection', async () => {
  const ids = await Promise.all(Array.from({ length: 5 }, () => actor()));
  const responses = await Promise.all(
    ids.map((id) =>
      request(id, '/api/v1/billing/checkout', { method: 'POST', body: {} }),
    ),
  );
  expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
  expect(checkoutCalls).toBe(5);
});

it('uses the same service admission and frozen v9 policy through internal personal Scenario/fork factories', async () => {
  const id = await actor(),
    internal = new LifeRepository(db);
  const created = await internal.create(id, setupFixture(), randomUUID());
  const row = (
    await db.query('SELECT payload FROM aw_jobs WHERE id=$1', [created.jobId])
  )[0]!;
  expect(
    hash(
      (row.payload as { narrativeContext: { policy: unknown } })
        .narrativeContext.policy,
    ),
  ).toBe(hash(fictionV9Policy()));
  const other = await actor(false);
  await expect(
    internal.create(other, setupFixture(), randomUUID()),
  ).rejects.toMatchObject({ code: 'SERVICE_ADMISSION_CLOSED' });
  const explicitLegacy = new LifeRepository(
    db,
    { daily: 10, concurrent: 2 },
    legacyNarrativeConfig,
  );
  const third = await actor();
  await expect(
    explicitLegacy.create(third, setupFixture(), randomUUID()),
  ).rejects.toMatchObject({ code: 'NARRATIVE_CONTEXT_INVALID' });
  await db.query('UPDATE aw_service_policy SET generation_enabled=false');
  expect((await explicitLegacy.branch(id, created.branchId)).id).toBe(
    created.branchId,
  );
});

it('keeps a ready result and its single chapter charge when admission is revoked after generation', async () => {
  const id = await actor();
  const started = await request(id, '/api/v2/lives', {
    method: 'POST',
    body: setupFixture(),
  });
  expect(started.status).toBe(201);
  const jobs = new LifeJobRepository(db),
    job = (await jobs.claim())!;
  const ready = await prepareFictionJobFixture(db, job, 'v9');
  await store.replaceAdmission(id, 1, 'revoked');
  await db.query('UPDATE aw_service_policy SET generation_enabled=false');
  await jobs.complete(
    job,
    ready.candidate,
    ready.chapter,
    ready.receipts,
    ready.commit,
  );
  expect(
    (
      await db.query(
        'SELECT state FROM aw_billing_reservations WHERE user_id=$1',
        [id],
      )
    )[0]?.state,
  ).toBe('consumed');
  expect(
    await db.query('SELECT id FROM aw_periods WHERE id=$1', [
      ready.candidate.periodId,
    ]),
  ).toHaveLength(1);
  expect((await request(id)).status).toBe(403);
  expect(
    (await request(id, '/api/v1/me/export', { assertion: null })).status,
  ).toBe(200);
});
it('refuses a historical weaker job policy without a raw hashing error or provider request', async () => {
  const id = await actor();
  expect(
    (
      await request(id, '/api/v2/lives', {
        method: 'POST',
        body: setupFixture(),
      })
    ).status,
  ).toBe(201);
  const jobs = new LifeJobRepository(db),
    job = (await jobs.claim())!;
  const before = (
    await db.query('SELECT checkpoints FROM aw_jobs WHERE id=$1', [job.id])
  )[0]?.checkpoints;
  const legacy = {
    ...job,
    payload: { ...job.payload, narrativeContext: undefined },
  };
  await expect(jobs.verifyChapterReservation(legacy)).rejects.toMatchObject({
    code: 'NARRATIVE_CONTEXT_INVALID',
  });
  await expect(jobs.admitNarrativeRequest(legacy)).rejects.toMatchObject({
    code: 'NARRATIVE_CONTEXT_INVALID',
  });
  expect(
    (await db.query('SELECT checkpoints FROM aw_jobs WHERE id=$1', [job.id]))[0]
      ?.checkpoints,
  ).toEqual(before);
});

it('retains own subscription management without Access or admission while service policy is quarantined', async () => {
  const id = await actor();
  await db.query(
    "INSERT INTO aw_billing_subscriptions(subscription_id,user_id,customer_id,status,period_start,period_end,last_state_event_created) VALUES('sub_serviceportal',$1,'cus_serviceportal','active',now(),now()+interval '30 days',1)",
    [id],
  );
  await store.replaceAdmission(id, 1, 'revoked');
  await db.query(
    'UPDATE aw_service_policy SET generation_enabled=false,checkout_enabled=false,reconcile_required=true',
  );
  const response = await request(id, '/api/v1/billing/portal', {
    method: 'POST',
    body: {},
    assertion: null,
  });
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({
    url: 'https://billing.stripe.com/p/session/synthetic',
  });
  expect(portalCustomers).toEqual(['cus_serviceportal']);
  expect(checkoutCalls).toBe(0);
  expect(
    await db.query('SELECT * FROM aw_billing_reservations WHERE user_id=$1', [
      id,
    ]),
  ).toEqual([]);
});
