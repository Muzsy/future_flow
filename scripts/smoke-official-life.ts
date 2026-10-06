import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  connectDatabase,
  Repository,
  LifeRepository,
} from '@future-flow/database';
import {
  officialLifeFixture,
  processOfficialFixture,
  officialBundleFixture,
  officialGrant,
} from '../tests/official-life-fixtures';

async function main() {
  // Only isolated CI server evidence: simulated provider receipts, never a real Official seed.
  assert.equal(process.platform, 'linux');
  assert.equal(process.env.CI, 'true');
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.AI_PROJECT_BUDGET_USD, '0');
  assert.equal(process.env.AI_USER_BUDGET_USD, '0');
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (
    url.hostname !== 'postgres' ||
    url.username !== 'postgres' ||
    url.password !== 'ci_unused_outside_fixture'
  )
    throw Error('Isolated CI database required');
  const raw = connectDatabase(url.href, true);
  const db = {
    query: raw.query,
    transaction: <T>(run: Parameters<typeof raw.transaction<T>>[0]) =>
      raw.transaction(async (tx) => {
        await tx.query("SET LOCAL lock_timeout='10s'");
        await tx.query("SET LOCAL statement_timeout='15s'");
        return run(tx);
      }),
  };
  const owners: string[] = [];
  try {
    const f = await officialLifeFixture(db);
    owners.push(f.owner);
    const key = randomUUID(),
      starts = await Promise.all([
        f.official.start(f.owner, f.startRequest, key),
        f.official.start(f.owner, f.startRequest, key),
        f.official.start(f.owner, f.startRequest, key),
      ]);
    assert.deepEqual(starts[0], starts[1]);
    assert.deepEqual(starts[1], starts[2]);
    const created = starts[0]!;
    assert.equal(
      (
        await db.query(
          'SELECT life_id FROM aw_official_life_starts WHERE user_id=$1',
          [f.owner],
        )
      ).length,
      1,
    );
    await processOfficialFixture(db, f.owner, created.jobId, true, true);
    const lives = new LifeRepository(db),
      first = await lives.branch(f.owner, created.branchId);
    await lives.choose(
      f.owner,
      first.id,
      first.revision,
      first.pending_decision!.id,
      first.pending_decision!.options[0]!.id,
      randomUUID(),
    );
    const ready = await lives.branch(f.owner, first.id),
      next = await lives.continue(
        f.owner,
        first.id,
        ready.revision,
        randomUUID(),
      );
    await processOfficialFixture(db, f.owner, next.jobId);
    const copy = await officialBundleFixture(db, f, created),
      inspected = await f.official.inspect(f.owner, copy.bundle.bundleId);
    assert.equal(inspected.evidence.periods.length, 2);
    assert.equal(inspected.evidence.periods[0]!.receipts.length, 4);
    const request = officialGrant(inspected);
    const grants = await Promise.all([
      f.official.grant(f.owner, request),
      f.official.grant(f.owner, request),
      f.official.grant(f.owner, request),
    ]);
    assert.deepEqual(grants[0], grants[1]);
    assert.deepEqual(grants[1], grants[2]);
    assert.equal(grants[0]!.publicationApproved, false);
    assert.equal(
      (
        await db.query('SELECT id FROM aw_publications WHERE user_id=$1', [
          f.owner,
        ])
      ).length,
      0,
    );
    const other = await officialLifeFixture(db);
    owners.push(other.owner);
    await assert.rejects(
      f.official.grant(other.owner, request),
      (e: unknown) => (e as { status: number }).status === 404,
    );
    const revoke = {
      grantId: grants[0]!.grant!.id,
      contentHash: copy.bundle.contentHash,
      reasonCode: 'quality',
      actorLabel: 'Isolated CI origin moderator',
      acknowledged: true,
    };
    const races = await Promise.allSettled([
      f.official.revoke(f.owner, revoke),
      f.official.revoke(f.owner, {
        ...revoke,
        actorLabel: 'Other isolated CI moderator',
      }),
    ]);
    assert.equal(races.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      (await f.official.grant(f.owner, request)).grant!.status,
      'revoked',
    );
    await assert.rejects(
      db.query(
        "UPDATE aw_official_life_sources SET status='active' WHERE id=$1",
        [revoke.grantId],
      ),
    );
    await assert.rejects(
      db.query(
        'UPDATE aw_official_life_starts SET initial_input_hash=$1 WHERE life_id=$2',
        ['7'.repeat(64), created.lifeId],
      ),
    );
    const exported = await f.repo.exportAccount(f.owner);
    assert.equal((exported.aw_official_life_starts as unknown[]).length, 1);
    assert.equal((exported.aw_official_life_sources as unknown[]).length, 1);
    // Separate unrevoked source proves account deletion itself terminates permission.
    const second = await other.official.start(
      other.owner,
      other.startRequest,
      randomUUID(),
    );
    await processOfficialFixture(db, other.owner, second.jobId);
    const secondCopy = await officialBundleFixture(db, other, second),
      secondInspect = await other.official.inspect(
        other.owner,
        secondCopy.bundle.bundleId,
      );
    await other.official.grant(other.owner, officialGrant(secondInspect));
    await other.repo.markDeleting(other.owner);
    await other.repo.restoreActive(other.owner);
    assert.equal(
      (
        await db.query(
          'SELECT status FROM aw_official_life_sources WHERE user_id=$1',
          [other.owner],
        )
      )[0]!.status,
      'revoked',
    );
    await assert.rejects(
      other.official.inspect(other.owner, secondCopy.bundle.bundleId),
    );
    const technical = await officialLifeFixture(db);
    owners.push(technical.owner);
    const third = await technical.official.start(
      technical.owner,
      technical.startRequest,
      randomUUID(),
    );
    await processOfficialFixture(db, technical.owner, third.jobId, false);
    const thirdCopy = await officialBundleFixture(db, technical, third);
    await assert.rejects(
      technical.official.inspect(technical.owner, thirdCopy.bundle.bundleId),
      (e: unknown) =>
        (e as { code: string }).code === 'OFFICIAL_LIFE_EVIDENCE_REQUIRED',
    );
    for (const table of [
      'aw_official_life_starts',
      'aw_official_life_sources',
    ]) {
      const [guard] = await db.query(
        "SELECT c.relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'INSERT') AS client FROM pg_class c WHERE c.oid=$1::regclass",
        [table],
      );
      assert.deepEqual(guard, { rls: true, anon: false, client: false });
    }
    for (const owner of owners)
      await new Repository(db).deleteAccountData(owner);
    for (const table of ['aw_official_life_starts', 'aw_official_life_sources'])
      assert.equal(
        (
          await db.query(
            `SELECT * FROM ${table} WHERE user_id=ANY($1::uuid[])`,
            [owners],
          )
        ).length,
        0,
      );
    console.log(
      JSON.stringify({
        officialLifePostgres: 'passed',
        prospectiveConcurrentStartOnce: true,
        completeChainAndRepairEvidence: true,
        concurrentExactGrantOnce: true,
        technicalReceiptRejected: true,
        crossOwnerRejected: true,
        terminalRevocationRace: true,
        deletionRecoveryExportCascadeRls: true,
        publicationApproved: false,
        actualProviderCalls: 0,
        actualOfficialSeed: false,
      }),
    );
  } finally {
    try {
      for (const owner of owners)
        await new Repository(db).deleteAccountData(owner);
    } finally {
      await raw.close();
    }
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Official life CI smoke failed',
  );
  process.exitCode = 1;
});
