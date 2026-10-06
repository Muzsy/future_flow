import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  connectDatabase,
  Repository,
  LifeRepository,
  OfficialPublicationRepository,
  DiscoveryRepository,
  PublicationRepository,
  SavedLivesRepository,
  PublicSafetyRepository,
  PublicMetricsRepository,
  cleanupExpiredPublicReadings,
  publicMetricsSummary,
  type Database,
} from '@future-flow/database';
import {
  officialLifeFixture,
  processOfficialFixture,
  officialBundleFixture,
  officialGrant,
} from '../tests/official-life-fixtures';
import {
  publicationFixture,
  approvePublicationFixture,
} from '../tests/publication-fixtures';

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
    const metricsConfig = { enabled: true };
    const publications = new OfficialPublicationRepository(
      db,
      {
        enabled: true,
        linkSecret: 'c'.repeat(64),
      },
      metricsConfig,
    );
    const publicationInput = {
      binding: {
        ...inspected.evidence.binding,
        sourceVersion: 'official-life-source-1',
        grantId: grants[0]!.grant!.id,
        evidenceHash: inspected.evidenceHash,
      },
      settings: {
        visibility: 'unlisted',
        authorMode: 'anonymous',
        indexable: false,
      },
    };
    const previews = await Promise.all(
      [1, 2, 3].map(() =>
        publications.prepare(f.owner, publicationInput, randomUUID()),
      ),
    );
    assert.deepEqual(previews[0], previews[1]);
    assert.deepEqual(previews[1], previews[2]);
    const confirm = {
        previewId: previews[0]!.previewId,
        previewHash: previews[0]!.previewHash,
        acknowledged: true,
      },
      confirmKey = randomUUID();
    const released = await Promise.all(
      [1, 2, 3].map(() => publications.confirm(f.owner, confirm, confirmKey)),
    );
    assert.deepEqual(released[0], released[1]);
    assert.deepEqual(released[1], released[2]);
    const published = released[0]!;
    assert.equal(
      (await publications.readUnlisted(published.unlistedToken!)).snapshot
        .classification,
      'official',
    );
    await assert.rejects(publications.readPublic(published.slug));
    const readerConfig = { enabled: true, linkSecret: 'c'.repeat(64) },
      discovery = new DiscoveryRepository(
        db,
        { enabled: true },
        readerConfig,
        readerConfig,
      );
    await assert.rejects(new DiscoveryRepository(db).list());
    assert.deepEqual((await discovery.list()).items, []);
    const rotateInput = {
        revision: published.revision,
        snapshotHash: published.snapshotHash,
        acknowledged: true,
      },
      rotateKey = randomUUID();
    const rotations = await Promise.all(
      [1, 2].map(() =>
        publications.action(
          f.owner,
          published.publicationId,
          'rotate',
          rotateInput,
          rotateKey,
        ),
      ),
    );
    assert.deepEqual(rotations[0], rotations[1]);
    await assert.rejects(publications.readUnlisted(published.unlistedToken!));
    assert.equal(
      (await publications.readUnlisted(rotations[0]!.unlistedToken!)).snapshot
        .story.title,
      published.snapshot.story.title,
    );
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
    await assert.rejects(
      publications.readUnlisted(rotations[0]!.unlistedToken!),
    );
    assert.equal(
      (await publications.confirm(f.owner, confirm, confirmKey)).status,
      'withdrawn',
    );
    assert.equal(
      (
        await db.query(
          'SELECT reason_code FROM aw_official_publication_actions WHERE publication_id=$1 ORDER BY revision DESC LIMIT 1',
          [published.publicationId],
        )
      )[0]!.reason_code,
      'source_revocation',
    );
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
    assert.equal((exported.aw_official_publications as unknown[]).length, 1);
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
    const secondGrant = await other.official.grant(
      other.owner,
      officialGrant(secondInspect),
    );
    const secondPreview = await publications.prepare(
      other.owner,
      {
        binding: {
          ...secondInspect.evidence.binding,
          sourceVersion: 'official-life-source-1',
          grantId: secondGrant.grant!.id,
          evidenceHash: secondInspect.evidenceHash,
        },
        settings: {
          visibility: 'public',
          authorMode: 'anonymous',
          indexable: false,
        },
      },
      randomUUID(),
    );
    const secondConfirm = {
        previewId: secondPreview.previewId,
        previewHash: secondPreview.previewHash,
        acknowledged: true,
      },
      secondKey = randomUUID();
    const secondPublication = await publications.confirm(
      other.owner,
      secondConfirm,
      secondKey,
    );
    const community = await publicationFixture(db);
    owners.push(community.owner);
    const communityInput = await approvePublicationFixture(db, community);
    assert.ok(communityInput);
    communityInput.settings.visibility = 'public';
    const communityPublications = new PublicationRepository(
        db,
        readerConfig,
        metricsConfig,
      ),
      communityPreview = await communityPublications.prepare(
        community.owner,
        communityInput,
        randomUUID(),
      ),
      communityPublication = await communityPublications.confirm(
        community.owner,
        {
          previewId: communityPreview.previewId,
          previewHash: communityPreview.previewHash,
          acknowledged: true,
        },
        randomUUID(),
      );
    const cards = await discovery.list();
    assert.equal(cards.items.length, 2);
    assert.deepEqual(cards.items.map((c) => c.classification).sort(), [
      'community',
      'official',
    ]);
    for (const q of ['%', '_', '\\', "'; DROP TABLE ff_users; --"])
      assert.deepEqual((await discovery.list({ q })).items, []);
    assert.equal(
      (
        await discovery.list({
          q: secondPublication.snapshot.story.title.toUpperCase(),
          category: secondPublication.snapshot.story.category,
          classification: 'official',
        })
      ).items[0]!.slug,
      secondPublication.slug,
    );
    const firstPage = await discovery.list({ pageSize: 1 }),
      secondPage = await discovery.list({ pageSize: 1, page: 2 });
    assert.equal(firstPage.hasMore, true);
    assert.equal(secondPage.hasMore, false);
    assert.notEqual(firstPage.items[0]!.slug, secondPage.items[0]!.slug);
    for (const secret of [
      other.owner,
      second.lifeId,
      second.branchId,
      secondGrant.grant!.id,
      secondInspect.evidenceHash,
      community.owner,
    ])
      assert(!JSON.stringify(cards).includes(secret));
    const safety = new PublicSafetyRepository(
      db,
      { enabled: true },
      readerConfig,
      readerConfig,
      metricsConfig,
    );
    const reportReplies = await Promise.all(
      [1, 2, 3].map(() =>
        safety.report(f.owner, secondPublication.slug, {
          reason: 'personal_data',
          details: 'Isolated CI technical concern',
        }),
      ),
    );
    assert.equal(new Set(reportReplies.map((r) => r.reportId)).size, 1);
    assert.equal(
      (await safety.queue()).filter(
        (r) => r.reportId === reportReplies[0]!.reportId,
      ).length,
      1,
    );
    const reportDecision = {
      reportId: reportReplies[0]!.reportId,
      reportRevision: 1,
      publicationRevision: secondPublication.revision,
      snapshotHash: secondPublication.snapshotHash,
      action: 'warn',
      reasonCode: 'personal_data',
      actorLabel: 'Isolated CI safety moderator',
      restrictPublishing: false,
      acknowledged: true,
    };
    const warns = await Promise.all([
      safety.resolve(reportDecision),
      safety.resolve(reportDecision),
    ]);
    assert.deepEqual(warns[0], warns[1]);
    assert.equal((await safety.ownSafety(other.owner)).warnings.length, 1);
    assert.equal((await safety.ownSafety(f.owner)).warnings.length, 0);
    const competingReport = await safety.report(
      f.owner,
      secondPublication.slug,
      { reason: 'spam' },
    );
    const moderationRace = await Promise.allSettled([
      safety.resolve({
        ...reportDecision,
        reportId: competingReport.reportId,
        action: 'dismiss',
      }),
      safety.resolve({
        ...reportDecision,
        reportId: competingReport.reportId,
        action: 'warn',
      }),
    ]);
    assert.equal(
      moderationRace.filter((r) => r.status === 'fulfilled').length,
      1,
    );
    const restrictInput = {
      userId: f.owner,
      revision: 0,
      active: true,
      reasonCode: 'spam',
      actorLabel: 'Isolated CI repeat-offender check',
      acknowledged: true,
    };
    const restrictions = await Promise.all([
      safety.setRestriction(restrictInput),
      safety.setRestriction(restrictInput),
    ]);
    assert.deepEqual(restrictions[0], restrictions[1]);
    await assert.rejects(
      publications.prepare(f.owner, publicationInput, randomUUID()),
      (e: unknown) => (e as { code: string }).code === 'PUBLICATION_RESTRICTED',
    );
    const restorations = await Promise.all([
      safety.setRestriction({ ...restrictInput, revision: 1, active: false }),
      safety.setRestriction({ ...restrictInput, revision: 1, active: false }),
    ]);
    assert.deepEqual(restorations[0], restorations[1]);
    const [restrictionCount] = await db.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM aw_publication_restriction_actions WHERE user_id=$1',
      [f.owner],
    );
    assert.equal(restrictionCount!.count, '2');
    assert.equal((await safety.ownSafety(f.owner)).publishingRestricted, false);
    const reporterExport = await f.repo.exportAccount(f.owner);
    assert.equal((reporterExport.aw_public_reports as unknown[]).length, 2);
    assert.equal((reporterExport.aw_public_warnings as unknown[]).length, 0);
    const saved = new SavedLivesRepository(
      db,
      { enabled: true },
      readerConfig,
      readerConfig,
      metricsConfig,
    );
    const parallelSaves = await Promise.all(
      [1, 2, 3].map(() => saved.save(f.owner, secondPublication.slug)),
    );
    assert.deepEqual(parallelSaves[0], parallelSaves[1]);
    assert.deepEqual(parallelSaves[1], parallelSaves[2]);
    await saved.save(f.owner, communityPublication.slug);
    // Opposite-direction saves exercise the global user lock order on real PG.
    await Promise.all([
      saved.save(other.owner, communityPublication.slug),
      saved.save(community.owner, secondPublication.slug),
    ]);
    assert.equal((await saved.list(f.owner)).items.length, 2);
    assert.equal((await saved.list(other.owner)).items.length, 1);
    assert.equal(
      (await saved.getStatus(other.owner, secondPublication.slug)).saved,
      false,
    );
    const saveExport = (await f.repo.exportAccount(f.owner))
      .aw_saved_lives as Record<string, unknown>[];
    assert.equal(saveExport.length, 2);
    for (const item of saveExport)
      assert.deepEqual(Object.keys(item).sort(), ['saved_at', 'slug']);
    const [saveCount] = await db.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM aw_saved_lives WHERE user_id=$1',
      [f.owner],
    );
    assert.equal(saveCount!.count, '2');
    const metrics = new PublicMetricsRepository(
        db,
        metricsConfig,
        readerConfig,
        readerConfig,
      ),
      readingId = randomUUID();
    const readings = await Promise.all(
      [1, 2, 3].map(() => metrics.start(secondPublication.slug, { readingId })),
    );
    assert.deepEqual(readings[0], readings[1]);
    assert.deepEqual(readings[1], readings[2]);
    const signals = await Promise.all(
      [1, 2, 3].map(() =>
        metrics.signal(secondPublication.slug, {
          readingId,
          signal: 'depth_25',
        }),
      ),
    );
    assert.equal(signals.filter((r) => !r.duplicate).length, 1);
    await assert.rejects(
      metrics.signal(secondPublication.slug, {
        readingId,
        signal: 'end_reached',
      }),
      (e: unknown) =>
        (e as { code: string }).code === 'PUBLIC_READING_TOO_EARLY',
    );
    const [officialMetrics] = await db.query<{
      published: number;
      saved: number;
      reported: number;
      readings: number;
      depth: number;
    }>(
      `SELECT max(total) FILTER(WHERE kind='published') AS published,max(total) FILTER(WHERE kind='saved') AS saved,
       max(total) FILTER(WHERE kind='reported') AS reported,max(total) FILTER(WHERE kind='reading_started') AS readings,
       max(total) FILTER(WHERE kind='depth_25') AS depth FROM aw_public_metrics_daily WHERE official_publication_id=$1`,
      [secondPublication.publicationId],
    );
    assert.deepEqual(officialMetrics, {
      published: 1,
      saved: 2,
      reported: 2,
      readings: 1,
      depth: 1,
    });
    const ownerMetrics = (await other.repo.exportAccount(other.owner))
      .aw_public_metrics_daily as Record<string, unknown>[];
    assert.equal(ownerMetrics.length, 5);
    assert(!JSON.stringify(ownerMetrics).includes(readingId));
    await db.query(
      "INSERT INTO aw_public_metrics_daily(community_publication_id,kind,total) VALUES($1,'reading_started',9999)",
      [communityPublication.publicationId],
    );
    const quota = await Promise.allSettled(
      [1, 2, 3].map(() =>
        metrics.start(communityPublication.slug, { readingId: randomUUID() }),
      ),
    );
    assert.equal(quota.filter((r) => r.status === 'fulfilled').length, 1);
    assert(
      quota
        .filter((r) => r.status === 'rejected')
        .every(
          (r) =>
            (r as PromiseRejectedResult).reason.code === 'PUBLIC_METRICS_LIMIT',
        ),
    );
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_public_reading_sessions WHERE community_publication_id=$1',
          [communityPublication.publicationId],
        )
      ).length,
      1,
    );
    const expiredId = randomUUID();
    await db.query(
      "INSERT INTO aw_public_reading_sessions(id,community_publication_id,created_at,expires_at) VALUES($1,$2,now()-interval '26 hours',now()-interval '25 hours 40 minutes')",
      [expiredId, communityPublication.publicationId],
    );
    assert.deepEqual(await cleanupExpiredPublicReadings(db), {
      deleted: 1,
      batchFull: false,
    });
    assert((await publicMetricsSummary(db)).daily.length > 0);
    let race = true;
    const raced: Database = {
      ...db,
      query: async <T extends Record<string, unknown>>(
        sql: string,
        values: unknown[] = [],
      ) => {
        const rows = await db.query<T>(sql, values);
        if (race && sql.includes('ORDER BY published_at DESC')) {
          race = false;
          await communityPublications.action(
            community.owner,
            communityPublication.publicationId,
            'withdraw',
            {
              revision: communityPublication.revision,
              snapshotHash: communityPublication.snapshotHash,
              acknowledged: true,
            },
            randomUUID(),
          );
        }
        return rows;
      },
    };
    assert.deepEqual(
      (
        await new DiscoveryRepository(
          raced,
          { enabled: true },
          readerConfig,
          readerConfig,
        ).list()
      ).items.map((c) => c.slug),
      [secondPublication.slug],
    );
    assert.equal(
      (await saved.list(f.owner)).items.find(
        (i) => i.slug === communityPublication.slug,
      )!.card,
      null,
    );
    await saved.remove(f.owner, communityPublication.slug);
    await saved.remove(f.owner, communityPublication.slug);
    const unsaveDeletion = await Promise.allSettled([
      saved.remove(other.owner, communityPublication.slug),
      new Repository(db).deleteAccountData(community.owner),
    ]);
    assert(unsaveDeletion.every((r) => r.status === 'fulfilled'));
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_public_metrics_daily WHERE community_publication_id=$1',
          [communityPublication.publicationId],
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await db.query(
          'SELECT id FROM aw_public_reading_sessions WHERE community_publication_id=$1',
          [communityPublication.publicationId],
        )
      ).length,
      0,
    );
    const deletionRace = await Promise.allSettled([
      publications.readPublic(secondPublication.slug),
      other.repo.markDeleting(other.owner),
      saved.save(f.owner, secondPublication.slug),
    ]);
    assert.equal(deletionRace[1]!.status, 'fulfilled');
    await assert.rejects(publications.readPublic(secondPublication.slug));
    await assert.rejects(
      metrics.signal(secondPublication.slug, {
        readingId,
        signal: 'share_clicked',
      }),
    );
    assert.deepEqual((await discovery.list()).items, []);
    assert.equal((await saved.list(f.owner)).items[0]!.card, null);
    await assert.rejects(
      safety.report(f.owner, secondPublication.slug, { reason: 'harassment' }),
    );
    await other.repo.restoreActive(other.owner);
    assert.equal(
      (await publications.confirm(other.owner, secondConfirm, secondKey))
        .status,
      'withdrawn',
    );
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
    assert.equal((await saved.list(f.owner)).items[0]!.card, null);
    await other.repo.deleteAccountData(other.owner);
    assert.deepEqual((await saved.list(f.owner)).items, []);
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
      'aw_public_metrics_daily',
      'aw_public_reading_sessions',
      'aw_public_reports',
      'aw_public_warnings',
      'aw_publication_restrictions',
      'aw_publication_restriction_actions',
      'aw_saved_lives',
      'aw_official_life_starts',
      'aw_official_life_sources',
      'aw_official_publication_previews',
      'aw_official_publications',
      'aw_official_publication_actions',
    ]) {
      const [guard] = await db.query(
        "SELECT c.relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'INSERT') AS client FROM pg_class c WHERE c.oid=$1::regclass",
        [table],
      );
      assert.deepEqual(guard, { rls: true, anon: false, client: false });
    }
    for (const owner of owners)
      await new Repository(db).deleteAccountData(owner);
    assert.equal(
      (await db.query('SELECT id FROM aw_public_metrics_daily')).length,
      0,
    );
    assert.equal(
      (await db.query('SELECT id FROM aw_public_reading_sessions')).length,
      0,
    );
    for (const table of [
      'aw_public_reports',
      'aw_public_warnings',
      'aw_publication_restrictions',
      'aw_publication_restriction_actions',
      'aw_saved_lives',
      'aw_official_life_starts',
      'aw_official_life_sources',
      'aw_official_publication_previews',
      'aw_official_publications',
      'aw_official_publication_actions',
    ])
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
        officialPublication: {
          concurrentExactPreviewConfirmOnce: true,
          distinctOfficialProjection: true,
          concurrentSecretRotation: true,
          sourceRevocationWithdrawsCopy: true,
          deletionReaderRaceRecoveryCascadeRls: true,
          actualProviderCalls: 0,
          actualOfficialSeed: false,
        },
        discovery: {
          activePublicReaderCardsOnly: true,
          boundedLiteralEnglishSearch: true,
          stableNewestPages: true,
          withdrawalBetweenLookupAndRead: true,
          sourceRevocationAndDeletionExcluded: true,
          noPrivateProvenanceInCards: true,
          actualProviderCalls: 0,
        },
        publicSafety: {
          concurrentReportDedupOnce: true,
          moderationDecisionRaceOnce: true,
          warningPrivateToPublisher: true,
          explicitRestrictionRestoreOnce: true,
          liveOfficialPermissionAndExport: true,
          deletionCascadeRls: true,
          actualProviderCalls: 0,
        },
        publicMetrics: {
          concurrentReadingAndSignalOnce: true,
          dailyAdmissionRollbackRace: true,
          serverElapsedTimeRequired: true,
          serverActionsCountOnce: true,
          unsavePublisherDeletionRace: true,
          expiredCleanupAndPrivateExport: true,
          livePermissionCascadeRls: true,
          actualProviderCalls: 0,
        },
        savedLives: {
          concurrentIdempotentSaveOnce: true,
          oppositeDirectionLockOrder: true,
          privateAccountIsolationAndMinimalExport: true,
          withdrawAndUnsaveIdempotency: true,
          deletionRaceRecoveryCascadeRls: true,
          actualProviderCalls: 0,
        },
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
