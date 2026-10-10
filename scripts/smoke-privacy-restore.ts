import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connectDatabase, type Database } from '@future-flow/database';
import { applyMigrations } from './lib/migrations';
import {
  preparePrivacyRestoreFixture,
  verifyPrivacyRestoreFixture,
  privacyFixtureBinding,
} from './lib/privacy-restore-proof';
import { replayPrivacyRestore } from './lib/privacy-restore';

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
    const f = await preparePrivacyRestoreFixture(facade, async () => {
      assert(source);
      await source.close();
      source = undefined;
      // Actual PostgreSQL physical database copy after all transactions close.
      // This tests an old application snapshot, not an age/offsite dump restore.
      await admin.query(`CREATE DATABASE ${targetName} TEMPLATE ${sourceName}`);
      targetCreated = true;
      source = connection(sourceName);
    });
    target = connection(targetName);
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
    return {
      ...proof,
      physicalOldSnapshot: true,
      actualDatabaseNameGuard: true,
      missingOrMismatchedAuthorityRejected: true,
      interruptedReplayRolledBack: true,
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
