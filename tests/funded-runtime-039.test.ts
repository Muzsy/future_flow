import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { hash } from '@future-flow/core';
import type { Database } from '@future-flow/database';
import {
  captureFundedRuntime,
  migrateFundedRuntime,
} from '../scripts/lib/funded-runtime';
import {
  assertReviewedPrivacyRecoverySchema,
  assertReviewedFundedPre039Schema,
} from '../scripts/lib/privacy-recovery-schema';
import { assertPrivacySecurityCatalog } from '../scripts/lib/privacy-security-catalog';
import {
  billingFoundationState,
  downgradeFixtureTo038,
} from '../scripts/ops/funded-upgrade-fixture-schema';

// The observed production state is 001–038. This is the dedicated 038→039
// upgrade lane: exact preflight, append-only step, empty billing foundation.
let engine: PGlite;
const user = randomUUID();
const input = {
  participants: [{ email: 'pre039@example.invalid', userId: user }],
  connectionHostname: 'synthetic-postgres',
  databaseIdentitySha256: hash(['synthetic-postgres', 'template1', 'postgres']),
};
function adapter(e: Pick<PGlite, 'query' | 'exec'>): Database {
  const d: Database = {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) =>
      values.length
        ? (await e.query<T>(sql, values)).rows
        : (((await e.exec(sql)).at(-1)?.rows ?? []) as T[]),
    transaction: async (run) => run(d),
  };
  return d;
}
beforeAll(async () => {
  engine = new PGlite();
  await engine.waitReady;
  await engine.exec(
    'CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE ff_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());',
  );
  for (const name of readdirSync('database/migrations')
    .filter((n) => n.endsWith('.sql') && Number(n.slice(0, 3)) <= 38)
    .sort()) {
    const sql = readFileSync('database/migrations/' + name, 'utf8').replace(
      /\r\n/g,
      '\n',
    );
    await engine.exec(sql);
    await engine.query(
      'INSERT INTO ff_migrations(name,checksum) VALUES($1,$2)',
      [name, hash(sql)],
    );
  }
  await engine.exec(
    `CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid,email text,aud text,role text,is_anonymous boolean,deleted_at timestamptz,email_confirmed_at timestamptz,last_sign_in_at timestamptz,banned_until timestamptz,email_change text);`,
  );
  await engine.query('INSERT INTO ff_users(id) VALUES($1)', [user]);
  await engine.query(
    "INSERT INTO auth.users VALUES($1,$2,'authenticated','authenticated',false,NULL,now()-interval '1 day',now()-interval '1 hour',NULL,'')",
    [user, input.participants[0]!.email],
  );
  await engine.query(
    "INSERT INTO aw_budget_accounts(id,user_id,limit_micro,accounted_micro) VALUES('pre039-project',NULL,2000000,188585),('pre039-user',$1,500000,188585)",
    [user],
  );
}, 60000);
afterAll(async () => {
  await engine?.close();
});
async function rollback(run: (d: Database) => Promise<void>) {
  await expect(
    engine.transaction(async (e) => {
      await run(adapter(e));
      throw Error('test rollback');
    }),
  ).rejects.toThrow('test rollback');
}
it('recognizes the exact 038 baseline while normal recovery rejects it', async () => {
  await rollback(async (d) => {
    expect((await captureFundedRuntime(d, input)).schema).toBe(38);
    await expect(assertReviewedPrivacyRecoverySchema(d)).rejects.toThrow(
      /table set/,
    );
    await expect(assertPrivacySecurityCatalog(d)).rejects.toThrow(/table set/);
    expect(await assertReviewedFundedPre039Schema(d)).toMatchObject({
      reviewedTables: 96,
      reviewedColumns: 856,
      reviewedForeignKeys: 219,
    });
  });
});
it('appends only 039, keeps every pre-039 row and leaves the billing tables empty and closed to browsers', async () => {
  await rollback(async (d) => {
    const before = await captureFundedRuntime(d, input);
    const after = await migrateFundedRuntime(d, input, before);
    expect(after.schema).toBe(39);
    expect(after.dataSha256).toBe(before.dataSha256);
    expect(after.artifactSha256).toBe(before.artifactSha256);
    expect(after.identityBindingSha256).toBe(before.identityBindingSha256);
    expect(
      (await d.query('SELECT name FROM ff_migrations ORDER BY name'))
        .slice(-2)
        .map((r) => r.name),
    ).toEqual(['038_narrative_artifacts.sql', '039_billing_foundation.sql']);
    expect(
      await d.query(
        "SELECT c.relname::text AS name,c.relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anon,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS authenticated FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'aw_billing_%' AND c.relkind='r' ORDER BY c.relname",
      ),
    ).toEqual(
      [
        'aw_billing_events',
        'aw_billing_grants',
        'aw_billing_reservations',
        'aw_billing_subscriptions',
      ].map((name) => ({
        name,
        rls: true,
        anon: false,
        authenticated: false,
      })),
    );
    await assertReviewedPrivacyRecoverySchema(d);
    await assertPrivacySecurityCatalog(d);
  });
});
it('refuses a source that drifted between preflight and migration', async () => {
  const before = await engine.transaction((e) =>
    captureFundedRuntime(adapter(e), input),
  );
  await expect(
    engine.transaction(async (e) => {
      await e.query(
        "UPDATE aw_budget_accounts SET accounted_micro=188586 WHERE id='pre039-user'",
      );
      await migrateFundedRuntime(adapter(e), input, before);
    }),
  ).rejects.toThrow(/source drift/);
});
it('rolls back completely if the billing step fails halfway', async () => {
  await expect(
    engine.transaction(async (e) => {
      const d = adapter(e),
        before = await captureFundedRuntime(d, input);
      const injected = {
        ...d,
        query: async <T extends Record<string, unknown>>(
          sql: string,
          values: unknown[] = [],
        ) => {
          if (sql.includes('CREATE TABLE aw_billing_events'))
            throw Error('injected039 failure');
          return d.query<T>(sql, values);
        },
      };
      await migrateFundedRuntime(injected, input, before);
    }),
  ).rejects.toThrow('injected039 failure');
  expect(
    (await engine.query('SELECT count(*)::int AS n FROM ff_migrations'))
      .rows[0]!.n,
  ).toBe(38);
  expect(
    (
      await engine.query(
        "SELECT 1 FROM information_schema.tables WHERE table_name LIKE 'aw_billing_%'",
      )
    ).rows,
  ).toEqual([]);
});
it('the fixture-only inverse returns a migrated database to the exact reviewed 038 state, repeatably', async () => {
  await rollback(async (d) => {
    const before = await captureFundedRuntime(d, input);
    expect(before.schema).toBe(38);
    const migrated = await migrateFundedRuntime(d, input, before);
    expect(await billingFoundationState(d)).toHaveLength(4);
    await downgradeFixtureTo038(d);
    expect(await billingFoundationState(d)).toEqual([]);
    const back = await captureFundedRuntime(d, input);
    expect(back).toEqual(before);
    expect(back.catalogSha256).not.toBe(migrated.catalogSha256);
    // The real migration applies again, with the same protected-data result.
    const again = await migrateFundedRuntime(d, input, back);
    expect(again).toEqual(migrated);
    expect(await billingFoundationState(d)).toEqual(
      [
        'aw_billing_events',
        'aw_billing_grants',
        'aw_billing_reservations',
        'aw_billing_subscriptions',
      ].map((name) => ({ name, rls: true, populated: false })),
    );
  });
}, 120000);
it('the fixture-only inverse refuses a non-039 or populated billing foundation', async () => {
  await rollback(async (d) => {
    await expect(downgradeFixtureTo038(d)).rejects.toThrow(
      /exactly schema 039/,
    );
    const before = await captureFundedRuntime(d, input);
    await migrateFundedRuntime(d, input, before);
    await d.query(
      "INSERT INTO aw_billing_subscriptions(subscription_id,user_id,customer_id,status,last_state_event_created) VALUES('sub_x',$1,'cus_x','active',1)",
      [user],
    );
    await expect(downgradeFixtureTo038(d)).rejects.toThrow(/empty billing/);
  });
}, 120000);
