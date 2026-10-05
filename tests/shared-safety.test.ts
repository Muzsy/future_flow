import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
} from 'vitest';
import {
  Repository,
  SharedSafetyRepository,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  sharedAdapter,
  testInviteSecret,
  sharedParticipant,
} from './shared-fixtures';
import { sharedAiGroup, candidateFor } from './shared-ai-fixtures';
let engine: PGlite,
  db: Database,
  shared: SharedSafetyRepository,
  g: Awaited<ReturnType<typeof sharedAiGroup>>;
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await applyMigrations(engine);
  db = sharedAdapter(engine);
  shared = new SharedSafetyRepository(db, testInviteSecret);
});
beforeEach(async () => {
  g = await sharedAiGroup(db, shared);
});
afterEach(async () => {
  const [owner] = await db.query(
    "SELECT user_id FROM aw_shared_members WHERE context_id=$1 AND status='active' AND admin_role='owner'",
    [g.contextId],
  );
  if (owner) {
    const d = await shared.detail(String(owner.user_id), g.contextId);
    if (['active', 'inviting', 'paused'].includes(d.status))
      await shared.lifecycle(
        String(owner.user_id),
        g.contextId,
        d.revision,
        'end',
        randomUUID(),
      );
  }
});
afterAll(async () => {
  await engine?.close();
});
const own = () => g.people[0]!,
  other = () => g.people[1]!;
async function blockRequest() {
  const d = await shared.detail(own().id, g.contextId);
  return {
    contextRevision: d.revision,
    memberId: d.members.find((m) => m.id !== d.ownMemberId)!.id,
  };
}
async function event() {
  const d = await shared.detail(own().id, g.contextId);
  await shared.enqueue(own().id, g.contextId, d.revision, randomUUID());
  const j = (await shared.claim())!;
  await shared.complete(j, candidateFor(j.payload));
  return j.payload;
}
const concern = {
  targetType: 'context' as const,
  reason: 'privacy',
  details: 'Synthetic concern for isolated safety testing.',
};
describe('S3 private Shared safety and trusted moderation', () => {
  it('blocks both directions, cancels a waiting decision and retains common history without personal writes', async () => {
    const p = await event(),
      before = await db.query(
        'SELECT id,state,revision,status FROM aw_branches WHERE id=ANY($1::uuid[]) ORDER BY id',
        [g.people.map((p) => p.branchId)],
      );
    await shared.submitIntent(
      other().id,
      g.contextId,
      p.eventId,
      {
        contextRevision: (await shared.detail(other().id, g.contextId))
          .revision,
        optionId: p.decision.participationOptionId,
      },
      randomUUID(),
    );
    const input = await blockRequest(),
      key = randomUUID(),
      result = await shared.setBlock(own().id, g.contextId, input, true, key);
    expect(
      await shared.setBlock(own().id, g.contextId, input, true, key),
    ).toEqual(result);
    const d = await shared.detail(own().id, g.contextId);
    expect(d.status).toBe('active');
    expect(d.pendingEventId).toBeNull();
    expect(
      (await shared.events(other().id, g.contextId))[0]!.resolution?.status,
    ).toBe('cancelled');
    expect(
      await db.query('SELECT id FROM aw_shared_impacts WHERE event_id=$1', [
        p.eventId,
      ]),
    ).toHaveLength(0);
    expect(
      await db.query(
        'SELECT id,state,revision,status FROM aw_branches WHERE id=ANY($1::uuid[]) ORDER BY id',
        [g.people.map((p) => p.branchId)],
      ),
    ).toEqual(before);
    await expect(
      shared.enqueue(other().id, g.contextId, d.revision, randomUUID()),
    ).rejects.toMatchObject({ code: 'SHARED_BLOCKED' });
    await expect(
      shared.createInvite(
        own().id,
        g.contextId,
        { contextRevision: d.revision, targetUserId: other().id },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'SHARED_BLOCKED' });
    const safe = await shared.safety(own().id, g.contextId);
    expect(safe.blockedMemberIds).toEqual([input.memberId]);
    expect(JSON.stringify(safe)).not.toContain(other().id);
    expect(
      (await shared.safety(other().id, g.contextId)).blockedMemberIds,
    ).toEqual([]);
  });
  it('cancels an in-flight lease and invalidates the pair in every shared group; unblocking does not resume jobs or invitations', async () => {
    const second = await shared.create(
      own().id,
      {
        type: 'friend_group',
        title: 'Second synthetic group',
        branchId: own().branchId,
        revision: own().revision,
        sharingAcknowledged: true,
      },
      randomUUID(),
    );
    const invite = await shared.createInvite(
      own().id,
      second.contextId,
      { contextRevision: second.revision, targetUserId: other().id },
      randomUUID(),
    );
    await shared.acceptInvite(
      other().id,
      invite.inviteId,
      {
        token: invite.token,
        branchId: other().branchId,
        revision: other().revision,
        contextRevision: invite.revision,
        sharingAcknowledged: true,
      },
      randomUUID(),
    );
    const d = await shared.detail(own().id, g.contextId);
    const q = await shared.enqueue(
        own().id,
        g.contextId,
        d.revision,
        randomUUID(),
      ),
      j = (await shared.claim())!;
    await shared.setBlock(
      own().id,
      g.contextId,
      await blockRequest(),
      true,
      randomUUID(),
    );
    expect((await shared.job(other().id, q.jobId)).status).toBe('cancelled');
    await expect(shared.complete(j, candidateFor(j.payload))).rejects.toThrow();
    const secondDetail = await shared.detail(other().id, second.contextId);
    expect(secondDetail.revision).toBe(3);
    await expect(
      shared.enqueue(
        other().id,
        second.contextId,
        secondDetail.revision,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'SHARED_BLOCKED' });
    await shared.setBlock(
      own().id,
      g.contextId,
      await blockRequest(),
      false,
      randomUUID(),
    );
    expect((await shared.job(own().id, q.jobId)).status).toBe('cancelled');
    expect(await shared.claim()).toBeNull();
    await shared.lifecycle(
      own().id,
      second.contextId,
      (await shared.detail(own().id, second.contextId)).revision,
      'end',
      randomUUID(),
    );
  });
  it('rejects foreign/self member IDs and stale revisions without storing a block', async () => {
    const outsider = await sharedParticipant(db, 'world', 'Outsider'),
      input = await blockRequest();
    await expect(
      shared.setBlock(outsider.id, g.contextId, input, true, randomUUID()),
    ).rejects.toMatchObject({ code: 'SHARED_CONTEXT_NOT_FOUND' });
    await expect(
      shared.setBlock(
        own().id,
        g.contextId,
        { ...input, memberId: randomUUID() },
        true,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'SHARED_CONTEXT_NOT_FOUND' });
    await expect(
      shared.setBlock(
        own().id,
        g.contextId,
        { ...input, memberId: g.detail.ownMemberId },
        true,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'SHARED_CONTEXT_NOT_FOUND' });
    await expect(
      shared.setBlock(
        own().id,
        g.contextId,
        { ...input, contextRevision: 0 },
        true,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'SHARED_REVISION_CONFLICT' });
    expect(
      await db.query('SELECT user_id FROM aw_user_blocks WHERE user_id=$1', [
        own().id,
      ]),
    ).toHaveLength(0);
  });
  it('keeps own reports private, deduplicates, preserves first details, and rejects cross-context targets and forged reporters', async () => {
    const first = await shared.report(
      own().id,
      g.contextId,
      concern,
      randomUUID(),
    );
    expect(
      await shared.report(
        own().id,
        g.contextId,
        { ...concern, details: 'Different duplicate text' },
        randomUUID(),
      ),
    ).toEqual(first);
    expect((await shared.safety(own().id, g.contextId)).reports).toHaveLength(
      1,
    );
    expect((await shared.safety(other().id, g.contextId)).reports).toHaveLength(
      0,
    );
    await expect(
      shared.report(
        own().id,
        g.contextId,
        { ...concern, targetType: 'event', targetId: randomUUID() },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'SHARED_CONTEXT_NOT_FOUND' });
    await expect(
      shared.report(
        own().id,
        g.contextId,
        { ...concern, reporterUserId: other().id },
        randomUUID(),
      ),
    ).rejects.toThrow();
    const exported = await new Repository(db).exportAccount(own().id);
    expect(JSON.stringify(exported.sharedSafety)).toContain(concern.details);
    expect(JSON.stringify(exported.sharedSafety)).not.toContain(
      'Different duplicate text',
    );
    expect(
      JSON.stringify(
        (await new Repository(db).exportAccount(other().id)).sharedSafety,
      ),
    ).not.toContain(concern.details);
  });
  it('allows a Free member to report and block while rate-limiting new reports to ten per 24 hours', async () => {
    await db.query(
      "UPDATE aw_user_entitlements SET tier='free' WHERE user_id=$1",
      [own().id],
    );
    for (let i = 0; i < 5; i++)
      for (const targetType of ['context', 'member'] as const) {
        await shared.report(
          own().id,
          g.contextId,
          {
            targetType,
            ...(targetType === 'member'
              ? { targetId: g.detail.ownMemberId }
              : {}),
            reason: [
              'harassment',
              'privacy',
              'unsafe_content',
              'spam',
              'other',
            ][i],
            details: concern.details,
          },
          randomUUID(),
        );
      }
    await expect(
      shared.report(
        own().id,
        g.contextId,
        {
          ...concern,
          targetType: 'member',
          targetId: (await blockRequest()).memberId,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'SHARED_REPORT_LIMIT', status: 429 });
    await shared.report(own().id, g.contextId, concern, randomUUID());
    await shared.setBlock(
      own().id,
      g.contextId,
      await blockRequest(),
      true,
      randomUUID(),
    );
  });
  it('permits an invitation report without joining, rejects a wrong targeted recipient, and never journals the bearer token', async () => {
    const reader = await sharedParticipant(db, 'free', 'Link reader'),
      d = await shared.detail(own().id, g.contextId);
    const invite = await shared.createInvite(
      own().id,
      g.contextId,
      { contextRevision: d.revision, targetUserId: reader.id },
      randomUUID(),
    );
    await expect(
      shared.reportInvite(
        other().id,
        { token: invite.token, reason: 'spam', details: concern.details },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'SHARED_INVITE_INVALID' });
    const result = await shared.reportInvite(
      reader.id,
      { token: invite.token, reason: 'spam', details: concern.details },
      randomUUID(),
    );
    expect(result.status).toBe('pending');
    expect(await shared.list(reader.id)).toEqual([]);
    expect(
      JSON.stringify(
        await db.query('SELECT * FROM ff_idempotency WHERE user_id=$1', [
          reader.id,
        ]),
      ),
    ).not.toContain(invite.token);
    expect(
      JSON.stringify(await new Repository(db).exportAccount(reader.id)),
    ).not.toContain(invite.token);
  });
  it('holds safely with immutable evidence, cancels jobs and invitations, survives repository restart and requires explicit release', async () => {
    const report = await shared.report(
      own().id,
      g.contextId,
      concern,
      randomUUID(),
    );
    const input = await event(),
      d = await shared.detail(own().id, g.contextId);
    const request = {
      actionId: randomUUID(),
      contextRevision: d.revision,
      action: 'hold',
      actorLabel: 'isolated-operator',
      reason: 'Synthetic review',
      reportId: report.reportId,
    };
    const held = await shared.moderate(g.contextId, request);
    expect(await shared.moderate(g.contextId, request)).toEqual(held);
    const restarted = new SharedSafetyRepository(db, testInviteSecret);
    expect(
      (await restarted.detail(other().id, g.contextId)).moderationHold,
    ).toBe(true);
    expect(
      (await restarted.events(other().id, g.contextId))[0]!.resolution?.status,
    ).toBe('cancelled');
    await expect(
      restarted.enqueue(own().id, g.contextId, held.revision, randomUUID()),
    ).rejects.toMatchObject({ code: 'SHARED_MODERATION_HOLD' });
    await expect(
      restarted.createInvite(
        own().id,
        g.contextId,
        { contextRevision: held.revision },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'SHARED_MODERATION_HOLD' });
    await expect(
      restarted.submitIntent(
        own().id,
        g.contextId,
        input.eventId,
        {
          contextRevision: held.revision,
          optionId: input.decision.participationOptionId,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'SHARED_MODERATION_HOLD' });
    await expect(
      db.query('UPDATE aw_shared_moderation_audit SET reason=$2 WHERE id=$1', [
        request.actionId,
        'tamper',
      ]),
    ).rejects.toThrow('immutable');
    const released = await restarted.moderate(g.contextId, {
      ...request,
      actionId: randomUUID(),
      contextRevision: held.revision,
      action: 'release',
    });
    expect(released.revision).toBe(held.revision + 1);
    expect(await restarted.claim()).toBeNull();
    expect(
      (await restarted.safety(own().id, g.contextId)).reports[0]!.status,
    ).toBe('reviewed');
  });
  it('cleans deleted reporters and block pairs, detaches audit references and retains other members’ canon', async () => {
    await event();
    const r = await shared.report(own().id, g.contextId, concern, randomUUID()),
      d = await shared.detail(own().id, g.contextId);
    const audit = randomUUID();
    await shared.moderate(g.contextId, {
      actionId: audit,
      contextRevision: d.revision,
      action: 'dismiss',
      actorLabel: 'isolated-operator',
      reason: 'Synthetic dismissal',
      reportId: r.reportId,
    });
    await shared.setBlock(
      own().id,
      g.contextId,
      await blockRequest(),
      true,
      randomUUID(),
    );
    const repo = new Repository(db);
    await repo.markDeleting(own().id);
    await repo.deleteAccountData(own().id);
    expect(
      await db.query(
        'SELECT id FROM aw_shared_reports WHERE reporter_user_id=$1',
        [own().id],
      ),
    ).toEqual([]);
    expect(
      await db.query(
        'SELECT user_id FROM aw_user_blocks WHERE user_id=$1 OR blocked_user_id=$1',
        [own().id],
      ),
    ).toEqual([]);
    expect(
      (
        await db.query(
          'SELECT report_id FROM aw_shared_moderation_audit WHERE id=$1',
          [audit],
        )
      )[0]!.report_id,
    ).toBeNull();
    expect(await shared.events(other().id, g.contextId)).toHaveLength(1);
  });
  it('denies direct authenticated client access to reports and moderation evidence with RLS', async () => {
    expect(
      await db.query(
        "SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename IN ('aw_shared_reports','aw_shared_moderation_audit') ORDER BY tablename",
      ),
    ).toEqual([
      { tablename: 'aw_shared_moderation_audit', rowsecurity: true },
      { tablename: 'aw_shared_reports', rowsecurity: true },
    ]);
    for (const table of ['aw_shared_reports', 'aw_shared_moderation_audit'])
      await expect(
        db.transaction(async (tx) => {
          await tx.query('SET LOCAL ROLE authenticated');
          await tx.query(`SELECT * FROM ${table}`);
        }),
      ).rejects.toThrow('permission denied');
  });
});
