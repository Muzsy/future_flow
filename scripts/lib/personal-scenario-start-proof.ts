import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hash } from '@future-flow/core';
import {
  Repository,
  PersonalScenarioRepository,
  LifeRepository,
  LifeJobRepository,
  LifeDeletionRepository,
  cleanupExpiredPersonalScenarioPreviews,
  publicOriginMetricsSummary,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import { publicScenarioFixture } from '../../tests/public-scenario-publication-fixtures';
import { personalScenarioFixture } from '../../tests/scenario-personalization-fixtures';
import { lifeTestAi } from '../../tests/life-fixtures';
import { processLifeJob } from '../../apps/worker/src/life-processor';

// Real isolated PostgreSQL, synthetic review evidence and technical AI. No
// production Scenario, live user, API credential or paid provider is involved.
export async function personalScenarioStartProof(db: Database) {
  const owners: string[] = [],
    repo = new Repository(db),
    lives = new LifeRepository(db),
    publicConfig = { enabled: true, operatorEnabled: false },
    personal = (database = db, limits = { daily: 10, concurrent: 2 }) =>
      new PersonalScenarioRepository(
        database,
        { enabled: true },
        publicConfig,
        limits,
      );
  async function target() {
    const id = randomUUID();
    owners.push(id);
    await repo.ensureUser(id);
    await repo.acceptPrivacy(id);
    return id;
  }
  async function source() {
    const f = await publicScenarioFixture(db);
    owners.push(f.owner);
    const publication = await f.pubs.confirm(f.owner, f.confirm, randomUUID());
    return {
      ...f,
      publication,
      canonicalBefore: hash(await f.scenarios.get(f.owner, f.version.id)),
    };
  }
  const request = (f: Awaited<ReturnType<typeof source>>) => ({
    templateHash: f.version.templateHash,
    profile: personalScenarioFixture(),
    acknowledged: true,
  });
  const body = (
    preview: Awaited<ReturnType<PersonalScenarioRepository['prepare']>>,
    profile = personalScenarioFixture(),
  ) => ({
    previewId: preview.id,
    previewHash: preview.previewHash,
    profile,
    acknowledged: true,
  });
  async function process(userId: string, jobId: string) {
    const [job] = await db.query<LifeJob>(
      "UPDATE aw_jobs SET status='running',attempt=1,lease_token=$1,lease_until=now()+interval '10 minutes' WHERE id=$2 AND user_id=$3 AND status='queued' RETURNING *",
      [randomUUID(), jobId, userId],
    );
    assert(job);
    await processLifeJob(job, new LifeJobRepository(db), lifeTestAi);
  }
  try {
    const cohortTotals = async () => {
      const report = await publicOriginMetricsSummary(db);
      return report.cohorts
        .filter((r) => r.channel === 'official_personal_scenario')
        .reduce(
          (n, r) => [
            n[0]! + r.createdLives,
            n[1]! + r.firstPeriodCompletedLives,
            n[2]! + r.secondPeriodCompletedLives,
            n[3]! + r.thirdPeriodCompletedLives,
          ],
          [0, 0, 0, 0],
        );
    };
    const cohortBefore = await cohortTotals();
    const f = await source(),
      user = await target(),
      r = personal(),
      prepareKey = randomUUID(),
      sourceBefore = hash(await f.scenarios.get(f.owner, f.version.id)),
      previews = await Promise.all(
        [1, 2, 3].map(() =>
          r.prepare(user, f.publication.slug, request(f), prepareKey),
        ),
      );
    assert.deepEqual(previews[0], previews[1]);
    assert.deepEqual(previews[1], previews[2]);
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_personal_scenario_previews WHERE user_id=$1',
          [user],
        )
      ).length,
      1,
    );
    assert.deepEqual(
      (
        await db.query(
          'SELECT response FROM ff_idempotency WHERE user_id=$1 AND key=$2',
          [user, prepareKey],
        )
      )[0]!.response,
      { id: previews[0]!.id },
    );
    assert.equal(
      (await db.query('SELECT id FROM aw_jobs WHERE user_id=$1', [user]))
        .length,
      0,
    );
    const startKey = randomUUID(),
      starts = await Promise.all(
        [1, 2, 3].map(() =>
          r.start(user, f.publication.slug, body(previews[0]!), startKey),
        ),
      );
    assert.deepEqual(starts[0], starts[1]);
    assert.deepEqual(starts[1], starts[2]);
    const created = starts[0]!,
      initial = await lives.branch(user, created.branchId);
    assert.deepEqual(await cohortTotals(), [
      cohortBefore[0]! + 1,
      ...cohortBefore.slice(1),
    ]);
    assert.equal(
      (await db.query('SELECT id FROM aw_jobs WHERE user_id=$1', [user]))
        .length,
      1,
    );
    assert.equal(initial.input.locale, 'en');
    assert.equal(initial.input.visibility, 'private');
    assert.equal(initial.input.identity.baseProfileVersionId, null);
    assert.equal(initial.input.initialState.location.country, 'DE');
    assert.deepEqual(initial.input.initialState.ownedAssets, []);
    assert.deepEqual(initial.input.initialState.opportunities, []);
    assert.equal(initial.input.initialState.actors[0]!.label, 'My partner');
    assert.deepEqual(
      initial.input.goals.map((g) => g.priority),
      ['primary', 'secondary'],
    );
    assert.equal(
      (
        await db.query(
          'SELECT life_id FROM aw_official_life_starts WHERE user_id=$1',
          [user],
        )
      ).length,
      0,
    );
    await assert.rejects(
      r.start(user, f.publication.slug, body(previews[0]!), randomUUID()),
    );

    assert.equal(
      hash(await f.scenarios.get(f.owner, f.version.id)),
      sourceBefore,
    );
    // Once born, the life continues using only its own approved canon even if
    // the original Scenario disappears during the ordinary three-period flow.
    await repo.markDeleting(f.owner);
    await repo.deleteAccountData(f.owner);
    assert.deepEqual(
      await r.start(user, f.publication.slug, body(previews[0]!), startKey),
      created,
    );
    assert.equal((await r.attribution(user, created.lifeId)).source, null);
    let jobId = created.jobId;
    for (let i = 0; i < 3; i++) {
      await process(user, jobId);
      const detail = await lives.detail(user, created.branchId);
      assert.equal(detail.periods.length, i + 1);
      assert.deepEqual(
        await cohortTotals(),
        cohortBefore.map((n, index) => n + (index <= i + 1 ? 1 : 0)),
      );
      if (i === 0)
        assert.deepEqual(detail.periods[0]!.start_state, initial.state);
      const branch = await lives.branch(user, created.branchId);
      if (branch.pending_decision)
        await lives.choose(
          user,
          branch.id,
          branch.revision,
          branch.pending_decision.id,
          branch.pending_decision.options[0]!.id,
          randomUUID(),
        );
      if (i < 2) {
        const ready = await lives.branch(user, created.branchId);
        jobId = (
          await lives.continue(user, ready.id, ready.revision, randomUUID())
        ).jobId;
      }
    }

    const a = await source(),
      b = await source(),
      pa = await r.prepare(
        a.owner,
        b.publication.slug,
        request(b),
        randomUUID(),
      ),
      pb = await r.prepare(
        b.owner,
        a.publication.slug,
        request(a),
        randomUUID(),
      );
    const opposite = await Promise.all([
      r.start(a.owner, b.publication.slug, body(pa), randomUUID()),
      r.start(b.owner, a.publication.slug, body(pb), randomUUID()),
    ]);
    assert.equal(opposite.length, 2);
    const attribution = await Promise.all([
      r.attribution(a.owner, opposite[0]!.lifeId),
      r.attribution(b.owner, opposite[1]!.lifeId),
    ]);
    assert(attribution.every((v) => v.source !== null));

    const q = await source(),
      quotaUser = await target(),
      qp = await r.prepare(
        quotaUser,
        q.publication.slug,
        request(q),
        randomUUID(),
      ),
      qkey = randomUUID(),
      qr = await personal(db, { daily: 1, concurrent: 1 }).start(
        quotaUser,
        q.publication.slug,
        body(qp),
        qkey,
      ),
      qsecond = await r.prepare(
        quotaUser,
        q.publication.slug,
        request(q),
        randomUUID(),
      );
    await assert.rejects(
      personal(db, { daily: 1, concurrent: 1 }).start(
        quotaUser,
        q.publication.slug,
        body(qsecond),
        randomUUID(),
      ),
      (e: unknown) => (e as { code: string }).code === 'GENERATION_LIMIT',
    );
    assert.equal((await lives.list(quotaUser)).length, 1);
    const branch = await lives.branch(quotaUser, qr.branchId);
    await new LifeDeletionRepository(db).remove(
      quotaUser,
      qr.lifeId,
      {
        branchId: branch.id,
        revision: branch.revision,
        confirmation: 'DELETE LIFE',
      },
      randomUUID(),
    );
    await assert.rejects(
      r.start(quotaUser, q.publication.slug, body(qp), qkey),
      (e: unknown) => (e as { status: number }).status === 410,
    );
    await assert.rejects(
      r.start(quotaUser, q.publication.slug, body(qp), randomUUID()),
    );
    await assert.rejects(
      personal(db, { daily: 1, concurrent: 1 }).start(
        quotaUser,
        q.publication.slug,
        body(qsecond),
        randomUUID(),
      ),
      (e: unknown) => (e as { code: string }).code === 'GENERATION_LIMIT',
    );
    assert.equal((await lives.list(quotaUser)).length, 0);

    const w = await source(),
      wu = await target(),
      wp = await r.prepare(wu, w.publication.slug, request(w), randomUUID());
    const race = await Promise.allSettled([
      r.start(wu, w.publication.slug, body(wp), randomUUID()),
      w.pubs.withdraw(w.owner, w.publication.id),
    ]);
    assert.equal(race[1]!.status, 'fulfilled');
    if (race[0]!.status === 'rejected')
      assert.equal((race[0]!.reason as { status: number }).status, 404);
    await assert.rejects(
      r.start(wu, w.publication.slug, body(wp), randomUUID()),
    );
    assert(
      (await db.query('SELECT id FROM aw_lives WHERE user_id=$1', [wu]))
        .length <= 1,
    );

    const d = await source(),
      du = await target(),
      dp = await r.prepare(du, d.publication.slug, request(d), randomUUID());
    const deletionRace = await Promise.allSettled([
      r.start(du, d.publication.slug, body(dp), randomUUID()),
      db.transaction(async (tx) => {
        await tx.query('SELECT id FROM ff_users WHERE id=$1 FOR UPDATE', [
          d.owner,
        ]);
        await tx.query('DELETE FROM aw_scenarios WHERE id=$1 AND user_id=$2', [
          d.version.scenarioId,
          d.owner,
        ]);
      }),
    ]);
    assert.equal(deletionRace[1]!.status, 'fulfilled');
    if (deletionRace[0]!.status === 'rejected')
      assert.equal((deletionRace[0]!.reason as { status: number }).status, 404);
    await assert.rejects(
      r.start(du, d.publication.slug, body(dp), randomUUID()),
    );
    const surviving = await lives.list(du);
    assert(surviving.length <= 1);
    if (deletionRace[0]!.status === 'fulfilled') {
      assert.equal(surviving.length, 1);
      assert.equal(
        (await r.attribution(du, deletionRace[0]!.value.lifeId)).source,
        null,
      );
    }

    // Hold an actual owner row lock while the complete preview expires. The
    // waiting start must use DB wall time after acquiring the contended locks.
    const e = await source(),
      eu = await target();
    const short = (base: Database): Database => ({
      query: (sql, values) =>
        base.query(
          sql.includes("clock_timestamp()+interval '30 minutes'")
            ? sql.replace('30 minutes', '3 seconds')
            : sql,
          values,
        ),
      transaction: (run) => base.transaction((tx) => run(short(tx))),
    });
    const ep = await personal(short(db)).prepare(
      eu,
      e.publication.slug,
      request(e),
      randomUUID(),
    );
    let unlock!: () => void, locked!: () => void;
    const lockedSignal = new Promise<void>((resolve) => {
        locked = resolve;
      }),
      releaseSignal = new Promise<void>((resolve) => {
        unlock = resolve;
      });
    const holder = db.transaction(async (tx) => {
      await tx.query('SELECT id FROM ff_users WHERE id=$1 FOR UPDATE', [eu]);
      locked();
      await releaseSignal;
    });
    await lockedSignal;
    let waiting!: () => void;
    const waitingSignal = new Promise<void>((resolve) => {
      waiting = resolve;
    });
    const observed = (base: Database): Database => ({
      query: (sql, values) => {
        if (sql.includes('ORDER BY id FOR UPDATE')) waiting();
        return base.query(sql, values);
      },
      transaction: (run) => base.transaction((tx) => run(observed(tx))),
    });
    const pending = personal(observed(db)).start(
      eu,
      e.publication.slug,
      body(ep),
      randomUUID(),
    );
    // Attach the rejection handler immediately, before releasing the holder.
    const rejected = assert.rejects(
      pending,
      (err: unknown) =>
        (err as { code: string }).code === 'PERSONAL_SCENARIO_PREVIEW_EXPIRED',
    );
    try {
      await Promise.race([
        waitingSignal,
        pending.then(
          () => {
            throw Error('Start unexpectedly completed before contended lock');
          },
          () => {
            throw Error('Start failed before contended lock');
          },
        ),
      ]);
      const [remaining] = await db.query<{ ms: number }>(
        'SELECT greatest(0,extract(epoch FROM ($1::timestamptz-clock_timestamp()))*1000)::float8 AS ms',
        [ep.expiresAt],
      );
      await new Promise((resolve) => setTimeout(resolve, remaining!.ms + 100));
    } finally {
      unlock();
      await holder;
    }
    await rejected;
    assert.equal(
      (await db.query('SELECT id FROM aw_jobs WHERE user_id=$1', [eu])).length,
      0,
    );

    const ex = await repo.exportAccount(a.owner);
    assert(Array.isArray(ex.aw_personal_scenario_starts));
    assert(Array.isArray(ex.aw_personal_scenario_previews));
    assert.equal(ex.aw_personal_scenario_starts.length, 1);
    assert.equal(ex.aw_personal_scenario_previews.length, 1);
    for (const table of [
      'aw_personal_scenario_starts',
      'aw_personal_scenario_previews',
    ]) {
      const [guard] = await db.query(
        "SELECT relrowsecurity AS rls,has_table_privilege('anon',oid,'SELECT') AS anon,has_table_privilege('authenticated',oid,'INSERT') AS client FROM pg_class WHERE oid=$1::regclass",
        [table],
      );
      assert.deepEqual(guard, { rls: true, anon: false, client: false });
    }
    await assert.rejects(
      db.query(
        'UPDATE aw_personal_scenario_starts SET profile_hash=$1 WHERE user_id=$2',
        ['0'.repeat(64), a.owner],
      ),
    );
    await assert.rejects(
      db.query(
        'UPDATE aw_personal_scenario_previews SET profile_hash=$1 WHERE user_id=$2',
        ['0'.repeat(64), a.owner],
      ),
    );
    assert.equal(
      hash(await q.scenarios.get(q.owner, q.version.id)),
      q.canonicalBefore,
    );
    await repo.markDeleting(a.owner);
    await repo.deleteAccountData(a.owner);
    assert.equal(
      (
        await db.query(
          'SELECT life_id FROM aw_personal_scenario_starts WHERE user_id=$1',
          [a.owner],
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_personal_scenario_previews WHERE user_id=$1',
          [a.owner],
        )
      ).length,
      0,
    );
    assert.equal((await lives.list(b.owner)).length, 1);
    assert.equal(
      (await r.attribution(b.owner, opposite[1]!.lifeId)).source,
      null,
    );
    await cleanupExpiredPersonalScenarioPreviews(db);
    return {
      concurrentPrivateProfilePreviewOnce: true,
      concurrentExactStartOneLifeOneJob: true,
      oppositeDirectionStartAndAttributionLockOrder: true,
      ownFactsThreePeriodsAfterSourceDeletion: true,
      withdrawalPhysicalSourceDeletionRaceSafe: true,
      contendedOwnerLockUsesDatabaseExpiry: true,
      quotaRollbackDeletionNoResurrection: true,
      privateExportImmutableRlsCascade: true,
      publicOriginPersonalCohortAfterSourceDeletion: true,
      actualProviderCalls: 0,
      actualEditorialScenario: false,
    };
  } finally {
    for (const owner of owners)
      if (
        (await db.query('SELECT id FROM ff_users WHERE id=$1', [owner])).length
      ) {
        await repo.markDeleting(owner);
        await repo.deleteAccountData(owner);
      }
  }
}
