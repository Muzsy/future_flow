import { createPrivacyFenceEnvelope } from './lib/privacy-fence-envelope';
import { runQuarantinedReplay } from './lib/quarantined-replay';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  LifeRepository,
  connectDatabase,
  type Database,
} from '@future-flow/database';
import { hash } from '@future-flow/core';
import { applyMigrations } from './lib/migrations';
import {
  preparePrivacyRestoreFixture,
  verifyPrivacyRestoreFixture,
  privacyFixtureBinding,
} from './lib/privacy-restore-proof';
import {
  capturePrivacyRestoreAuthority,
  replayPrivacyRestore,
} from './lib/privacy-restore';

async function main() {
  assert.equal(process.platform, 'linux');
  assert.equal(process.env.ALTERWARD_PRIVACY_FIXTURE, 'true');
  assert.equal(process.env.AI_PROJECT_BUDGET_USD, '0');
  assert.equal(process.env.AI_USER_BUDGET_USD, '0');
  assert(!process.env.ANTHROPIC_API_KEY);
  assert(
    [undefined, 'ci_openai_unused', 'rehearsal_openai_unused'].includes(
      process.env.OPENAI_API_KEY,
    ),
  );
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(url.hostname, 'postgres');
  assert.equal(url.username, 'postgres');
  assert.equal(url.pathname, '/postgres');
  assert(
    ['ci_unused_outside_fixture', 'rehearsal_unused'].includes(url.password),
  );
  const suffix = randomUUID().replaceAll('-', '').slice(0, 24),
    sourceName = 'aw_fixture_' + suffix,
    targetName = 'aw_restore_' + suffix;
  const admin = connectDatabase(url.href, true);
  let source: ReturnType<typeof connectDatabase> | undefined,
    target: ReturnType<typeof connectDatabase> | undefined,
    sourceCreated = false,
    targetCreated = false;
  const connection = (name: string) => {
    const u = new URL(url);
    u.pathname = '/' + name;
    return connectDatabase(u.href, true);
  };
  const facade: Database = {
    query: (sql, values) => {
      assert(source);
      return source.query(sql, values);
    },
    transaction: (run) => {
      assert(source);
      return source.transaction(run);
    },
  };
  try {
    await admin.query(`CREATE DATABASE ${sourceName}`);
    sourceCreated = true;
    source = connection(sourceName);
    await applyMigrations({ exec: (sql) => facade.query(sql) });
    let artifactSnapshot: unknown;
    const f = await preparePrivacyRestoreFixture(facade, async () => {
      assert(source);
      artifactSnapshot = await source.query(
        'SELECT id,narrative_artifact FROM aw_periods ORDER BY id',
      );
      await source.close();
      source = undefined;
      // Actual PostgreSQL physical database copy after all transactions close.
      // This tests an old application snapshot, not an age/offsite dump restore.
      await admin.query(`CREATE DATABASE ${targetName} TEMPLATE ${sourceName}`);
      targetCreated = true;
      source = connection(sourceName);
    });
    target = connection(targetName);
    const restoredArtifacts = await target.query(
      'SELECT id,narrative_artifact FROM aw_periods ORDER BY id',
    );
    assert.deepEqual(restoredArtifacts, artifactSnapshot);
    assert(restoredArtifacts.some((p) => p.narrative_artifact !== null));
    assert(restoredArtifacts.some((p) => p.narrative_artifact === null));
    const [restoredBranch] = await target.query<{ id: string }>(
      'SELECT id FROM aw_branches WHERE life_id=$1',
      [f.deletedLife],
    );
    assert(restoredBranch);
    const dto = await new LifeRepository(target).detail(f.a, restoredBranch.id);
    assert(dto.periods.every((p) => !('narrative_artifact' in p)));

    await source!.query("SET TIME ZONE 'Asia/Tokyo'");
    f.authority = await capturePrivacyRestoreAuthority(source!, {
      projectBinding: f.projectBinding,
      writerFenceDigest: f.writerFenceDigest,
      authVerifiedAt: new Date().toISOString(),
      authUserIds: [f.a, f.c],
    });
    await target.query("SET TIME ZONE 'America/Los_Angeles'");
    const before = await target.query(
      'SELECT id,status FROM ff_users ORDER BY id',
    );
    await assert.rejects(
      replayPrivacyRestore(target, null, privacyFixtureBinding(f, targetName)),
    );
    await assert.rejects(
      replayPrivacyRestore(target, f.authority, {
        ...privacyFixtureBinding(f, targetName),
        expectedAuthorityHash: '0'.repeat(64),
      }),
    );
    await assert.rejects(
      replayPrivacyRestore(
        source!,
        f.authority,
        privacyFixtureBinding(f, targetName),
      ),
    );
    const newAccount = 'privacy-post-backup-project';
    await source!.query(
      'INSERT INTO aw_budget_accounts(id,limit_micro,accounted_micro) VALUES($1,2000000,900)',
      [newAccount],
    );
    try {
      const current = await capturePrivacyRestoreAuthority(source!, {
        projectBinding: f.projectBinding,
        writerFenceDigest: f.writerFenceDigest,
        authVerifiedAt: new Date().toISOString(),
        authUserIds: [f.a, f.c],
      });
      await assert.rejects(
        replayPrivacyRestore(target, current, {
          ...privacyFixtureBinding(f, targetName),
          expectedAuthorityHash: hash(current),
        }),
        /budget account missing/,
      );
      assert.deepEqual(
        await target.query('SELECT id,status FROM ff_users ORDER BY id'),
        before,
      );
    } finally {
      await source!.query('DELETE FROM aw_budget_accounts WHERE id=$1', [
        newAccount,
      ]);
    }
    let injected: Database;
    const failure: Database = {
      query: target.query,
      transaction: (run) =>
        target!.transaction((tx) => {
          injected = {
            query: async (sql, values) => {
              if (sql.startsWith('UPDATE aw_publications'))
                throw Error('Injected restore interruption');
              return tx.query(sql, values);
            },
            transaction: (fn) => fn(injected),
          };
          return run(injected);
        }),
    };
    await assert.rejects(
      replayPrivacyRestore(
        failure,
        f.authority,
        privacyFixtureBinding(f, targetName),
      ),
    );
    assert.deepEqual(
      await target.query('SELECT id,status FROM ff_users ORDER BY id'),
      before,
    );
    const proof = await verifyPrivacyRestoreFixture(target, f, targetName);
    assert.equal(
      (await target.query('SHOW TIME ZONE'))[0]?.TimeZone,
      'America/Los_Angeles',
    );
    const replayBinding = {
      mode: 'recovery' as const,
      nonce: 'a'.repeat(24),
      sourceCommit: 'b'.repeat(40),
      sourceFilesDigest: hash('synthetic-funded-runtime-source'),
      ownerManifestDigest: hash('synthetic-funded-manifest'),
      projectBinding: f.projectBinding,
      writerFenceDigest: f.writerFenceDigest,
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };
    const envelope = createPrivacyFenceEnvelope(
      f.authority,
      hash('synthetic-independent-auth'),
      replayBinding,
    );
    const retainedBefore = await target.query(
      'SELECT narrative_artifact FROM aw_periods WHERE id=$1',
      [f.retainedV9NarrativePeriod],
    );
    assert(
      retainedBefore.length === 1 &&
        (retainedBefore[0]!.narrative_artifact as Record<string, unknown>)
          .characterDelta,
    );
    await runQuarantinedReplay(target, {
      action: 'replay',
      fundedRuntime: 'v9',
      quarantineDatabase: targetName,
      backupCapturedAt: f.backupCapturedAt,
      backupDumpSha256: hash('synthetic-physical-snapshot'),
      envelope,
      held: { ...replayBinding, stateDigest: envelope.stateDigest },
    });
    assert.deepEqual(
      await target.query(
        'SELECT narrative_artifact FROM aw_periods WHERE id=$1',
        [f.retainedV9NarrativePeriod],
      ),
      retainedBefore,
    );
    return {
      ...proof,
      fundedV9ReplayAndCharacterStateVerified: true,
      physicalOldSnapshot: true,
      narrativeArtifactsSurvivedPhysicalRestore: true,
      legacyNullArtifactsReadable: true,
      privateArtifactExcludedFromLifeDto: true,
      actualDatabaseNameGuard: true,
      missingOrMismatchedAuthorityRejected: true,
      interruptedReplayRolledBack: true,
      missingCurrentBudgetAccountRejected: true,
      differentSessionTimezonesVerified: true,
      postgresPrivacyRestore: 'passed',
    };
  } finally {
    await source?.close();
    await target?.close();
    if (targetCreated) await admin.query(`DROP DATABASE ${targetName}`);
    if (sourceCreated) await admin.query(`DROP DATABASE ${sourceName}`);
    await admin.close();
  }
}
main()
  .then((result) => console.log(JSON.stringify(result)))
  .catch(() => {
    console.error(
      JSON.stringify({
        postgresPrivacyRestore: 'failed',
        rawDiagnosticsOmitted: true,
      }),
    );
    process.exitCode = 1;
  });
