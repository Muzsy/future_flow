import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import {
  LifeRepository,
  LifeJobRepository,
  SharedJobRepository,
  PublicDraftRepository,
  PublicReviewRepository,
  Repository,
  type Database,
} from '@future-flow/database';
import { hash } from '@future-flow/core';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  sharedAdapter,
  testInviteSecret,
  sharedParticipant,
} from './shared-fixtures';
import { sharedAiGroup, candidateFor } from './shared-ai-fixtures';
import { sharedEventFixture } from './shared-engine-fixtures';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { lifeTestAi } from './life-fixtures';

const secretText = 'PRIVATE_OLD_ALIAS_qa@example.invalid';
let engine: PGlite,
  db: Database,
  lives: LifeRepository,
  jobs: LifeJobRepository,
  shared: SharedJobRepository;
beforeAll(async () => {
  engine = new PGlite();
  await applyMigrations(engine);
  db = sharedAdapter(engine);
  lives = new LifeRepository(db, { daily: 100, concurrent: 10 });
  jobs = new LifeJobRepository(db);
  shared = new SharedJobRepository(db, testInviteSecret);
});
afterAll(async () => {
  await engine?.close();
});
async function group() {
  const g = await sharedAiGroup(db, shared),
    a = g.people[0]!,
    b = g.people[1]!,
    c = await sharedParticipant(db, 'world', 'Synthetic Morgan');
  const invite = await shared.createInvite(
    a.id,
    g.contextId,
    { contextRevision: g.detail.revision, targetUserId: c.id },
    randomUUID(),
  );
  await shared.acceptInvite(
    c.id,
    invite.inviteId,
    {
      token: invite.token,
      branchId: c.branchId,
      revision: c.revision,
      contextRevision: invite.revision,
      sharingAcknowledged: true,
    },
    randomUUID(),
  );
  const detail = await shared.detail(a.id, g.contextId);
  const f = sharedEventFixture(
    g.contextId,
    detail.revision,
    a.date,
    detail.members.map((m) => m.id),
    null,
  );
  f.candidate.title = secretText;
  f.candidate.summary = secretText;
  f.candidate.decision!.prompt = secretText;
  f.candidate.sharedChanges = [
    { type: 'summary_set', value: secretText },
    { type: 'friend_group_focus_set', value: secretText },
  ];
  for (const o of f.candidate.decision!.options) {
    o.label = secretText;
    o.description = secretText;
    for (const p of o.impactProposals)
      if (p.type === 'memory_only') p.summary = secretText;
  }
  await shared.commitCandidate(
    a.id,
    g.contextId,
    f.candidate,
    randomUUID(),
    f.rules,
  );
  for (const [person, option] of [
    [a, f.yes],
    [b, f.yes],
    [c, f.no],
  ] as const) {
    const d = await shared.detail(person.id, g.contextId);
    await shared.submitIntent(
      person.id,
      g.contextId,
      f.candidate.eventId,
      { contextRevision: d.revision, optionId: option },
      randomUUID(),
    );
  }
  return { ...g, a, b, c, f };
}
type Group = Awaited<ReturnType<typeof group>>;
async function ready(g: Group) {
  const b = await lives.branch(g.a.id, g.a.branchId);
  await lives.choose(
    g.a.id,
    b.id,
    b.revision,
    b.pending_decision!.id,
    b.pending_decision!.options[0]!.id,
    randomUUID(),
  );
  return lives.branch(g.a.id, b.id);
}
async function queue(g: Group) {
  const b = await ready(g);
  return lives.continue(g.a.id, b.id, b.revision, randomUUID());
}
async function claimed(jobId: string) {
  const row = await jobs.claim();
  expect(row?.id).toBe(jobId);
  return row!;
}

describe('Shared retained text projections and stale input invalidation', () => {
  it('requires a separate public review for learned Shared history and prevents reuse of an earlier owner preview', async () => {
    const g = await group(),
      drafts = new PublicDraftRepository(db),
      detail = await lives.detail(g.a.id, g.a.branchId);
    const periods = detail.periods as unknown as {
      chapter: { title: string; body: string };
      candidate: import('@future-flow/contracts').PeriodCandidateV2;
    }[];
    const copy = {
      title: 'A different life',
      summary: 'A fictional adult considers a different path.',
      category: 'personal_growth',
      goalDescription: 'Build a new habit',
      periods: periods.map((p) => ({
        chapter: { title: p.chapter.title, body: p.chapter.body },
        events: p.candidate.events.map((e) => ({
          title: e.title,
          summary: e.summary,
        })),
        decision: {
          prompt: p.candidate.events.at(-1)!.decision!.prompt,
          options: p.candidate.events.at(-1)!.decision!.options.map((o) => ({
            label: o.label,
            description: o.description,
          })),
        },
      })),
    };
    const preview = await drafts.prepare(
      g.a.id,
      g.a.branchId,
      detail.branch.revision,
      copy,
    );
    await expect(drafts.get(g.b.id, preview.draftId)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
    await ready(g);
    const branch = await lives.branch(g.a.id, g.a.branchId);
    await expect(
      drafts.prepare(g.a.id, branch.id, branch.revision, copy),
    ).rejects.toMatchObject({ code: 'PUBLIC_SHARED_REVIEW_REQUIRED' });
    await expect(drafts.get(g.a.id, preview.draftId)).rejects.toMatchObject({
      code: 'PUBLIC_SHARED_REVIEW_REQUIRED',
    });
    const reviews = new PublicReviewRepository(db);
    await expect(reviews.start(g.a.id, preview.draftId)).rejects.toMatchObject({
      code: 'PUBLIC_SHARED_REVIEW_REQUIRED',
    });
    await expect(reviews.get(g.a.id, preview.draftId)).rejects.toMatchObject({
      code: 'PUBLIC_SHARED_REVIEW_REQUIRED',
    });
    await new Repository(db).deleteAccountData(g.b.id);
    await expect(
      drafts.prepare(g.a.id, branch.id, branch.revision, copy),
    ).rejects.toMatchObject({ code: 'PUBLIC_SHARED_REVIEW_REQUIRED' });
    expect(
      (
        await db.query(
          'SELECT snapshot_hash FROM aw_publication_drafts WHERE id=$1',
          [preview.draftId],
        )
      )[0]!.snapshot_hash,
    ).toBe(preview.snapshotHash);
  });
  it('hides all common prose at the deleting marker, preserves verified dates/counts and keeps immutable canon', async () => {
    const g = await group();
    await ready(g);
    const before = await db.query(
      'SELECT candidate,decision,canon_hash FROM aw_shared_events WHERE id=$1',
      [g.f.candidate.eventId],
    );
    expect(JSON.stringify(await shared.events(g.a.id, g.contextId))).toContain(
      secretText,
    );
    await new Repository(db).markDeleting(g.b.id);
    expect(
      (await shared.detail(g.a.id, g.contextId)).members.find(
        (m) => m.interactionProfile.displayName === 'Former member',
      ),
    ).toMatchObject({ status: 'deleted', worldRole: null });
    const [event] = await shared.events(g.a.id, g.contextId);
    expect(event).toMatchObject({
      privacyRedacted: true,
      effectiveAt: g.a.date,
      resolution: { status: 'resolved', participatingCount: 2 },
    });
    expect(event!.resolution!.participatingMemberIds).not.toContain(
      g.detail.members.find(
        (m) => m.interactionProfile.displayName === 'Test Casey',
      )!.id,
    );
    for (const projection of [
      event,
      await shared.detail(g.a.id, g.contextId),
      await shared.list(g.a.id),
      (await new Repository(db).exportAccount(g.a.id)).shared,
    ])
      expect(JSON.stringify(projection)).not.toContain(secretText);
    expect(
      await db.query(
        'SELECT candidate,decision,canon_hash FROM aw_shared_events WHERE id=$1',
        [g.f.candidate.eventId],
      ),
    ).toEqual(before);
    await new Repository(db).deleteAccountData(g.b.id);
  });
  it('projects pending and already learned memories without modifying source hashes or dates', async () => {
    const g = await group();
    const raw = await db.query(
      'SELECT payload,payload_hash FROM aw_shared_impacts WHERE target_branch_id=$1',
      [g.a.branchId],
    );
    await new Repository(db).deleteAccountData(g.b.id);
    expect(
      JSON.stringify(await shared.pendingImpacts(g.a.id, g.a.branchId)),
    ).not.toContain(secretText);
    const q = await queue(g),
      job = await claimed(q.jobId);
    expect(job.payload.memory.sharedEvents![0]).toMatchObject({
      effectiveAt: g.a.date,
      knownAt: g.a.date,
      title: 'Shared opportunity (details hidden)',
      ownOptionId: g.f.yes,
    });
    expect(JSON.stringify(job.payload)).not.toContain(secretText);
    expect(
      await db.query(
        'SELECT payload,payload_hash FROM aw_shared_impacts WHERE target_branch_id=$1',
        [g.a.branchId],
      ),
    ).toEqual(raw);
    await processLifeJob(job, jobs, lifeTestAi);
  });
  it.each(['queued', 'running'])(
    'cancels an unsafe %s personal snapshot, rejects old lease and rebuilds a fresh explicit retry',
    async (status) => {
      const g = await group(),
        q = await queue(g);
      const old = status === 'running' ? await claimed(q.jobId) : null;
      await new Repository(db).markDeleting(g.b.id);
      const [cancelled] = await db.query(
        'SELECT status,payload,checkpoints,error_code FROM aw_jobs WHERE id=$1',
        [q.jobId],
      );
      expect(cancelled).toEqual({
        status: 'cancelled',
        payload: {},
        checkpoints: {},
        error_code: 'SHARED_PRIVACY_CHANGED',
      });
      if (old) {
        const ai = {
          period: vi.fn(),
          periodChapter: vi.fn(),
          checkPeriodChapter: vi.fn(),
        };
        await expect(processLifeJob(old, jobs, ai)).rejects.toMatchObject({
          code: 'JOB_LEASE_LOST',
        });
        expect(ai.period).not.toHaveBeenCalled();
      }
      const branch = await lives.branch(g.a.id, g.a.branchId),
        key = randomUUID();
      const retry = await lives.retry(g.a.id, q.jobId, branch.revision, key);
      expect(retry.jobId).not.toBe(q.jobId);
      expect(await lives.retry(g.a.id, q.jobId, branch.revision, key)).toEqual(
        retry,
      );
      const next = await claimed(retry.jobId);
      expect(JSON.stringify(next.payload)).not.toContain(secretText);
      await new Repository(db).deleteAccountData(g.b.id);
      await processLifeJob(next, jobs, lifeTestAi);
    },
  );
  it('scrubs a former member history job but preserves a new already projected remaining-member generation', async () => {
    const g = await group();
    let d = await shared.detail(g.b.id, g.contextId);
    await shared.lifecycle(
      g.b.id,
      g.contextId,
      d.revision,
      'leave',
      randomUUID(),
    );
    d = await shared.detail(g.a.id, g.contextId);
    const old = await shared.enqueue(
      g.a.id,
      g.contextId,
      d.revision,
      randomUUID(),
    );
    await new Repository(db).markDeleting(g.b.id);
    expect(
      (
        await db.query(
          'SELECT status,payload FROM aw_shared_jobs WHERE id=$1',
          [old.jobId],
        )
      )[0],
    ).toEqual({ status: 'cancelled', payload: {} });
    d = await shared.detail(g.a.id, g.contextId);
    const next = await shared.enqueue(
      g.a.id,
      g.contextId,
      d.revision,
      randomUUID(),
    );
    const job = (await shared.claim())!;
    expect(job.id).toBe(next.jobId);
    expect(JSON.stringify(job.payload)).not.toContain(secretText);
    const snapshot = hash(job.payload);
    await new Repository(db).deleteAccountData(g.b.id);
    await shared.verify(job);
    expect(hash(job.payload)).toBe(snapshot);
    await shared.complete(job, candidateFor(job.payload));
  });
  it('keeps a personal fork free of live membership while sanitizing inherited memory and later prompt prose', async () => {
    const g = await group(),
      q = await queue(g);
    await processLifeJob(await claimed(q.jobId), jobs, lifeTestAi);
    const detail = await lives.detail(g.a.id, g.a.branchId),
      last = detail.periods.at(-1)!;
    const candidate =
      last.candidate as import('@future-flow/contracts').PeriodCandidateV2;
    const fork = await lives.fork(
      g.a.id,
      g.a.branchId,
      String(last.id),
      detail.branch.revision,
      candidate.events.at(-1)!.decision!.options[1]!.id,
      randomUUID(),
    );
    const old = await claimed(fork.jobId);
    await new Repository(db).deleteAccountData(g.b.id);
    await expect(jobs.verifySharedPrivacy(old)).rejects.toMatchObject({
      code: 'JOB_LEASE_LOST',
    });
    const branch = await lives.branch(g.a.id, fork.branchId),
      next = await lives.retry(g.a.id, old.id, branch.revision, randomUUID());
    const safe = await claimed(next.jobId);
    expect(JSON.stringify(safe.payload)).not.toContain(secretText);
    expect(safe.payload.memory.choices).toEqual([]);
    expect(
      (
        await db.query('SELECT id FROM aw_shared_members WHERE branch_id=$1', [
          fork.branchId,
        ])
      ).length,
    ).toBe(0);
    await processLifeJob(safe, jobs, lifeTestAi);
  });
});
