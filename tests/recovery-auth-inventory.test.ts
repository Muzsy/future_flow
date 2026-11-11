import { describe, it, expect } from 'vitest';
import {
  readRecoveryAuthInventory,
  assertRecoveryAuthMatchesDatabase,
  assertRecoveryAuthStable,
  verifyRecoveryAuthInventory,
  assertVerifiedRecoveryAuth,
} from '../scripts/lib/recovery-auth-inventory';

const now = new Date('2026-10-11T01:00:00Z');
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const user = (id = a, extra: Record<string, unknown> = {}) => ({
  id,
  updated_at: '2026-10-11T00:59:00.123456Z',
  role: 'authenticated',
  is_anonymous: false,
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
const clocks = {
  localStartedAt: now.toISOString(),
  localFinishedAt: now.toISOString(),
  databaseAt: now.toISOString(),
};
async function verified(users: unknown[]) {
  const inventory = await read(users);
  return verifyRecoveryAuthInventory(
    inventory,
    users,
    await read(users),
    clocks,
    now,
  );
}

describe('independent recovery Auth evidence', () => {
  it('compares exact safe facets and keeps email/token/arbitrary metadata out', async () => {
    const raw = user(a, {
      email: 'private@example.test',
      recovery_token: 'private',
      user_metadata: { private: true },
    });
    const inventory = await read([raw]);
    expect(inventory).not.toHaveProperty('eligibleUserIds');
    expect(Object.isFrozen(inventory)).toBe(true);
    expect(Object.isFrozen(inventory.users)).toBe(true);
    expect(Object.isFrozen(inventory.users[0])).toBe(true);
    expect((await verified([raw])).eligibleUserIds).toEqual([a]);
    assertRecoveryAuthMatchesDatabase(inventory, [
      user(a, { updated_at: '2026-10-11T02:59:00.123456+02:00' }),
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
      { is_anonymous: true },
      { is_anonymous: undefined },
      { is_anonymous: null },
    ]) {
      expect((await verified([user(a, extra)])).eligibleUserIds).toEqual([]);
    }
    expect(
      (await verified([user(a, { banned_until: now.toISOString() })]))
        .eligibleUserIds,
    ).toEqual([a]);
    expect(
      (
        await verified([
          user(a, { banned_until: '2026-10-11T01:00:00.000001Z' }),
        ])
      ).eligibleUserIds,
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
      await read([user(a, { is_anonymous: true })]),
      await read([user(a, { email_confirmed_at: null })]),
      await read([user(a, { deleted_at: now.toISOString() })]),
      await read([user(a, { role: 'anon' })]),
    ]) {
      expect(() => assertRecoveryAuthStable(before, after)).toThrow('changed');
    }
    assertRecoveryAuthStable(before, await read([user()]));
  });
  it('exposes eligibility only after complete, stable DB agreement', async () => {
    const inventory = await read([user()]);
    for (const extra of [
      { role: 'anon' },
      { is_anonymous: true },
      { deleted_at: now.toISOString() },
      { email_confirmed_at: null },
    ]) {
      expect(() =>
        verifyRecoveryAuthInventory(
          inventory,
          [user(a, extra)],
          inventory,
          clocks,
          now,
        ),
      ).toThrow('differs');
      expect(() =>
        verifyRecoveryAuthInventory(
          inventory,
          [user()],
          { ...inventory, digest: '0'.repeat(64) },
          clocks,
          now,
        ),
      ).toThrow('changed');
    }
  });
  it('rejects cloned eligibility objects and freezes issued evidence at runtime', async () => {
    const observation = await verified([user()]);
    assertVerifiedRecoveryAuth(observation);
    expect(Object.isFrozen(observation)).toBe(true);
    expect(Object.isFrozen(observation.eligibleUserIds)).toBe(true);
    expect(() => assertVerifiedRecoveryAuth({ ...observation })).toThrow(
      'Original',
    );
    expect(() => assertVerifiedRecoveryAuth({ eligibleUserIds: [a] })).toThrow(
      'Original',
    );
    expect(() => {
      (observation.eligibleUserIds as string[]).push(b);
    }).toThrow();
    expect(() => {
      observation.digest = '0'.repeat(64);
    }).toThrow();
  });
  it('rejects clocks ahead or behind and retains bans at the earlier allowed clock', async () => {
    const raw = user(a, { banned_until: '2026-10-11T01:00:05Z' });
    const inventory = await read([raw]);
    const ahead = new Date('2026-10-11T01:00:10Z');
    const bad = {
      ...clocks,
      localStartedAt: ahead.toISOString(),
      localFinishedAt: ahead.toISOString(),
    };
    expect(() =>
      verifyRecoveryAuthInventory(inventory, [raw], inventory, bad, ahead),
    ).toThrow('clock agreement');
    expect(() =>
      verifyRecoveryAuthInventory(
        inventory,
        [raw],
        inventory,
        { ...clocks, databaseAt: ahead.toISOString() },
        ahead,
      ),
    ).toThrow('clock agreement');
    const slightAhead = new Date('2026-10-11T01:00:01Z');
    const valid = {
      ...clocks,
      localStartedAt: slightAhead.toISOString(),
      localFinishedAt: slightAhead.toISOString(),
    };
    const observation = verifyRecoveryAuthInventory(
      inventory,
      [raw],
      inventory,
      valid,
      slightAhead,
    );
    expect(observation.eligibleUserIds).toEqual([]);
    expect(observation.bannedUsers).toBe(1);
    for (const invalid of [
      { ...clocks, localFinishedAt: '2026-10-11T00:59:59Z' },
      { ...clocks, localFinishedAt: '2026-10-11T01:00:11Z' },
    ])
      expect(() =>
        verifyRecoveryAuthInventory(
          inventory,
          [raw],
          inventory,
          invalid,
          ahead,
        ),
      ).toThrow('clock agreement');
    expect(() =>
      verifyRecoveryAuthInventory(
        inventory,
        [raw],
        inventory,
        clocks,
        new Date('2026-10-11T01:16:00Z'),
      ),
    ).toThrow('clock agreement');
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
      { banned_until: 'infinity' },
      { updated_at: null },
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
