import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { evaluateServiceAccess, type ServiceAction } from '@future-flow/core';
import {
  Repository,
  ServiceAccessRepository,
  type Database,
} from '@future-flow/database';
import {
  assertReviewedFundedPre040Schema,
  assertReviewedPrivacyRecoverySchema,
} from '../scripts/lib/privacy-recovery-schema';
import {
  assertFundedPre040SecurityCatalog,
  assertPrivacySecurityCatalog,
} from '../scripts/lib/privacy-security-catalog';

let engine: PGlite,
  db: Database,
  accounts: Repository,
  store: ServiceAccessRepository;
let owner: string, other: string;
const invitation = {
  mode: 'invitation',
  generationEnabled: true,
  checkoutEnabled: true,
} as const;
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
async function digest(tables: string[]) {
  const result: Record<string, unknown> = {};
  for (const table of tables) {
    if (!/^[a-z][a-z0-9_]+$/.test(table))
      throw Error('Fixture identifier required');
    result[table] = await db.query(
      `SELECT count(*)::int AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS digest FROM "${table}" t`,
    );
  }
  return result;
}
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
  const migrations = readdirSync('database/migrations')
    .filter((n) => n.endsWith('.sql'))
    .sort();
  expect(migrations).toHaveLength(40);
  expect(migrations[39]).toBe('040_service_access_registry.sql');
  for (const name of migrations.slice(0, 39))
    await engine.exec(readFileSync('database/migrations/' + name, 'utf8'));
  db = adapter(engine);
  accounts = new Repository(db);
  store = new ServiceAccessRepository(db);
  const seed = randomUUID();
  await accounts.ensureUser(seed);
  await db.query(
    "INSERT INTO aw_billing_reservations(user_id,key,bucket,state) VALUES($1,'existing-chapter','taster','consumed')",
    [seed],
  );
  await db.query(
    "INSERT INTO aw_budget_accounts(id,user_id,limit_micro,accounted_micro) VALUES('preserved-usd',$1,1000,77)",
    [seed],
  );
  await db.query(
    "INSERT INTO aw_budget_reservations(id,user_id,project_key,user_key,job_id,model,task,reserved_micro,accounted_micro,status) VALUES($1,$2,'preserved-usd','preserved-usd',$3,'test-model','life_period',77,77,'unknown')",
    [randomUUID(), seed, randomUUID()],
  );
  const tables = (
    await db.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).map((r) => r.tablename);
  expect(tables).toHaveLength(100);
  await db.transaction(async (tx) => {
    expect(await assertReviewedFundedPre040Schema(tx)).toMatchObject({
      reviewedTables: 100,
      reviewedColumns: 892,
      reviewedForeignKeys: 225,
    });
    await assertFundedPre040SecurityCatalog(tx);
    await expect(assertReviewedPrivacyRecoverySchema(tx)).rejects.toThrow(
      'table set',
    );
  });
  expect((await accounts.exportAccount(seed)).aw_service_admissions).toEqual(
    [],
  );
  const before = await digest(tables),
    sql = readFileSync('database/migrations/' + migrations[39], 'utf8');
  await expect(
    engine.transaction(async (tx) => {
      await tx.exec(sql);
      throw Error('Synthetic interrupted append');
    }),
  ).rejects.toThrow('Synthetic interrupted append');
  expect(
    (
      await db.query("SELECT to_regclass('public.aw_service_policy') AS policy")
    )[0]?.policy,
  ).toBeNull();
  expect(await digest(tables)).toEqual(before);
  await engine.transaction((tx) => tx.exec(sql));
  expect(await digest(tables)).toEqual(before);
  await db.transaction(async (tx) => {
    expect(await assertReviewedPrivacyRecoverySchema(tx)).toMatchObject({
      reviewedTables: 102,
      reviewedColumns: 909,
      reviewedForeignKeys: 226,
    });
    await assertPrivacySecurityCatalog(tx);
    await expect(assertReviewedFundedPre040Schema(tx)).rejects.toThrow(
      'table set',
    );
  });
});
beforeEach(async () => {
  vi.restoreAllMocks();
  await db.query('TRUNCATE aw_service_policy,aw_service_admissions');
  owner = randomUUID();
  other = randomUUID();
  await accounts.ensureUser(owner);
  await accounts.ensureUser(other);
});
afterAll(async () => {
  await engine?.close();
});
async function decision(user = owner, action: ServiceAction = 'read') {
  const snap = await store.snapshot(user);
  return evaluateServiceAccess(snap.policy, user, snap.admission, action);
}
describe('durable server-owned service access over append-only migration040', () => {
  it.each([
    [
      'ALTER TABLE aw_service_admissions ADD COLUMN private_email text',
      'columns or foreign-key',
    ],
    [
      'ALTER TABLE aw_service_admissions DROP CONSTRAINT aw_service_admissions_user_id_fkey',
      'columns or foreign-key',
    ],
    [
      'ALTER TABLE aw_service_policy ALTER COLUMN reconcile_required SET DEFAULT false',
      'executable catalog',
    ],
    [
      'CREATE INDEX unreviewed_service_revision ON aw_service_policy(revision)',
      'executable catalog',
    ],
    [
      'ALTER TABLE aw_service_admissions DISABLE ROW LEVEL SECURITY',
      'privileges',
    ],
    ['GRANT SELECT ON aw_service_policy TO authenticated', 'privileges'],
  ])(
    'rejects unreviewed registry schema/security drift: %s',
    async (sql, message) => {
      await expect(
        db.transaction(async (tx) => {
          await tx.query(sql);
          await assertPrivacySecurityCatalog(tx);
        }),
      ).rejects.toThrow(message);
      await db.transaction((tx) => assertPrivacySecurityCatalog(tx));
    },
  );
  it('starts empty and closed without auto-admitting old or new accounts', async () => {
    expect(await store.snapshot(owner)).toEqual({
      policy: null,
      admission: { status: 'unavailable' },
    });
    expect(await db.query('SELECT * FROM aw_service_admissions')).toEqual([]);
    expect(await decision()).toMatchObject({
      allowed: false,
      code: 'SERVICE_ACCESS_UNAVAILABLE',
    });
    expect(await decision(owner, 'account-control')).toEqual({ allowed: true });
  });
  it('uses explicit account-bound admission and keeps revocation effective in open mode', async () => {
    await store.replacePolicy(0, invitation);
    expect(await decision()).toMatchObject({
      allowed: false,
      code: 'SERVICE_ADMISSION_CLOSED',
    });
    expect(
      await store.replaceAdmission(owner.toUpperCase(), 0, 'active'),
    ).toMatchObject({ userId: owner, revision: 1, state: 'active' });
    expect(await decision()).toEqual({ allowed: true });
    expect(await decision(other)).toMatchObject({ allowed: false });
    await store.replaceAdmission(owner, 1, 'revoked');
    await store.configureAdmission(1, { capacity: 10, open: true });
    expect(await decision()).toMatchObject({
      allowed: false,
      code: 'SERVICE_INVITATION_REQUIRED',
    });
    // Open mode never lets an unlisted account act: it only makes the account
    // eligible for the atomic admission step.
    expect(await decision(other)).toMatchObject({
      allowed: false,
      code: 'SERVICE_ADMISSION_REQUIRED',
    });
  });
  it('keeps generation/checkout pauses independent of reading and admission revisions', async () => {
    await store.replacePolicy(0, { ...invitation, generationEnabled: false });
    await store.replaceAdmission(owner, 0, 'active');
    expect(await decision(owner, 'generate')).toMatchObject({
      allowed: false,
      code: 'SERVICE_GENERATION_PAUSED',
    });
    expect(await decision(owner, 'checkout')).toEqual({ allowed: true });
    await store.replacePolicy(1, { ...invitation, checkoutEnabled: false });
    expect(await decision(owner, 'generate')).toEqual({ allowed: true });
    expect(await decision(owner, 'checkout')).toMatchObject({
      allowed: false,
      code: 'SERVICE_CHECKOUT_PAUSED',
    });
    expect(await decision()).toEqual({ allowed: true });
    expect((await store.snapshot(owner)).admission).toMatchObject({
      admission: { revision: 1 },
    });
  });
  it('does not turn an update of a missing policy or admission into an insert', async () => {
    await expect(store.replacePolicy(2, invitation)).rejects.toMatchObject({
      code: 'SERVICE_ACCESS_CONFLICT',
    });
    await expect(
      store.replaceAdmission(owner, 2, 'active'),
    ).rejects.toMatchObject({ code: 'SERVICE_ACCESS_CONFLICT' });
    expect(await db.query('SELECT * FROM aw_service_policy')).toEqual([]);
    expect(await db.query('SELECT * FROM aw_service_admissions')).toEqual([]);
  });
  it('allows only one concurrent initial policy creation and rejects stale CAS', async () => {
    const results = await Promise.allSettled([
      store.replacePolicy(0, invitation),
      store.replacePolicy(0, { ...invitation, generationEnabled: false }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      results.filter((r) => r.status === 'rejected').map((r) => r.reason.code),
    ).toEqual(['SERVICE_ACCESS_CONFLICT']);
    await expect(store.replacePolicy(0, invitation)).rejects.toMatchObject({
      code: 'SERVICE_ACCESS_CONFLICT',
    });
    expect(
      (await db.query('SELECT revision::int FROM aw_service_policy'))[0]
        ?.revision,
    ).toBe(1);
  });
  it('does not let a concurrent stale grant overwrite revocation', async () => {
    await store.replacePolicy(0, invitation);
    await store.replaceAdmission(owner, 0, 'active');
    const results = await Promise.allSettled([
      store.replaceAdmission(owner, 1, 'revoked'),
      store.replaceAdmission(owner, 1, 'revoked'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      results.filter((r) => r.status === 'rejected').map((r) => r.reason.code),
    ).toEqual(['SERVICE_ACCESS_CONFLICT']);
    await expect(
      store.replaceAdmission(owner, 1, 'active'),
    ).rejects.toMatchObject({ code: 'SERVICE_ACCESS_CONFLICT' });
    expect(await decision()).toMatchObject({ allowed: false });
  });
  it.each([-1, NaN, 0.5, Number.MAX_SAFE_INTEGER, Infinity])(
    'rejects invalid expected revision %s without a partial mutation',
    async (revision) => {
      await expect(
        store.replacePolicy(revision, invitation),
      ).rejects.toMatchObject({ code: 'SERVICE_ACCESS_INPUT_INVALID' });
      await expect(
        store.replaceAdmission(owner, revision, 'active'),
      ).rejects.toMatchObject({ code: 'SERVICE_ACCESS_INPUT_INVALID' });
      expect(await db.query('SELECT * FROM aw_service_policy')).toEqual([]);
      expect(await db.query('SELECT * FROM aw_service_admissions')).toEqual([]);
    },
  );
  it('rejects client metadata and coupon fields instead of treating them as authority', async () => {
    await expect(
      store.replacePolicy(0, {
        ...invitation,
        user_metadata: { invited: true },
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_ACCESS_INPUT_INVALID' });
    await expect(
      store.replaceAdmission(owner, 0, { state: 'active', coupon: true }),
    ).rejects.toMatchObject({ code: 'SERVICE_ACCESS_INPUT_INVALID' });
    expect(await db.query('SELECT * FROM aw_service_policy')).toEqual([]);
  });
  it('fails closed on a read failure even in open mode', async () => {
    await store.replacePolicy(0, invitation);
    await store.configureAdmission(1, { capacity: 10, open: true });
    vi.spyOn(db, 'query').mockRejectedValueOnce(
      Error('Synthetic connection failure'),
    );
    expect(await decision()).toMatchObject({
      allowed: false,
      code: 'SERVICE_ACCESS_UNAVAILABLE',
    });
  });
  it('does not clear restore quarantine through a normal policy update or new admission', async () => {
    await store.replacePolicy(0, invitation);
    await store.configureAdmission(1, { capacity: 10, open: true });
    await db.query('UPDATE aw_service_policy SET reconcile_required=true');
    await store.replacePolicy(2, invitation);
    await store.replaceAdmission(owner, 0, 'active');
    for (const action of ['read', 'generate', 'checkout'] as const)
      expect(await decision(owner, action)).toMatchObject({
        allowed: false,
        code: 'SERVICE_ACCESS_UNAVAILABLE',
      });
    expect(await decision(owner, 'account-control')).toEqual({ allowed: true });
  });
  it('does not create or resurrect an unknown/deleting account', async () => {
    await expect(
      store.replaceAdmission(randomUUID(), 0, 'active'),
    ).rejects.toMatchObject({ code: 'SERVICE_ACCESS_ACCOUNT_INACTIVE' });
    await db.query("UPDATE ff_users SET status='deleting' WHERE id=$1", [
      owner,
    ]);
    await expect(
      store.replaceAdmission(owner, 0, 'active'),
    ).rejects.toMatchObject({ code: 'SERVICE_ACCESS_ACCOUNT_INACTIVE' });
    expect(await db.query('SELECT * FROM aw_service_admissions')).toEqual([]);
  });
  it('removes admission with its account root and never grants it to another account', async () => {
    await store.replacePolicy(0, invitation);
    await store.replaceAdmission(owner, 0, 'active');
    await db.query('DELETE FROM ff_users WHERE id=$1', [owner]);
    expect(await db.query('SELECT * FROM aw_service_admissions')).toEqual([]);
    expect(await decision()).toMatchObject({
      allowed: false,
      code: 'SERVICE_ADMISSION_CLOSED',
    });
    expect(await decision(other)).toMatchObject({
      allowed: false,
      code: 'SERVICE_ADMISSION_CLOSED',
    });
  });
  it('does not change either financial ledger when invitation or pause changes', async () => {
    const tables = [
      'aw_billing_events',
      'aw_billing_grants',
      'aw_billing_reservations',
      'aw_billing_subscriptions',
      'aw_budget_accounts',
      'aw_budget_reservations',
    ];
    const before = await digest(tables);
    await store.replacePolicy(0, invitation);
    await store.replaceAdmission(owner, 0, 'active');
    await store.replaceAdmission(owner, 1, 'revoked');
    await store.replacePolicy(1, { ...invitation, generationEnabled: false });
    expect(await digest(tables)).toEqual(before);
  });
  it('exports only the account-owned admission and excludes global policy and other accounts', async () => {
    await store.replacePolicy(0, invitation);
    await store.replaceAdmission(owner, 0, 'active');
    await store.replaceAdmission(other, 0, 'revoked');
    const exported = await accounts.exportAccount(owner);
    expect(exported.aw_service_admissions).toEqual([
      expect.objectContaining({ revision: 1, state: 'active' }),
    ]);
    expect(JSON.stringify(exported)).not.toContain(other);
    expect(exported).not.toHaveProperty('aw_service_policy');
  });
  it.each(['anon', 'authenticated'])(
    'denies browser role %s every registry read/write operation',
    async (role) => {
      await store.replacePolicy(0, invitation);
      await store.replaceAdmission(owner, 0, 'active');
      for (const statement of [
        'SELECT * FROM aw_service_policy',
        'SELECT * FROM aw_service_admissions',
        "INSERT INTO aw_service_policy(id,version,revision,mode,generation_enabled,checkout_enabled,admission_capacity) VALUES(1,1,1,'open',true,true,10)",
        "INSERT INTO aw_service_admissions(user_id,revision,state) VALUES('" +
          other +
          "',1,'active')",
        "UPDATE aw_service_policy SET mode='open'",
        "UPDATE aw_service_admissions SET state='active'",
        'DELETE FROM aw_service_policy',
        'DELETE FROM aw_service_admissions',
      ]) {
        await engine.exec('SET ROLE ' + role);
        try {
          await expect(engine.exec(statement)).rejects.toMatchObject({
            code: '42501',
          });
        } finally {
          await engine.exec('RESET ROLE');
        }
      }
      expect(await decision()).toEqual({ allowed: true });
      expect(await decision(other)).toMatchObject({ allowed: false });
    },
  );
});
