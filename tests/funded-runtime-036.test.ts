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
  assertReviewedFundedPre038Schema,
} from '../scripts/lib/privacy-recovery-schema';
let engine: PGlite;
const user = randomUUID(),
  member = randomUUID(),
  context = randomUUID();
const input = {
  participants: [{ email: 'pre036@example.invalid', userId: user }],
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
    .filter((n) => n.endsWith('.sql') && Number(n.slice(0, 3)) <= 36)
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
    "INSERT INTO aw_budget_accounts(id,user_id,limit_micro,accounted_micro) VALUES('pre036-project',NULL,2000000,188585),('pre036-user',$1,500000,188585)",
    [user],
  );
  await engine.query(
    `INSERT INTO aw_shared_contexts(id,type,content_locale,title,state,simulation_at,governance) VALUES($1,'friend_group','en','Retained historic context','{"type":"friend_group"}','2026-10-13','{}')`,
    [context],
  );
  await engine.query(
    "INSERT INTO aw_shared_members(id,context_id,context_type,status,admin_role,interaction_profile,sharing_policy_version) VALUES($1,$2,'friend_group','deleted','member','{}','shared-profile-v1')",
    [member, context],
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
it('recognizes only the exact036 funded baseline while normal recovery and037 guards still reject it', async () => {
  await rollback(async (d) => {
    expect((await captureFundedRuntime(d, input)).schema).toBe(36);
    await expect(assertReviewedPrivacyRecoverySchema(d)).rejects.toThrow(
      /columns/,
    );
    await expect(assertReviewedFundedPre038Schema(d)).rejects.toThrow(
      /columns/,
    );
  });
});
it('applies the two exact source migrations atomically and preserves history, cost and existing membership semantics', async () => {
  await rollback(async (d) => {
    const before = await captureFundedRuntime(d, input);
    const result = await migrateFundedRuntime(d, input, before);
    expect(result.schema).toBe(38);
    expect(result.dataSha256).toBe(before.dataSha256);
    expect(result.artifactSha256).toBe(before.artifactSha256);
    expect(
      (
        await d.query(
          'SELECT entitlement_mode FROM aw_shared_members WHERE id=$1',
          [member],
        )
      )[0],
    ).toEqual({ entitlement_mode: 'subscriber' });
    expect(
      (
        await d.query(
          "SELECT accounted_micro::text AS spend FROM aw_budget_accounts WHERE id='pre036-project'",
        )
      )[0],
    ).toEqual({ spend: '188585' });
    expect(
      (await d.query('SELECT name FROM ff_migrations ORDER BY name'))
        .slice(-2)
        .map((r) => r.name),
    ).toEqual([
      '037_shared_sponsored_guest_seats.sql',
      '038_narrative_artifacts.sql',
    ]);
    await assertReviewedPrivacyRecoverySchema(d);
  });
});
it('rejects checksum, column and index drift instead of deriving a permissive expected catalog', async () => {
  for (const sql of [
    "UPDATE ff_migrations SET checksum='tampered' WHERE name LIKE '036%'",
    'ALTER TABLE aw_periods ADD COLUMN unexpected text',
    'CREATE INDEX unreviewed_account_idx ON aw_budget_accounts(accounted_micro)',
  ])
    await engine
      .transaction(async (e) => {
        await e.query(sql);
        await expect(captureFundedRuntime(adapter(e), input)).rejects.toThrow();
        throw Error('test rollback');
      })
      .catch((e) => {
        if (e.message !== 'test rollback') throw e;
      });
});
it('rolls back037 as well when038 fails, without persisting a half-upgraded catalog', async () => {
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
          if (
            sql.includes('ALTER TABLE aw_periods ADD COLUMN narrative_artifact')
          )
            throw Error('injected038 failure');
          return d.query<T>(sql, values);
        },
      };
      await migrateFundedRuntime(injected, input, before);
    }),
  ).rejects.toThrow('injected038 failure');
  expect(
    (await engine.query('SELECT count(*)::int AS n FROM ff_migrations'))
      .rows[0]!.n,
  ).toBe(36);
  expect(
    (
      await engine.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='aw_shared_members' AND column_name='entitlement_mode'",
      )
    ).rows,
  ).toEqual([]);
});
it('refuses any non-default entitlement change during the036 upgrade rather than masking it', async () => {
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
          const result = await d.query<T>(sql, values);
          if (
            sql.includes('ALTER TABLE aw_periods ADD COLUMN narrative_artifact')
          )
            await d.query(
              "UPDATE aw_shared_members SET entitlement_mode='sponsored_guest' WHERE id=$1",
              [member],
            );
          return result;
        },
      };
      await migrateFundedRuntime(injected, input, before);
    }),
  ).rejects.toThrow();
  expect(
    (await engine.query('SELECT count(*)::int AS n FROM ff_migrations'))
      .rows[0]!.n,
  ).toBe(36);
});
