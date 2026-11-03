import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import { hash } from '@future-flow/core';
import type { Database } from '@future-flow/database';
import {
  prepareServiceOperation,
  applyServiceOperation,
  reconcileServiceOperation,
  type ServiceOperationIntent,
} from '../scripts/lib/service-operations';

let engine: PGlite, db: Database, protectedUser: string;
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
const context = () => ({
  sourceCommit: 'a'.repeat(40),
  imageId: 'sha256:' + 'b'.repeat(64),
  authoritySha256: 'c'.repeat(64),
  parentOperationSha256: 'd'.repeat(64),
  operatorSha256: 'e'.repeat(64),
  operationId: randomUUID(),
});
const provider = (id: string) => ({
  id,
  is_anonymous: false,
  email: 'synthetic@example.test',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
  banned_until: null,
});
const grant = (userId = randomUUID(), expectedRevision = 0) => ({
  userId,
  expectedRevision,
  state: 'active',
});
async function ro<T>(run: (tx: Database) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    return run(tx);
  });
}
async function plan(request: unknown) {
  const ctx = context();
  return {
    ctx,
    intent: await ro((tx) => prepareServiceOperation(tx, request, ctx)),
  };
}
async function apply(
  value: Awaited<ReturnType<typeof plan>>,
  verify = async (id: string) => provider(id),
) {
  return applyServiceOperation(
    db,
    value.intent,
    value.ctx,
    hash(value.intent),
    verify,
  );
}
async function bootstrap(members: unknown[] = []) {
  const value = await plan({ kind: 'bootstrap', members });
  await apply(value);
  return value;
}
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec('CREATE ROLE anon;CREATE ROLE authenticated');
  for (const name of readdirSync('database/migrations')
    .filter((name) => name.endsWith('.sql'))
    .sort())
    await engine.exec(readFileSync('database/migrations/' + name, 'utf8'));
  db = adapter(engine);
}, 30000);
beforeEach(async () => {
  await db.query('TRUNCATE ff_users,aw_service_policy CASCADE');
  protectedUser = randomUUID();
  await db.query('INSERT INTO ff_users(id) VALUES($1)', [protectedUser]);
  await db.query(
    "INSERT INTO aw_billing_reservations(user_id,key,bucket,state) VALUES($1,'existing-chapter','taster','consumed')",
    [protectedUser],
  );
  await db.query(
    "INSERT INTO aw_budget_accounts(id,user_id,limit_micro,accounted_micro) VALUES('original-budget',$1,10000000,1234567)",
    [protectedUser],
  );
});
afterEach(async () => {
  expect(
    await db.query(
      "SELECT limit_micro::text,accounted_micro::text FROM aw_budget_accounts WHERE id='original-budget'",
    ),
  ).toEqual([{ limit_micro: '10000000', accounted_micro: '1234567' }]);
  expect(
    await db.query(
      "SELECT state FROM aw_billing_reservations WHERE user_id=$1 AND key='existing-chapter'",
      [protectedUser],
    ),
  ).toEqual([{ state: 'consumed' }]);
});
afterAll(async () => {
  await engine.close();
});

describe('privileged service operations on actual SQL, without host authority impersonation', () => {
  it('bootstraps only a paused invitation policy and checks Auth after uncommitted roots exist', async () => {
    const members = [grant(), grant(), grant()];
    const value = await plan({ kind: 'bootstrap', members });
    expect(await db.query('SELECT * FROM aw_service_policy')).toEqual([]);
    const observed: string[] = [];
    // Use the same tx query stream to verify ordering, not another pool client.
    const query = db.query.bind(db);
    const wrapped: Database = {
      query,
      transaction: (run) =>
        db.transaction((tx) =>
          run({
            query: async (sql, values) => {
              if (sql.startsWith('INSERT INTO ff_users')) observed.push('root');
              return tx.query(sql, values);
            },
            transaction: (nested) => tx.transaction(nested),
          }),
        ),
    };
    const result = await applyServiceOperation(
      wrapped,
      value.intent,
      value.ctx,
      hash(value.intent),
      async (id) => {
        observed.push('auth');
        return provider(id);
      },
    );
    expect(observed.slice(0, 3)).toEqual(['root', 'root', 'root']);
    expect(observed.slice(3)).toEqual(['auth', 'auth', 'auth']);
    expect(result.state.policy).toMatchObject({
      revision: 1,
      mode: 'invitation',
      generationEnabled: false,
      checkoutEnabled: false,
      reconcileRequired: false,
    });
    expect(result.state.accounts).toHaveLength(3);
    expect(result).toMatchObject({
      outcome: 'committed',
      authProviderWrites: false,
      paidAiCalls: 0,
    });
  });
  it('adds ten then another ten without changing policy, historical users or financial ledgers', async () => {
    const original = [grant(protectedUser), grant(), grant()];
    await db.query('INSERT INTO ff_users(id) VALUES($1),($2)', [
      original[1]!.userId,
      original[2]!.userId,
    ]);
    await bootstrap(original);
    for (let batch = 0; batch < 2; batch++) {
      const value = await plan({
        kind: 'admission',
        expectedPolicyRevision: 1,
        members: Array.from({ length: 10 }, () => grant()),
      });
      await apply(value);
    }
    expect(
      await db.query(
        'SELECT count(*)::int AS count FROM aw_service_admissions',
      ),
    ).toEqual([{ count: 23 }]);
    expect(
      await db.query(
        'SELECT revision::int,generation_enabled,checkout_enabled FROM aw_service_policy',
      ),
    ).toEqual([
      { revision: 1, generation_enabled: false, checkout_enabled: false },
    ]);
  });
  it('preserves a paused state and rejects stale CAS without any partial batch provisioning', async () => {
    await bootstrap();
    const stale = await plan({
      kind: 'admission',
      expectedPolicyRevision: 1,
      members: [grant()],
    });
    await apply(
      await plan({
        kind: 'policy',
        expectedPolicyRevision: 1,
        generationEnabled: false,
        checkoutEnabled: false,
      }),
    );
    await expect(apply(stale)).rejects.toThrow('state changed');
    expect(
      await db.query('SELECT id FROM ff_users WHERE id=$1', [
        stale.intent.after.accounts[0]!.userId,
      ]),
    ).toEqual([]);
    expect(
      await db.query(
        'SELECT count(*)::int AS count FROM aw_service_admissions',
      ),
    ).toEqual([{ count: 0 }]);
  });
  it('rolls back all new roots and admissions when any provider verification fails', async () => {
    const members = [grant(), grant()];
    const value = await plan({ kind: 'bootstrap', members });
    await expect(
      apply(value, async (id) =>
        id === members[1]!.userId
          ? { ...provider(id), is_anonymous: true }
          : provider(id),
      ),
    ).rejects.toThrow('provider');
    expect(
      await db.query('SELECT id FROM ff_users WHERE id<>$1', [protectedUser]),
    ).toEqual([]);
    expect(await db.query('SELECT * FROM aw_service_policy')).toEqual([]);
  });
  it.each([
    ['wrong UUID', { id: randomUUID() }],
    ['anonymous', { is_anonymous: true }],
    ['unconfirmed', { email_confirmed_at: null }],
    ['banned', { banned_until: '2099-01-01T00:00:00.000Z' }],
    ['deleted', { deleted_at: '2026-01-01' }],
    ['changing email', { email_change: 'other@example.test' }],
    [
      'metadata only',
      { email: null, user_metadata: { email: 'synthetic@example.test' } },
    ],
  ])(
    'rejects %s provider data, not an operator-supplied identity assertion',
    async (_name, delta) => {
      const member = grant(),
        value = await plan({ kind: 'bootstrap', members: [member] });
      await expect(
        apply(value, async (id) => ({ ...provider(id), ...delta })),
      ).rejects.toThrow();
      expect(
        await db.query('SELECT id FROM ff_users WHERE id=$1', [member.userId]),
      ).toEqual([]);
    },
  );
  it('revokes with a new revision without requiring a working Auth provider', async () => {
    const member = grant();
    await bootstrap([member]);
    const value = await plan({
      kind: 'admission',
      expectedPolicyRevision: 1,
      members: [{ ...member, expectedRevision: 1, state: 'revoked' }],
    });
    const verify = vi.fn(async () => {
      throw Error('Auth outage');
    });
    const result = await applyServiceOperation(
      db,
      value.intent,
      value.ctx,
      hash(value.intent),
      verify,
    );
    expect(verify).not.toHaveBeenCalled();
    expect(result.state.accounts[0]!.admission).toEqual({
      revision: 2,
      state: 'revoked',
    });
  });
  it('cannot grant or resume under restore quarantine; pausing preserves that quarantine', async () => {
    await bootstrap();
    await db.query('UPDATE aw_service_policy SET reconcile_required=true');
    await expect(
      plan({
        kind: 'policy',
        expectedPolicyRevision: 1,
        generationEnabled: true,
        checkoutEnabled: false,
      }),
    ).rejects.toThrow('quarantine');
    await expect(
      plan({
        kind: 'admission',
        expectedPolicyRevision: 1,
        members: [grant()],
      }),
    ).rejects.toThrow();
    const result = await apply(
      await plan({
        kind: 'policy',
        expectedPolicyRevision: 1,
        generationEnabled: false,
        checkoutEnabled: false,
      }),
    );
    expect(result.state.policy?.reconcileRequired).toBe(true);
  });
  it('reconciles a lost output readonly, including after expiry, without applying SQL again', async () => {
    const value = await bootstrap([grant()]);
    const result = await ro((tx) =>
      reconcileServiceOperation(
        tx,
        value.intent,
        value.ctx,
        hash(value.intent),
      ),
    );
    expect(result.outcome).toBe('committed');
    expect(result.stateSha256).toBe(hash(value.intent.after));
    await expect(apply(value)).rejects.toThrow('state changed');
    const old = structuredClone(value.intent);
    old.observedAt = '2020-01-01T00:00:00.000Z';
    old.expiresAt = '2020-01-01T00:15:00.000Z';
    expect(
      (
        await ro((tx) =>
          reconcileServiceOperation(tx, old, value.ctx, hash(old)),
        )
      ).outcome,
    ).toBe('committed');
    await expect(
      applyServiceOperation(db, old, value.ctx, hash(old), async (id) =>
        provider(id),
      ),
    ).rejects.toThrow('expired');
  });
  it('refuses a deleted root on readback instead of resurrecting a previously committed admission', async () => {
    const member = grant(),
      value = await bootstrap([member]);
    await db.query('DELETE FROM ff_users WHERE id=$1', [member.userId]);
    await expect(
      ro((tx) =>
        reconcileServiceOperation(
          tx,
          value.intent,
          value.ctx,
          hash(value.intent),
        ),
      ),
    ).rejects.toThrow('drift');
    expect(
      await db.query('SELECT id FROM ff_users WHERE id=$1', [member.userId]),
    ).toEqual([]);
  });
  it('does not silently adopt admissions if the initial policy is missing', async () => {
    await db.query(
      "INSERT INTO aw_service_admissions(user_id,revision,state) VALUES($1,1,'active')",
      [protectedUser],
    );
    await expect(plan({ kind: 'bootstrap', members: [] })).rejects.toThrow(
      'existing admissions',
    );
    expect(await db.query('SELECT * FROM aw_service_policy')).toEqual([]);
  });
  it('observes an uncommitted intent readonly without creating a root', async () => {
    const member = grant(),
      value = await plan({ kind: 'bootstrap', members: [member] });
    const result = await ro((tx) =>
      reconcileServiceOperation(
        tx,
        value.intent,
        value.ctx,
        hash(value.intent),
      ),
    );
    expect(result.outcome).toBe('uncommitted');
    expect(
      await db.query('SELECT id FROM ff_users WHERE id=$1', [member.userId]),
    ).toEqual([]);
  });
  it('allows exactly one of two intents for the same policy revision', async () => {
    await bootstrap();
    const left = await plan({
      kind: 'policy',
      expectedPolicyRevision: 1,
      generationEnabled: true,
      checkoutEnabled: false,
    });
    const right = await plan({
      kind: 'policy',
      expectedPolicyRevision: 1,
      generationEnabled: false,
      checkoutEnabled: true,
    });
    const results = await Promise.allSettled([apply(left), apply(right)]);
    expect(
      results.filter((value) => value.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(results.filter((value) => value.status === 'rejected')).toHaveLength(
      1,
    );
    expect(
      await db.query('SELECT revision::int FROM aw_service_policy'),
    ).toEqual([{ revision: 2 }]);
  });
  it('rolls back roots if the original deadline expires during Auth verification', async () => {
    const member = grant(),
      value = await plan({ kind: 'bootstrap', members: [member] });
    const now = Date.now();
    value.intent.observedAt = new Date(now - 897000).toISOString();
    value.intent.expiresAt = new Date(now + 3000).toISOString();
    let queried = false;
    await expect(
      apply(value, async (id) => {
        queried = true;
        await new Promise((resolve) => setTimeout(resolve, 4000));
        return provider(id);
      }),
    ).rejects.toThrow('expired');
    expect(queried).toBe(true);
    expect(
      await db.query('SELECT id FROM ff_users WHERE id=$1', [member.userId]),
    ).toEqual([]);
    expect(await db.query('SELECT * FROM aw_service_policy')).toEqual([]);
  });
  it('binds original intent/context and rejects duplicate or injected operation fields', async () => {
    const member = grant();
    await expect(
      plan({ kind: 'bootstrap', members: [member, member] }),
    ).rejects.toThrow();
    await expect(
      plan({ kind: 'bootstrap', members: [], generationEnabled: true }),
    ).rejects.toThrow();
    const value = await plan({ kind: 'bootstrap', members: [member] });
    await expect(
      applyServiceOperation(
        db,
        value.intent,
        { ...value.ctx, operationId: randomUUID() },
        hash(value.intent),
        async (id) => provider(id),
      ),
    ).rejects.toThrow('binding');
    await expect(
      applyServiceOperation(
        db,
        value.intent,
        value.ctx,
        'f'.repeat(64),
        async (id) => provider(id),
      ),
    ).rejects.toThrow('Durable');
    const altered = structuredClone(value.intent) as ServiceOperationIntent;
    altered.after.policy!.generationEnabled = true;
    await expect(
      applyServiceOperation(db, altered, value.ctx, hash(altered), async (id) =>
        provider(id),
      ),
    ).rejects.toThrow('binding');
  });

  describe('bounded open wave control and restore reconcile', () => {
    const usedNow = async () =>
      (
        await db.query<{ used: string | number; capacity: string | number }>(
          'SELECT admission_used AS used,admission_capacity AS capacity FROM aw_service_policy',
        )
      ).map((r) => ({ used: Number(r.used), capacity: Number(r.capacity) }))[0];
    async function register(id = randomUUID()) {
      const { ServiceAccessRepository } = await import('@future-flow/database');
      return new ServiceAccessRepository(db).admitOpenAccount(id);
    }

    it('opens, closes and raises a wave by revision, without any provider call', async () => {
      await bootstrap();
      const calls: string[] = [];
      const verify = async (id: string) => {
        calls.push(id);
        return provider(id);
      };
      const opened = await apply(
        await plan({
          kind: 'wave',
          expectedPolicyRevision: 1,
          capacity: 2,
          open: true,
        }),
        verify,
      );
      expect(opened.state.policy).toMatchObject({
        revision: 2,
        mode: 'open',
        admissionCapacity: 2,
        generationEnabled: false,
      });
      expect(calls).toEqual([]);
      expect((await register()).status).toBe('admitted');
      // A registration below capacity does not move the observed revision.
      const closed = await apply(
        await plan({
          kind: 'wave',
          expectedPolicyRevision: 2,
          capacity: 2,
          open: false,
        }),
      );
      expect(closed.state.policy).toMatchObject({
        revision: 3,
        mode: 'invitation',
      });
      expect((await register()).status).toBe('closed');
      const next = await apply(
        await plan({
          kind: 'wave',
          expectedPolicyRevision: 3,
          capacity: 12,
          open: true,
        }),
      );
      expect(next.state.policy).toMatchObject({ mode: 'open' });
      expect(await usedNow()).toEqual({ used: 1, capacity: 12 });
    });

    it('rejects a stale revision, a capacity below the used slots and a wave under quarantine', async () => {
      await bootstrap();
      await apply(
        await plan({
          kind: 'wave',
          expectedPolicyRevision: 1,
          capacity: 3,
          open: true,
        }),
      );
      await register();
      await register();
      await expect(
        apply(
          await plan({
            kind: 'wave',
            expectedPolicyRevision: 2,
            capacity: 1,
            open: false,
          }),
        ),
      ).rejects.toMatchObject({ code: 'SERVICE_ACCESS_INPUT_INVALID' });
      await expect(
        apply(
          await plan({
            kind: 'wave',
            expectedPolicyRevision: 2,
            capacity: 2,
            open: true,
          }),
        ),
      ).rejects.toMatchObject({ code: 'SERVICE_ACCESS_INPUT_INVALID' });
      expect(await usedNow()).toEqual({ used: 2, capacity: 3 });
      await expect(
        plan({
          kind: 'wave',
          expectedPolicyRevision: 1,
          capacity: 3,
          open: true,
          extra: 1,
        }),
      ).rejects.toThrow();
      await db.query('UPDATE aw_service_policy SET reconcile_required=true');
      await expect(
        plan({
          kind: 'wave',
          expectedPolicyRevision: 2,
          capacity: 5,
          open: true,
        }),
      ).rejects.toThrow('quarantine');
    });

    it('invalidates an older wave intent when the automatic close moves the revision', async () => {
      await bootstrap();
      await apply(
        await plan({
          kind: 'wave',
          expectedPolicyRevision: 1,
          capacity: 1,
          open: true,
        }),
      );
      const stale = await plan({
        kind: 'policy',
        expectedPolicyRevision: 2,
        generationEnabled: true,
        checkoutEnabled: true,
      });
      expect((await register()).status).toBe('admitted');
      await expect(apply(stale)).rejects.toThrow('changed');
    });

    it('reconciles a lost wave output readonly without applying it again', async () => {
      await bootstrap();
      const value = await plan({
        kind: 'wave',
        expectedPolicyRevision: 1,
        capacity: 4,
        open: true,
      });
      const before = await ro((tx) =>
        reconcileServiceOperation(
          tx,
          value.intent,
          value.ctx,
          hash(value.intent),
        ),
      );
      expect(before.outcome).toBe('uncommitted');
      await apply(value);
      const after = await ro((tx) =>
        reconcileServiceOperation(
          tx,
          value.intent,
          value.ctx,
          hash(value.intent),
        ),
      );
      expect(after.outcome).toBe('committed');
      await register();
      // A registration after the commit is not drift for the receipt.
      const later = await ro((tx) =>
        reconcileServiceOperation(
          tx,
          value.intent,
          value.ctx,
          hash(value.intent),
        ),
      );
      expect(later.outcome).toBe('committed');
    });

    it('releases a restore quarantine only through restore-reconcile, closed and paused', async () => {
      await bootstrap();
      await apply(
        await plan({
          kind: 'wave',
          expectedPolicyRevision: 1,
          capacity: 5,
          open: true,
        }),
      );
      await apply(
        await plan({
          kind: 'policy',
          expectedPolicyRevision: 2,
          generationEnabled: true,
          checkoutEnabled: true,
        }),
      );
      for (let i = 0; i < 3; i++) await register();
      // Simulate a restore from an older backup: stale counter, open mode.
      await db.query(
        'UPDATE aw_service_policy SET reconcile_required=true,admission_used=1',
      );
      await expect(
        plan({ kind: 'restore-reconcile', expectedPolicyRevision: 3 }),
      ).resolves.toBeTruthy();
      const result = await apply(
        await plan({ kind: 'restore-reconcile', expectedPolicyRevision: 3 }),
        async () => {
          throw Error('No provider call expected');
        },
      );
      expect(result.state.policy).toMatchObject({
        revision: 4,
        mode: 'invitation',
        generationEnabled: false,
        checkoutEnabled: false,
        reconcileRequired: false,
        admissionCapacity: 5,
      });
      // The stale counter is raised to the admissions that really exist.
      expect(await usedNow()).toEqual({ used: 3, capacity: 5 });
      expect((await register()).status).toBe('closed');
      // Reopening needs an explicit wave.
      await apply(
        await plan({
          kind: 'wave',
          expectedPolicyRevision: 4,
          capacity: 5,
          open: true,
        }),
      );
      expect((await register()).status).toBe('admitted');
    });

    it('refuses restore-reconcile without a quarantine or with a stale revision', async () => {
      await bootstrap();
      await expect(
        plan({ kind: 'restore-reconcile', expectedPolicyRevision: 1 }),
      ).rejects.toThrow('quarantine');
      await db.query('UPDATE aw_service_policy SET reconcile_required=true');
      const value = await plan({
        kind: 'restore-reconcile',
        expectedPolicyRevision: 1,
      });
      await db.query('UPDATE aw_service_policy SET revision=revision+1');
      await expect(apply(value)).rejects.toThrow();
      expect(
        (await db.query('SELECT reconcile_required FROM aw_service_policy'))[0],
      ).toEqual({ reconcile_required: true });
    });
  });
});
