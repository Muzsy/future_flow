import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hash } from '@future-flow/core';
import type { Database } from '@future-flow/database';
import {
  captureHistorical039PrivacyRestoreAuthority,
  capturePrivacyRestoreAuthority,
  replayHistorical039PrivacyRestore,
  replayPrivacyRestore,
  type PrivacyRestoreAuthority,
  type ReplayBinding,
} from '../scripts/lib/privacy-restore';
import {
  verifyHistorical039PrivacyRestore,
  verifyPrivacyRestore,
} from '../scripts/lib/privacy-restore-verifier';
import {
  historical039RecoveryProfile,
  registry040RecoveryProfile,
} from '../scripts/lib/privacy-recovery-profile';
import { reviewedMigrationManifest } from '../scripts/lib/reviewed-migration-manifest';

type Fixture = {
  engine: PGlite;
  db: Database;
  name: string;
  authority: PrivacyRestoreAuthority;
  binding: ReplayBinding;
};
let old: Fixture, current: Fixture;
const owner = randomUUID(),
  projectBinding = hash('synthetic-profile-project'),
  writerFenceDigest = hash('synthetic-profile-fence');
function adapter(
  client: Pick<PGlite, 'query' | 'transaction'>,
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
        : (await client.query<T>(sql, values)).rows,
    transaction: (run) =>
      nested
        ? run(adapter(client, name, true))
        : client.transaction((tx) =>
            run(adapter(tx as unknown as PGlite, name, true)),
          ),
  };
}
async function fixture(schema: 39 | 40): Promise<Fixture> {
  const engine = new PGlite(),
    name = 'aw_restore_' + randomUUID().replaceAll('-', '').slice(0, 24);
  await engine.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
  for (const file of reviewedMigrationManifest().slice(0, schema))
    await engine.exec(file.sql);
  await engine.query('INSERT INTO ff_users(id) VALUES($1)', [owner]);
  const db = adapter(engine, name),
    backupCapturedAt = new Date().toISOString();
  const evidence = {
    projectBinding,
    writerFenceDigest,
    authVerifiedAt: new Date().toISOString(),
    authUserIds: [owner],
  };
  const authority = await (
    schema === 39
      ? captureHistorical039PrivacyRestoreAuthority
      : capturePrivacyRestoreAuthority
  )(db, evidence);
  return {
    engine,
    db,
    name,
    authority,
    binding: {
      quarantineDatabase: name,
      backupCapturedAt,
      expectedAuthorityHash: hash(authority),
      projectBinding,
      writerFenceDigest,
    },
  };
}
beforeAll(async () => {
  old = await fixture(39);
  current = await fixture(40);
}, 60000);
afterAll(async () => {
  await old?.engine.close();
  await current?.engine.close();
});
async function snapshot(f: Fixture) {
  const profile =
    f === old ? historical039RecoveryProfile : registry040RecoveryProfile;
  return f.db.transaction(async (tx) => ({
    catalog: await profile.catalog(tx),
    users: await tx.query('SELECT * FROM ff_users ORDER BY id'),
    budgets: await tx.query('SELECT * FROM aw_budget_accounts ORDER BY id'),
    ...(f === current
      ? {
          policy: await tx.query('SELECT * FROM aw_service_policy'),
          admissions: await tx.query('SELECT * FROM aw_service_admissions'),
        }
      : {}),
  }));
}
describe('explicit039 and040 recovery profiles without fallback or authority reinterpretation', () => {
  it('keeps the authority wire structure and distinguishes the fixed catalog and schema digests', () => {
    expect(old.authority.schemaVersion).toBe('privacy-restore-authority-1');
    expect(current.authority.schemaVersion).toBe(old.authority.schemaVersion);
    expect(Object.keys(current.authority).sort()).toEqual(
      Object.keys(old.authority).sort(),
    );
    expect(current.authority.schemaDigest).not.toBe(old.authority.schemaDigest);
    expect(current.authority.securityCatalog.immutableDigest).not.toBe(
      old.authority.securityCatalog.immutableDigest,
    );
  });
  it.each(['039-to040', '040-to039'] as const)(
    'refuses cross-profile authority %s before any mutation',
    async (direction) => {
      const source = direction === '039-to040' ? old : current,
        target = direction === '039-to040' ? current : old;
      const before = await snapshot(target),
        binding = {
          ...target.binding,
          backupCapturedAt: source.binding.backupCapturedAt,
          expectedAuthorityHash: hash(source.authority),
        };
      await expect(
        (target === current
          ? replayPrivacyRestore
          : replayHistorical039PrivacyRestore)(
          target.db,
          source.authority,
          binding,
        ),
      ).rejects.toThrow('matching-schema');
      expect(await snapshot(target)).toEqual(before);
    },
  );
  it('does not retry a historical039 wrapper against matching040 authority/database', async () => {
    const before = await snapshot(current);
    await expect(
      replayHistorical039PrivacyRestore(
        current.db,
        current.authority,
        current.binding,
      ),
    ).rejects.toThrow('table set');
    expect(await snapshot(current)).toEqual(before);
  });
  it('does not retry the current040 wrapper against matching039 authority/database', async () => {
    const before = await snapshot(old);
    await expect(
      replayPrivacyRestore(old.db, old.authority, old.binding),
    ).rejects.toThrow('table set');
    expect(await snapshot(old)).toEqual(before);
  });
  it('replays and independently verifies the historical039 baseline without touching040 tables', async () => {
    await replayHistorical039PrivacyRestore(old.db, old.authority, old.binding);
    expect(
      await verifyHistorical039PrivacyRestore(
        old.db,
        old.authority,
        old.binding,
      ),
    ).toMatchObject({
      reviewedTables: 100,
      reviewedForeignKeys: 225,
      serviceActivationAllowed: false,
      paidAiCalls: 0,
    });
    expect(
      (
        await old.db.query(
          "SELECT to_regclass('public.aw_service_policy') AS policy",
        )
      )[0]?.policy,
    ).toBeNull();
  });
  it('replays and independently verifies040 under its explicit profile', async () => {
    await replayPrivacyRestore(current.db, current.authority, current.binding);
    expect(
      await verifyPrivacyRestore(
        current.db,
        current.authority,
        current.binding,
      ),
    ).toMatchObject({
      reviewedTables: 102,
      reviewedForeignKeys: 226,
      serviceActivationAllowed: false,
      paidAiCalls: 0,
    });
  });
});
