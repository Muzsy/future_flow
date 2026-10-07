import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  LifeDeletionRepository,
  LifeRepository,
  Repository,
  PublicationRepository,
  PublicationRefreshRepository,
  PublicExposureRepository,
  SharedJobRepository,
  cleanupExpiredLifeAdmissions,
  type Database,
} from '@future-flow/database';
import {
  publicationFixture,
  approvePublicationFixture,
} from '../../tests/publication-fixtures';
import { refreshedPublicationFixture } from '../../tests/publication-refresh-fixtures';
import { sharedAiGroup } from '../../tests/shared-ai-fixtures';
import { testInviteSecret } from '../../tests/shared-fixtures';
import { setupFixture } from '../../tests/life-fixtures';
// Isolated PostgreSQL fixture only; no actual provider or seed content.
export async function lifeDeletionProof(db: Database) {
  const owners: string[] = [],
    config = { enabled: true, linkSecret: 'd'.repeat(64) },
    lives = new LifeRepository(db),
    deletion = new LifeDeletionRepository(db),
    pubs = new PublicationRepository(db, config),
    exposure = new PublicExposureRepository(
      db,
      { enabled: true },
      config,
      config,
    );
  const body = (branchId: string, revision: number) => ({
    branchId,
    revision,
    confirmation: 'DELETE LIFE',
  });
  try {
    const f = await publicationFixture(db);
    owners.push(f.owner);
    const approved = await approvePublicationFixture(db, f);
    assert.ok(approved);
    approved.settings.visibility = 'public';
    const preview = await pubs.prepare(f.owner, approved, randomUUID()),
      previous = await pubs.confirm(
        f.owner,
        {
          previewId: preview.previewId,
          previewHash: preview.previewHash,
          acknowledged: true,
        },
        randomUUID(),
      );
    await exposure.setOwner(f.owner, previous.slug, {
      publicationRevision: previous.revision,
      snapshotHash: previous.snapshotHash,
      permissionRevision: 0,
      mode: 'index',
      acknowledged: true,
    });
    const branch = await lives.branch(f.owner, f.created.branchId),
      key = randomUUID(),
      results = await Promise.all(
        [1, 2, 3].map(() =>
          deletion.remove(
            f.owner,
            f.created.lifeId,
            body(branch.id, branch.revision),
            key,
          ),
        ),
      );
    assert.deepEqual(results[0], results[1]);
    assert.deepEqual(results[1], results[2]);
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_deleted_life_admissions WHERE user_id=$1',
          [f.owner],
        )
      ).length,
      2,
    );
    await assert.rejects(pubs.readPublic(previous.slug));
    await assert.rejects(exposure.project(previous.slug));
    await assert.rejects(
      new LifeRepository(db, { daily: 1, concurrent: 2 }).create(
        f.owner,
        setupFixture(),
        randomUUID(),
      ),
      (e: unknown) => (e as { code: string }).code === 'GENERATION_LIMIT',
    );
    const [admission] = await db.query<{ id: string }>(
      'SELECT id FROM aw_deleted_life_admissions WHERE user_id=$1',
      [f.owner],
    );
    assert.ok(admission);
    await assert.rejects(
      db.query(
        'UPDATE aw_deleted_life_admissions SET admitted_at=now() WHERE id=$1',
        [admission.id],
      ),
    );
    const [guard] = await db.query(
      "SELECT c.relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'INSERT') AS client FROM pg_class c WHERE c.oid='aw_deleted_life_admissions'::regclass",
    );
    assert.deepEqual(guard, { rls: true, anon: false, client: false });
    await db.query(
      "INSERT INTO aw_deleted_life_admissions(user_id,kind,admitted_at) VALUES($1,'generation',now()-interval '25 hours')",
      [f.owner],
    );
    assert.deepEqual(await cleanupExpiredLifeAdmissions(db), {
      deleted: 1,
      batchFull: false,
    });
    const exported = (await new Repository(db).exportAccount(f.owner))
      .aw_deleted_life_admissions as Record<string, unknown>[];
    assert.equal(exported.length, 2);
    for (const row of exported)
      assert.deepEqual(Object.keys(row).sort(), ['admitted_at', 'kind']);

    const competing = await publicationFixture(db);
    owners.push(competing.owner);
    const input = await approvePublicationFixture(db, competing);
    assert.ok(input);
    input.settings.visibility = 'public';
    const oldPreview = await pubs.prepare(competing.owner, input, randomUUID()),
      old = await pubs.confirm(
        competing.owner,
        {
          previewId: oldPreview.previewId,
          previewHash: oldPreview.previewHash,
          acknowledged: true,
        },
        randomUUID(),
      ),
      next = await refreshedPublicationFixture(db, competing);
    next.input.settings.visibility = 'public';
    const newPreview = await pubs.prepare(
        competing.owner,
        next.input,
        randomUUID(),
      ),
      current = await lives.branch(competing.owner, competing.created.branchId),
      race = await Promise.allSettled([
        new PublicationRefreshRepository(
          db,
          { enabled: true },
          config,
          config,
        ).refresh(
          competing.owner,
          'community',
          {
            previousPublicationId: old.publicationId,
            previousRevision: old.revision,
            previousSnapshotHash: old.snapshotHash,
            previewId: newPreview.previewId,
            previewHash: newPreview.previewHash,
            acknowledged: true,
          },
          randomUUID(),
        ),
        deletion.remove(
          competing.owner,
          competing.created.lifeId,
          body(current.id, current.revision),
          randomUUID(),
        ),
      ]);
    assert.equal(race[1]!.status, 'fulfilled');
    if (race[0]!.status === 'rejected')
      assert.equal((race[0] as PromiseRejectedResult).reason.status, 404);
    for (const table of [
      'aw_lives',
      'aw_jobs',
      'aw_publications',
      'aw_publication_refreshes',
    ])
      assert.equal(
        (
          await db.query(`SELECT id FROM ${table} WHERE user_id=$1`, [
            competing.owner,
          ])
        ).length,
        0,
      );
    assert.equal(
      (
        await db.query('SELECT status FROM ff_users WHERE id=$1', [
          competing.owner,
        ])
      )[0]!.status,
      'active',
    );

    const shared = new SharedJobRepository(db, testInviteSecret),
      g = await sharedAiGroup(db, shared);
    owners.push(...g.people.map((p) => p.id));
    const a = g.people[0]!,
      b = g.people[1]!,
      q = await shared.enqueue(
        a.id,
        g.contextId,
        g.detail.revision,
        randomUUID(),
      ),
      job = await shared.claim();
    assert.equal(job!.id, q.jobId);
    await deletion.remove(
      a.id,
      a.lifeId,
      body(a.branchId, a.revision),
      randomUUID(),
    );
    assert.deepEqual(
      (
        await db.query(
          'SELECT status,payload,checkpoints,lease_token FROM aw_shared_jobs WHERE id=$1',
          [q.jobId],
        )
      )[0],
      { status: 'cancelled', payload: {}, checkpoints: {}, lease_token: null },
    );
    await assert.rejects(shared.verify(job!));
    assert.equal((await lives.list(b.id)).length, 1);
    for (const owner of owners)
      await new Repository(db).deleteAccountData(owner);
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_deleted_life_admissions WHERE user_id=ANY($1::uuid[])',
          [owners],
        )
      ).length,
      0,
    );
    return {
      concurrentExactDeleteOnce: true,
      refreshDeletionRaceNoResurrection: true,
      publicExternalSourceCascade: true,
      sharedInFlightScrubAndRemainingLife: true,
      quotaNotResetByDeletion: true,
      minimalExportExpiryImmutableRls: true,
      accountAdmissionCascade: true,
      actualProviderCalls: 0,
    };
  } finally {
    for (const owner of owners)
      await new Repository(db).deleteAccountData(owner);
  }
}
