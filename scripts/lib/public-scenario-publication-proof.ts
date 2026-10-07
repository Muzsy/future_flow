import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  PublicScenarioPublicationRepository,
  Repository,
  type Database,
} from '@future-flow/database';
import { publicScenarioFixture } from '../../tests/public-scenario-publication-fixtures';

// Real isolated PostgreSQL concurrency; synthetic receipts, no external provider.
export async function publicScenarioPublicationProof(db: Database) {
  const owners: string[] = [],
    flags = { enabled: true, operatorEnabled: true },
    repo = new Repository(db),
    pubs = new PublicScenarioPublicationRepository(db, flags);
  try {
    const f = await publicScenarioFixture(db);
    owners.push(f.owner);
    const original = await f.scenarios.get(f.owner, f.version.id),
      key = randomUUID(),
      previews = await Promise.all(
        [1, 2, 3].map(() =>
          pubs.prepare(f.owner, f.version.id, f.request, key),
        ),
      );
    assert.deepEqual(previews[0], previews[1]);
    assert.deepEqual(previews[1], previews[2]);
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_public_scenario_previews WHERE user_id=$1',
          [f.owner],
        )
      ).length,
      2,
    );
    const confirm = {
        ...f.confirm,
        previewId: previews[0]!.id,
        previewHash: previews[0]!.previewHash,
      },
      confirmationKey = randomUUID(),
      created = await Promise.all(
        [1, 2, 3].map(() => pubs.confirm(f.owner, confirm, confirmationKey)),
      );
    assert.deepEqual(created[0], created[1]);
    assert.deepEqual(created[1], created[2]);
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_scenario_publications WHERE user_id=$1',
          [f.owner],
        )
      ).length,
      1,
    );
    const view = created[0]!,
      reader = await pubs.read(view.slug);
    assert.equal(reader.officialScenario, true);
    assert.equal(reader.officialLifeApproved, false);
    assert.deepEqual(reader.template, f.version.template);
    for (const hidden of [
      f.owner,
      f.version.id,
      f.version.scenarioId,
      f.request.sourceGrantId,
      previews[0]!.id,
    ])
      assert(!JSON.stringify(reader).includes(hidden));
    assert.deepEqual(await f.scenarios.get(f.owner, f.version.id), original);
    assert.equal(
      (await db.query('SELECT id FROM aw_jobs WHERE user_id=$1', [f.owner]))
        .length,
      0,
    );
    const readWithdraw = await Promise.allSettled([
      pubs.read(view.slug),
      pubs.withdraw(f.owner, view.id),
    ]);
    assert.equal(readWithdraw[1]!.status, 'fulfilled');
    await assert.rejects(pubs.read(view.slug));
    assert.equal(
      (await pubs.confirm(f.owner, confirm, confirmationKey)).status,
      'withdrawn',
    );

    const a = await pubs.prepare(
        f.owner,
        f.version.id,
        f.request,
        randomUUID(),
      ),
      b = await pubs.prepare(
        f.owner,
        f.version.id,
        { ...f.request, allowPersonalization: false },
        randomUUID(),
      ),
      race = await Promise.allSettled([
        pubs.confirm(
          f.owner,
          { ...f.confirm, previewId: a.id, previewHash: a.previewHash },
          randomUUID(),
        ),
        pubs.confirm(
          f.owner,
          {
            previewId: b.id,
            previewHash: b.previewHash,
            acknowledged: true,
            personalizationAcknowledged: false,
          },
          randomUUID(),
        ),
      ]);
    assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      (race.find((r) => r.status === 'rejected') as PromiseRejectedResult)
        .reason.status,
      409,
    );
    const latest = (
      race.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
        typeof view
      >
    ).value;
    await Promise.allSettled([
      pubs.read(latest.slug),
      f.release.revoke({
        grantId: f.request.sourceGrantId,
        templateHash: f.request.templateHash,
        acknowledged: true,
        reasonCode: 'privacy',
        actorLabel: 'Isolated source revocation',
      }),
    ]);
    await assert.rejects(pubs.read(latest.slug));

    const exp = await publicScenarioFixture(db);
    owners.push(exp.owner);
    const shortDb: Database = {
        ...db,
        transaction: (run) =>
          db.transaction((tx) =>
            run({
              ...tx,
              query: async (sql, values) =>
                tx.query(
                  sql.includes("clock_timestamp()+interval '30 minutes'")
                    ? "SELECT clock_timestamp()+interval '3 seconds' AS until"
                    : sql,
                  values,
                ),
            }),
          ),
      },
      short = new PublicScenarioPublicationRepository(shortDb, flags),
      p = await short.prepare(
        exp.owner,
        exp.version.id,
        exp.request,
        randomUUID(),
      );
    let release!: () => void, held!: () => void, entered!: () => void;
    const released = new Promise<void>((r) => (release = r)),
      locked = new Promise<void>((r) => (held = r)),
      waiting = new Promise<void>((r) => (entered = r)),
      holder = db.transaction(async (tx) => {
        await tx.query('SELECT id FROM ff_users WHERE id=$1 FOR UPDATE', [
          exp.owner,
        ]);
        held();
        await released;
      }),
      observed: Database = {
        ...db,
        transaction: (run) =>
          db.transaction((tx) =>
            run({
              ...tx,
              query: async (sql, values) => {
                if (sql.startsWith('SELECT status FROM ff_users')) entered();
                return tx.query(sql, values);
              },
            }),
          ),
      };
    await locked;
    const pending = new PublicScenarioPublicationRepository(
      observed,
      flags,
    ).confirm(
      exp.owner,
      { ...exp.confirm, previewId: p.id, previewHash: p.previewHash },
      randomUUID(),
    );
    try {
      await Promise.race([waiting, pending]);
      const [remaining] = await db.query<{ ms: number }>(
        'SELECT greatest(0,extract(epoch FROM ($1::timestamptz-clock_timestamp()))*1000)::int AS ms',
        [p.expiresAt],
      );
      await new Promise((r) => setTimeout(r, Number(remaining!.ms) + 50));
    } finally {
      release();
      await holder;
    }
    await assert.rejects(
      pending,
      (e: unknown) =>
        (e as { code: string }).code === 'PUBLIC_SCENARIO_PREVIEW_EXPIRED',
    );
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_scenario_publications WHERE user_id=$1',
          [exp.owner],
        )
      ).length,
      0,
    );

    const d = await publicScenarioFixture(db);
    owners.push(d.owner);
    const deleteKey = randomUUID(),
      dv = await pubs.confirm(d.owner, d.confirm, deleteKey);
    const deleted = await Promise.allSettled([
      pubs.read(dv.slug),
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
    assert.equal(deleted[1]!.status, 'fulfilled');
    await assert.rejects(pubs.read(dv.slug));
    await assert.rejects(pubs.confirm(d.owner, d.confirm, deleteKey));
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_scenario_publications WHERE user_id=$1',
          [d.owner],
        )
      ).length,
      0,
    );
    const m = await publicScenarioFixture(db);
    owners.push(m.owner);
    const mv = await pubs.confirm(m.owner, m.confirm, randomUUID()),
      action = {
        status: 'hidden',
        reason: 'privacy',
        actorLabel: 'Isolated Scenario moderator',
      };
    await Promise.all(
      [1, 2, 3].map(() => pubs.moderate(m.owner, mv.id, action)),
    );
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_scenario_publication_moderation WHERE user_id=$1',
          [m.owner],
        )
      ).length,
      1,
    );
    await assert.rejects(pubs.read(mv.slug));
    for (const table of [
      'aw_public_scenario_previews',
      'aw_scenario_publications',
      'aw_scenario_publication_moderation',
    ]) {
      const [guard] = await db.query(
        "SELECT relrowsecurity AS rls,has_table_privilege('anon',oid,'SELECT') AS anon,has_table_privilege('authenticated',oid,'INSERT') AS client FROM pg_class WHERE oid=$1::regclass",
        [table],
      );
      assert.deepEqual(guard, { rls: true, anon: false, client: false });
    }
    await assert.rejects(
      db.query(
        'UPDATE aw_scenario_publications SET allow_personalization=false WHERE id=$1',
        [mv.id],
      ),
    );
    await assert.rejects(
      db.query(
        "UPDATE aw_scenario_publication_moderation SET reason='other' WHERE user_id=$1",
        [m.owner],
      ),
    );
    const exported = await repo.exportAccount(m.owner);
    assert.equal((exported.aw_scenario_publications as unknown[]).length, 1);
    assert.equal(
      (exported.aw_scenario_publication_moderation as unknown[]).length,
      1,
    );
    await repo.markDeleting(m.owner);
    await repo.restoreActive(m.owner);
    await assert.rejects(pubs.read(mv.slug));
    await repo.deleteAccountData(m.owner);
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_scenario_publications WHERE user_id=$1',
          [m.owner],
        )
      ).length,
      0,
    );
    return {
      concurrentPrivatePreviewOnce: true,
      concurrentExplicitConfirmationOnce: true,
      competingPermissionSnapshotsOnce: true,
      minimalReviewedScenarioNoLifeAuthority: true,
      withdrawalAndSourceRevocationStopReader: true,
      contendedOwnerLockStopsExpiredConfirmation: true,
      physicalSourceDeletionNoResurrection: true,
      ownerExportCascadeRlsImmutableModeration: true,
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
