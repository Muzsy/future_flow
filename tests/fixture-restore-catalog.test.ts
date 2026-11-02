import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { Database } from '@future-flow/database';
import { fixtureRestoreCatalog } from '../scripts/ops/funded-upgrade-fixture-catalog';
let client: PGlite;
function adapter(pg: Pick<PGlite, 'query'>): Database {
  const db: Database = {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) => (await pg.query<T>(sql, values)).rows,
    transaction: (run) => run(db),
  };
  return db;
}
async function capture() {
  return client.transaction(async (tx) => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    return fixtureRestoreCatalog(adapter(tx));
  });
}
beforeAll(async () => {
  client = new PGlite();
  await client.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE public.aw_fixture_acl(id integer);
    CREATE SEQUENCE public.aw_fixture_sequence;
    CREATE FUNCTION public.fixture_acl_fn() RETURNS integer LANGUAGE sql AS 'SELECT 1';`);
});
afterAll(async () => {
  await client.close();
});
describe('fixture binary-restore catalog semantics, never production promotion', () => {
  it('compares default grants equally after a normal grant/revoke round trip', async () => {
    const before = await capture();
    await client.exec(
      'GRANT SELECT ON public.aw_fixture_acl TO anon; REVOKE SELECT ON public.aw_fixture_acl FROM anon;',
    );
    expect(await capture()).toEqual(before);
  });
  it('retains recipients, privileges, grant options and sequence permissions', async () => {
    const before = await capture();
    await client.exec('GRANT SELECT ON public.aw_fixture_acl TO anon;');
    const granted = await capture();
    expect(granted).not.toEqual(before);
    await client.exec(
      'GRANT SELECT ON public.aw_fixture_acl TO anon WITH GRANT OPTION;',
    );
    expect(await capture()).not.toEqual(granted);
    await client.exec('REVOKE SELECT ON public.aw_fixture_acl FROM anon;');
    expect(await capture()).toEqual(before);
    await client.exec(
      'GRANT USAGE ON SEQUENCE public.aw_fixture_sequence TO authenticated;',
    );
    expect(await capture()).not.toEqual(before);
    await client.exec(
      'REVOKE USAGE ON SEQUENCE public.aw_fixture_sequence FROM authenticated;',
    );
    expect(await capture()).toEqual(before);
  });
  it('compares all equivalent grants equally when their ACL entry order changes', async () => {
    await client.exec(
      'GRANT SELECT ON public.aw_fixture_acl TO anon; GRANT SELECT ON public.aw_fixture_acl TO authenticated;',
    );
    const before = await capture();
    await client.exec(
      'REVOKE SELECT ON public.aw_fixture_acl FROM anon; REVOKE SELECT ON public.aw_fixture_acl FROM authenticated; GRANT SELECT ON public.aw_fixture_acl TO authenticated; GRANT SELECT ON public.aw_fixture_acl TO anon;',
    );
    expect(await capture()).toEqual(before);
    await client.exec(
      'REVOKE SELECT ON public.aw_fixture_acl FROM anon; REVOKE SELECT ON public.aw_fixture_acl FROM authenticated;',
    );
  });
  it('retains executable, row-security and schema-usage changes', async () => {
    const before = await capture();
    await client.exec(
      'ALTER TABLE public.aw_fixture_acl ENABLE ROW LEVEL SECURITY;',
    );
    expect(await capture()).not.toEqual(before);
    await client.exec(
      'ALTER TABLE public.aw_fixture_acl DISABLE ROW LEVEL SECURITY;',
    );
    expect(await capture()).toEqual(before);
    await client.exec(
      'REVOKE EXECUTE ON FUNCTION public.fixture_acl_fn() FROM PUBLIC;',
    );
    expect(await capture()).not.toEqual(before);
    await client.exec(
      'GRANT EXECUTE ON FUNCTION public.fixture_acl_fn() TO PUBLIC;',
    );
    expect(await capture()).toEqual(before);
    await client.exec('REVOKE USAGE ON SCHEMA public FROM PUBLIC;');
    expect(await capture()).not.toEqual(before);
    await client.exec('GRANT USAGE ON SCHEMA public TO PUBLIC;');
    expect(await capture()).toEqual(before);
  });
  it('refuses an inconsistent or writable caller snapshot', async () => {
    await expect(fixtureRestoreCatalog(adapter(client))).rejects.toThrow(
      /read-only consistent/i,
    );
    await client.transaction(async (tx) => {
      await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await expect(fixtureRestoreCatalog(adapter(tx))).rejects.toThrow(
        /read-only consistent/i,
      );
    });
  });
});
