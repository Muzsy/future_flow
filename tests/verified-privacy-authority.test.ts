import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { hash } from '@future-flow/core';
import type { Database } from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { captureVerifiedPrivacyRestoreAuthority } from '../scripts/lib/verified-privacy-authority';
import { readVerifiedPrivacyRestoreAuthoritySnapshot } from '../scripts/lib/privacy-restore';
import {
  recoveryAuthProjectionSql,
  type VerifiedRecoveryAuth,
  readRecoveryAuthInventory,
  verifyRecoveryAuthInventory,
} from '../scripts/lib/recovery-auth-inventory';
let engine: PGlite, records: Record<string, unknown>[];
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
  it('rejects unissued Auth evidence before reading application state', async () => {
    const forbidden: Database = {
      query: async () => {
        throw Error('Should not read');
      },
      transaction: async () => {
        throw Error('Should not read');
      },
    };
    await expect(
      readVerifiedPrivacyRestoreAuthoritySnapshot(
        forbidden,
        { eligibleUserIds: [a] } as VerifiedRecoveryAuth,
        binding,
      ),
    ).rejects.toThrow('Original');
  });
  it('refuses an issued Auth object outside the protected source transaction', async () => {
    const now = new Date(),
      clock = {
        localStartedAt: now.toISOString(),
        localFinishedAt: now.toISOString(),
        databaseAt: now.toISOString(),
      };
    const inventory = await readRecoveryAuthInventory(
      async () => response(records),
      now,
    );
    const verified = verifyRecoveryAuthInventory(
      inventory,
      records,
      inventory,
      clock,
      now,
    );
    await expect(
      readVerifiedPrivacyRestoreAuthoritySnapshot(
        adapter(engine),
        verified,
        binding,
      ),
    ).rejects.toThrow('authority snapshot');
  });
});
