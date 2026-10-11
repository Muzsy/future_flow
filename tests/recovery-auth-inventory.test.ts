import { describe, it, expect } from 'vitest';
import {
  readRecoveryAuthInventory,
  assertRecoveryAuthMatchesDatabase,
  assertRecoveryAuthStable,
} from '../scripts/lib/recovery-auth-inventory';

const now = new Date('2026-10-11T01:00:00Z');
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const user = (id = a, extra: Record<string, unknown> = {}) => ({
  id,
  updated_at: '2026-10-11T00:59:00.123456Z',
  role: 'authenticated',
  email_confirmed_at: '2026-10-10T00:00:00Z',
  ...extra,
});
const page = (
  users: unknown[],
  nextPage: number | null = null,
  total = users.length,
) => ({ error: null, data: { users, nextPage, total } });
const read = (users: unknown[]) =>
  readRecoveryAuthInventory(async () => page(users), now);

describe('independent recovery Auth evidence', () => {
  it('compares exact safe facets and keeps email/token/arbitrary metadata out', async () => {
    const raw = user(a, {
      email: 'private@example.test',
      recovery_token: 'private',
      user_metadata: { private: true },
    });
    const inventory = await read([raw]);
    expect(inventory.eligibleUserIds).toEqual([a]);
    assertRecoveryAuthMatchesDatabase(inventory, [
      user(a, { updated_at: '2026-10-11T00:59:00.123456+00:00' }),
    ]);
    expect(JSON.stringify(inventory)).not.toContain('private');
    expect(() =>
      assertRecoveryAuthMatchesDatabase(inventory, [
        user(a, { updated_at: '2026-10-11T00:59:00.123457Z' }),
      ]),
    ).toThrow('differs');
  });
  it('denies active bans, deleted, unconfirmed and non-authenticated accounts', async () => {
    for (const extra of [
      { banned_until: '2026-10-12T00:00:00Z' },
      { deleted_at: '2026-10-10T00:00:00Z' },
      { email_confirmed_at: null },
      { role: 'service_role' },
    ]) {
      expect((await read([user(a, extra)])).eligibleUserIds).toEqual([]);
    }
    expect(
      (await read([user(a, { banned_until: now.toISOString() })]))
        .eligibleUserIds,
    ).toEqual([a]);
    expect(
      (await read([user(a, { banned_until: '2026-10-11T01:00:00.000001Z' })]))
        .eligibleUserIds,
    ).toEqual([]);
  });
  it('requires independent DB agreement even with missing/default SDK totals', async () => {
    const inventory = await readRecoveryAuthInventory(
      async () => page([user()], null, 0),
      now,
    );
    expect(() =>
      assertRecoveryAuthMatchesDatabase(inventory, [user(), user(b)]),
    ).toThrow('differs');
    expect(() =>
      assertRecoveryAuthMatchesDatabase(inventory, [
        user(a, { banned_until: '2026-10-12T00:00:00Z' }),
      ]),
    ).toThrow('differs');
    expect(() =>
      assertRecoveryAuthMatchesDatabase(inventory, [user(), user()]),
    ).toThrow('Unique');
  });
  it('rejects changing identities and ban/version state between observations', async () => {
    const before = await read([user()]);
    for (const after of [
      await read([user(b)]),
      await read([user(a, { banned_until: '2026-10-12T00:00:00Z' })]),
      await read([user(a, { updated_at: '2026-10-11T00:59:00.123457Z' })]),
    ]) {
      expect(() => assertRecoveryAuthStable(before, after)).toThrow('changed');
    }
    assertRecoveryAuthStable(before, await read([user()]));
  });
  it('checks sequential pagination, duplicates and nonzero totals', async () => {
    const inventory = await readRecoveryAuthInventory(
      async (p) => (p === 1 ? page([user()], 2, 2) : page([user(b)], null, 2)),
      now,
    );
    expect(inventory.pages).toBe(2);
    await expect(
      readRecoveryAuthInventory(async () => page([user()], 3), now),
    ).rejects.toThrow('Sequential');
    await expect(
      readRecoveryAuthInventory(async () => page([user()], 2), now),
    ).rejects.toThrow('Unique');
    await expect(
      readRecoveryAuthInventory(async () => page([user()], null, 2), now),
    ).rejects.toThrow('total');
    await expect(
      readRecoveryAuthInventory(async () => page([], 2), now),
    ).rejects.toThrow('Sequential');
  });
  it('fails closed for provider errors, malformed time, future versions and bounds', async () => {
    await expect(
      readRecoveryAuthInventory(
        async () => ({ ...page([]), error: { message: 'secret' } }),
        now,
      ),
    ).rejects.toThrow('unavailable');
    for (const extra of [
      { banned_until: 'forever' },
      { updated_at: '2026-10-11T01:01:00Z' },
      { updated_at: '2026-10-11T00:59:00.1234567Z' },
      { updated_at: undefined },
    ]) {
      await expect(read([user(a, extra)])).rejects.toThrow();
    }
    await expect(
      readRecoveryAuthInventory(
        async () => page(Array.from({ length: 1001 }, () => user())),
        now,
      ),
    ).rejects.toThrow();
  });
});
