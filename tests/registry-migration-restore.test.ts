import { randomUUID, createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { hash } from '@future-flow/core';
import { ServiceAccessRepository, type Database } from '@future-flow/database';
import {
  preparePrivacyRestoreFixture,
  type PrivacyRestoreFixture,
} from '../scripts/lib/privacy-restore-proof';
import { reviewedMigrationManifest } from '../scripts/lib/reviewed-migration-manifest';
import { createPrivacyFenceEnvelope } from '../scripts/lib/privacy-fence-envelope';
import {
  prepareRegistryMigrationRestore,
  applyRegistryMigrationRestore,
  verifyRegistryMigrationRestore,
} from '../scripts/lib/registry-migration-restore';

let source: PGlite,
  backup: Blob,
  fixture: PrivacyRestoreFixture,
  dumpSha256: string;
const active: PGlite[] = [];
function adapter(
  client: Pick<PGlite, 'query' | 'transaction' | 'exec'>,
  name: string,
  nested = false,
): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) =>
      sql === 'SELECT current_database() AS name'
        ? ([{ name }] as unknown as T[])
        : values.length
          ? (await client.query<T>(sql, values)).rows
          : (((await client.exec(sql)).at(-1)?.rows ?? []) as T[]),
    transaction: (run) =>
      nested
        ? run(adapter(client, name, true))
        : client.transaction((tx) =>
            run(adapter(tx as unknown as PGlite, name, true)),
          ),
  };
}
beforeAll(async () => {
  source = new PGlite();
  await source.exec(
    'CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE ff_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());',
  );
  for (const step of reviewedMigrationManifest().slice(0, 39)) {
    await source.exec(step.sql);
    await source.query(
      'INSERT INTO ff_migrations(name,checksum) VALUES($1,$2)',
      [step.name, hash(step.sql)],
    );
  }
  fixture = await preparePrivacyRestoreFixture(
    adapter(source, 'template1'),
    async () => {
      backup = await source.dumpDataDir('gzip');
    },
    39,
  );
  dumpSha256 = createHash('sha256')
    .update(Buffer.from(await backup.arrayBuffer()))
    .digest('hex');
}, 60000);
afterEach(async () => {
  for (const e of active.splice(0)) await e.close();
});
afterAll(async () => {
  await source?.close();
});
async function restored() {
  const engine = new PGlite({ loadDataDir: backup });
  active.push(engine);
  await engine.waitReady;
  const name = 'aw_restore_' + randomUUID().replaceAll('-', '').slice(0, 24),
    db = adapter(engine, name);
  const context = {
    sourceCommit: 'c'.repeat(40),
    imageId: 'sha256:' + 'd'.repeat(64),
    backupRunId: 'unit-registry-restore',
    backupDumpSha256: dumpSha256,
    backupCapturedAt: fixture.backupCapturedAt,
    quarantineDatabase: name,
    quarantineInstanceSha256: hash(['unit-PGlite', name]),
  };
  const binding = {
    mode: 'recovery' as const,
    nonce: randomUUID().replaceAll('-', '').slice(0, 24),
    // Held039 capture/replay controller and040 image have separate provenance.
    sourceCommit: 'b'.repeat(40),
    sourceFilesDigest: hash('unit-reviewed-source'),
    ownerManifestDigest: hash('unit-owner-manifest'),
    projectBinding: fixture.projectBinding,
    writerFenceDigest: fixture.writerFenceDigest,
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  };
  const envelope = createPrivacyFenceEnvelope(
    fixture.authority,
    hash('unit-auth-state'),
    binding,
  );
  const request = {
    action: 'replay',
    fundedRuntime: 'v9',
    recoveryProfile: 'historical039',
    quarantineDatabase: name,
    backupCapturedAt: context.backupCapturedAt,
    backupDumpSha256: dumpSha256,
    envelope,
    held: { ...binding, stateDigest: envelope.stateDigest },
  };
  return { engine, db, name, context, request };
}
describe('versioned039 backup → replayed039 → registry040 migration restore composition (PGlite)', () => {
  it('measures a source/image/instance-bound intent after real039 replay without changing the original authority', async () => {
    const f = await restored(),
      original = hash(fixture.authority);
    expect(f.request.envelope.binding.sourceCommit).not.toBe(
      f.context.sourceCommit,
    );
    const intent = await prepareRegistryMigrationRestore(
      f.db,
      f.request,
      f.context,
    );
    expect(intent).toMatchObject({
      version: 'alterward-registry-restore-intent-1',
      before: { schema: 39, registryDataSha256: null },
      sourceAuthoritySha256: original,
      providerApiCalls: 0,
      serviceActivationAllowed: false,
    });
    expect(hash(fixture.authority)).toBe(original);
    expect(
      (
        await f.db.query(
          "SELECT to_regclass('public.aw_service_policy') AS policy",
        )
      )[0]?.policy,
    ).toBeNull();
    expect(
      await f.db.query('SELECT 1 FROM ff_users WHERE id=$1', [fixture.b]),
    ).toEqual([]);
    expect(
      (await f.db.query('SELECT count(*)::int AS count FROM ff_migrations'))[0]
        ?.count,
    ).toBe(39);
  });
  it('applies one040 step and recovers a lost output by independent read-only040 verification', async () => {
    const f = await restored(),
      intent = await prepareRegistryMigrationRestore(
        f.db,
        f.request,
        f.context,
      );
    await applyRegistryMigrationRestore(f.db, f.request, intent, f.context); // output deliberately not adopted
    const [receipt] = await f.db.query(
      "SELECT (applied_at AT TIME ZONE 'UTC')::text AS at FROM ff_migrations WHERE name='040_service_access_registry.sql'",
    );
    const writes: string[] = [];
    const transaction = f.db.transaction.bind(f.db);
    f.db.transaction = (run) =>
      transaction((tx) => {
        const query = tx.query.bind(tx);
        tx.query = async (sql, values = []) => {
          if (
            /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|DO|TRUNCATE|GRANT|REVOKE)\b/i.test(
              sql,
            )
          )
            writes.push(sql);
          return query(sql, values);
        };
        return run(tx);
      });
    const recovered = await verifyRegistryMigrationRestore(
      f.db,
      f.request,
      intent,
      f.context,
    );
    expect(writes).toEqual([]);
    expect(recovered).toMatchObject({
      version: 'alterward-registry-migration-restore-proof-1',
      replayedDataPreserved: true,
      newRegistryEmpty: true,
      sourceTables: 100,
      reviewedTables: 102,
      reviewedForeignKeys: 226,
      providerApiCalls: 0,
      authProviderWrites: false,
      serviceActivationAllowed: false,
    });
    expect(recovered.after.applicationDataSha256).toBe(
      intent.before.applicationDataSha256,
    );
    expect(recovered.after.migrationPrefixSha256).toBe(
      intent.before.migrationPrefixSha256,
    );
    expect(await new ServiceAccessRepository(f.db).snapshot(fixture.a)).toEqual(
      { policy: null, admission: { status: 'unavailable' } },
    );
    expect(
      (
        await f.db.query(
          "SELECT (applied_at AT TIME ZONE 'UTC')::text AS at FROM ff_migrations WHERE name='040_service_access_registry.sql'",
        )
      )[0],
    ).toEqual(receipt);
    expect(
      (
        await f.db.query(
          "SELECT count(*)::int AS count FROM ff_migrations WHERE name LIKE '040_%'",
        )
      )[0]?.count,
    ).toBe(1);
    f.db.transaction = transaction;
    await expect(
      applyRegistryMigrationRestore(f.db, f.request, intent, f.context),
    ).rejects.toThrow('receipts');
  });
  it('refuses source/image/backup/instance substitution before the schema write', async () => {
    const f = await restored(),
      intent = await prepareRegistryMigrationRestore(
        f.db,
        f.request,
        f.context,
      );
    for (const changed of [
      { imageId: 'sha256:' + 'a'.repeat(64) },
      { sourceCommit: 'a'.repeat(40) },
      { backupRunId: 'different-run' },
      { quarantineInstanceSha256: 'a'.repeat(64) },
      { backupDumpSha256: 'a'.repeat(64) },
    ])
      await expect(
        applyRegistryMigrationRestore(f.db, f.request, intent, {
          ...f.context,
          ...changed,
        }),
      ).rejects.toThrow(/binding mismatch|request required/);
    expect(
      (
        await f.db.query(
          "SELECT to_regclass('public.aw_service_policy') AS policy",
        )
      )[0]?.policy,
    ).toBeNull();
  });
  it('rejects a changed039 snapshot between readonly planning and serializable apply', async () => {
    const f = await restored(),
      intent = await prepareRegistryMigrationRestore(
        f.db,
        f.request,
        f.context,
      );
    await f.db.query(
      "UPDATE aw_billing_grants SET revoked=true WHERE key='in_kept'",
    );
    await expect(
      applyRegistryMigrationRestore(f.db, f.request, intent, f.context),
    ).rejects.toThrow('drift before SQL');
    expect(
      (
        await f.db.query(
          "SELECT to_regclass('public.aw_service_policy') AS policy",
        )
      )[0]?.policy,
    ).toBeNull();
  });
  it('rolls an interrupted append back and requires an explicit subsequent apply', async () => {
    const f = await restored(),
      intent = await prepareRegistryMigrationRestore(
        f.db,
        f.request,
        f.context,
      ),
      transaction = f.db.transaction.bind(f.db);
    f.db.transaction = (run) =>
      transaction((tx) => {
        const query = tx.query.bind(tx);
        tx.query = async (sql, values = []) => {
          if (
            sql.startsWith('INSERT INTO public.ff_migrations') &&
            values[0] === '040_service_access_registry.sql'
          )
            throw Error('Synthetic lost receipt before commit');
          return query(sql, values);
        };
        return run(tx);
      });
    await expect(
      applyRegistryMigrationRestore(f.db, f.request, intent, f.context),
    ).rejects.toThrow('Synthetic lost receipt before commit');
    f.db.transaction = transaction;
    expect(
      (await f.db.query('SELECT count(*)::int AS count FROM ff_migrations'))[0]
        ?.count,
    ).toBe(39);
    expect(
      (
        await f.db.query(
          "SELECT to_regclass('public.aw_service_policy') AS policy",
        )
      )[0]?.policy,
    ).toBeNull();
    expect(
      await applyRegistryMigrationRestore(f.db, f.request, intent, f.context),
    ).toMatchObject({ newRegistryEmpty: true });
  });
  it.each(['billing', 'registry', 'receipt', 'prefix'] as const)(
    'refuses %s drift after the committed040 step',
    async (kind) => {
      const f = await restored(),
        intent = await prepareRegistryMigrationRestore(
          f.db,
          f.request,
          f.context,
        );
      await applyRegistryMigrationRestore(f.db, f.request, intent, f.context);
      const sql = {
        billing:
          "UPDATE aw_billing_grants SET revoked=true WHERE key='in_kept'",
        registry:
          "INSERT INTO aw_service_policy(id,version,revision,mode,generation_enabled,checkout_enabled) VALUES(1,1,1,'open',true,true)",
        receipt:
          "UPDATE ff_migrations SET checksum='tampered' WHERE name LIKE '040_%'",
        prefix:
          "UPDATE ff_migrations SET applied_at=applied_at+interval '1 second' WHERE name LIKE '039_%'",
      }[kind];
      await f.db.query(sql);
      await expect(
        verifyRegistryMigrationRestore(f.db, f.request, intent, f.context),
      ).rejects.toThrow(/data or receipts changed|migration receipts/);
    },
  );
});
