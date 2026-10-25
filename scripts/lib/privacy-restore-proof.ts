import { prepareFictionJobFixture } from '../../tests/fiction-storage-fixtures';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  LifeDeletionRepository,
  LifeRepository,
  LifeJobRepository,
  PublicationRepository,
  Repository,
  SharedJobRepository,
  type Database,
} from '@future-flow/database';
import { hash } from '@future-flow/core';
import { verifyPrivacyRestore } from './privacy-restore-verifier';
import {
  capturePrivacyRestoreAuthority,
  replayPrivacyRestore,
} from './privacy-restore';
import { sharedAiGroup } from '../../tests/shared-ai-fixtures';
import {
  sharedParticipant,
  testInviteSecret,
} from '../../tests/shared-fixtures';
import { sharedEventFixture } from '../../tests/shared-engine-fixtures';
import {
  approvePublicationFixture,
  publicationFixture,
} from '../../tests/publication-fixtures';
import { setupFixture } from '../../tests/life-fixtures';
import { prepareNarrativeJobFixture } from '../../tests/narrative-storage-fixtures';
export const privacyFixtureConfig = {
  enabled: true,
  linkSecret: 'd'.repeat(64),
};
export async function preparePrivacyRestoreFixture(
  db: Database,
  snapshot: () => Promise<void>,
) {
  const [source] = await db.query<{ name: string }>(
    'SELECT current_database() AS name',
  );
  assert(
    source &&
      (/^(aw_fixture_|aw_restore_)[a-f0-9]{24}$/.test(source.name) ||
        source.name === 'template1'),
  );
  const shared = new SharedJobRepository(db, testInviteSecret),
    g = await sharedAiGroup(db, shared);
  const a = g.people[0]!.id,
    b = g.people[1]!.id,
    contextId = g.contextId;
  const third = await sharedParticipant(db, 'world', 'Synthetic Morgan'),
    c = third.id;
  const invite = await shared.createInvite(
    a,
    contextId,
    { contextRevision: g.detail.revision, targetUserId: c },
    randomUUID(),
  );
  await shared.acceptInvite(
    c,
    invite.inviteId,
    {
      token: invite.token,
      branchId: third.branchId,
      revision: third.revision,
      contextRevision: invite.revision,
      sharingAcknowledged: true,
    },
    randomUUID(),
  );
  const detail = await shared.detail(a, contextId),
    f = sharedEventFixture(
      contextId,
      detail.revision,
      g.people[0]!.date,
      detail.members.map((m) => m.id),
      null,
    );
  f.candidate.title = 'PRIVATE_RESTORE_ALIAS';
  f.candidate.summary = 'PRIVATE_RESTORE_ALIAS';
  const eventId = f.candidate.eventId;
  await shared.commitCandidate(
    a,
    contextId,
    f.candidate,
    randomUUID(),
    f.rules,
  );
  for (const id of [a, b, c]) {
    const current = await shared.detail(id, contextId);
    await shared.submitIntent(
      id,
      contextId,
      eventId,
      { contextRevision: current.revision, optionId: f.yes },
      randomUUID(),
    );
  }
  const p = await publicationFixture(db, a),
    approved = await approvePublicationFixture(db, p);
  assert(approved);
  approved.settings.visibility = 'unlisted';
  const pubs = new PublicationRepository(db, privacyFixtureConfig),
    preview = await pubs.prepare(a, approved, randomUUID());
  const published = await pubs.confirm(
    a,
    {
      previewId: preview.previewId,
      previewHash: preview.previewHash,
      acknowledged: true,
    },
    randomUUID(),
  );
  assert(published.unlistedToken);
  const kept = await publicationFixture(db, c),
    approvedKept = await approvePublicationFixture(db, kept);
  assert(approvedKept);
  approvedKept.settings.visibility = 'public';
  const keptPreview = await pubs.prepare(c, approvedKept, randomUUID()),
    keptSlug = (
      await pubs.confirm(
        c,
        {
          previewId: keptPreview.previewId,
          previewHash: keptPreview.previewHash,
          acknowledged: true,
        },
        randomUUID(),
      )
    ).slug;
  const lives = new LifeRepository(db),
    narrativeAccountLife = await lives.create(b, setupFixture(), randomUUID());
  const jobs = new LifeJobRepository(db);
  async function narrativePeriod(jobId: string, creative = false) {
    const job = await jobs.claim();
    assert(job && job.id === jobId);
    if (creative) {
      const prepared = await prepareFictionJobFixture(db, job, 'v9');
      await jobs.complete(
        job,
        prepared.candidate,
        prepared.chapter,
        prepared.receipts,
        prepared.commit,
      );
      return prepared.candidate.periodId;
    }
    const prepared = await prepareNarrativeJobFixture(db, job);
    await jobs.complete(
      job,
      prepared.plan.candidate,
      prepared.chapter,
      prepared.receipts,
      prepared.commit,
    );
    return prepared.plan.candidate.periodId;
  }
  const deletedAccountNarrativePeriod = await narrativePeriod(
    narrativeAccountLife.jobId,
  );
  const removed = await lives.create(a, setupFixture(), randomUUID()),
    deletedLife = removed.lifeId,
    unchangedLife = g.people[0]!.lifeId;
  const deletedLifeNarrativePeriod = await narrativePeriod(removed.jobId, true);
  const retainedV9Life = await lives.create(a, setupFixture(), randomUUID());
  const retainedV9NarrativePeriod = await narrativePeriod(
    retainedV9Life.jobId,
    true,
  );
  await db.query(
    "INSERT INTO aw_budget_accounts(id,limit_micro,accounted_micro) VALUES('privacy-project',1000000,100)",
  );
  const backupCapturedAt = new Date().toISOString();
  await snapshot();
  await new Repository(db).markDeleting(b);
  await new Repository(db).deleteAccountData(b);
  const branch = await lives.branch(a, removed.branchId);
  await new LifeDeletionRepository(db).remove(
    a,
    deletedLife,
    {
      branchId: branch.id,
      revision: branch.revision,
      confirmation: 'DELETE LIFE',
    },
    randomUUID(),
  );
  await pubs.action(
    a,
    published.publicationId,
    'withdraw',
    {
      revision: published.revision,
      snapshotHash: published.snapshotHash,
      acknowledged: true,
    },
    randomUUID(),
  );
  await db.query(
    'INSERT INTO aw_user_blocks(user_id,blocked_user_id) VALUES($1,$2)',
    [a, c],
  );
  await db.query(
    "UPDATE aw_budget_accounts SET accounted_micro=700 WHERE id='privacy-project'",
  );
  const projectBinding = hash('isolated-privacy-project'),
    writerFenceDigest = hash('stopped-synthetic-writers');
  const authority = await capturePrivacyRestoreAuthority(db, {
    projectBinding,
    writerFenceDigest,
    authVerifiedAt: new Date().toISOString(),
    authUserIds: [a, c],
  });
  return {
    a,
    b,
    c,
    deletedLife,
    deletedAccountNarrativePeriod,
    deletedLifeNarrativePeriod,
    retainedV9NarrativePeriod,
    unchangedLife,
    withdrawnToken: published.unlistedToken,
    keptSlug,
    contextId,
    eventId,
    backupCapturedAt,
    projectBinding,
    writerFenceDigest,
    authority,
  };
}
export type PrivacyRestoreFixture = Awaited<
  ReturnType<typeof preparePrivacyRestoreFixture>
>;
export function privacyFixtureBinding(
  f: PrivacyRestoreFixture,
  quarantineDatabase: string,
) {
  return {
    projectBinding: f.projectBinding,
    writerFenceDigest: f.writerFenceDigest,
    expectedAuthorityHash: hash(f.authority),
    backupCapturedAt: f.backupCapturedAt,
    quarantineDatabase,
  };
}
export async function verifyPrivacyRestoreFixture(
  db: Database,
  f: PrivacyRestoreFixture,
  targetName: string,
) {
  const pubs = new PublicationRepository(db, privacyFixtureConfig),
    shared = new SharedJobRepository(db, testInviteSecret);
  assert.equal(
    (await db.query('SELECT id FROM ff_users WHERE id=$1', [f.b])).length,
    1,
  );
  assert(await pubs.readUnlisted(f.withdrawnToken));
  const canon = await db.query(
    'SELECT canon_hash,effective_at FROM aw_shared_events WHERE id=$1',
    [f.eventId],
  );
  const proof = await replayPrivacyRestore(
    db,
    f.authority,
    privacyFixtureBinding(f, targetName),
  );
  assert.equal(proof.deletedAccounts, 1);
  assert.equal(proof.deletedLives, 1);
  assert.equal(
    (
      await db.query('SELECT id FROM aw_periods WHERE id=ANY($1::uuid[])', [
        [f.deletedAccountNarrativePeriod, f.deletedLifeNarrativePeriod],
      ])
    ).length,
    0,
  );
  assert.equal(
    (await db.query('SELECT id FROM ff_users WHERE id=$1', [f.b])).length,
    0,
  );
  assert.equal(
    (await db.query('SELECT id FROM aw_lives WHERE id=$1', [f.deletedLife]))
      .length,
    0,
  );
  assert.equal(
    (await db.query('SELECT id FROM aw_lives WHERE id=$1', [f.unchangedLife]))
      .length,
    1,
  );
  await assert.rejects(pubs.readUnlisted(f.withdrawnToken));
  assert(await pubs.readPublic(f.keptSlug));
  const common = await shared.events(f.a, f.contextId),
    event = common.find((e) => e.id === f.eventId);
  assert(event?.privacyRedacted);
  assert(event.resolution?.status === 'resolved');
  assert.equal(event.resolution.participatingCount, 3);
  assert(!JSON.stringify(common).includes('PRIVATE_RESTORE_ALIAS'));
  assert.deepEqual(
    await db.query(
      'SELECT canon_hash,effective_at FROM aw_shared_events WHERE id=$1',
      [f.eventId],
    ),
    canon,
  );
  assert.equal(
    (
      await db.query(
        'SELECT user_id FROM aw_user_blocks WHERE user_id=$1 AND blocked_user_id=$2',
        [f.a, f.c],
      )
    ).length,
    1,
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT limit_micro::text,accounted_micro::text FROM aw_budget_accounts WHERE id='privacy-project'",
      )
    )[0],
    { limit_micro: '0', accounted_micro: '700' },
  );
  assert.equal(
    (
      await db.query(
        "SELECT id FROM aw_jobs WHERE status IN('queued','running') OR lease_token IS NOT NULL OR payload<>'{}'::jsonb OR checkpoints<>'{}'::jsonb",
      )
    ).length,
    0,
  );
  const again = await replayPrivacyRestore(
    db,
    f.authority,
    privacyFixtureBinding(f, targetName),
  );
  assert.equal(again.deletedAccounts, 0);
  assert.equal(again.deletedLives, 0);
  const verified = await verifyPrivacyRestore(
    db,
    f.authority,
    privacyFixtureBinding(f, targetName),
  );
  assert.equal(verified.reviewedTables, 96);
  assert.equal(verified.reviewedForeignKeys, 219);
  assert.equal(verified.accountCascadeTables, 81);
  assert.equal(verified.heldSharedTables, 11);
  assert.equal(verified.operatorMetadataTables, 3);
  assert.equal(verified.serviceActivationAllowed, false);
  return {
    deletedAccountNotRestored: true,
    deletedLifeNotRestored: true,
    oldBearerLinkRejected: true,
    unchangedCopyRetained: true,
    sharedTextHiddenDateOutcomePreserved: true,
    newerBlockRetained: true,
    budgetNotReducedAndPaidDisabled: true,
    oldJobsCancelledAndScrubbed: true,
    idempotentReplay: true,
    independentReadOnlyPostReplayVerified: true,
    schemaWideRelationshipChecks: verified.reviewedForeignKeys,
    serviceActivationAllowed: false,
    paidAiCalls: 0,
    authProviderWrites: false,
  };
}
