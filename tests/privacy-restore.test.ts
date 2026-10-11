import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hash } from '@future-flow/core';
import { PublicationRepository, type Database } from '@future-flow/database';
import {
  capturePrivacyRestoreAuthority,
  replayPrivacyRestore,
  type PrivacyRestoreAuthority,
} from '../scripts/lib/privacy-restore';
import {
  preparePrivacyRestoreFixture,
  privacyFixtureConfig,
  verifyPrivacyRestoreFixture,
  type PrivacyRestoreFixture,
} from '../scripts/lib/privacy-restore-proof';
import { applyMigrations } from '../scripts/lib/migrations';
import { verifyPrivacyRestore } from '../scripts/lib/privacy-restore-verifier';
import { hardenPrivacyQuarantine } from '../scripts/lib/privacy-security-catalog';
import { LifeRepository } from '@future-flow/database';
import { setupFixture } from './life-fixtures';
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
  it('rejects column-only browser access and restored public/paid capabilities', async () => {
    const db = await restored();
    await replayPrivacyRestore(db, authority, proofBinding());
    await db.query(
      'GRANT SELECT(handle) ON aw_social_profiles TO authenticated',
    );
    expect(
      (
        await db.query(
          "SELECT has_table_privilege('authenticated','aw_social_profiles','SELECT') AS granted",
        )
      )[0]?.granted,
    ).toBe(false);
    await expect(
      verifyPrivacyRestore(db, authority, proofBinding()),
    ).rejects.toThrow('privacy recovery privileges');
    await db.query(
      'REVOKE SELECT(handle) ON aw_social_profiles FROM authenticated',
    );
    await db.query(
      "INSERT INTO aw_social_profiles(user_id,handle,display_name,discoverability) VALUES($1,'synthetic_recovery','Synthetic','searchable') ON CONFLICT(user_id) DO UPDATE SET discoverability='searchable'",
      [a],
    );
    await expect(
      verifyPrivacyRestore(db, authority, proofBinding()),
    ).rejects.toThrow('verification failed');
    await db.query("UPDATE aw_social_profiles SET discoverability='private'");
    await db.query(
      "INSERT INTO aw_user_entitlements(user_id,tier,source) VALUES($1,'connected','Synthetic recovery') ON CONFLICT(user_id) DO UPDATE SET tier='connected'",
      [a],
    );
    await expect(
      verifyPrivacyRestore(db, authority, proofBinding()),
    ).rejects.toThrow('verification failed');
    await db.query("UPDATE aw_user_entitlements SET tier='free'");
    await db.query('DELETE FROM aw_publication_restrictions WHERE user_id=$1', [
      a,
    ]);
    await expect(
      verifyPrivacyRestore(db, authority, proofBinding()),
    ).rejects.toThrow('verification failed');
  });
  it('does not require or restore the account of an Auth-ineligible current user', async () => {
    await source.query(
      "INSERT INTO aw_budget_accounts(id,user_id,limit_micro,accounted_micro) VALUES('ineligible-post-backup',$1,1000,900)",
      [c],
    );
    try {
      const current = await capturePrivacyRestoreAuthority(adapter(source), {
        projectBinding,
        writerFenceDigest,
        authVerifiedAt: new Date().toISOString(),
        authUserIds: [a],
      });
      expect(current.activeUserIds).toEqual([a]);
      expect(
        current.budgetAccounts.some(
          (row) => row.id === 'ineligible-post-backup',
        ),
      ).toBe(false);
      const binding = {
        ...proofBinding(),
        expectedAuthorityHash: hash(current),
      };
      const db = await restored();
      await replayPrivacyRestore(db, current, binding);
      const verified = await verifyPrivacyRestore(db, current, binding);
      expect(verified.serviceActivationAllowed).toBe(false);
      expect(
        await db.query('SELECT id FROM ff_users WHERE id=$1', [c]),
      ).toHaveLength(0);
    } finally {
      await source.query(
        "DELETE FROM aw_budget_accounts WHERE id='ineligible-post-backup'",
      );
    }
  });
  it('independently rejects an old snapshot and any later resurrected user or life', async () => {
    const db = await restored();
    // Rebuild only the non-serving privilege boundary; keep all old rows so
    // the independent verifier must still detect the resurrected data graph.
    await db.transaction(async (tx) => {
      await tx.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      await hardenPrivacyQuarantine(tx, targetName);
    });
    await expect(
      verifyPrivacyRestore(db, authority, proofBinding()),
    ).rejects.toThrow('verification failed');
    await replayPrivacyRestore(db, authority, proofBinding());
    const verified = await verifyPrivacyRestore(db, authority, proofBinding());
    expect(verified).toMatchObject({
      reviewedTables: 96,
      reviewedForeignKeys: 219,
      serviceActivationAllowed: false,
      liveWrites: false,
      paidAiCalls: 0,
    });
    await db.query("INSERT INTO ff_users(id,status) VALUES($1,'active')", [b]);
    await expect(
      verifyPrivacyRestore(db, authority, proofBinding()),
    ).rejects.toThrow('verification failed');
    await db.query('DELETE FROM ff_users WHERE id=$1', [b]);
    await new LifeRepository(db).create(a, setupFixture(), randomUUID());
    await expect(
      verifyPrivacyRestore(db, authority, proofBinding()),
    ).rejects.toThrow('ownership');
  });
  it('rejects changed live permissions and a lost current block without repairing them', async () => {
    const db = await restored();
    await replayPrivacyRestore(db, authority, proofBinding());
    await db.query(
      'DELETE FROM aw_user_blocks WHERE user_id=$1 AND blocked_user_id=$2',
      [a, c],
    );
    await expect(
      verifyPrivacyRestore(db, authority, proofBinding()),
    ).rejects.toThrow('verification failed');
    await db.query(
      'INSERT INTO aw_user_blocks(user_id,blocked_user_id) VALUES($1,$2)',
      [a, c],
    );
    await db.query(
      "UPDATE aw_publications SET status='hidden',revision=revision+1 WHERE status='active'",
    );
    await expect(
      verifyPrivacyRestore(db, authority, proofBinding()),
    ).rejects.toThrow('permission');
  });
  it('rejects AI budget rollback, restored queue inputs and weak browser table protection', async () => {
    const db = await restored();
    await replayPrivacyRestore(db, authority, proofBinding());
    await db.query(
      "UPDATE aw_budget_accounts SET accounted_micro=0 WHERE id='privacy-project'",
    );
    await expect(
      verifyPrivacyRestore(db, authority, proofBinding()),
    ).rejects.toThrow('high-water');
    await db.query(
      "UPDATE aw_budget_accounts SET accounted_micro=700,limit_micro=1 WHERE id='privacy-project'",
    );
    await expect(
      verifyPrivacyRestore(db, authority, proofBinding()),
    ).rejects.toThrow('verification failed');
    await db.query(
      "UPDATE aw_budget_accounts SET limit_micro=0 WHERE id='privacy-project'",
    );
    await db.query('UPDATE aw_jobs SET payload=\'{"old_prompt":true}\'::jsonb');
    await expect(
      verifyPrivacyRestore(db, authority, proofBinding()),
    ).rejects.toThrow('verification failed');
    await db.query("UPDATE aw_jobs SET payload='{}'");
    await db.query('ALTER TABLE aw_feedback DISABLE ROW LEVEL SECURITY');
    await expect(
      verifyPrivacyRestore(db, authority, proofBinding()),
    ).rejects.toThrow('privacy recovery privileges');
  });
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
  it('refuses a current budget account created after the backup before changing restored data', async () => {
    const id =
      'project:window:2026-10-10T00:00:00.000Z:2026-11-09T00:00:00.000Z';
    await source.query(
      'INSERT INTO aw_budget_accounts(id,limit_micro,accounted_micro) VALUES($1,2000000,900)',
      [id],
    );
    try {
      const current = await capturePrivacyRestoreAuthority(adapter(source), {
        projectBinding,
        writerFenceDigest,
        authVerifiedAt: new Date().toISOString(),
        authUserIds: [a, c],
      });
      const db = await restored();
      const before = await db.query(
        'SELECT id,status FROM ff_users ORDER BY id',
      );
      await expect(
        replayPrivacyRestore(db, current, {
          ...proofBinding(),
          expectedAuthorityHash: hash(current),
        }),
      ).rejects.toThrow('budget account missing');
      expect(
        await db.query('SELECT id,status FROM ff_users ORDER BY id'),
      ).toEqual(before);
      expect(
        await db.query('SELECT id FROM aw_lives WHERE id=$1', [deletedLife]),
      ).toHaveLength(1);
      expect(
        await db.query('SELECT id FROM aw_budget_accounts WHERE id=$1', [id]),
      ).toHaveLength(0);
    } finally {
      await source.query('DELETE FROM aw_budget_accounts WHERE id=$1', [id]);
    }
  });
  it('preserves an unchanged publication across different capture/replay session timezones', async () => {
    const utcRows = await source.query(
      'SELECT to_jsonb(p) AS record FROM aw_publications p ORDER BY id',
    );
    await source.query("SET TIME ZONE 'Asia/Tokyo'");
    try {
      const localRows = await source.query(
        'SELECT to_jsonb(p) AS record FROM aw_publications p ORDER BY id',
      );
      expect(hash(localRows.rows)).not.toBe(hash(utcRows.rows));
      const current = await capturePrivacyRestoreAuthority(adapter(source), {
        projectBinding,
        writerFenceDigest,
        authVerifiedAt: new Date().toISOString(),
        authUserIds: [a, c],
      });
      const db = await restored();
      await db.query("SET TIME ZONE 'America/Los_Angeles'");
      const proof = await replayPrivacyRestore(db, current, {
        ...proofBinding(),
        expectedAuthorityHash: hash(current),
      });
      expect(proof.fingerprintTimeZone).toBe('UTC');
      expect((await db.query('SHOW TIME ZONE'))[0]).toMatchObject({
        TimeZone: 'America/Los_Angeles',
      });
      expect(
        await new PublicationRepository(db, privacyFixtureConfig).readPublic(
          fixture.keptSlug,
        ),
      ).toBeTruthy();
    } finally {
      await source.query("SET TIME ZONE 'UTC'");
    }
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
