import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  DatabaseAiBudget,
  Repository,
  type Database,
} from '@future-flow/database';

// Isolated PostgreSQL evidence. No provider, production allowance or real account.
export async function aiBudgetWindowProof(db: Database) {
  const repo = new Repository(db),
    owners: string[] = [],
    projectKeys: string[] = [];
  const request = { model: 'gpt-6.1-sol', max_output_tokens: 500, input: [] };
  const amount = Math.ceil(
    (Buffer.byteLength(JSON.stringify(request)) + 4096) * 2.5 + 5000,
  );
  async function owner() {
    const id = randomUUID();
    owners.push(id);
    await repo.ensureUser(id);
    return id;
  }
  const [clock] = await db.query<{ time: Date }>(
    'SELECT clock_timestamp() AS time',
  );
  const now = new Date(clock!.time).getTime();
  const window = {
    startsAt: new Date(now - 86400000).toISOString(),
    endsAt: new Date(now + 86400000).toISOString(),
  };
  try {
    const a = await owner(),
      b = await owner();
    const config = { projectUsd: (amount + 1) / 1e6, userUsd: 1, window };
    const race = await Promise.allSettled([
      new DatabaseAiBudget(db, a, randomUUID(), config).reserve(request),
      new DatabaseAiBudget(db, b, randomUUID(), config).reserve(request),
    ]);
    assert.equal(race.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal(
      (race.find((x) => x.status === 'rejected') as PromiseRejectedResult)
        .reason.code,
      'AI_BUDGET_EXCEEDED',
    );
    const id = (
      race.find(
        (x) => x.status === 'fulfilled',
      ) as PromiseFulfilledResult<string>
    ).value;
    const [receipt] = await db.query(
      'SELECT project_key,user_id FROM aw_budget_reservations WHERE id=$1',
      [id],
    );
    projectKeys.push(String(receipt!.project_key));
    await new DatabaseAiBudget(db, a, randomUUID(), config).settle(id, null);
    assert.equal(
      Number(
        (
          await db.query(
            'SELECT accounted_micro FROM aw_budget_accounts WHERE id=$1',
            [receipt!.project_key],
          )
        )[0]!.accounted_micro,
      ),
      amount,
    );
    // A later guard must settle against the saved reservation keys, not its own period.
    const nextWindow = {
      startsAt: new Date(now - 2 * 86400000).toISOString(),
      endsAt: window.endsAt,
    };
    const next = new DatabaseAiBudget(db, a, randomUUID(), {
      projectUsd: 1,
      userUsd: 1,
      window: nextWindow,
    });
    const nextId = await next.reserve(request);
    const [nextReceipt] = await db.query(
      'SELECT project_key FROM aw_budget_reservations WHERE id=$1',
      [nextId],
    );
    projectKeys.push(String(nextReceipt!.project_key));
    await next.settle(id, { input_tokens: 20, output_tokens: 10 });
    await next.settle(id, { input_tokens: 800, output_tokens: 800 });
    assert.equal(
      Number(
        (
          await db.query(
            'SELECT accounted_micro FROM aw_budget_accounts WHERE id=$1',
            [receipt!.project_key],
          )
        )[0]!.accounted_micro,
      ),
      150,
    );
    assert.equal(
      Number(
        (
          await db.query(
            'SELECT accounted_micro FROM aw_budget_accounts WHERE id=$1',
            [nextReceipt!.project_key],
          )
        )[0]!.accounted_micro,
      ),
      amount,
    );
    const capWindow = {
      startsAt: new Date(now - 3 * 86400000).toISOString(),
      endsAt: window.endsAt,
    };
    const personal = new DatabaseAiBudget(db, b, randomUUID(), {
      projectUsd: 1,
      userUsd: (amount + 1) / 1e6,
      window: capWindow,
    });
    const personalRace = await Promise.allSettled([
      personal.reserve(request),
      personal.reserve(request),
    ]);
    assert.equal(
      personalRace.filter((x) => x.status === 'fulfilled').length,
      1,
    );
    const personalId = (
      personalRace.find(
        (x) => x.status === 'fulfilled',
      ) as PromiseFulfilledResult<string>
    ).value;
    const [personalReceipt] = await db.query(
      'SELECT project_key FROM aw_budget_reservations WHERE id=$1',
      [personalId],
    );
    projectKeys.push(String(personalReceipt!.project_key));
    const providerWindow = {
        startsAt: new Date(now - 4 * 86400000).toISOString(),
        endsAt: window.endsAt,
      },
      claudeRequest = { ...request, model: 'claude-sonnet-5-5' },
      claudeAmount = Math.ceil(
        (Buffer.byteLength(JSON.stringify(claudeRequest)) + 4096) * 2.5 + 5000,
      ),
      userAllowance = (Math.max(amount, claudeAmount) + 1) / 1e6;
    const providers = [
      new DatabaseAiBudget(db, a, randomUUID(), {
        projectUsd: 10,
        userUsd: userAllowance,
        window: providerWindow,
      }),
      new DatabaseAiBudget(db, a, randomUUID(), {
        provider: 'anthropic',
        projectUsd: 5,
        userUsd: userAllowance,
        window: providerWindow,
      }),
    ];
    const providerRace = await Promise.allSettled([
      providers[0]!.reserve(request),
      providers[1]!.reserve(claudeRequest),
    ]);
    assert.equal(
      providerRace.filter((x) => x.status === 'fulfilled').length,
      1,
    );
    const providerId = (
      providerRace.find(
        (x) => x.status === 'fulfilled',
      ) as PromiseFulfilledResult<string>
    ).value;
    const [providerReceipt] = await db.query(
      'SELECT project_key,user_key FROM aw_budget_reservations WHERE id=$1',
      [providerId],
    );
    projectKeys.push(String(providerReceipt!.project_key));
    const secondClaude = await new DatabaseAiBudget(db, b, randomUUID(), {
      provider: 'anthropic',
      projectUsd: 5,
      userUsd: userAllowance,
      window: providerWindow,
    }).reserve(claudeRequest);
    const [secondReceipt] = await db.query(
      'SELECT project_key,user_key FROM aw_budget_reservations WHERE id=$1',
      [secondClaude],
    );
    if (!projectKeys.includes(String(secondReceipt!.project_key)))
      projectKeys.push(String(secondReceipt!.project_key));
    assert.notEqual(providerReceipt!.user_key, secondReceipt!.user_key);
    // A reservation waiting for the project lock must use the clock after the wait.
    const [boundaryClock] = await db.query<{ time: Date }>(
      'SELECT clock_timestamp() AS time',
    );
    const boundaryNow = new Date(boundaryClock!.time).getTime();
    const shortConfig = {
      projectUsd: 1,
      userUsd: 1,
      window: {
        startsAt: new Date(boundaryNow - 86400000).toISOString(),
        endsAt: new Date(boundaryNow + 3000).toISOString(),
      },
    };
    const seedGuard = new DatabaseAiBudget(db, a, randomUUID(), shortConfig),
      seedId = await seedGuard.reserve(request);
    await seedGuard.settle(seedId, { input_tokens: 0, output_tokens: 0 });
    const [shortReceipt] = await db.query(
      'SELECT project_key FROM aw_budget_reservations WHERE id=$1',
      [seedId],
    );
    const shortKey = String(shortReceipt!.project_key);
    projectKeys.push(shortKey);
    let release!: () => void, held!: () => void, waiting!: () => void;
    const unlocked = new Promise<void>((resolve) => {
        release = resolve;
      }),
      locked = new Promise<void>((resolve) => {
        held = resolve;
      }),
      entered = new Promise<void>((resolve) => {
        waiting = resolve;
      });
    const holder = db.transaction(async (tx) => {
      await tx.query(
        'SELECT id FROM aw_budget_accounts WHERE id=$1 FOR UPDATE',
        [shortKey],
      );
      held();
      await unlocked;
    });
    let pending: Promise<string> | undefined;
    try {
      await locked;
      const observed: Database = {
        query: db.query,
        transaction: (run) =>
          db.transaction((tx) =>
            run({
              ...tx,
              query: async <T extends Record<string, unknown>>(
                sql: string,
                values: unknown[] = [],
              ) => {
                if (
                  sql ===
                    'SELECT limit_micro,accounted_micro FROM aw_budget_accounts WHERE id=$1 FOR UPDATE' &&
                  values[0] === shortKey
                )
                  waiting();
                return tx.query<T>(sql, values);
              },
            }),
          ),
      };
      pending = new DatabaseAiBudget(
        observed,
        b,
        randomUUID(),
        shortConfig,
      ).reserve(request);
      // Prevent an early rejection becoming unhandled while the barrier is observed.
      void pending.catch(() => {});
      await Promise.race([
        entered,
        pending.then(() => {
          throw Error('Reservation bypassed the held project lock');
        }),
      ]);
      const [remaining] = await db.query<{ ms: string }>(
        'SELECT EXTRACT(EPOCH FROM ($1::timestamptz-clock_timestamp()))*1000 AS ms',
        [shortConfig.window.endsAt],
      );
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, Number(remaining!.ms)) + 50),
      );
    } finally {
      release();
      await holder;
    }
    assert(pending);
    await assert.rejects(
      pending,
      (e: unknown) =>
        (e as { code: string }).code === 'AI_BUDGET_WINDOW_CLOSED',
    );
    assert.equal(
      Number(
        (
          await db.query(
            'SELECT accounted_micro FROM aw_budget_accounts WHERE id=$1',
            [shortKey],
          )
        )[0]!.accounted_micro,
      ),
      0,
    );
    const [before] = await db.query(
      'SELECT count(*)::int AS total FROM aw_budget_accounts',
    );
    for (const period of [
      {
        startsAt: new Date(now + 86400000).toISOString(),
        endsAt: new Date(now + 2 * 86400000).toISOString(),
      },
      {
        startsAt: new Date(now - 2 * 86400000).toISOString(),
        endsAt: new Date(now - 86400000).toISOString(),
      },
    ])
      await assert.rejects(
        new DatabaseAiBudget(db, a, randomUUID(), {
          projectUsd: 1,
          userUsd: 1,
          window: period,
        }).reserve(request),
        (e: unknown) =>
          (e as { code: string }).code === 'AI_BUDGET_WINDOW_CLOSED',
      );
    assert.equal(
      (
        await db.query('SELECT count(*)::int AS total FROM aw_budget_accounts')
      )[0]!.total,
      before!.total,
    );
    await assert.rejects(
      new DatabaseAiBudget(db, b, randomUUID(), {
        projectUsd: 0,
        userUsd: 1,
        window,
      }).reserve(request),
      (e: unknown) => (e as { code: string }).code === 'AI_BUDGET_EXCEEDED',
    );
    assert(
      (
        (await repo.exportAccount(a)).aw_budget_reservations as Array<{
          id: string;
        }>
      ).some((x) => x.id === nextId),
    );
    await repo.markDeleting(a);
    await repo.deleteAccountData(a);
    await next.settle(nextId, { input_tokens: 0, output_tokens: 0 });
    assert.equal(
      Number(
        (
          await db.query(
            'SELECT accounted_micro FROM aw_budget_accounts WHERE id=$1',
            [nextReceipt!.project_key],
          )
        )[0]!.accounted_micro,
      ),
      amount,
    );
    for (const table of ['aw_budget_accounts', 'aw_budget_reservations']) {
      const [guard] = await db.query(
        "SELECT c.relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'INSERT') AS client FROM pg_class c WHERE c.oid=$1::regclass",
        [table],
      );
      assert.deepEqual(guard, { rls: true, anon: false, client: false });
    }
    return {
      fixedProjectLastReservationRace: true,
      personalLastReservationRace: true,
      separateProviderProjectsSharedPersonalCapRace: true,
      futureExpiredWindowNoAutomaticRenewal: true,
      databaseClockAfterContendedLockStopsExpiredCall: true,
      originalWindowLateSettlementOnce: true,
      unknownReservationAndZeroStop: true,
      privateExportDeletionProjectSpendRetainedRls: true,
      actualProviderCalls: 0,
      actualProductionAllowance: false,
    };
  } finally {
    for (const id of owners) {
      if (
        (await db.query('SELECT id FROM ff_users WHERE id=$1', [id])).length
      ) {
        await repo.markDeleting(id);
        await repo.deleteAccountData(id);
      }
    }
    // Only isolated fixture cleanup; the preceding check proved deletion retains spend.
    for (const key of projectKeys)
      await db.query(
        'DELETE FROM aw_budget_accounts WHERE id=$1 AND user_id IS NULL',
        [key],
      );
  }
}
