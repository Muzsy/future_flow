import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hash, addMonths } from '@future-flow/core';
import {
  PublicForkStartRepository,
  PublicForkPermissionRepository,
  LifeRepository,
  LifeJobRepository,
  LifeDeletionRepository,
  Repository,
  publicOriginMetricsSummary,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import {
  communityForkCopy,
  officialForkCopy,
} from '../../tests/public-fork-permission-fixtures';
import { lifeTestAi } from '../../tests/life-fixtures';
import { processLifeJob } from '../../apps/worker/src/life-processor';
// Isolated PostgreSQL and technical AI only; no genuine seed or provider call.
export async function publicForkStartProof(db: Database) {
  const owners: string[] = [],
    config = { enabled: true, linkSecret: 'b'.repeat(64) },
    flags = { enabled: true, startsEnabled: true },
    permissions = new PublicForkPermissionRepository(db, flags, config, config),
    starts = new PublicForkStartRepository(db, flags, config, config),
    lives = new LifeRepository(db),
    repo = new Repository(db),
    deletion = new LifeDeletionRepository(db);
  async function target() {
    const owner = randomUUID();
    owners.push(owner);
    await repo.ensureUser(owner);
    await repo.acceptPrivacy(owner);
    return owner;
  }
  async function grant(f: Awaited<ReturnType<typeof communityForkCopy>>) {
    await permissions.setOwner(f.owner, f.view.slug, {
      publicationRevision: f.view.revision,
      snapshotHash: f.view.snapshotHash,
      permissionRevision: 0,
      allowed: true,
      acknowledged: true,
    });
    const c = await permissions.capability(f.view.slug);
    return {
      capabilityHash: c.capabilityHash,
      checkpointIndex: 0,
      optionKey: c.checkpoints[0]!.options[0]!.key,
      acknowledged: true,
    };
  }
  async function process(owner: string, jobId: string) {
    const [job] = await db.query<LifeJob>(
      "UPDATE aw_jobs SET status='running',attempt=1,lease_token=$1,lease_until=now()+interval '10 minutes' WHERE id=$2 AND user_id=$3 AND status='queued' RETURNING *",
      [randomUUID(), jobId, owner],
    );
    assert(job);
    await processLifeJob(job, new LifeJobRepository(db), lifeTestAi);
  }
  try {
    const cohortTotals = async () => {
      const report = await publicOriginMetricsSummary(db);
      return report.cohorts
        .filter((r) => r.channel === 'community_public_checkpoint')
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
    const source = await communityForkCopy(db, config);
    owners.push(source.owner);
    const user = await target(),
      body = await grant(source),
      key = randomUUID(),
      before = await lives.detail(source.owner, source.created.branchId),
      requests = await Promise.all(
        [1, 2, 3].map(() => starts.start(user, source.view.slug, body, key)),
      );
    assert.deepEqual(requests[0], requests[1]);
    assert.deepEqual(requests[1], requests[2]);
    const created = requests[0]!;
    assert.deepEqual(await cohortTotals(), [
      cohortBefore[0]! + 1,
      ...cohortBefore.slice(1),
    ]);
    assert.equal(
      (await db.query('SELECT id FROM aw_jobs WHERE user_id=$1', [user]))
        .length,
      1,
    );
    await assert.rejects(
      starts.start(
        user,
        source.view.slug,
        { ...body, optionKey: 'option-2' },
        key,
      ),
      (e: unknown) => (e as { status: number }).status === 409,
    );
    const initial = await lives.branch(user, created.branchId);
    assert.equal(initial.parent_branch_id, null);
    assert.equal(initial.input.visibility, 'private');
    assert.equal(initial.input.identity.baseProfileVersionId, null);
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
        const [job] = await db.query<LifeJob>(
          'SELECT * FROM aw_jobs WHERE id=$1',
          [jobId],
        );
        assert(
          job!.payload.memory.choices.some(
            (c: any) => c.decision_id === initial.accepted_decision_ids[0],
          ),
        );
      }
    }
    assert.equal(
      (await lives.branch(user, created.branchId)).state.effectiveAt,
      addMonths(initial.state.effectiveAt, 18),
    );
    assert.deepEqual(
      await lives.detail(source.owner, source.created.branchId),
      before,
    );
    assert.equal(
      (
        await db.query('SELECT id FROM aw_initial_choices WHERE life_id=$1', [
          created.lifeId,
        ])
      ).length,
      1,
    );
    const a = await communityForkCopy(db, config),
      b = await communityForkCopy(db, config);
    owners.push(a.owner, b.owner);
    const abody = await grant(a),
      bbody = await grant(b),
      opposite = await Promise.all([
        starts.start(b.owner, a.view.slug, abody, randomUUID()),
        starts.start(a.owner, b.view.slug, bbody, randomUUID()),
      ]);
    assert.equal(opposite.length, 2);
    assert.equal((await lives.list(a.owner)).length, 2);
    assert.equal((await lives.list(b.owner)).length, 2);
    const saved = await lives.detail(user, created.branchId),
      sourceBranch = await lives.branch(source.owner, source.created.branchId);
    await deletion.remove(
      source.owner,
      source.created.lifeId,
      {
        branchId: sourceBranch.id,
        revision: sourceBranch.revision,
        confirmation: 'DELETE LIFE',
      },
      randomUUID(),
    );
    assert.equal((await starts.attribution(user, created.lifeId)).source, null);
    assert.deepEqual(
      await starts.start(user, source.view.slug, body, key),
      created,
    );
    assert.deepEqual(await lives.detail(user, created.branchId), saved);
    const raced = await communityForkCopy(db, config);
    owners.push(raced.owner);
    const targetUser = await target(),
      raceBody = await grant(raced),
      raceBranch = await lives.branch(raced.owner, raced.created.branchId),
      race = await Promise.allSettled([
        starts.start(targetUser, raced.view.slug, raceBody, randomUUID()),
        deletion.remove(
          raced.owner,
          raced.created.lifeId,
          {
            branchId: raceBranch.id,
            revision: raceBranch.revision,
            confirmation: 'DELETE LIFE',
          },
          randomUUID(),
        ),
      ]);
    assert.equal(race[1]!.status, 'fulfilled');
    if (race[0]!.status === 'fulfilled') {
      const receipt = race[0].value;
      assert.equal(
        (await starts.attribution(targetUser, receipt.lifeId)).source,
        null,
      );
      assert.equal((await lives.list(targetUser)).length, 1);
    } else {
      assert.equal((race[0] as PromiseRejectedResult).reason.status, 404);
      assert.equal((await lives.list(targetUser)).length, 0);
    }
    const quotaSource = await communityForkCopy(db, config);
    owners.push(quotaSource.owner);
    const quotaUser = await target(),
      quotaBody = await grant(quotaSource),
      quota = new PublicForkStartRepository(db, flags, config, config, {
        daily: 1,
        concurrent: 1,
      }),
      quotaKey = randomUUID(),
      first = await quota.start(
        quotaUser,
        quotaSource.view.slug,
        quotaBody,
        quotaKey,
      );
    await assert.rejects(
      quota.start(quotaUser, quotaSource.view.slug, quotaBody, randomUUID()),
      (e: unknown) => (e as { code: string }).code === 'GENERATION_LIMIT',
    );
    assert.equal((await lives.list(quotaUser)).length, 1);
    const head = await lives.branch(quotaUser, first.branchId);
    await deletion.remove(
      quotaUser,
      first.lifeId,
      {
        branchId: head.id,
        revision: head.revision,
        confirmation: 'DELETE LIFE',
      },
      randomUUID(),
    );
    await assert.rejects(
      quota.start(quotaUser, quotaSource.view.slug, quotaBody, quotaKey),
      (e: unknown) =>
        (e as { code: string }).code === 'PUBLIC_FORK_START_DELETED',
    );
    await assert.rejects(
      quota.start(quotaUser, quotaSource.view.slug, quotaBody, randomUUID()),
      (e: unknown) => (e as { code: string }).code === 'GENERATION_LIMIT',
    );
    assert.equal((await lives.list(quotaUser)).length, 0);
    const official = await officialForkCopy(db, config);
    owners.push(official.owner);
    await permissions.setOfficial({
      slug: official.view.slug,
      publicationRevision: official.view.revision,
      snapshotHash: official.view.snapshotHash,
      permissionRevision: 0,
      allowed: true,
      acknowledged: true,
      actorLabel: 'Isolated curator',
    });
    const cap = await permissions.capability(official.view.slug),
      officialUser = await target(),
      officialBody = {
        capabilityHash: cap.capabilityHash,
        checkpointIndex: 0,
        optionKey: cap.checkpoints[0]!.options[0]!.key,
        acknowledged: true,
      },
      privateOfficial = await starts.start(
        officialUser,
        official.view.slug,
        officialBody,
        randomUUID(),
      );
    assert.equal(
      (
        await db.query(
          'SELECT life_id FROM aw_official_life_starts WHERE user_id=$1',
          [officialUser],
        )
      ).length,
      0,
    );
    await official.official.revoke(official.owner, {
      grantId: official.grant.grant!.id,
      contentHash: official.grant.contentHash,
      reasonCode: 'privacy',
      actorLabel: 'Isolated curator',
      acknowledged: true,
    });
    await assert.rejects(
      starts.start(
        officialUser,
        official.view.slug,
        officialBody,
        randomUUID(),
      ),
    );
    assert.equal(
      (await starts.attribution(officialUser, privateOfficial.lifeId)).source,
      null,
    );
    for (const table of ['aw_public_fork_starts', 'aw_initial_choices']) {
      assert.deepEqual(
        (
          await db.query(
            "SELECT relrowsecurity AS rls,has_table_privilege('anon',oid,'SELECT') AS anon,has_table_privilege('authenticated',oid,'INSERT') AS client FROM pg_class WHERE oid=$1::regclass",
            [table],
          )
        )[0],
        { rls: true, anon: false, client: false },
      );
      await assert.rejects(
        db.query(`UPDATE ${table} SET user_id=$1 WHERE user_id=$2`, [
          official.owner,
          officialUser,
        ]),
      );
    }
    const exported = await repo.exportAccount(user);
    assert.equal((exported.aw_initial_choices as unknown[]).length, 1);
    for (const forbidden of [
      source.owner,
      source.created.lifeId,
      source.created.branchId,
      source.view.publicationId,
    ])
      assert(
        !JSON.stringify(exported.aw_public_fork_starts).includes(forbidden),
      );
    for (const owner of owners) await repo.deleteAccountData(owner);
    for (const table of ['aw_public_fork_starts', 'aw_initial_choices'])
      assert.equal((await db.query(`SELECT id FROM ${table}`)).length, 0);
    assert.deepEqual(await cohortTotals(), cohortBefore);
    return {
      concurrentExactPrivateStartOnce: true,
      oppositeDirectionOwnerLockOrder: true,
      initialChoiceOnceAndThreePrivatePeriods: true,
      sourceDeletionDetachesIndependentLife: true,
      physicalDeletionStartRaceSafe: true,
      quotaRollbackAndDeletedRequestNoResurrection: true,
      officialSourceDoesNotGrantPrivateProvenance: true,
      privateExportImmutableRlsAndCascade: true,
      publicOriginCreatedAndThreeOriginalPeriods: true,
      publicOriginReplayAndDeletionCohorts: true,
      actualProviderCalls: 0,
      actualOfficialSeed: false,
    };
  } finally {
    for (const owner of owners) await repo.deleteAccountData(owner);
  }
}
