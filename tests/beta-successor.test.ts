import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { hash } from '@future-flow/core';
import { DatabaseAiBudget, type Database } from '@future-flow/database';
import {
  successorPlan,
  captureSuccessorAccounts,
  closeAndSeedSuccessorAccounts,
  reconcileSuccessorAccounts,
} from '../scripts/lib/beta-successor';

const users = Array.from({ length: 3 }, (_, i) => ({
  email: `tester${i}@example.invalid`,
  userId: randomUUID(),
}));
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
    "CREATE TABLE ff_users(id uuid PRIMARY KEY,status text DEFAULT 'active');" +
      readFileSync('database/migrations/004_ai_budget.sql', 'utf8'),
  );
  for (const p of users)
    await engine.query('INSERT INTO ff_users(id) VALUES($1)', [p.userId]);
}, 60000);
afterAll(async () => {
  await engine?.close();
});
function input(leadMs = 60000) {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
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
    closePreviousAt: iso(now),
    next: {
      participants: users,
      projectUsd: '10',
      userUsd: '3.33',
      startsAt: iso(now + leadMs),
      endsAt: iso(now + leadMs + 30 * 86400000),
    },
  };
  return {
    previous,
    selection,
    plan: successorPlan(previous, selection, iso(now)),
  };
}
async function seeded(tx: Database, plan: ReturnType<typeof successorPlan>) {
  await tx.query(
    `INSERT INTO aw_budget_accounts(id,user_id,limit_micro,accounted_micro) VALUES
    ($1,NULL,2000000,188585),($2,$3,500000,188585),('retained-legacy',NULL,123,12)`,
    [plan.previousKeys.project, plan.previousKeys.users[0], users[0]!.userId],
  );
  await tx.query(
    `INSERT INTO aw_budget_reservations(id,user_id,project_key,user_key,job_id,model,task,reserved_micro,accounted_micro,status,input_tokens,output_tokens,settled_at)
    VALUES($1,$2,$3,$4,$5,'gpt-6.1-sol','history',200000,188585,'completed',100,200,now())`,
    [
      randomUUID(),
      users[0]!.userId,
      plan.previousKeys.project,
      plan.previousKeys.users[0],
      randomUUID(),
    ],
  );
}
async function rollback(
  run: (tx: Database) => Promise<void>,
  serializable = true,
) {
  try {
    await engine.transaction(async (e) => {
      if (serializable)
        await e.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      await run(adapter(e));
      throw Error('test rollback');
    });
  } catch (e) {
    if (!(e instanceof Error) || e.message !== 'test rollback') throw e;
  }
}
it('binds explicit early closure, exact three participants and new independent account keys', () => {
  const { previous, selection, plan } = input();
  expect(plan.previousTermsSha256).toBe(hash(previous));
  expect(plan.nextKeys.project).not.toBe(plan.previousKeys.project);
  expect(plan.next.participants).toHaveLength(3);
  const changes = [
    (s: typeof selection) => {
      s.previousTermsSha256 = 'a'.repeat(64);
    },
    (s: typeof selection) => {
      s.next.participants = users.slice(0, 2);
    },
    (s: typeof selection) => {
      s.next.participants = [users[0]!, users[0]!, users[2]!];
    },
    (s: typeof selection) => {
      s.next.projectUsd = '11';
    },
    (s: typeof selection) => {
      s.next.userUsd = '3.34';
    },
    (s: typeof selection) => {
      s.next.startsAt = previous.startsAt;
      s.next.endsAt = previous.endsAt;
    },
    (s: typeof selection) => {
      s.closePreviousAt = previous.endsAt;
    },
    (s: typeof selection) => {
      s.next.endsAt = previous.endsAt;
    },
    (s: typeof selection) => {
      s.next.startsAt = '2026-02-30T00:00:00Z';
    },
    (s: typeof selection) => {
      Object.assign(s.next, { openaiKey: 'forbidden' });
    },
  ];
  for (const change of changes) {
    const s = structuredClone(selection);
    change(s);
    expect(() => successorPlan(previous, s, plan.observedAt)).toThrow();
  }
});
function ownerInput(leadMs = 60000) {
  const i = input(leadMs);
  const selection = {
    ...i.selection,
    purpose: 'owner-e2e' as const,
    next: {
      ...i.selection.next,
      participants: [users[0]!],
      projectUsd: '3',
      userUsd: '3',
    },
  };
  return {
    previous: i.previous,
    selection,
    plan: successorPlan(i.previous, selection, i.plan.observedAt),
  };
}
it('separately binds the approved single-owner 3 USD journey without admitting the tester beta', () => {
  const i = ownerInput();
  expect(i.plan.purpose).toBe('owner-e2e');
  expect(i.plan.next.participants).toHaveLength(1);
  for (const mutate of [
    (s: Record<string, any>) => {
      s.purpose = 'tester-beta';
    },
    (s: Record<string, any>) => {
      s.purpose = 'arbitrary';
    },
    (s: Record<string, any>) => {
      delete s.purpose;
    },
    (s: Record<string, any>) => {
      s.next.participants = users;
    },
    (s: Record<string, any>) => {
      s.next.projectUsd = '10';
    },
    (s: Record<string, any>) => {
      s.next.userUsd = '3.33';
    },
    (s: Record<string, any>) => {
      s.next.endsAt = i.previous.endsAt;
    },
  ]) {
    const altered = structuredClone(i.selection);
    mutate(altered);
    expect(() =>
      successorPlan(i.previous, altered, i.plan.observedAt),
    ).toThrow();
  }
});
it('closes old allowance and reconciles exactly two independent 3 USD owner accounts, retaining spend and history', async () => {
  const i = ownerInput(1500);
  await rollback(async (tx) => {
    await seeded(tx, i.plan);
    const history = await tx.query(
      'SELECT * FROM aw_budget_reservations ORDER BY id',
    );
    const before = await captureSuccessorAccounts(tx, i.plan);
    const result = await closeAndSeedSuccessorAccounts(
      tx,
      i.previous,
      i.selection,
      i.plan,
      before,
    );
    expect(result.newAccounts).toBe(2);
    expect(result.previousSpendPreserved).toBe(true);
    expect(
      (
        await reconcileSuccessorAccounts(
          tx,
          i.previous,
          i.selection,
          i.plan,
          before,
        )
      ).state,
    ).toBe('committed');
    const accounts = await tx.query(
      'SELECT id,limit_micro::text,accounted_micro::text FROM aw_budget_accounts WHERE id=ANY($1::text[]) ORDER BY id',
      [[i.plan.nextKeys.project, ...i.plan.nextKeys.users]],
    );
    expect(accounts).toHaveLength(2);
    expect(
      accounts.every(
        (a) => a.limit_micro === '3000000' && a.accounted_micro === '0',
      ),
    ).toBe(true);
    expect(
      await tx.query('SELECT * FROM aw_budget_reservations ORDER BY id'),
    ).toEqual(history);
    const old = new DatabaseAiBudget(tx, users[0]!.userId, randomUUID(), {
      projectUsd: 2,
      userUsd: 0.5,
      window: i.plan.previous,
    });
    await expect(
      old.reserve({ model: 'gpt-6.1-sol', max_output_tokens: 1, input: [] }),
    ).rejects.toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });
    const owner = new DatabaseAiBudget(tx, users[0]!.userId, randomUUID(), {
      projectUsd: 3,
      userUsd: 3,
      window: i.plan.next,
      closedBetaUserIds: [users[0]!.userId],
    });
    await delay(
      Math.max(0, Date.parse(i.plan.next.startsAt) - Date.now() + 30),
    );
    const reservation = await owner.reserve({
      model: 'gpt-6.1-sol',
      max_output_tokens: 1,
      input: [],
    });
    await owner.settle(reservation, { input_tokens: 0, output_tokens: 0 });
    // Synthetic exhausted NEW accounts exercise the real reservation guard;
    // old spend/history remain untouched and no provider request is made.
    await tx.query(
      'UPDATE aw_budget_accounts SET accounted_micro=3000000 WHERE id=ANY($1::text[])',
      [[i.plan.nextKeys.project, ...i.plan.nextKeys.users]],
    );
    await expect(
      owner.reserve({ model: 'gpt-6.1-sol', max_output_tokens: 1, input: [] }),
    ).rejects.toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });
    await expect(
      reconcileSuccessorAccounts(tx, i.previous, i.selection, i.plan, before),
    ).rejects.toThrow();
    expect(
      await captureSuccessorAccounts(tx, i.plan).catch(() => null),
    ).toBeNull();
  });
});
it('atomically closes old limits, preserves history/spend and seeds only the new four accounts', async () => {
  const i = input();
  await rollback(async (tx) => {
    await seeded(tx, i.plan);
    const history = await tx.query(
      'SELECT * FROM aw_budget_reservations ORDER BY id',
    );
    const before = await captureSuccessorAccounts(tx, i.plan);
    const result = await closeAndSeedSuccessorAccounts(
      tx,
      i.previous,
      i.selection,
      i.plan,
      before,
    );
    expect(result.previousSpendPreserved).toBe(true);
    expect(result.previousAccountLimitsClosed).toBe(2);
    expect(
      await tx.query('SELECT * FROM aw_budget_reservations ORDER BY id'),
    ).toEqual(history);
    expect(
      await tx.query(
        'SELECT id,limit_micro::text,accounted_micro::text FROM aw_budget_accounts ORDER BY id',
      ),
    ).toContainEqual({
      id: 'retained-legacy',
      limit_micro: '123',
      accounted_micro: '12',
    });
    const old = await tx.query(
      'SELECT limit_micro::text,accounted_micro::text FROM aw_budget_accounts WHERE id=$1',
      [i.plan.previousKeys.project],
    );
    expect(old[0]).toEqual({ limit_micro: '0', accounted_micro: '188585' });
    const guard = new DatabaseAiBudget(tx, users[0]!.userId, randomUUID(), {
      projectUsd: 2,
      userUsd: 0.5,
      window: i.plan.previous,
    });
    await expect(
      guard.reserve({ model: 'gpt-6.1-sol', max_output_tokens: 1, input: [] }),
    ).rejects.toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });
    // A second execution cannot reopen the old window or reset the new one.
    await expect(captureSuccessorAccounts(tx, i.plan)).rejects.toThrow();
  });
});
it('chains the tester beta from the live single-owner 3 USD window, keeping its spend and history', async () => {
  const owner = ownerInput();
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const previous = {
    participants: [users[0]!],
    projectUsd: '3',
    userUsd: '3',
    startsAt: iso(now - 86400000),
    endsAt: iso(now - 86400000 + 30 * 86400000),
  };
  const selection = {
    purpose: 'tester-beta' as const,
    previousTermsSha256: hash(previous),
    closePreviousAt: iso(now),
    next: {
      participants: users,
      projectUsd: '10',
      userUsd: '3.33',
      startsAt: iso(now + 60000),
      endsAt: iso(now + 60000 + 30 * 86400000),
    },
  };
  const plan = successorPlan(previous, selection, iso(now));
  expect(plan.purpose).toBe('tester-beta');
  expect(owner.plan.purpose).toBe('owner-e2e');
  // The same selection cannot be replayed against another previous window.
  expect(() =>
    successorPlan(owner.previous, selection, plan.observedAt),
  ).toThrow();
  await rollback(async (tx) => {
    await tx.query(
      `INSERT INTO aw_budget_accounts(id,user_id,limit_micro,accounted_micro) VALUES
      ($1,NULL,3000000,671215),($2,$3,3000000,671215)`,
      [plan.previousKeys.project, plan.previousKeys.users[0], users[0]!.userId],
    );
    await tx.query(
      `INSERT INTO aw_budget_reservations(id,user_id,project_key,user_key,job_id,model,task,reserved_micro,accounted_micro,status,input_tokens,output_tokens,settled_at)
      VALUES($1,$2,$3,$4,$5,'gpt-6.1-sol','history',700000,671215,'completed',100,200,now())`,
      [
        randomUUID(),
        users[0]!.userId,
        plan.previousKeys.project,
        plan.previousKeys.users[0],
        randomUUID(),
      ],
    );
    const history = await tx.query(
      'SELECT * FROM aw_budget_reservations ORDER BY id',
    );
    const before = await captureSuccessorAccounts(tx, plan);
    const result = await closeAndSeedSuccessorAccounts(
      tx,
      previous,
      selection,
      plan,
      before,
    );
    expect(result.previousSpendPreserved).toBe(true);
    expect(result.previousAccountLimitsClosed).toBe(2);
    expect(result.newAccounts).toBe(4);
    expect(
      (await reconcileSuccessorAccounts(tx, previous, selection, plan, before))
        .state,
    ).toBe('committed');
    expect(
      await tx.query('SELECT * FROM aw_budget_reservations ORDER BY id'),
    ).toEqual(history);
    const closed = await tx.query(
      'SELECT limit_micro::text,accounted_micro::text FROM aw_budget_accounts WHERE id=ANY($1::text[]) ORDER BY id',
      [[plan.previousKeys.project, ...plan.previousKeys.users]],
    );
    expect(closed).toHaveLength(2);
    expect(
      closed.every(
        (a) => a.limit_micro === '0' && a.accounted_micro === '671215',
      ),
    ).toBe(true);
    const fresh = await tx.query(
      'SELECT id,limit_micro::text,accounted_micro::text FROM aw_budget_accounts WHERE id=ANY($1::text[]) ORDER BY id',
      [[plan.nextKeys.project, ...plan.nextKeys.users]],
    );
    expect(fresh).toHaveLength(4);
    expect(fresh.map((a) => a.limit_micro).sort()).toEqual([
      '10000000',
      '3330000',
      '3330000',
      '3330000',
    ]);
    expect(fresh.every((a) => a.accounted_micro === '0')).toBe(true);
    const old = new DatabaseAiBudget(tx, users[0]!.userId, randomUUID(), {
      projectUsd: 3,
      userUsd: 3,
      window: plan.previous,
    });
    await expect(
      old.reserve({ model: 'gpt-6.1-sol', max_output_tokens: 1, input: [] }),
    ).rejects.toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });
  });
});
it('opens the tester window at most once: a tester window can never be succeeded by another', () => {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const tester = {
    participants: users,
    projectUsd: '10',
    userUsd: '3.33',
    startsAt: iso(now - 86400000),
    endsAt: iso(now - 86400000 + 30 * 86400000),
  };
  const again = {
    purpose: 'tester-beta' as const,
    previousTermsSha256: hash(tester),
    closePreviousAt: iso(now),
    next: {
      participants: users,
      projectUsd: '10',
      userUsd: '3.33',
      startsAt: iso(now + 60000),
      endsAt: iso(now + 60000 + 30 * 86400000),
    },
  };
  expect(() => successorPlan(tester, again, iso(now))).toThrow();
  // The same selection over the owner window is the approved single step.
  const owner = {
    ...tester,
    participants: [users[0]!],
    projectUsd: '3',
    userUsd: '3',
  };
  expect(
    successorPlan(
      owner,
      { ...again, previousTermsSha256: hash(owner) },
      iso(now),
    ).purpose,
  ).toBe('tester-beta');
});
it('normal DatabaseAiBudget spends from the new window after its start; old configuration stays denied', async () => {
  const i = input(1500);
  await rollback(async (tx) => {
    await seeded(tx, i.plan);
    const before = await captureSuccessorAccounts(tx, i.plan);
    await closeAndSeedSuccessorAccounts(
      tx,
      i.previous,
      i.selection,
      i.plan,
      before,
    );
    const guard = new DatabaseAiBudget(tx, users[1]!.userId, randomUUID(), {
      projectUsd: 10,
      userUsd: 3.33,
      window: i.plan.next,
      closedBetaUserIds: users.map((p) => p.userId),
    });
    await expect(
      guard.reserve({ model: 'gpt-6.1-sol', max_output_tokens: 1, input: [] }),
    ).rejects.toMatchObject({ code: 'AI_BUDGET_WINDOW_CLOSED' });
    await delay(
      Math.max(0, Date.parse(i.plan.next.startsAt) - Date.now() + 30),
    );
    const id = await guard.reserve({
      model: 'gpt-6.1-sol',
      max_output_tokens: 1,
      input: [],
    });
    await guard.settle(id, { input_tokens: 0, output_tokens: 0 });
    const [reservation] = await tx.query(
      'SELECT project_key,user_key FROM aw_budget_reservations WHERE id=$1',
      [id],
    );
    expect(reservation).toEqual({
      project_key: i.plan.nextKeys.project,
      user_key: i.plan.nextKeys.users[1],
    });
  });
});
it('refuses unresolved usage, changed accounts and previously allocated successor keys before mutation', async () => {
  for (const mode of [
    'unknown',
    'reserved',
    'unsettled',
    'drift',
    'collision',
    'foreign-old',
  ]) {
    const i = input();
    await rollback(async (tx) => {
      await seeded(tx, i.plan);
      const expected = await captureSuccessorAccounts(tx, i.plan);
      if (['unknown', 'reserved'].includes(mode))
        await tx.query('UPDATE aw_budget_reservations SET status=$1', [mode]);
      if (mode === 'unsettled')
        await tx.query('UPDATE aw_budget_reservations SET settled_at=NULL');
      if (mode === 'drift')
        await tx.query(
          'UPDATE aw_budget_accounts SET accounted_micro=accounted_micro+1 WHERE id=$1',
          [i.plan.previousKeys.project],
        );
      if (mode === 'collision')
        await tx.query(
          'INSERT INTO aw_budget_accounts(id,limit_micro,accounted_micro) VALUES($1,1,0)',
          [i.plan.nextKeys.project],
        );
      if (mode === 'foreign-old')
        await tx.query(
          'INSERT INTO aw_budget_accounts(id,limit_micro,accounted_micro) VALUES($1,1,0)',
          [
            `user:${users[2]!.userId}:window:${i.plan.previous.startsAt}:${i.plan.previous.endsAt}`,
          ],
        );
      const before = await tx.query(
        'SELECT * FROM aw_budget_accounts ORDER BY id',
      );
      await expect(
        closeAndSeedSuccessorAccounts(
          tx,
          i.previous,
          i.selection,
          i.plan,
          expected,
        ),
      ).rejects.toThrow();
      expect(
        await tx.query('SELECT * FROM aw_budget_accounts ORDER BY id'),
      ).toEqual(before);
    });
  }
});
it('requires a serializable transaction and does not trust an edited plan', async () => {
  const i = input();
  await rollback(async (tx) => {
    await seeded(tx, i.plan);
    const before = await captureSuccessorAccounts(tx, i.plan);
    await expect(
      closeAndSeedSuccessorAccounts(
        tx,
        i.previous,
        i.selection,
        i.plan,
        before,
      ),
    ).rejects.toThrow();
  }, false);
  await rollback(async (tx) => {
    await seeded(tx, i.plan);
    const before = await captureSuccessorAccounts(tx, i.plan);
    const changed = structuredClone(i.plan);
    changed.nextKeys.project = 'retained-legacy';
    await expect(
      closeAndSeedSuccessorAccounts(
        tx,
        i.previous,
        i.selection,
        changed,
        before,
      ),
    ).rejects.toThrow();
  });
});
it('transaction failure rolls back both old-limit closure and new account insertion', async () => {
  const i = input();
  await expect(
    engine.transaction(async (e) => {
      await e.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      const tx = adapter(e);
      await seeded(tx, i.plan);
      const expected = await captureSuccessorAccounts(tx, i.plan);
      const failing = {
        ...tx,
        query: async <T extends Record<string, unknown>>(
          sql: string,
          values: unknown[] = [],
        ) => {
          if (sql.includes('INSERT INTO public.aw_budget_accounts(id,user_id'))
            throw Error('injected insertion failure');
          return tx.query<T>(sql, values);
        },
      };
      await closeAndSeedSuccessorAccounts(
        failing,
        i.previous,
        i.selection,
        i.plan,
        expected,
      );
    }),
  ).rejects.toThrow('injected insertion failure');
  expect(await engine.query('SELECT * FROM aw_budget_accounts')).toMatchObject({
    rows: [],
  });
});

it('refuses autocommit even when the session default isolation is serializable', async () => {
  const i = input();
  const db = adapter(engine);
  await engine.exec('SET default_transaction_isolation=serializable');
  try {
    await seeded(db, i.plan);
    const expected = await captureSuccessorAccounts(db, i.plan);
    const before = await db.query(
      'SELECT * FROM aw_budget_accounts ORDER BY id',
    );
    await expect(
      closeAndSeedSuccessorAccounts(
        db,
        i.previous,
        i.selection,
        i.plan,
        expected,
      ),
    ).rejects.toThrow();
    expect(
      await db.query('SELECT * FROM aw_budget_accounts ORDER BY id'),
    ).toEqual(before);
  } finally {
    await engine.exec(
      'DELETE FROM aw_budget_reservations;DELETE FROM aw_budget_accounts;RESET default_transaction_isolation',
    );
  }
});

it('recognizes a lost COMMIT response without re-closing, reseeding or changing a row', async () => {
  const i = input();
  await rollback(async (tx) => {
    await seeded(tx, i.plan);
    const expected = await captureSuccessorAccounts(tx, i.plan);
    expect(
      (
        await reconcileSuccessorAccounts(
          tx,
          i.previous,
          i.selection,
          i.plan,
          expected,
        )
      ).state,
    ).toBe('uncommitted');
    await closeAndSeedSuccessorAccounts(
      tx,
      i.previous,
      i.selection,
      i.plan,
      expected,
    );
    const committed = await tx.query(
      'SELECT * FROM aw_budget_accounts ORDER BY id',
    );
    for (let n = 0; n < 2; n++)
      expect(
        (
          await reconcileSuccessorAccounts(
            tx,
            i.previous,
            i.selection,
            i.plan,
            expected,
          )
        ).state,
      ).toBe('committed');
    expect(
      await tx.query('SELECT * FROM aw_budget_accounts ORDER BY id'),
    ).toEqual(committed);
  });
});

it('does not label a mixed state or new spending as a clean completed closure', async () => {
  for (const kind of [
    'partial',
    'new-spend',
    'old-spend',
    'old-reopen',
    'new-limit',
    'new-identity',
    'snapshot-edit',
  ]) {
    const i = input();
    await rollback(async (tx) => {
      await seeded(tx, i.plan);
      const expected = await captureSuccessorAccounts(tx, i.plan);
      if (kind === 'partial')
        await tx.query(
          'UPDATE aw_budget_accounts SET limit_micro=0 WHERE id=$1',
          [i.plan.previousKeys.project],
        );
      else
        await closeAndSeedSuccessorAccounts(
          tx,
          i.previous,
          i.selection,
          i.plan,
          expected,
        );
      if (kind === 'new-spend')
        await tx.query(
          'UPDATE aw_budget_accounts SET accounted_micro=1 WHERE id=$1',
          [i.plan.nextKeys.project],
        );
      if (kind === 'old-spend')
        await tx.query(
          'UPDATE aw_budget_accounts SET accounted_micro=accounted_micro+1 WHERE id=$1',
          [i.plan.previousKeys.project],
        );
      if (kind === 'old-reopen')
        await tx.query(
          'UPDATE aw_budget_accounts SET limit_micro=2000000 WHERE id=$1',
          [i.plan.previousKeys.project],
        );
      if (kind === 'new-limit')
        await tx.query(
          'UPDATE aw_budget_accounts SET limit_micro=10000001 WHERE id=$1',
          [i.plan.nextKeys.project],
        );
      if (kind === 'new-identity')
        await tx.query('UPDATE aw_budget_accounts SET user_id=$2 WHERE id=$1', [
          i.plan.nextKeys.users[0],
          users[1]!.userId,
        ]);
      if (kind === 'snapshot-edit')
        expected.beforeAccounts[0]!.accounted_micro = '999';
      const before = await tx.query(
        'SELECT * FROM aw_budget_accounts ORDER BY id',
      );
      await expect(
        reconcileSuccessorAccounts(
          tx,
          i.previous,
          i.selection,
          i.plan,
          expected,
        ),
      ).rejects.toThrow();
      expect(
        await tx.query('SELECT * FROM aw_budget_accounts ORDER BY id'),
      ).toEqual(before);
    });
  }
});
