import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { DomainError, billingConfigFromEnv } from '@future-flow/core';
import {
  Repository,
  configureGenerationGate,
  type Database,
} from '@future-flow/database';
import { createApp } from '../apps/api/src/app';
import { createBillingRuntime } from '../apps/api/src/billing';

const owner = '11111111-1111-4111-8111-111111111111';
const token = 'test.verified_provider_identity.token';
const unsupported = [
  '/api/v1/futures',
  `/api/v1/decisions/${owner}/resolve`,
  `/api/v2/shared-contexts/${owner}/continue`,
  `/api/v2/public-previews/${owner}/review-job`,
  `/api/v2/public-content-bundles/${owner}/review-job`,
];
const personal = [
  '/api/v2/lives',
  `/api/v2/scenario-versions/${owner}/start`,
  `/api/v2/branches/${owner}/continue`,
  `/api/v2/branches/${owner}/periods/${owner}/fork`,
  `/api/v2/jobs/${owner}/retry`,
  '/api/v2/personal-scenarios/sources/example/start',
  '/api/v2/public-forks/example',
];

async function boot(enforcement: boolean) {
  const db: Database = {
    query: async () => {
      throw Error('Unexpected SQL: guard must settle the request first.');
    },
    transaction: (run) => run(db),
  };
  const repo = new Repository(db);
  // This sentinel proves the real Nest guard accepted the route. Stop before
  // body handlers, SQL, billing or providers, rather than mocking that guard.
  const ensure = vi.spyOn(repo, 'ensureUser').mockImplementation(async () => {
    throw new DomainError('TEST_GUARD_PASSED', 'Verified route boundary.', 409);
  });
  const args: Parameters<typeof createApp> = [
    repo,
    {
      verify: async (value) => {
        if (value !== token)
          throw new DomainError('AUTH_INVALID', 'Invalid token.', 401);
        return { id: owner };
      },
      deleteUser: async () => {},
    },
  ];
  args[24] = { enabled: false, userIds: [] };
  args[25] = { enabled: false, verify: async () => true };
  args[26] = createBillingRuntime(
    db,
    billingConfigFromEnv({
      BILLING_ENABLED: 'false',
      BILLING_ENFORCEMENT: String(enforcement),
    }),
  );
  const app = await createApp(...args);
  await app.listen(0, '127.0.0.1');
  return { app, ensure, base: await app.getUrl() };
}
type Harness = Awaited<ReturnType<typeof boot>>;
let h: Harness;
const post = (harness: Harness, path: string, body: unknown = {}) =>
  fetch(harness.base + path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  h = await boot(true);
});
beforeEach(() => {
  h.ensure.mockClear();
});
afterAll(async () => {
  await h?.app.close();
  configureGenerationGate(null);
});

describe('chapter enforcement at the actual API handler boundary', () => {
  it.each(unsupported)(
    'rejects unsupported generation before account/queue mutation: %s',
    async (path) => {
      const response = await post(h, path);
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe(
        'GENERATION_ROUTE_UNAVAILABLE',
      );
      expect(h.ensure).not.toHaveBeenCalled();
    },
  );
  it.each(personal)(
    'lets the ledger-backed route reach existing guards: %s',
    async (path) => {
      const response = await post(h, path);
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('TEST_GUARD_PASSED');
      expect(h.ensure).toHaveBeenCalledExactlyOnceWith(owner);
    },
  );
  it('uses handler metadata despite forged body claims, route casing and a trailing slash', async () => {
    const response = await post(h, '/API/V1/FUTURES/', {
      chapterBilled: true,
      user_metadata: { paid: true },
    });
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe(
      'GENERATION_ROUTE_UNAVAILABLE',
    );
    expect(h.ensure).not.toHaveBeenCalled();
  });
  it('preserves authentication before classification', async () => {
    const response = await fetch(h.base + unsupported[0], { method: 'POST' });
    expect(response.status).toBe(401);
    expect(h.ensure).not.toHaveBeenCalled();
  });
  it('does not turn saved-story reading into a billing gate', async () => {
    const response = await fetch(h.base + '/api/v1/futures', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('TEST_GUARD_PASSED');
  });
  it('preserves the previous route boundaries when enforcement is off', async () => {
    const legacy = await boot(false);
    try {
      for (const path of unsupported) {
        legacy.ensure.mockClear();
        const response = await post(legacy, path);
        expect(response.status).toBe(409);
        expect((await response.json()).error.code).toBe('TEST_GUARD_PASSED');
        expect(legacy.ensure).toHaveBeenCalledExactlyOnceWith(owner);
      }
    } finally {
      await legacy.app.close();
    }
  });
});
