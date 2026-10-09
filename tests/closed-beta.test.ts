import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, describe, it, expect } from 'vitest';
import { DomainError } from '@future-flow/core';
import {
  Repository,
  LifeRepository,
  DatabaseAiBudget,
  closedBetaConfigFromEnv,
  validateClosedBetaConfig,
  assertClosedBetaAdmission,
  applicationAiBudgetConfigFromEnv,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { createApp } from '../apps/api/src/app';
import { setupFixture } from './life-fixtures';
import { createClosedSiteGate } from '@future-flow/access';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
const period = () => {
  const startsAt = new Date(Date.now() - 60000).toISOString();
  return {
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 30 * 86400000).toISOString(),
  };
};
const request = { model: 'gpt-6.1-sol', max_output_tokens: 500, input: [] };
describe('explicitly limited closed beta configuration', () => {
  it('starts an uninvited zero-budget deployment without starting the paid window', async () => {
    const env = {
      CLOSED_BETA_ENABLED: 'true',
      CLOSED_BETA_USER_IDS: '',
      AI_PROJECT_BUDGET_USD: '0',
      CLAUDE_PRODUCTION_BUDGET_USD: '0',
      AI_USER_BUDGET_USD: '0',
      AI_BUDGET_WINDOW_REQUIRED: 'true',
      AI_BUDGET_WINDOW_START: '',
      AI_BUDGET_WINDOW_END: '',
    };
    let accesses = 0;
    const forbidden: Database = {
      query: async () => {
        accesses++;
        throw Error('Database must not be reached');
      },
      transaction: async () => {
        accesses++;
        throw Error('Database must not be reached');
      },
    };
    for (const provider of ['openai', 'anthropic'] as const) {
      const config = applicationAiBudgetConfigFromEnv(env, provider);
      expect(config.window).toBeUndefined();
      expect(config.closedBetaUserIds).toEqual([]);
      const guard = new DatabaseAiBudget(
        forbidden,
        randomUUID(),
        randomUUID(),
        config,
      );
      await expect(guard.reserve(request)).rejects.toMatchObject({
        code: 'CLOSED_BETA_INVITE_REQUIRED',
      });
      for (const change of [
        { CLOSED_BETA_USER_IDS: randomUUID() },
        { AI_USER_BUDGET_USD: '0.50' },
        { AI_PROJECT_BUDGET_USD: '2', CLAUDE_PRODUCTION_BUDGET_USD: '1' },
      ])
        expect(() =>
          applicationAiBudgetConfigFromEnv({ ...env, ...change }, provider),
        ).toThrow();
      expect(
        () =>
          new DatabaseAiBudget(forbidden, randomUUID(), randomUUID(), {
            ...config,
            initialProjectSpentUsd: 1,
          }),
      ).toThrow();
    }
    expect(accesses).toBe(0);
  });
  it('defaults off, accepts at most ten unique verified Auth identifiers, and canonicalizes case', () => {
    expect(closedBetaConfigFromEnv({})).toEqual({
      enabled: false,
      userIds: [],
    });
    const ids = Array.from({ length: 10 }, () => randomUUID()),
      config = closedBetaConfigFromEnv({
        CLOSED_BETA_ENABLED: 'true',
        CLOSED_BETA_USER_IDS: ids.map((id) => id.toUpperCase()).join(', '),
      });
    expect(config).toEqual({ enabled: true, userIds: ids });
    expect(() => assertClosedBetaAdmission(config, ids[0]!)).not.toThrow();
    expect(() => assertClosedBetaAdmission(config, randomUUID())).toThrowError(
      expect.objectContaining({ code: 'CLOSED_BETA_INVITE_REQUIRED' }),
    );
    expect(() =>
      assertClosedBetaAdmission({ enabled: false, userIds: [] }, randomUUID()),
    ).not.toThrow();
  });
  it('rejects an eleventh slot, duplicates, emails, malformed ids and ambiguous switches', () => {
    const id = randomUUID();
    for (const env of [
      { CLOSED_BETA_ENABLED: 'yes' },
      { CLOSED_BETA_USER_IDS: 'someone@example.invalid' },
      { CLOSED_BETA_USER_IDS: id + ',' + id.toUpperCase() },
      {
        CLOSED_BETA_USER_IDS: Array.from({ length: 11 }, () =>
          randomUUID(),
        ).join(','),
      },
      { CLOSED_BETA_USER_IDS: id + ',' },
    ])
      expect(() => closedBetaConfigFromEnv(env)).toThrow();
    expect(() =>
      validateClosedBetaConfig({ enabled: true, userIds: [id] }),
    ).not.toThrow();
    expect(() =>
      assertClosedBetaAdmission({ enabled: true, userIds: [] }, id),
    ).toThrow();
  });
  it('accepts only the reserved beta provider caps and exactly one thirty-day window', () => {
    const window = period(),
      env = {
        CLOSED_BETA_ENABLED: 'true',
        CLOSED_BETA_USER_IDS: randomUUID(),
        AI_PROJECT_BUDGET_USD: '2',
        CLAUDE_PRODUCTION_BUDGET_USD: '1',
        AI_USER_BUDGET_USD: '0.50',
        AI_BUDGET_WINDOW_START: window.startsAt,
        AI_BUDGET_WINDOW_END: window.endsAt,
      };
    expect(applicationAiBudgetConfigFromEnv(env).projectUsd).toBe(2);
    expect(applicationAiBudgetConfigFromEnv(env, 'anthropic').projectUsd).toBe(
      1,
    );
    for (const change of [
      { AI_PROJECT_BUDGET_USD: '6' },
      { AI_USER_BUDGET_USD: '0.51' },
      {
        AI_BUDGET_WINDOW_END: new Date(
          Date.parse(window.endsAt) + 1,
        ).toISOString(),
      },
      { AI_BUDGET_WINDOW_START: '', AI_BUDGET_WINDOW_END: '' },
    ])
      expect(() =>
        applicationAiBudgetConfigFromEnv({ ...env, ...change }),
      ).toThrow();
    expect(() =>
      applicationAiBudgetConfigFromEnv(
        { ...env, CLAUDE_PRODUCTION_BUDGET_USD: '2' },
        'anthropic',
      ),
    ).toThrow();
  });
  it('rechecks admission before database reservation and does not trust a subsequently mutated allowlist', async () => {
    const owner = randomUUID(),
      foreign = randomUUID(),
      ids = [owner];
    let accesses = 0;
    const forbidden: Database = {
      query: async () => {
        accesses++;
        throw Error('Database should not be reached');
      },
      transaction: async () => {
        accesses++;
        throw Error('Database should not be reached');
      },
    };
    const budget = new DatabaseAiBudget(forbidden, foreign, randomUUID(), {
      projectUsd: 2,
      userUsd: 0.5,
      window: period(),
      closedBetaUserIds: ids,
    });
    ids.push(foreign);
    await expect(budget.reserve(request)).rejects.toMatchObject({
      code: 'CLOSED_BETA_INVITE_REQUIRED',
    });
    expect(accesses).toBe(0);
    expect(
      () =>
        new DatabaseAiBudget(forbidden, owner, randomUUID(), {
          projectUsd: 6,
          userUsd: 0.5,
          window: period(),
          closedBetaUserIds: [owner],
        }),
    ).toThrow();
  });
});
let engine: PGlite, db: Database;
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
  await engine.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
  await applyMigrations(engine);
  db = adapter(engine);
});
afterEach(async () => {
  for (const u of await db.query<{ id: string }>('SELECT id FROM ff_users'))
    await new Repository(db).deleteAccountData(u.id);
});
afterAll(async () => {
  await engine?.close();
});
async function user() {
  const id = randomUUID(),
    repo = new Repository(db);
  await repo.ensureUser(id);
  await repo.acceptPrivacy(id);
  return id;
}
const token = (id: string) =>
  'technical.' +
  Buffer.from(
    JSON.stringify({
      sub: id,
      amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }],
    }),
  ).toString('base64url') +
  '.verified-fixture-signature';
describe('closed beta paid-boundary isolation', () => {
  it('closes every API entrance at the origin while a revoked user retains only authenticated own export and deletion', async () => {
    const allowed = await user(),
      revoked = await user(),
      allowedToken = token(allowed),
      revokedToken = token(revoked),
      pair = await generateKeyPair('RS256'),
      aud = 'a'.repeat(64),
      issuer = 'https://fixture.cloudflareaccess.com';
    const assertion = await new SignJWT({
      email: 'owner@example.invalid',
      sub: 'access-owner',
      type: 'app',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
      .setIssuer(issuer)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(pair.privateKey);
    const gate = createClosedSiteGate(
      {
        CLOSED_SITE_ENABLED: 'true',
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'fixture.cloudflareaccess.com',
        CLOUDFLARE_ACCESS_AUD: aud,
        CLOSED_SITE_ALLOWED_EMAILS: 'owner@example.invalid',
      },
      async () =>
        Response.json({
          keys: [
            {
              ...(await exportJWK(pair.publicKey)),
              kid: 'fixture',
              alg: 'RS256',
              use: 'sig',
            },
          ],
        }),
    );
    const deleted: string[] = [];
    const args: Parameters<typeof createApp> = [
      new Repository(db),
      {
        verify: async (value) => {
          if (value === allowedToken) return { id: allowed };
          if (value === revokedToken) return { id: revoked };
          throw new DomainError('AUTH_INVALID', 'Invalid token.', 401);
        },
        deleteUser: async (id) => {
          deleted.push(id);
        },
      },
    ];
    args[24] = { enabled: true, userIds: [allowed] };
    args[25] = gate;
    const app = await createApp(...args);
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl(),
      own = {
        Authorization: `Bearer ${revokedToken}`,
        'Content-Type': 'application/json',
      };
    try {
      for (const path of [
        '/api/v1/me',
        '/api/v1/me/consent',
        '/api/v2/lives',
        '/api/public/discover',
        '/api/docs',
        '/api/openapi.json',
        '/api/v1/me/export/other',
      ]) {
        const response = await fetch(base + path, {
          headers: {
            ...own,
            'cf-access-authenticated-user-email': 'owner@example.invalid',
            'X-Forwarded-Host': 'alterward.com',
          },
        });
        expect(response.status, path).toBe(403);
        expect((await response.json()).error.code).toBe(
          'CLOSED_SITE_ACCESS_REQUIRED',
        );
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
      }
      const authHeaders = { ...own, 'cf-access-jwt-assertion': assertion };
      expect(
        (await fetch(base + '/api/v1/me', { headers: authHeaders })).status,
      ).toBe(200);
      expect(
        (
          await fetch(base + '/api/v1/me', {
            headers: { 'cf-access-jwt-assertion': assertion },
          })
        ).status,
      ).toBe(401);
      const paid = await fetch(base + '/api/v2/lives', {
        method: 'POST',
        headers: authHeaders,
        body: '{}',
      });
      expect(paid.status).toBe(403);
      expect((await paid.json()).error.code).toBe(
        'CLOSED_BETA_INVITE_REQUIRED',
      );
      expect((await fetch(base + '/health')).status).toBe(200);
      expect((await fetch(base + '/api/v1/me/export')).status).toBe(401);
      const ownExport = await fetch(
        base + '/api/v1/me/export?userId=' + allowed,
        { headers: own },
      );
      expect(ownExport.status).toBe(200);
      expect(ownExport.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
      expect(ownExport.headers.get('Cache-Control')).toBe('no-store');
      const malformed = await fetch(base + '/api/v1/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      });
      expect(malformed.status).toBe(400);
      expect(malformed.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
      const text = await ownExport.text();
      expect(text).toContain(revoked);
      expect(text).not.toContain(allowed);
      expect(
        (
          await fetch(base + '/api/v1/me/export', {
            method: 'POST',
            headers: own,
            body: '{}',
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(base + '/api/v1/me', {
            method: 'DELETE',
            body: JSON.stringify({ confirmation: 'DELETE ACCOUNT' }),
            headers: { 'Content-Type': 'application/json' },
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await fetch(base + '/api/v1/me', {
            method: 'DELETE',
            body: JSON.stringify({ confirmation: 'DELETE ACCOUNT' }),
            headers: own,
          })
        ).status,
      ).toBe(200);
      expect(deleted).toEqual([revoked]);
      expect(
        await db.query('SELECT id FROM ff_users WHERE id=$1', [revoked]),
      ).toEqual([]);
      expect(
        await db.query('SELECT id FROM ff_users WHERE id=$1', [allowed]),
      ).toHaveLength(1);
    } finally {
      await app.close();
    }
  });
  it('prevents an uninvited pending requester from allocating either provider budget while admitted users share their user cap', async () => {
    const owner = await user(),
      foreign = await user(),
      window = period(),
      config = {
        projectUsd: 2,
        userUsd: 0.5,
        window,
        closedBetaUserIds: [owner],
      },
      before = await db.query('SELECT * FROM aw_budget_reservations');
    await expect(
      new DatabaseAiBudget(db, foreign, randomUUID(), config).reserve(request),
    ).rejects.toMatchObject({ code: 'CLOSED_BETA_INVITE_REQUIRED' });
    await expect(
      new DatabaseAiBudget(db, foreign, randomUUID(), {
        ...config,
        provider: 'anthropic',
        projectUsd: 1,
      }).reserve({ ...request, model: 'claude-sonnet-5-5' }),
    ).rejects.toMatchObject({ code: 'CLOSED_BETA_INVITE_REQUIRED' });
    expect(await db.query('SELECT * FROM aw_budget_reservations')).toEqual(
      before,
    );
    const openai = new DatabaseAiBudget(db, owner, randomUUID(), config),
      first = await openai.reserve(request);
    await openai.settle(first, { input_tokens: 2000, output_tokens: 100 });
    const claude = new DatabaseAiBudget(db, owner, randomUUID(), {
        ...config,
        provider: 'anthropic',
        projectUsd: 1,
      }),
      second = await claude.reserve({ ...request, model: 'claude-sonnet-5-5' });
    await claude.settle(second, { input_tokens: 2000, output_tokens: 100 });
    const users = await db.query(
      'SELECT id FROM aw_budget_accounts WHERE user_id=$1',
      [owner],
    );
    expect(users).toHaveLength(1);
  });
  it('blocks all twelve queue entry routes before mutation while preserving consent, own reading, export and deletion', async () => {
    const allowed = await user(),
      foreign = await user(),
      allowedToken = token(allowed),
      foreignToken = token(foreign),
      list = [allowed],
      args: Parameters<typeof createApp> = [
        new Repository(db),
        {
          verify: async (t) => {
            if (t === allowedToken) return { id: allowed };
            if (t === foreignToken) return { id: foreign };
            throw new DomainError('AUTH_INVALID', 'Invalid token.', 401);
          },
          deleteUser: async () => {},
        },
      ];
    args[24] = { enabled: true, userIds: list };
    const existing = await new LifeRepository(db).create(
        foreign,
        setupFixture(),
        randomUUID(),
      ),
      initial = await new LifeRepository(db).branch(foreign, existing.branchId),
      before = await db.query('SELECT id FROM aw_jobs ORDER BY id');
    const app = await createApp(...args);
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl(),
      headers = {
        Authorization: `Bearer ${foreignToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      id = randomUUID();
    list.push(foreign);
    try {
      const paths = [
        '/api/v1/futures',
        `/api/v1/decisions/${id}/resolve`,
        '/api/v2/lives',
        `/api/v2/scenario-versions/${id}/start`,
        `/api/v2/branches/${id}/continue`,
        `/api/v2/branches/${id}/periods/${id}/fork`,
        `/api/v2/jobs/${id}/retry`,
        `/api/v2/public-content-bundles/${id}/review-job`,
        `/api/v2/public-previews/${id}/review-job`,
        `/api/v2/shared-contexts/${id}/continue`,
        '/api/v2/public-forks/life-' + 'a'.repeat(32),
        '/api/v2/personal-scenarios/sources/scenario-' +
          'a'.repeat(32) +
          '/start',
      ];
      for (const path of paths) {
        const result = await fetch(base + path, {
          method: 'POST',
          headers,
          body: '{}',
        });
        expect(result.status, path).toBe(403);
        expect((await result.json()).error.code).toBe(
          'CLOSED_BETA_INVITE_REQUIRED',
        );
      }
      expect(await db.query('SELECT id FROM aw_jobs ORDER BY id')).toEqual(
        before,
      );
      expect((await fetch(base + '/api/v2/lives', { headers })).status).toBe(
        200,
      );
      expect(
        (
          await fetch(base + '/api/v1/me/consent', {
            method: 'POST',
            headers,
            body: JSON.stringify({ adult: true, acknowledged: true }),
          })
        ).status,
      ).toBe(201);
      expect(
        (await fetch(base + '/api/v1/me/export', { headers })).status,
      ).toBe(200);
      const admitted = await fetch(base + '/api/v2/lives', {
        method: 'POST',
        headers: { ...headers, Authorization: `Bearer ${allowedToken}` },
        body: JSON.stringify(setupFixture()),
      });
      expect(admitted.status).toBe(201);
      const removed = await fetch(base + `/api/v2/lives/${existing.lifeId}`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({
          branchId: initial.id,
          revision: initial.revision,
          confirmation: 'DELETE LIFE',
        }),
      });
      expect(removed.status).toBe(200);
      const deleted = await fetch(base + '/api/v1/me', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ confirmation: 'DELETE ACCOUNT' }),
      });
      expect(deleted.status).toBe(200);
      expect(
        await db.query('SELECT id FROM ff_users WHERE id=$1', [foreign]),
      ).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
