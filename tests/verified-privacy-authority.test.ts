import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { hash } from '@future-flow/core';
import { LifeRepository, type Database } from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { captureVerifiedPrivacyRestoreAuthority } from '../scripts/lib/verified-privacy-authority';
import { recoveryAuthProjectionSql } from '../scripts/lib/recovery-auth-inventory';
import { setupFixture } from './life-fixtures';
let engine: PGlite, records: Record<string, unknown>[], bannedLife: string;
const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const binding = {
  projectBinding: hash('synthetic-project'),
  writerFenceDigest: hash('synthetic-fence-only'),
};
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
const response = (users: unknown[]) => ({
  error: null,
  data: { users, nextPage: null, total: users.length },
});
beforeAll(async () => {
  engine = new PGlite();
  await engine.waitReady;
  await engine.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
  await applyMigrations(engine);
  await engine.exec(
    'CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,updated_at timestamptz NOT NULL,banned_until timestamptz,deleted_at timestamptz,email_confirmed_at timestamptz,role text,is_anonymous boolean);',
  );
  await engine.query('INSERT INTO ff_users(id) VALUES($1),($2)', [a, b]);
  await engine.query(
    "INSERT INTO ff_consents(id,user_id,policy_version,consent_type) VALUES($1,$1,'alpha-privacy-v1','adult_and_ai_acknowledgement'),($2,$2,'alpha-privacy-v1','adult_and_ai_acknowledgement')",
    [a, b],
  );
  bannedLife = (
    await new LifeRepository(adapter(engine)).create(
      b,
      setupFixture('en'),
      '2026-01-01',
    )
  ).lifeId;
  await engine.query(
    'INSERT INTO aw_user_blocks(user_id,blocked_user_id) VALUES($1,$2)',
    [b, a],
  );
  await engine.query(
    "INSERT INTO aw_budget_accounts(id,user_id,limit_micro,accounted_micro) VALUES('banned-user-budget',$1,1000000,50)",
    [b],
  );
  await engine.query(
    "INSERT INTO auth.users(id,updated_at,email_confirmed_at,role,is_anonymous,banned_until) VALUES($1,now(),now(),'authenticated',false,NULL),($2,now(),now(),'authenticated',false,now()+interval '1 day')",
    [a, b],
  );
  records = (
    await engine.query<{ record: Record<string, unknown> }>(
      recoveryAuthProjectionSql,
    )
  ).rows.map((row) => row.record);
}, 60000);
afterAll(async () => {
  await engine?.close();
});
describe('verified Auth bound to one application authority snapshot', () => {
  it('excludes banned app-active users and strips unrelated Auth private data', async () => {
    let reads = 0;
    const result = await captureVerifiedPrivacyRestoreAuthority(
      adapter(engine),
      async () => {
        reads++;
        return response(
          records.map((row) => ({
            ...row,
            email: 'private@example.test',
            recovery_token: 'DO_NOT_EXPORT',
          })),
        );
      },
      binding,
    );
    expect(reads).toBe(3);
    expect(result.authority.activeUserIds).toEqual([a]);
    expect(result.authority.lives.some((r) => r.id === bannedLife)).toBe(false);
    expect(result.authority.blocks).toEqual([]);
    expect(
      result.authority.budgetAccounts.some(
        (r) => r.id === 'banned-user-budget',
      ),
    ).toBe(false);
    expect(result).toMatchObject({
      independentAuthStateVerified: true,
      singleReadOnlySourceSnapshot: true,
      serviceActivationAllowed: false,
    });
    expect(JSON.stringify(result)).not.toMatch(/private@|DO_NOT_EXPORT/);
  });
  it('refuses a ban changed during the final API observation', async () => {
    let reads = 0;
    await expect(
      captureVerifiedPrivacyRestoreAuthority(
        adapter(engine),
        async () =>
          response(
            ++reads === 3
              ? records.map((row) => ({
                  ...row,
                  banned_until: '2099-01-01T00:00:00Z',
                }))
              : records,
          ),
        binding,
      ),
    ).rejects.toThrow('changed');
  });
  it('refuses an Auth state that disagrees with the source snapshot', async () => {
    await expect(
      captureVerifiedPrivacyRestoreAuthority(
        adapter(engine),
        async () =>
          response(records.map((row) => ({ ...row, is_anonymous: true }))),
        binding,
      ),
    ).rejects.toThrow('differs');
  });
  it('aborts the transaction if the second API observation fails', async () => {
    let reads = 0;
    await expect(
      captureVerifiedPrivacyRestoreAuthority(
        adapter(engine),
        async () =>
          ++reads === 2
            ? {
                error: 'unavailable',
                data: { users: [], nextPage: null, total: 0 },
              }
            : response(records),
        binding,
      ),
    ).rejects.toThrow('unavailable');
    expect(reads).toBe(2);
    expect(
      (await engine.query('SELECT count(*)::int AS n FROM ff_users')).rows[0]
        ?.n,
    ).toBe(2);
  });
});
