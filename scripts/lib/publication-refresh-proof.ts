import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  PublicationRefreshRepository,
  PublicationRepository,
  PublicExposureRepository,
  Repository,
  type Database,
} from '@future-flow/database';
import {
  publicationFixture,
  approvePublicationFixture,
} from '../../tests/publication-fixtures';
import {
  refreshedPublicationFixture,
  officialRefreshFixture,
} from '../../tests/publication-refresh-fixtures';

// Isolated PostgreSQL CI evidence with technical fixtures; never real provider or seed content.
export async function publicationRefreshProof(db: Database) {
  const config = { enabled: true, linkSecret: 'f'.repeat(64) },
    owners: string[] = [],
    pubs = new PublicationRepository(db, config, { enabled: false }),
    refresh = new PublicationRefreshRepository(
      db,
      { enabled: true },
      config,
      config,
      { enabled: false },
    ),
    exposure = new PublicExposureRepository(
      db,
      { enabled: true },
      config,
      config,
    );
  const request = (p: {
    previous: { publicationId: string; revision: number; snapshotHash: string };
    preview: { previewId: string; previewHash: string };
  }) => ({
    previousPublicationId: p.previous.publicationId,
    previousRevision: p.previous.revision,
    previousSnapshotHash: p.previous.snapshotHash,
    previewId: p.preview.previewId,
    previewHash: p.preview.previewHash,
    acknowledged: true,
  });
  async function pair(visibility: 'public' | 'unlisted' = 'public') {
    const f = await publicationFixture(db);
    owners.push(f.owner);
    const input = await approvePublicationFixture(db, f);
    assert.ok(input);
    input.settings.visibility = visibility;
    const first = await pubs.prepare(f.owner, input, randomUUID()),
      previous = await pubs.confirm(
        f.owner,
        {
          previewId: first.previewId,
          previewHash: first.previewHash,
          acknowledged: true,
        },
        randomUUID(),
      ),
      next = await refreshedPublicationFixture(db, f);
    next.input.settings.visibility = 'public';
    const preview = await pubs.prepare(f.owner, next.input, randomUUID());
    return { f, previous, next, preview };
  }
  try {
    const p = await pair(),
      originalBranch = await db.query('SELECT * FROM aw_branches WHERE id=$1', [
        p.f.created.branchId,
      ]);
    await exposure.setOwner(p.f.owner, p.previous.slug, {
      publicationRevision: p.previous.revision,
      snapshotHash: p.previous.snapshotHash,
      permissionRevision: 0,
      mode: 'index',
      acknowledged: true,
    });
    const key = randomUUID(),
      input = request(p),
      copies = await Promise.all([
        refresh.refresh(p.f.owner, 'community', input, key),
        refresh.refresh(p.f.owner, 'community', input, key),
        refresh.refresh(p.f.owner, 'community', input, randomUUID()),
      ]);
    assert.deepEqual(copies[0], copies[1]);
    assert.deepEqual(copies[1], copies[2]);
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_publication_refreshes WHERE user_id=$1',
          [p.f.owner],
        )
      ).length,
      1,
    );
    assert.notEqual(copies[0]!.publication.slug, p.previous.slug);
    await assert.rejects(pubs.readPublic(p.previous.slug));
    await assert.rejects(exposure.project(p.previous.slug));
    await assert.rejects(exposure.project(copies[0]!.publication.slug));
    assert.deepEqual(
      await db.query('SELECT * FROM aw_branches WHERE id=$1', [
        p.f.created.branchId,
      ]),
      originalBranch,
    );
    const [audit] = await db.query<{ id: string }>(
      'SELECT id FROM aw_publication_refreshes WHERE user_id=$1',
      [p.f.owner],
    );
    assert.ok(audit);
    await assert.rejects(
      db.query(
        'UPDATE aw_publication_refreshes SET previous_revision=previous_revision+1 WHERE id=$1',
        [audit.id],
      ),
    );
    assert.equal(
      (
        (await new Repository(db).exportAccount(p.f.owner))
          .aw_publication_refreshes as unknown[]
      ).length,
      1,
    );
    const next = copies[0]!.publication;
    await pubs.action(
      p.f.owner,
      next.publicationId,
      'withdraw',
      {
        revision: next.revision,
        snapshotHash: next.snapshotHash,
        acknowledged: true,
      },
      randomUUID(),
    );
    assert.equal(
      (await refresh.refresh(p.f.owner, 'community', input, key)).publication
        .status,
      'withdrawn',
    );

    const competing = await pair(),
      alternative = await refreshedPublicationFixture(
        db,
        competing.f,
        'Another reviewed replacement title',
      );
    alternative.input.settings.visibility = 'public';
    const alternativePreview = await pubs.prepare(
        competing.f.owner,
        alternative.input,
        randomUUID(),
      ),
      race = await Promise.allSettled([
        refresh.refresh(
          competing.f.owner,
          'community',
          request(competing),
          randomUUID(),
        ),
        refresh.refresh(
          competing.f.owner,
          'community',
          request({ ...competing, preview: alternativePreview }),
          randomUUID(),
        ),
      ]);
    assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      (race.find((r) => r.status === 'rejected') as PromiseRejectedResult)
        .reason.code,
      'PUBLICATION_REFRESH_CONFLICT',
    );
    assert.equal(
      (
        await db.query(
          "SELECT id FROM aw_publications WHERE user_id=$1 AND status='active'",
          [competing.f.owner],
        )
      ).length,
      1,
    );

    const unlisted = await pair('unlisted');
    await pubs.readUnlisted(unlisted.previous.unlistedToken!);
    await refresh.refresh(
      unlisted.f.owner,
      'community',
      request(unlisted),
      randomUUID(),
    );
    await assert.rejects(pubs.readUnlisted(unlisted.previous.unlistedToken!));

    const official = await officialRefreshFixture(db, config);
    owners.push(official.f.owner);
    const officialCopy = await refresh.refresh(
      official.f.owner,
      'official',
      request(official),
      randomUUID(),
    );
    assert.equal(officialCopy.publication.snapshot.classification, 'official');
    await official.f.official.revoke(official.f.owner, {
      grantId: official.next.grant.grant!.id,
      contentHash: official.next.copy.bundle.contentHash,
      reasonCode: 'quality',
      actorLabel: 'Isolated refresh proof',
      acknowledged: true,
    });
    await assert.rejects(
      official.pubs.readPublic(officialCopy.publication.slug),
    );
    const revoked = await officialRefreshFixture(db, config);
    owners.push(revoked.f.owner);
    await revoked.f.official.revoke(revoked.f.owner, {
      grantId: revoked.next.grant.grant!.id,
      contentHash: revoked.next.copy.bundle.contentHash,
      reasonCode: 'quality',
      actorLabel: 'Isolated before refresh proof',
      acknowledged: true,
    });
    await assert.rejects(
      refresh.refresh(
        revoked.f.owner,
        'official',
        request(revoked),
        randomUUID(),
      ),
    );
    await revoked.pubs.readPublic(revoked.previous.slug);
    assert.equal(
      await revoked.pubs.forBundle(
        revoked.f.owner,
        revoked.next.copy.bundle.bundleId,
      ),
      null,
    );
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_publication_refreshes WHERE user_id=$1',
          [revoked.f.owner],
        )
      ).length,
      0,
    );

    const deleting = await pair(),
      deletionRace = await Promise.allSettled([
        refresh.refresh(
          deleting.f.owner,
          'community',
          request(deleting),
          randomUUID(),
        ),
        new Repository(db).deleteAccountData(deleting.f.owner),
      ]);
    assert.equal(deletionRace[1]!.status, 'fulfilled');
    if (deletionRace[0]!.status === 'rejected')
      assert.equal(
        (deletionRace[0] as PromiseRejectedResult).reason.status,
        404,
      );
    await assert.rejects(pubs.readPublic(deleting.previous.slug));
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_publication_refreshes WHERE user_id=$1',
          [deleting.f.owner],
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await db.query('SELECT id FROM aw_publications WHERE user_id=$1', [
          deleting.f.owner,
        ])
      ).length,
      0,
    );
    return {
      concurrentExactRefreshOnce: true,
      competingReplacementOnce: true,
      immutableNewCopyAndPrivateCanon: true,
      oldPublicUnlistedAndExternalPermissionsStop: true,
      exactOfficialGrantAndRollback: true,
      inactiveReplayExportAndImmutableHistory: true,
      physicalDeletionRaceAndCascade: true,
      actualProviderCalls: 0,
      actualOfficialSeed: false,
    };
  } finally {
    for (const owner of owners)
      await new Repository(db).deleteAccountData(owner);
  }
}
