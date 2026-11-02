import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { hash } from '@future-flow/core';
import type { Database } from '@future-flow/database';
import {
  assertServiceRegistryMigration,
  captureFundedRuntime,
  captureServiceRegistryRuntime,
  migrateServiceRegistryRuntime,
  parseServiceRegistryRuntime,
  serviceRegistryRuntimeCapabilities,
  type ServiceRegistryRuntimeObservation,
} from '../scripts/lib/funded-runtime';
import { registryUpgradeRequest } from '../scripts/lib/service-registry-upgrade';
import { reviewedMigrationManifest } from '../scripts/lib/reviewed-migration-manifest';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, readdirSync: vi.fn(actual.readdirSync) };
});
let engine: PGlite;
const user = randomUUID(),
  input = {
    participants: [{ email: 'registry@example.invalid', userId: user }],
    connectionHostname: 'synthetic-postgres',
    databaseIdentitySha256: hash([
      'synthetic-postgres',
      'template1',
      'postgres',
    ]),
  };
function adapter(client: Pick<PGlite, 'query' | 'exec'>): Database {
  const db: Database = {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) =>
      values.length
        ? (await client.query<T>(sql, values)).rows
        : (((await client.exec(sql)).at(-1)?.rows ?? []) as T[]),
    transaction: (run) => run(db),
  };
  return db;
}
const tx = <T>(run: (db: Database) => Promise<T>) =>
  engine.transaction(async (client) => {
    await client.exec('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    return run(adapter(client));
  });
async function rollback(run: (db: Database) => Promise<unknown>) {
  await expect(
    tx(async (db) => {
      await run(db);
      throw Error('Synthetic test rollback');
    }),
  ).rejects.toThrow('Synthetic test rollback');
}
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec(
    'CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE ff_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());',
  );
  for (const file of reviewedMigrationManifest().slice(0, 39)) {
    await engine.exec(file.sql);
    await engine.query(
      'INSERT INTO ff_migrations(name,checksum) VALUES($1,$2)',
      [file.name, hash(file.sql)],
    );
  }
  await engine.exec(`CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid,email text,aud text,role text,is_anonymous boolean,
    deleted_at timestamptz,email_confirmed_at timestamptz,last_sign_in_at timestamptz,banned_until timestamptz,email_change text);`);
  await engine.query('INSERT INTO ff_users(id) VALUES($1)', [user]);
  await engine.query(
    "INSERT INTO auth.users VALUES($1,'registry@example.invalid','authenticated','authenticated',false,NULL,now()-interval '1 day',now()-interval '1 hour',NULL,'')",
    [user],
  );
  await engine.query(
    "INSERT INTO aw_budget_accounts(id,user_id,limit_micro,accounted_micro) VALUES('registry-project',NULL,2000000,188585),('registry-user',$1,500000,188585)",
    [user],
  );
  await engine.query(
    "INSERT INTO aw_budget_reservations(id,user_id,project_key,user_key,job_id,model,task,reserved_micro,accounted_micro,status,input_tokens,output_tokens,settled_at) VALUES($1,$2,'registry-project','registry-user',$3,'synthetic-history','life_period',200000,188585,'completed',321,654,now())",
    [randomUUID(), user, randomUUID()],
  );
  await engine.query(
    "INSERT INTO aw_billing_subscriptions(subscription_id,user_id,customer_id,status,period_start,period_end,last_state_event_created,paid_invoice_ids) VALUES('sub_registry',$1,'cus_registry','active',now()-interval '1 day',now()+interval '29 days',1,ARRAY['in_registry'])",
    [user],
  );
  await engine.query(
    "INSERT INTO aw_billing_grants(key,subscription_id,user_id,cycle_index,amount,expires_at) VALUES('in_registry','sub_registry',$1,1,5,now()+interval '29 days')",
    [user],
  );
  await engine.query(
    "INSERT INTO aw_billing_reservations(user_id,key,bucket,grant_key,state) VALUES($1,'existing-consumed-chapter','paid','in_registry','consumed')",
    [user],
  );
  await engine.query(
    "INSERT INTO aw_billing_events(event_id,subscription_id,event_type,outcome) VALUES('evt_registry','sub_registry','invoice_paid','applied')",
  );
});
afterAll(async () => {
  await engine?.close();
});

describe('explicit registry040 runtime profile alongside the unchanged legacy039 observation', () => {
  it('advertises a separate v2 capability and rejects an unknown source suffix', () => {
    expect(serviceRegistryRuntimeCapabilities()).toMatchObject({
      version: 'alterward-funded-runtime-2',
      profile: 'service-registry-040',
      fromSchema: 39,
      schema: 40,
    });
    const names = readdirSync('database/migrations');
    vi.mocked(readdirSync).mockReturnValueOnce([
      ...names,
      '041_unknown.sql',
    ] as unknown as ReturnType<typeof readdirSync>);
    expect(() => reviewedMigrationManifest()).toThrow(
      'Exactly reviewed 001–040 source manifest',
    );
  });
  it('gives039 billing a full digest without changing the historical v1 shape or hash', async () => {
    await rollback(async (db) => {
      const legacy = await captureFundedRuntime(db, input),
        before = await captureServiceRegistryRuntime(db, input);
      expect(before).toMatchObject({
        version: 'alterward-funded-runtime-2',
        schema: 39,
        registryDataSha256: null,
        registryRows: null,
      });
      expect(before.dataSha256).toBe(legacy.dataSha256);
      expect(legacy).not.toHaveProperty('billingDataSha256');
      await db.query(
        "UPDATE aw_billing_events SET outcome='noted' WHERE event_id='evt_registry'",
      );
      const changed = await captureServiceRegistryRuntime(db, input);
      expect(changed.dataSha256).toBe(before.dataSha256);
      expect(changed.billingDataSha256).not.toBe(before.billingDataSha256);
      expect(await captureFundedRuntime(db, input)).toEqual(legacy);
    });
  });
  it('migrates only039→040, preserves populated accounting and creates an empty registry', async () => {
    await rollback(async (db) => {
      const before = await captureServiceRegistryRuntime(db, input);
      const after = await migrateServiceRegistryRuntime(db, input, before);
      expect(after).toMatchObject({
        schema: 40,
        registryRows: { policy: 0, admissions: 0 },
        providerApiCalls: 0,
      });
      expect(() => assertServiceRegistryMigration(before, after)).not.toThrow();
      expect(after.billingDataSha256).toBe(before.billingDataSha256);
      expect(after.dataSha256).toBe(before.dataSha256);
      expect(
        await db.query(
          'SELECT accounted_micro,input_tokens,output_tokens,status FROM aw_budget_reservations',
        ),
      ).toEqual([
        {
          accounted_micro: 188585,
          input_tokens: 321,
          output_tokens: 654,
          status: 'completed',
        },
      ]);
      expect(
        (await db.query('SELECT name FROM ff_migrations ORDER BY name')).at(-1)
          ?.name,
      ).toBe('040_service_access_registry.sql');
      await expect(captureFundedRuntime(db, input)).rejects.toThrow(
        'checksums',
      );
    });
  });
  it('refuses a stale billing baseline before any040 SQL', async () => {
    await rollback(async (db) => {
      const before = await captureServiceRegistryRuntime(db, input);
      await db.query(
        "UPDATE aw_billing_grants SET revoked=true WHERE key='in_registry'",
      );
      await expect(
        migrateServiceRegistryRuntime(db, input, before),
      ).rejects.toThrow('source drift');
      expect(
        (
          await db.query(
            "SELECT to_regclass('public.aw_service_policy') AS policy",
          )
        )[0]?.policy,
      ).toBeNull();
    });
  });
  it('does not accept a v1 record or missing v2 fields as authority', async () => {
    await rollback(async (db) => {
      const legacy = await captureFundedRuntime(db, input),
        before = await captureServiceRegistryRuntime(db, input);
      expect(() => parseServiceRegistryRuntime(legacy)).toThrow();
      for (const key of [
        'billingDataSha256',
        'registryDataSha256',
        'registryRows',
        'profile',
      ] as const) {
        const bad = { ...before };
        delete (bad as Record<string, unknown>)[key];
        expect(() => parseServiceRegistryRuntime(bad)).toThrow();
      }
      await expect(
        migrateServiceRegistryRuntime(
          db,
          input,
          legacy as unknown as ServiceRegistryRuntimeObservation,
        ),
      ).rejects.toThrow('Exact039');
      expect(() =>
        parseServiceRegistryRuntime({ ...before, allowUnknown: true }),
      ).toThrow();
    });
  });
  it('recognizes a committed result without executing040 again', async () => {
    await rollback(async (db) => {
      const before = await captureServiceRegistryRuntime(db, input);
      await migrateServiceRegistryRuntime(db, input, before);
      const recovered = await captureServiceRegistryRuntime(db, input);
      assertServiceRegistryMigration(before, recovered);
      await expect(
        migrateServiceRegistryRuntime(db, input, before),
      ).rejects.toThrow('source drift');
      expect(
        (
          await db.query(
            "SELECT name FROM ff_migrations WHERE name LIKE '040_%'",
          )
        ).length,
      ).toBe(1);
    });
  });
  it.each(['billing', 'registry', 'migration-history'] as const)(
    'rejects %s drift in a postcommit recovery observation',
    async (kind) => {
      await rollback(async (db) => {
        const before = await captureServiceRegistryRuntime(db, input);
        await migrateServiceRegistryRuntime(db, input, before);
        await db.query(
          kind === 'billing'
            ? "UPDATE aw_billing_reservations SET state='released' WHERE key='existing-consumed-chapter'"
            : kind === 'registry'
              ? "INSERT INTO aw_service_policy(id,version,revision,mode,generation_enabled,checkout_enabled) VALUES(1,1,1,'open',true,true)"
              : "UPDATE ff_migrations SET applied_at=applied_at+interval '1 second' WHERE name LIKE '039_%'",
        );
        const after = await captureServiceRegistryRuntime(db, input);
        expect(() => assertServiceRegistryMigration(before, after)).toThrow(
          'protected data',
        );
      });
    },
  );
  it('rolls back an interruption after table creation but before receipt insertion', async () => {
    const before = await tx((db) => captureServiceRegistryRuntime(db, input));
    await expect(
      tx(async (db) => {
        const query = db.query.bind(db);
        db.query = async (sql, values = []) => {
          if (
            sql.startsWith('INSERT INTO public.ff_migrations') &&
            values[0] === '040_service_access_registry.sql'
          )
            throw Error('Synthetic interrupted receipt');
          return query(sql, values);
        };
        await migrateServiceRegistryRuntime(db, input, before);
      }),
    ).rejects.toThrow('Synthetic interrupted receipt');
    expect(await tx((db) => captureServiceRegistryRuntime(db, input))).toEqual(
      before,
    );
  });
});

describe('source-bound production040 database transport', () => {
  const context = {
    sourceCommit: 'a'.repeat(40),
    imageId: 'sha256:' + 'b'.repeat(64),
    candidateSha256: 'c'.repeat(64),
    parentAuthoritySha256: 'd'.repeat(64),
    backupManifestSha256: 'e'.repeat(64),
    restoreProofSha256: 'f'.repeat(64),
  };
  const read = <T>(run: (db: Database) => Promise<T>) =>
    engine.transaction(async (client) => {
      await client.exec(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      );
      return run(adapter(client));
    });
  it('requires a durable exact intent, preserves both ledgers and reconciles a lost COMMIT response without writes', async () => {
    const intent = await read((db) =>
      registryUpgradeRequest(db, input, 'registry-prepare', { context }),
    );
    expect(intent).toMatchObject({
      version: 'alterward-registry-upgrade-intent-1',
      purpose: 'schema-040',
      before: { schema: 39 },
      serviceActivationAllowed: false,
    });
    expect(
      await read((db) =>
        registryUpgradeRequest(db, input, 'registry-reconcile', {
          context,
          intent,
        }),
      ),
    ).toMatchObject({ state: 'uncommitted', protectedDataUnchanged: true });
    const apply = (
      db: Database,
      candidate = intent,
      bound = context,
      persistedIntentSha256 = hash(candidate),
    ) =>
      registryUpgradeRequest(db, input, 'registry-apply', {
        context: bound,
        intent: candidate,
        persistedIntentSha256,
      });
    for (const key of Object.keys(context) as (keyof typeof context)[]) {
      const changed = {
        ...context,
        [key]:
          key === 'sourceCommit'
            ? '0'.repeat(40)
            : key === 'imageId'
              ? 'sha256:' + '0'.repeat(64)
              : '0'.repeat(64),
      };
      await expect(tx((db) => apply(db, intent, changed))).rejects.toThrow(
        'binding mismatch',
      );
    }
    await expect(
      tx((db) => apply(db, intent, context, '0'.repeat(64))),
    ).rejects.toThrow('Durable exact');
    const expired = {
      ...intent,
      observedAt: '2020-01-01T00:00:00.000Z',
      expiresAt: '2020-01-01T00:15:00.000Z',
    };
    await expect(tx((db) => apply(db, expired))).rejects.toThrow('Unexpired');
    await expect(
      tx((db) =>
        registryUpgradeRequest(db, input, 'registry-prepare', { context }),
      ),
    ).rejects.toThrow('Read-only');
    await expect(
      read((db) =>
        registryUpgradeRequest(db, input, 'registry-prepare', {
          context,
          ignored: true,
        }),
      ),
    ).rejects.toThrow();
    await expect(
      tx(async (db) => {
        await db.query(
          "UPDATE aw_billing_grants SET revoked=true WHERE key='in_registry'",
        );
        await apply(db);
      }),
    ).rejects.toThrow('source drift');
    // All negative attempts rolled back and left039 intact.
    expect(
      await read((db) =>
        registryUpgradeRequest(db, input, 'registry-reconcile', {
          context,
          intent,
        }),
      ),
    ).toMatchObject({ state: 'uncommitted' });
    await expect(
      tx(async (db) => {
        const query = db.query.bind(db);
        db.query = async (sql, values = []) => {
          if (
            sql.startsWith('INSERT INTO public.ff_migrations') &&
            values[0] === '040_service_access_registry.sql'
          )
            throw Error('Synthetic upgrade transport interruption');
          return query(sql, values);
        };
        await apply(db);
      }),
    ).rejects.toThrow('Synthetic upgrade transport interruption');
    expect(
      await read((db) =>
        registryUpgradeRequest(db, input, 'registry-reconcile', {
          context,
          intent,
        }),
      ),
    ).toMatchObject({ state: 'uncommitted' });
    // Persisted intent hash is supplied only after the root caller stored it.
    const applied = await tx((db) => apply(db));
    expect(applied).toMatchObject({
      state: 'committed',
      intentSha256: hash(intent),
      observation: { schema: 40, registryRows: { policy: 0, admissions: 0 } },
      protectedDataUnchanged: true,
      providerApiCalls: 0,
      authProviderWrites: false,
    });
    const statements: string[] = [];
    const recovered = await read((db) => {
      const query = db.query.bind(db);
      db.query = async (sql, values = []) => {
        statements.push(sql);
        return query(sql, values);
      };
      return registryUpgradeRequest(db, input, 'registry-reconcile', {
        context,
        intent,
      });
    });
    expect(recovered).toEqual(applied);
    expect(
      statements.every((sql) => /^(SELECT|SHOW|SET LOCAL)/i.test(sql)),
    ).toBe(true);
    await expect(tx((db) => apply(db))).rejects.toThrow('source drift');
    expect(
      (
        await engine.query(
          "SELECT name FROM ff_migrations WHERE name LIKE '040_%'",
        )
      ).rows,
    ).toHaveLength(1);
  });
});
