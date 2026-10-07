import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hash } from '@future-flow/core';
import {
  PublicForkPermissionRepository,
  PublicationRefreshRepository,
  LifeDeletionRepository,
  Repository,
  type Database,
} from '@future-flow/database';
import {
  communityForkCopy,
  officialForkCopy,
} from '../../tests/public-fork-permission-fixtures';
import { refreshedPublicationFixture } from '../../tests/publication-refresh-fixtures';
// Only isolated PostgreSQL fixtures. No real provider call or genuine Official seed.
export async function publicForkPermissionProof(db: Database) {
  const owners: string[] = [],
    config = { enabled: true, linkSecret: 'f'.repeat(64) },
    flags = { enabled: true, startsEnabled: false },
    forks = new PublicForkPermissionRepository(db, flags, config, config),
    repo = new Repository(db);
  const request = (
    v: { revision: number; snapshotHash: string },
    allowed = true,
    permissionRevision = 0,
  ) => ({
    publicationRevision: v.revision,
    snapshotHash: v.snapshotHash,
    permissionRevision,
    allowed,
    acknowledged: true,
  });
  try {
    const f = await communityForkCopy(db, config);
    owners.push(f.owner);
    const before = await f.lives.detail(f.owner, f.created.branchId),
      reader = await f.pubs.readPublic(f.view.slug),
      input = request(f.view),
      grants = await Promise.all(
        [1, 2, 3].map(() => forks.setOwner(f.owner, f.view.slug, input)),
      );
    assert.deepEqual(grants[0], grants[1]);
    assert.deepEqual(grants[1], grants[2]);
    assert.equal(grants[0]!.permissionRevision, 1);
    assert.equal(
      (await db.query('SELECT id FROM aw_public_fork_permission_actions'))
        .length,
      1,
    );
    const capability = await forks.capability(f.view.slug);
    assert.equal(capability.startsEnabled, false);
    assert.equal(capability.checkpoints.length, 1);
    for (const hidden of [
      f.owner,
      f.created.lifeId,
      f.created.branchId,
      f.bundle.bundleId,
      f.view.snapshotHash,
    ])
      assert(!JSON.stringify(capability).includes(hidden));
    assert.deepEqual(await f.lives.detail(f.owner, f.created.branchId), before);
    assert.deepEqual(await f.pubs.readPublic(f.view.slug), reader);
    assert.equal(reader.snapshot.forkEnabled, false);
    const conflict = await Promise.allSettled([
      forks.setOwner(f.owner, f.view.slug, request(f.view, false, 1)),
      forks.setOwner(f.owner, f.view.slug, request(f.view, true, 1)),
    ]);
    assert.equal(conflict.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      (conflict.find((r) => r.status === 'rejected') as PromiseRejectedResult)
        .reason.status,
      409,
    );
    const current = await forks.own(f.owner, f.view.slug);
    await forks.setOwner(
      f.owner,
      f.view.slug,
      request(f.view, false, current.permissionRevision),
    );
    await assert.rejects(forks.capability(f.view.slug));
    await assert.rejects(forks.setOwner(f.owner, f.view.slug, input));
    const denied = await forks.own(f.owner, f.view.slug);
    await forks.setOwner(
      f.owner,
      f.view.slug,
      request(f.view, true, denied.permissionRevision),
    );
    await assert.rejects(
      db.query('UPDATE aw_public_fork_permission_actions SET allowed=false'),
    );
    for (const table of [
      'aw_public_fork_permissions',
      'aw_public_fork_permission_actions',
    ])
      assert.deepEqual(
        (
          await db.query(
            "SELECT relrowsecurity AS rls,has_table_privilege('anon',oid,'SELECT') AS anon,has_table_privilege('authenticated',oid,'INSERT') AS client FROM pg_class WHERE oid=$1::regclass",
            [table],
          )
        )[0],
        { rls: true, anon: false, client: false },
      );
    const exported = await repo.exportAccount(f.owner);
    for (const row of exported.aw_public_fork_permission_actions as Record<
      string,
      unknown
    >[])
      for (const hidden of [
        'actor_label',
        'request_hash',
        'permission_id',
        'user_id',
      ])
        assert(!Object.hasOwn(row, hidden));
    const next = await refreshedPublicationFixture(db, f);
    next.input.settings.visibility = 'public';
    const preview = await f.pubs.prepare(f.owner, next.input, randomUUID()),
      replacement = await new PublicationRefreshRepository(
        db,
        { enabled: true },
        config,
        config,
      ).refresh(
        f.owner,
        'community',
        {
          previousPublicationId: f.view.publicationId,
          previousRevision: f.view.revision,
          previousSnapshotHash: f.view.snapshotHash,
          previewId: preview.previewId,
          previewHash: preview.previewHash,
          acknowledged: true,
        },
        randomUUID(),
      );
    await assert.rejects(forks.capability(f.view.slug));
    assert.equal(
      (await forks.own(f.owner, replacement.publication.slug)).allowed,
      false,
    );
    await assert.rejects(
      forks.setOwner(
        f.owner,
        replacement.publication.slug,
        request(replacement.publication),
      ),
      (e: unknown) =>
        (e as { code: string }).code === 'PUBLIC_FORK_CHECKPOINT_REQUIRED',
    );
    const official = await officialForkCopy(db, config);
    owners.push(official.owner);
    await assert.rejects(
      forks.setOwner(
        official.owner,
        official.view.slug,
        request(official.view),
      ),
      (e: unknown) => (e as { status: number }).status === 403,
    );
    await forks.setOfficial({
      ...request(official.view),
      slug: official.view.slug,
      actorLabel: 'Isolated curator',
    });
    assert.equal(
      (await forks.capability(official.view.slug)).classification,
      'official',
    );
    await new PublicForkPermissionRepository(
      db,
      { enabled: false, startsEnabled: false },
      config,
      config,
    ).setOwner(
      official.owner,
      official.view.slug,
      request(official.view, false, 1),
    );
    await assert.rejects(forks.capability(official.view.slug));
    await forks.setOfficial({
      ...request(official.view, true, 2),
      slug: official.view.slug,
      actorLabel: 'Isolated curator',
    });
    await official.official.revoke(official.owner, {
      grantId: official.grant.grant!.id,
      contentHash: official.grant.contentHash,
      reasonCode: 'privacy',
      actorLabel: 'Isolated curator',
      acknowledged: true,
    });
    await assert.rejects(forks.capability(official.view.slug));
    const race = await communityForkCopy(db, config);
    owners.push(race.owner);
    const branch = await race.lives.branch(race.owner, race.created.branchId),
      contenders = await Promise.allSettled([
        forks.setOwner(race.owner, race.view.slug, request(race.view)),
        new LifeDeletionRepository(db).remove(
          race.owner,
          race.created.lifeId,
          {
            branchId: branch.id,
            revision: branch.revision,
            confirmation: 'DELETE LIFE',
          },
          randomUUID(),
        ),
      ]);
    assert.equal(contenders[1]!.status, 'fulfilled');
    if (contenders[0]!.status === 'rejected')
      assert.equal((contenders[0] as PromiseRejectedResult).reason.status, 404);
    await assert.rejects(forks.capability(race.view.slug));
    await Promise.all(owners.map((owner) => repo.deleteAccountData(owner)));
    for (const table of [
      'aw_public_fork_permissions',
      'aw_public_fork_permission_actions',
    ])
      assert.equal((await db.query(`SELECT id FROM ${table}`)).length, 0);
    return {
      concurrentExactConsentOnce: true,
      competingConsentRevisionOnce: true,
      reviewedMinimalChoicesAndPrivateCanon: true,
      refreshRequiresIndependentConsent: true,
      officialCuratorRevokeAndSourceRevocation: true,
      physicalLifeDeletionRaceCascadePrivateAudit: true,
      actualProviderCalls: 0,
      actualOfficialSeed: false,
    };
  } finally {
    for (const owner of owners) await repo.deleteAccountData(owner);
  }
}
