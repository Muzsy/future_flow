import { afterEach, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Repository, type Database } from '@future-flow/database';
import { createApp } from '../apps/api/src/app';

const apps: INestApplication[] = [];
const noDatabase = vi.fn(async () => {
  throw Error('Unauthenticated limit checks must not use the database');
});
const noAuthProvider = vi.fn(async () => {
  throw Error('No provider is available in this fixture');
});
async function fixture(proxyHops: 0 | 1) {
  const database: Database = { query: noDatabase, transaction: noDatabase };
  const app = await createApp(
    new Repository(database),
    { verify: noAuthProvider, deleteUser: noAuthProvider },
    'http://localhost:3000',
    proxyHops,
  );
  apps.push(app);
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  return async (address: string) => {
    const response = await fetch(`${base}/api/v1/me/export`, {
      headers: { 'X-Forwarded-For': address },
    });
    const body = await response.json();
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('cloudflare-cdn-cache-control')).toBe(
      'no-store',
    );
    expect(body.error.code).toBe(
      response.status === 429 ? 'RATE_LIMIT' : 'AUTH_REQUIRED',
    );
    return response;
  };
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  expect(noDatabase).not.toHaveBeenCalled();
  expect(noAuthProvider).not.toHaveBeenCalled();
});

describe('API request limits without database or provider access', () => {
  it('limits one trusted IPv4 client while a different client retains its allowance', async () => {
    const get = await fixture(1);
    for (let n = 0; n < 120; n++)
      expect((await get('198.51.100.20')).status).toBe(401);
    const limited = await get('198.51.100.20');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await get('198.51.100.21')).status).toBe(401);
    expect((await get('198.51.100.20')).status).toBe(429);
  });

  it('cannot escape a direct, untrusted-peer limit by rotating forwarded addresses', async () => {
    const get = await fixture(0);
    for (let n = 0; n < 120; n++)
      expect((await get(`198.51.100.${(n % 100) + 1}`)).status).toBe(401);
    expect((await get('203.0.113.99')).status).toBe(429);
  });

  it('groups IPv6 clients in one /56 while a separate subnet has its own allowance', async () => {
    const get = await fixture(1);
    for (let n = 0; n < 120; n++)
      expect(
        (await get(`2001:db8:1000:1::${(n + 1).toString(16)}`)).status,
      ).toBe(401);
    expect((await get('2001:db8:1000:2::1')).status).toBe(429);
    expect((await get('2001:db8:1000:100::1')).status).toBe(401);
  });
});
