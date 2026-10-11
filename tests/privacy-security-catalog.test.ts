import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { Database } from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  assertPrivacySecurityCatalog,
  hardenPrivacyQuarantine,
} from '../scripts/lib/privacy-security-catalog';

let engine: PGlite;
const name = 'aw_restore_' + 'a'.repeat(24);
function adapter(client: Pick<PGlite, 'query'>, quarantine = false): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) =>
      // PGlite's database name alone is simulated. The existing physical PG
      // runner verifies the real source/target names and the same replay path.
      sql === 'SELECT current_database() AS name' && quarantine
        ? ([{ name }] as unknown as T[])
        : (await client.query<T>(sql, values)).rows,
    transaction: (run) => run(adapter(client, quarantine)),
  };
}
beforeAll(async () => {
  engine = new PGlite();
  await engine.waitReady;
  await engine.exec(
    'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;',
  );
  await applyMigrations(engine);
}, 60000);
afterAll(async () => {
  await engine?.close();
});
const source = () =>
  engine.transaction((tx) => assertPrivacySecurityCatalog(adapter(tx)));
const changed = (sql: string) =>
  engine.transaction(async (tx) => {
    await tx.exec(sql);
    return assertPrivacySecurityCatalog(adapter(tx));
  });
describe('executable and privilege catalog before privacy recovery', () => {
  it('accepts only the separately reviewed actual migration catalog', async () => {
    expect(await source()).toMatchObject({
      schemaVersion: 'privacy-security-catalog-1',
    });
  });
  it('rejects a trigger disable and altered executable body before replay', async () => {
    await expect(
      changed('ALTER TABLE aw_lives DISABLE TRIGGER USER'),
    ).rejects.toThrow('executable catalog');
    await expect(
      changed(
        "CREATE FUNCTION public.unreviewed_action() RETURNS int LANGUAGE SQL SECURITY DEFINER AS 'SELECT 1'",
      ),
    ).rejects.toThrow('executable catalog');
    expect(await source()).toMatchObject({
      schemaVersion: 'privacy-security-catalog-1',
    });
  });
  it('rejects changed constraints, defaults, indexes, policies and rewrite rules', async () => {
    for (const sql of [
      "ALTER TABLE ff_users ALTER COLUMN status SET DEFAULT 'deleting'",
      'CREATE INDEX extra_recovery_index ON ff_users(status)',
      "ALTER TABLE ff_users ADD CONSTRAINT changed_check CHECK(status<>'unreviewed')",
      'CREATE POLICY stale_access ON ff_users TO authenticated USING(true)',
      'CREATE RULE hide_deletion AS ON DELETE TO ff_users DO INSTEAD NOTHING',
    ])
      await expect(changed(sql)).rejects.toThrow('executable catalog');
  });
  it('rejects browser column access, MAINTAIN and dangerous role inheritance', async () => {
    await expect(
      changed('GRANT SELECT(handle) ON aw_social_profiles TO authenticated'),
    ).rejects.toThrow('privileges');
    await expect(changed('GRANT MAINTAIN ON ff_users TO anon')).rejects.toThrow(
      'privileges',
    );
    await expect(
      changed('GRANT pg_read_all_data TO authenticated'),
    ).rejects.toThrow('privileges');
    await expect(changed('ALTER ROLE anon BYPASSRLS')).rejects.toThrow(
      'privileges',
    );
    await expect(
      changed('ALTER TABLE ff_users OWNER TO authenticated'),
    ).rejects.toThrow('privileges');
  });
  it('binds a change in known source default grants without copying them to the target', async () => {
    const before = await source();
    await engine
      .transaction(async (tx) => {
        await tx.exec(
          'ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO anon',
        );
        const after = await assertPrivacySecurityCatalog(adapter(tx));
        expect(after.immutableDigest).toBe(before.immutableDigest);
        expect(after.sourcePrivilegesDigest).not.toBe(
          before.sourcePrivilegesDigest,
        );
        throw Error('rollback intentional');
      })
      .catch((error) => {
        expect(error.message).toBe('rollback intentional');
      });
  });
  it('requires the actual quarantine name before any privilege changes', async () => {
    await expect(
      engine.transaction((tx) => hardenPrivacyQuarantine(adapter(tx), name)),
    ).rejects.toThrow('dedicated quarantine');
    expect(await source()).toMatchObject({
      schemaVersion: 'privacy-security-catalog-1',
    });
  });
  it('allows the hosted source timeout while refusing unreviewed role settings', async () => {
    await engine
      .transaction(async (tx) => {
        await tx.exec("ALTER ROLE anon SET statement_timeout='3s'");
        expect(await assertPrivacySecurityCatalog(adapter(tx))).toMatchObject({
          schemaVersion: 'privacy-security-catalog-1',
        });
        throw Error('rollback intentional');
      })
      .catch((error) => {
        expect(error.message).toBe('rollback intentional');
      });
    await expect(
      changed("ALTER ROLE authenticated SET search_path='public'"),
    ).rejects.toThrow('privileges');
  });
  it('revokes default function execution and verifies the committed quarantine independently', async () => {
    const fresh = await source();
    await expect(
      engine.transaction((tx) =>
        assertPrivacySecurityCatalog(adapter(tx), 'quarantine', fresh),
      ),
    ).rejects.toThrow('privileges');
    await engine
      .transaction(async (tx) => {
        await tx.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
        await hardenPrivacyQuarantine(adapter(tx, true), name);
        expect(
          await assertPrivacySecurityCatalog(adapter(tx), 'quarantine', fresh),
        ).toMatchObject({ immutableDigest: fresh.immutableDigest });
        const [row] = (
          await tx.query<{ allowed: boolean }>(
            "SELECT has_function_privilege('authenticated',p.oid,'EXECUTE') AS allowed FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' LIMIT 1",
          )
        ).rows;
        expect(row?.allowed).toBe(false);
        throw Error('rollback intentional');
      })
      .catch((error) => {
        expect(error.message).toBe('rollback intentional');
      });
  });
  it('rejects unexpected column/default grants and a grantable schema permission', async () => {
    for (const sql of [
      'CREATE ROLE restored_extra; GRANT SELECT(handle) ON aw_social_profiles TO restored_extra',
      'CREATE ROLE restored_extra; ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO restored_extra',
      'GRANT CREATE ON SCHEMA public TO authenticated WITH GRANT OPTION',
    ])
      await expect(changed(sql)).rejects.toThrow('privileges');
  });
  it('accepts only the harmless optional migration ledger, with reviewed defaults and indexes', async () => {
    await engine.exec(
      'CREATE TABLE ff_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    expect(await source()).toMatchObject({
      schemaVersion: 'privacy-security-catalog-1',
    });
    await expect(
      changed(
        'ALTER TABLE ff_migrations ALTER COLUMN applied_at SET DEFAULT clock_timestamp()',
      ),
    ).rejects.toThrow('metadata ledger');
    await expect(
      changed(
        'CREATE INDEX ledger_unreviewed_index ON ff_migrations(checksum)',
      ),
    ).rejects.toThrow('metadata ledger');
  });
});
