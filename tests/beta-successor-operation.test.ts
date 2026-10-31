import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, it, expect } from 'vitest';
import { hash } from '@future-flow/core';
import { LifeRepository, type Database } from '@future-flow/database';
import { setupFixture } from './life-fixtures';
import { successorPlan } from '../scripts/lib/beta-successor';
import {
  captureSuccessorOperation,
  applySuccessorOperation,
  reconcileSuccessorOperation,
  successorDatabaseRequest,
} from '../scripts/lib/beta-successor-operation';
const users = Array.from({ length: 3 }, (_, i) => ({
  email: `operation${i}@example.invalid`,
  userId: randomUUID(),
}));
const identity = {
  connectionHostname: 'synthetic-postgres',
  databaseIdentitySha256: hash(['synthetic-postgres', 'template1', 'postgres']),
};
let engine: PGlite;
function adapter(e: Pick<PGlite, 'query'>): Database {
  const db: Database = {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) => (await e.query<T>(sql, values)).rows,
    transaction: async (run) => run(db),
  };
  return db;
}
beforeAll(async () => {
  engine = new PGlite();
  await engine.waitReady;
  await engine.exec(
    'CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE ff_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());',
  );
  for (const name of readdirSync('database/migrations')
    .filter((n) => n.endsWith('.sql'))
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
  await engine.exec(`CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid,email text,aud text,role text,is_anonymous boolean,
    deleted_at timestamptz,email_confirmed_at timestamptz,last_sign_in_at timestamptz,banned_until timestamptz,email_change text);`);
  for (const p of users) {
    await engine.query('INSERT INTO ff_users(id) VALUES($1)', [p.userId]);
    await engine.query(
      "INSERT INTO auth.users VALUES($1,$2,'authenticated','authenticated',false,NULL,now()-interval '1 day',now()-interval '1 hour',NULL,'')",
      [p.userId, p.email],
    );
  }
}, 60000);
afterAll(async () => {
  await engine?.close();
});
afterEach(async () => {
  await engine.exec(
    'DELETE FROM aw_budget_reservations;DELETE FROM aw_budget_accounts',
  );
});
function input() {
  const now = Date.now(),
    iso = (t: number) => new Date(t).toISOString();
  const previous = {
    participants: [users[0]!],
    projectUsd: '2',
    userUsd: '0.50',
    startsAt: iso(now - 86400000),
    endsAt: iso(now + 29 * 86400000),
  };
  const selection = {
    purpose: 'tester-beta' as const,
    previousTermsSha256: hash(previous),
    closePreviousAt: iso(now + 300),
    next: {
      participants: users,
      projectUsd: '10',
      userUsd: '3.33',
      startsAt: iso(now + 60000),
      endsAt: iso(now + 60000 + 30 * 86400000),
    },
  };
  return {
    previous,
    selection,
    plan: successorPlan(previous, selection, iso(now)),
  };
}
async function seed(tx: Database, i: ReturnType<typeof input>) {
  await tx.query(
    `INSERT INTO aw_budget_accounts(id,user_id,limit_micro,accounted_micro) VALUES($1,NULL,2000000,188585),($2,$3,500000,188585)`,
    [
      i.plan.previousKeys.project,
      i.plan.previousKeys.users[0],
      users[0]!.userId,
    ],
  );
  await tx.query(
    `INSERT INTO aw_budget_reservations(id,user_id,project_key,user_key,job_id,model,task,reserved_micro,accounted_micro,status,input_tokens,output_tokens,settled_at)
    VALUES($1,$2,$3,$4,$5,'gpt-6.1-sol','history',200000,188585,'completed',100,200,now())`,
    [
      randomUUID(),
      users[0]!.userId,
      i.plan.previousKeys.project,
      i.plan.previousKeys.users[0],
      randomUUID(),
    ],
  );
}
async function tx<T>(run: (db: Database) => Promise<T>) {
  return engine.transaction(async (e) => {
    await e.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    return run(adapter(e));
  });
}
async function ready(i: ReturnType<typeof input>) {
  await delay(
    Math.max(0, Date.parse(i.selection.closePreviousAt) - Date.now() + 10),
  );
}

it('binds schema039, actual Auth identities and all non-account rows around the accounting mutation', async () => {
  const i = input();
  await seed(adapter(engine), i);
  const expected = await tx((d) =>
    captureSuccessorOperation(d, i.previous, i.selection, identity),
  );
  expect(expected.runtime.schema).toBe(39);
  expect(expected.runtime.drained).toBe(true);
  const history = (await engine.query('SELECT * FROM aw_budget_reservations'))
    .rows;
  await ready(i);
  const result = await tx((d) =>
    applySuccessorOperation(d, i.previous, i.selection, identity, expected),
  );
  expect(result.state).toBe('committed');
  expect(result.protectedDataUnchanged).toBe(true);
  expect(
    (await engine.query('SELECT * FROM aw_budget_reservations')).rows,
  ).toEqual(history);
  // Simulate lost stdout after COMMIT: a separate transaction recognizes the
  // committed state; no second apply and no account-reset is performed.
  const rows = (
    await engine.query('SELECT * FROM aw_budget_accounts ORDER BY id')
  ).rows;
  expect(
    (
      await tx((d) =>
        reconcileSuccessorOperation(
          d,
          i.previous,
          i.selection,
          identity,
          expected,
        ),
      )
    ).state,
  ).toBe('committed');
  await expect(
    tx((d) =>
      applySuccessorOperation(d, i.previous, i.selection, identity, expected),
    ),
  ).rejects.toThrow();
  expect(
    (await engine.query('SELECT * FROM aw_budget_accounts ORDER BY id')).rows,
  ).toEqual(rows);
});
it('moves funding from a technical account to the authenticated owner without moving its spend or history', async () => {
  const i = input();
  const selection = {
    ...i.selection,
    purpose: 'owner-e2e' as const,
    next: {
      ...i.selection.next,
      participants: [users[1]!],
      projectUsd: '3',
      userUsd: '3',
    },
  };
  await seed(adapter(engine), i);
  const expected = await tx((d) =>
    captureSuccessorOperation(d, i.previous, selection, identity),
  );
  const history = (await engine.query('SELECT * FROM aw_budget_reservations'))
    .rows;
  await ready(i);
  const result = await tx((d) =>
    applySuccessorOperation(d, i.previous, selection, identity, expected),
  );
  expect(result.state).toBe('committed');
  const accounts = (
    await engine.query<{
      id: string;
      user_id: string | null;
      limit_micro: string;
      accounted_micro: string;
    }>(
      'SELECT id,user_id,limit_micro::text,accounted_micro::text FROM aw_budget_accounts ORDER BY id',
    )
  ).rows;
  expect(accounts).toHaveLength(4);
  for (const id of [i.plan.previousKeys.project, i.plan.previousKeys.users[0]])
    expect(accounts.find((a) => a.id === id)).toMatchObject({
      limit_micro: '0',
      accounted_micro: '188585',
    });
  const fresh = accounts.filter((a) => a.id.includes(selection.next.startsAt));
  expect(fresh).toHaveLength(2);
  expect(
    fresh.every(
      (a) => a.limit_micro === '3000000' && a.accounted_micro === '0',
    ),
  ).toBe(true);
  expect(fresh.filter((a) => a.user_id !== null).map((a) => a.user_id)).toEqual(
    [users[1]!.userId],
  );
  expect(
    (await engine.query('SELECT * FROM aw_budget_reservations')).rows,
  ).toEqual(history);
  expect(
    (
      await tx((d) =>
        reconcileSuccessorOperation(
          d,
          i.previous,
          selection,
          identity,
          expected,
        ),
      )
    ).state,
  ).toBe('committed');
});
it('rejects a forged Auth mapping, missing first sign-in and a foreign database identity', async () => {
  const i = input();
  await seed(adapter(engine), i);
  const altered = structuredClone(i.selection);
  altered.next.participants[1]!.email = 'unmatched@example.invalid';
  await expect(
    tx((d) => captureSuccessorOperation(d, i.previous, altered, identity)),
  ).rejects.toThrow();
  await expect(
    tx((d) =>
      captureSuccessorOperation(d, i.previous, i.selection, {
        ...identity,
        databaseIdentitySha256: 'a'.repeat(64),
      }),
    ),
  ).rejects.toThrow();
  await engine
    .transaction(async (e) => {
      await e.query('UPDATE auth.users SET last_sign_in_at=NULL WHERE id=$1', [
        users[1]!.userId,
      ]);
      await expect(
        captureSuccessorOperation(
          adapter(e),
          i.previous,
          i.selection,
          identity,
        ),
      ).rejects.toThrow();
      throw Error('test rollback');
    })
    .catch((e) => {
      if (e.message !== 'test rollback') throw e;
    });
});
it('rejects settled-history drift even when every budget-account row is unchanged', async () => {
  const i = input();
  await seed(adapter(engine), i);
  const expected = await tx((d) =>
    captureSuccessorOperation(d, i.previous, i.selection, identity),
  );
  await engine.query(
    'UPDATE aw_budget_reservations SET accounted_micro=accounted_micro+1',
  );
  await ready(i);
  const before = (
    await engine.query('SELECT * FROM aw_budget_accounts ORDER BY id')
  ).rows;
  await expect(
    tx((d) =>
      applySuccessorOperation(d, i.previous, i.selection, identity, expected),
    ),
  ).rejects.toThrow();
  expect(
    (await engine.query('SELECT * FROM aw_budget_accounts ORDER BY id')).rows,
  ).toEqual(before);
});

it('rolls back the accounting mutation if the protected post-check changes', async () => {
  const i = input();
  await seed(adapter(engine), i);
  const expected = await tx((d) =>
    captureSuccessorOperation(d, i.previous, i.selection, identity),
  );
  await ready(i);
  const before = (
    await engine.query('SELECT * FROM aw_budget_accounts ORDER BY id')
  ).rows;
  const history = (await engine.query('SELECT * FROM aw_budget_reservations'))
    .rows;
  await expect(
    tx(async (d) => {
      const injected = {
        ...d,
        query: async <T extends Record<string, unknown>>(
          sql: string,
          values: unknown[] = [],
        ) => {
          const rows = await d.query<T>(sql, values);
          if (
            sql.startsWith(
              'INSERT INTO public.aw_budget_accounts(id,limit_micro',
            )
          )
            await d.query(
              'UPDATE aw_budget_reservations SET accounted_micro=accounted_micro+1',
            );
          return rows;
        },
      };
      return applySuccessorOperation(
        injected,
        i.previous,
        i.selection,
        identity,
        expected,
      );
    }),
  ).rejects.toThrow();
  expect(
    (await engine.query('SELECT * FROM aw_budget_accounts ORDER BY id')).rows,
  ).toEqual(before);
  expect(
    (await engine.query('SELECT * FROM aw_budget_reservations')).rows,
  ).toEqual(history);
});
it('rejects queued jobs and does not turn a capture request into a migration or arbitrary command', async () => {
  const i = input();
  await seed(adapter(engine), i);
  await engine
    .transaction(async (e) => {
      await e.query(
        "INSERT INTO ff_consents(id,user_id,policy_version,consent_type) VALUES(gen_random_uuid(),$1,'alpha-privacy-v1','adult_and_ai_acknowledgement')",
        [users[0]!.userId],
      );
      await new LifeRepository(adapter(e)).create(
        users[0]!.userId,
        setupFixture(),
        randomUUID(),
      );
      await expect(
        captureSuccessorOperation(
          adapter(e),
          i.previous,
          i.selection,
          identity,
        ),
      ).rejects.toThrow();
      throw Error('test rollback');
    })
    .catch((e) => {
      if (e.message !== 'test rollback') throw e;
    });
  for (const raw of [
    {
      mode: 'migrate',
      previous: i.previous,
      selection: i.selection,
      expected: null,
    },
    {
      mode: 'capture',
      previous: i.previous,
      selection: i.selection,
      expected: null,
      sql: 'forbidden',
    },
  ])
    await expect(
      tx((d) => successorDatabaseRequest(d, raw, identity)),
    ).rejects.toThrow();
});
