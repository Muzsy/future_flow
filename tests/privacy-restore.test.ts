import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hash } from '@future-flow/core';
import type { Database } from '@future-flow/database';
import {
  replayPrivacyRestore,
  type PrivacyRestoreAuthority,
} from '../scripts/lib/privacy-restore';
import {
  preparePrivacyRestoreFixture,
  verifyPrivacyRestoreFixture,
  type PrivacyRestoreFixture,
} from '../scripts/lib/privacy-restore-proof';
import { applyMigrations } from '../scripts/lib/migrations';
let fixture: PrivacyRestoreFixture;
function adapter(
  client: Pick<PGlite, 'query' | 'transaction'>,
  nested = false,
): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) =>
      sql === 'SELECT current_database() AS name'
        ? // PGlite always connects to template1; only this connection-name check is
          // simulated here. The separate PostgreSQL runner checks a real database.
          ([{ name: targetName }] as unknown as T[])
        : (await client.query<T>(sql, values)).rows,
    transaction: (run) =>
      nested
        ? run(adapter(client, true))
        : client.transaction((tx) =>
            run(adapter(tx as unknown as PGlite, true)),
          ),
  };
}
let source: PGlite, old: Blob, authority: PrivacyRestoreAuthority;
const targetName =
  'aw_restore_' + randomUUID().replaceAll('-', '').slice(0, 24);
const projectBinding = hash('isolated-privacy-project'),
  writerFenceDigest = hash('stopped-synthetic-writers');
const pubConfig = { enabled: true, linkSecret: 'd'.repeat(64) };
let a: string,
  b: string,
  c: string,
  deletedLife: string,
  unchangedLife: string,
  withdrawnSlug: string,
  keptSlug: string,
  contextId: string,
  eventId: string,
  backupCapturedAt: string;
const engines: PGlite[] = [];
const proofBinding = () => ({
  projectBinding,
  writerFenceDigest,
  expectedAuthorityHash: hash(authority),
  backupCapturedAt,
  quarantineDatabase: targetName,
});
async function restored() {
  const e = new PGlite({ loadDataDir: old });
  engines.push(e);
  await e.waitReady;
  return adapter(e);
}
beforeAll(async () => {
  source = new PGlite();
  await source.waitReady;
  await source.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
  await applyMigrations(source);
  fixture = await preparePrivacyRestoreFixture(adapter(source), async () => {
    old = await source.dumpDataDir('gzip');
  });
  ({
    a,
    b,
    c,
    deletedLife,
    unchangedLife,
    contextId,
    eventId,
    backupCapturedAt,
    authority,
  } = fixture);
}, 60000);
afterAll(async () => {
  for (const e of engines) await e.close();
  await source?.close();
});
describe('independent authority and quarantined privacy restore', () => {
  it('removes a deleted account/life, denies withdrawn old links, retains an unchanged copy and preserves minimal Shared canon', async () => {
    const db = await restored();
    const proof = await verifyPrivacyRestoreFixture(db, fixture, targetName);
    expect(proof).toMatchObject({
      deletedAccountNotRestored: true,
      deletedLifeNotRestored: true,
      oldBearerLinkRejected: true,
      unchangedCopyRetained: true,
      sharedTextHiddenDateOutcomePreserved: true,
      serviceActivationAllowed: false,
    });
  });
  it('refuses absent, stale, tampered, wrong-project and duplicate authority before writes', async () => {
    const db = await restored(),
      before = await db.query('SELECT id,status FROM ff_users ORDER BY id');
    await expect(
      replayPrivacyRestore(db, null, proofBinding()),
    ).rejects.toThrow();
    await expect(
      replayPrivacyRestore(
        db,
        { ...authority, capturedAt: '2000-01-01T00:00:00.000Z' },
        proofBinding(),
      ),
    ).rejects.toThrow('Fresh');
    await expect(
      replayPrivacyRestore(
        db,
        { ...authority, activeUserIds: [...authority.activeUserIds, b] },
        proofBinding(),
      ),
    ).rejects.toThrow('binding');
    await expect(
      replayPrivacyRestore(db, authority, {
        ...proofBinding(),
        projectBinding: hash('other-project'),
      }),
    ).rejects.toThrow('binding');
    await expect(
      replayPrivacyRestore(
        db,
        { ...authority, activeUserIds: [a, a] },
        proofBinding(),
      ),
    ).rejects.toThrow('Duplicate');
    expect(
      await db.query('SELECT id,status FROM ff_users ORDER BY id'),
    ).toEqual(before);
  });
  it('rejects a serving database name and schema drift', async () => {
    const db = await restored();
    await expect(
      replayPrivacyRestore(db, authority, {
        ...proofBinding(),
        quarantineDatabase: 'postgres',
      }),
    ).rejects.toThrow('binding');
    await db.query('ALTER TABLE aw_lives ADD COLUMN unexpected text');
    await expect(
      replayPrivacyRestore(db, authority, proofBinding()),
    ).rejects.toThrow('matching-schema');
    expect(
      await db.query('SELECT id FROM ff_users WHERE id=$1', [b]),
    ).toHaveLength(1);
  });
  it('rolls the complete replay back on an intermediate failure, allowing a clean explicit retry', async () => {
    const db = await restored();
    // Construct the nested adapter inside the same transaction, never a second connection.
    const fail: Database = {
      query: db.query,
      transaction: (run) =>
        db.transaction((tx) => {
          const failTx: Database = {
            query: async (sql, values) => {
              if (sql.startsWith('UPDATE aw_publications'))
                throw Error('Injected replay interruption');
              return tx.query(sql, values);
            },
            transaction: (fn) => fn(failTx),
          };
          return run(failTx);
        }),
    };
    await expect(
      replayPrivacyRestore(fail, authority, proofBinding()),
    ).rejects.toThrow('Injected');
    expect(
      await db.query('SELECT id FROM ff_users WHERE id=$1', [b]),
    ).toHaveLength(1);
    expect(
      await db.query('SELECT id FROM aw_lives WHERE id=$1', [deletedLife]),
    ).toHaveLength(1);
    expect(
      (await replayPrivacyRestore(db, authority, proofBinding()))
        .deletedAccounts,
    ).toBe(1);
  });
});
