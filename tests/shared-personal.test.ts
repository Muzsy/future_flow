import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  LifeJobRepository,
  LifeRepository,
  Repository,
  SharedJobRepository,
  type Database,
} from '@future-flow/database';
import {
  DomainError,
  hash,
  projectPersonalSharedMemory,
  sharedMemoryImpact,
  validatePersonalSharedMemories,
  sharedTimeAnchor,
} from '@future-flow/core';
import { personalSharedMemorySchema } from '@future-flow/contracts';
import { applyMigrations } from '../scripts/lib/migrations';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { sharedAdapter, testInviteSecret } from './shared-fixtures';
import { sharedAiGroup } from './shared-ai-fixtures';
import { candidateFor } from './shared-ai-fixtures';
import { sharedEventFixture } from './shared-engine-fixtures';
import { lifeTestAi } from './life-fixtures';

let engine: PGlite,
  db: Database,
  lives: LifeRepository,
  jobs: LifeJobRepository,
  shared: SharedJobRepository;
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
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
    b = g.people[1]!;
  const f = sharedEventFixture(
    g.contextId,
    g.detail.revision,
    a.date,
    g.detail.members.map((m) => String(m.id)),
    null,
  );
  await shared.commitCandidate(
    a.id,
    g.contextId,
    f.candidate,
    randomUUID(),
    f.rules,
  );
  return { ...g, a, b, f };
}
type Group = Awaited<ReturnType<typeof group>>;
async function respond(g: Group, person = g.a, option = g.f.yes) {
  const detail = await shared.detail(person.id, g.contextId);
  return shared.submitIntent(
    person.id,
    g.contextId,
    g.f.candidate.eventId,
    { contextRevision: detail.revision, optionId: option },
    randomUUID(),
  );
}
async function ready(person: Group['a']) {
  const b = await lives.branch(person.id, person.branchId);
  return lives.choose(
    person.id,
    person.branchId,
    b.revision,
    b.pending_decision!.id,
    b.pending_decision!.options[0]!.id,
    randomUUID(),
  );
}
async function finish(person: Group['a'], ai = lifeTestAi) {
  const b = await lives.branch(person.id, person.branchId);
  const q = await lives.continue(
    person.id,
    person.branchId,
    b.revision,
    randomUUID(),
  );
  const j = (await jobs.claim())!;
  expect(j.id).toBe(q.jobId);
  await processLifeJob(j, jobs, ai);
  return j;
}
async function memories(person: Group['a']) {
  return db.query(
    'SELECT * FROM aw_shared_personal_memories WHERE user_id=$1 AND branch_id=$2 ORDER BY first_history_position,id',
    [person.id, person.branchId],
  );
}

// True when `value` occurs as its own token: not inside a longer run of
// letters, digits or hyphens. Every character of a UUID is a hex digit or a
// hyphen, so a UUID can never contain a standalone token, while the value as a
// JSON number, a quoted string, a decimal (2123.5) or a word in prose is found.
function standaloneToken(text: string, value: string) {
  return new RegExp(`(?<![0-9A-Za-z-])${value}(?![0-9A-Za-z-])`).test(text);
}

describe.sequential('S3 delayed common canon and personal snapshots', () => {
  it('permits a personal chapter while waiting and learns a later resolution without rewriting history', async () => {
    const g = await group();
    expect((await respond(g)).status).toBe('waiting');
    await ready(g.a);
    const before = await lives.detail(g.a.id, g.a.branchId);
    const j = await finish(g.a);
    expect(j.payload.memory).not.toHaveProperty('sharedEvents');
    const advanced = await lives.branch(g.a.id, g.a.branchId);
    expect(advanced.state.effectiveAt > g.f.candidate.effectiveAt).toBe(true);
    expect((await respond(g, g.b, g.f.no)).status).toBe('resolved');
    const original = (await lives.detail(g.a.id, g.a.branchId)).periods[0];
    expect(hash(original)).toBe(hash(before.periods[0]));
    expect(await memories(g.a)).toEqual([]);
    expect(await lives.branch(g.a.id, g.a.branchId)).toEqual(advanced);
    const chosen = await ready(g.a);
    expect(chosen.revision).toBe(advanced.revision + 2);
    const [m] = await memories(g.a);
    expect(m!.payload).toMatchObject({
      effectiveAt: g.a.date,
      knownAt: advanced.state.effectiveAt,
      eventId: g.f.candidate.eventId,
      ownOptionId: g.f.yes,
    });
    expect(m!.first_history_position).toBe(3);
    const peer = await lives.branch(g.b.id, g.b.branchId);
    expect(peer.revision).toBe(g.b.revision);
    expect(await memories(g.b)).toEqual([]);
    const period = vi.fn(lifeTestAi.period),
      chapter = vi.fn(lifeTestAi.periodChapter),
      fidelity = vi.fn(lifeTestAi.checkPeriodChapter);
    const next = await finish(g.a, {
      period,
      periodChapter: chapter,
      checkPeriodChapter: fidelity,
    });
    expect(next.base_revision).toBe(chosen.revision);
    expect(period.mock.calls[0]![0].memory.sharedEvents).toEqual([m!.payload]);
    expect(chapter.mock.calls[0]![0].sharedEvents).toEqual([m!.payload]);
    expect(fidelity.mock.calls[0]![0].sharedEvents).toEqual([m!.payload]);
    const encoded = JSON.stringify(next.payload.memory.sharedEvents);
    for (const value of [
      g.b.id,
      g.b.branchId,
      g.b.lifeId,
      'Private employer',
      'Private goal',
      'UNTRUSTED proposal',
    ])
      expect(encoded).not.toContain(value);
    // The private income must not appear as a value. A bare substring search
    // for 2123 also hits random public UUIDs that happen to contain those four
    // hex digits (a rare, run-dependent failure), so the value is looked for
    // as a standalone token; no UUID can match it (see standaloneToken).
    expect(standaloneToken(encoded, '2123')).toBe(false);
    expect(personalSharedMemorySchema.safeParse(m!.payload).success).toBe(true);
  });

  it('accepts the user’s own late intent after personal advancement, without changing event time', async () => {
    const g = await group();
    await ready(g.a);
    await finish(g.a);
    expect((await respond(g, g.b, g.f.no)).status).toBe('waiting');
    expect((await respond(g)).status).toBe('resolved');
    const events = await shared.events(g.a.id, g.contextId);
    expect(events[0]!.effectiveAt).toBe(g.a.date);
    expect(await memories(g.a)).toEqual([]);
  });

  it('leaves an in-flight personal job intact when the common decision closes', async () => {
    const g = await group();
    await respond(g);
    await ready(g.a);
    const b = await lives.branch(g.a.id, g.a.branchId);
    const queued = await lives.continue(
      g.a.id,
      g.a.branchId,
      b.revision,
      randomUUID(),
    );
    const job = (await jobs.claim())!;
    expect(job.id).toBe(queued.jobId);
    const snapshot = hash(job.payload);
    expect((await respond(g, g.b, g.f.no)).status).toBe('resolved');
    expect((await lives.branch(g.a.id, g.a.branchId)).revision).toBe(
      job.base_revision,
    );
    expect(
      hash(
        (
          await db.query('SELECT payload FROM aw_jobs WHERE id=$1', [job.id])
        )[0]!.payload,
      ),
    ).toBe(snapshot);
    await processLifeJob(job, jobs, lifeTestAi);
    expect(await memories(g.a)).toEqual([]);
    await ready(g.a);
    expect(await memories(g.a)).toHaveLength(1);
  });

  it('validates the client revision first and rolls back memory application on an invalid personal choice', async () => {
    const g = await group();
    await respond(g);
    await respond(g, g.b, g.f.no);
    const b = await lives.branch(g.a.id, g.a.branchId);
    await expect(
      lives.choose(
        g.a.id,
        b.id,
        b.revision - 1,
        b.pending_decision!.id,
        b.pending_decision!.options[0]!.id,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'LIFE_REVISION_CONFLICT' });
    await expect(
      lives.choose(
        g.a.id,
        b.id,
        b.revision,
        b.pending_decision!.id,
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    expect(await memories(g.a)).toEqual([]);
    expect((await shared.pendingImpacts(g.a.id, b.id))[0]!.status).toBe(
      'pending',
    );
    expect(await lives.branch(g.a.id, b.id)).toEqual(b);
  });

  it('applies a batch once, accepts the same idempotency key and rejects a second stale request', async () => {
    const g = await group();
    await respond(g);
    await respond(g, g.b, g.f.no);
    const b = await lives.branch(g.a.id, g.a.branchId),
      key = randomUUID();
    const args = [
      g.a.id,
      b.id,
      b.revision,
      b.pending_decision!.id,
      b.pending_decision!.options[0]!.id,
    ] as const;
    const response = await lives.choose(...args, key);
    expect(response.revision).toBe(b.revision + 2);
    expect(await lives.choose(...args, key)).toEqual(response);
    await expect(lives.choose(...args, randomUUID())).rejects.toMatchObject({
      code: 'LIFE_REVISION_CONFLICT',
    });
    expect(await memories(g.a)).toHaveLength(1);
    expect(await shared.pendingImpacts(g.a.id, b.id)).toEqual([]);
    await finish(g.a);
    await ready(g.a);
    expect(await memories(g.a)).toHaveLength(1);
  });

  it('materializes after revision validation on continue and enqueues with the new revision', async () => {
    const g = await group();
    await ready(g.a);
    await respond(g);
    await respond(g, g.b, g.f.no);
    const b = await lives.branch(g.a.id, g.a.branchId);
    await expect(
      lives.continue(g.a.id, b.id, b.revision - 1, randomUUID()),
    ).rejects.toMatchObject({ code: 'LIFE_REVISION_CONFLICT' });
    const q = await lives.continue(g.a.id, b.id, b.revision, randomUUID()),
      job = (await jobs.claim())!;
    expect(job.id).toBe(q.jobId);
    expect(job.base_revision).toBe(b.revision + 1);
    expect(job.payload.revision).toBe(job.base_revision);
    expect(hash(job.payload.state)).toBe(hash(b.state));
    expect(job.payload.memory.sharedEvents).toHaveLength(1);
    await processLifeJob(job, jobs, lifeTestAi);
  });

  it('retries the same snapshot while pending Shared memories wait for the next personal mutation', async () => {
    const g = await group();
    await respond(g);
    await ready(g.a);
    const b = await lives.branch(g.a.id, g.a.branchId);
    await lives.continue(g.a.id, b.id, b.revision, randomUUID());
    const job = (await jobs.claim())!,
      snapshot = hash(job.payload);
    await jobs.fail(
      job,
      new DomainError('SYNTHETIC_TEST_FAILURE', 'Test only.'),
    );
    await respond(g, g.b, g.f.no);
    await lives.retry(g.a.id, job.id, job.base_revision, randomUUID());
    const retry = (await jobs.claim())!;
    expect(hash(retry.payload)).toBe(snapshot);
    expect(await memories(g.a)).toEqual([]);
    await processLifeJob(retry, jobs, lifeTestAi);
    await ready(g.a);
    expect(await memories(g.a)).toHaveLength(1);
  });

  it('forks past known memory without live membership or later impacts, and forks an earlier chapter without that memory', async () => {
    const g = await group();
    await respond(g);
    await respond(g, g.b, g.f.no);
    await ready(g.a);
    await finish(g.a);
    const detail = await lives.detail(g.a.id, g.a.branchId),
      parent = detail.branch;
    const second = detail.periods[1]!,
      decision = (
        second.candidate as {
          events: { decision: { options: { id: string }[] } | null }[];
        }
      ).events.at(-1)!.decision!;
    const child = await lives.fork(
      g.a.id,
      parent.id,
      String(second.id),
      parent.revision,
      decision.options[1]!.id,
      randomUUID(),
    );
    const job = (await jobs.claim())!;
    expect(job.id).toBe(child.jobId);
    expect(job.payload.memory.sharedEvents).toHaveLength(1);
    expect(
      await db.query('SELECT id FROM aw_shared_members WHERE branch_id=$1', [
        child.branchId,
      ]),
    ).toEqual([]);
    expect(await shared.pendingImpacts(g.a.id, child.branchId)).toEqual([]);
    await processLifeJob(job, jobs, lifeTestAi);
    const first = detail.periods[0]!,
      earlier = first.candidate as typeof second.candidate as {
        events: { decision: { options: { id: string }[] } | null }[];
      };
    const older = await lives.fork(
      g.a.id,
      parent.id,
      String(first.id),
      parent.revision,
      earlier.events.at(-1)!.decision!.options[1]!.id,
      randomUUID(),
    );
    const oldJob = (await jobs.claim())!;
    expect(oldJob.id).toBe(older.jobId);
    expect(oldJob.payload.memory).not.toHaveProperty('sharedEvents');
    await processLifeJob(oldJob, jobs, lifeTestAi);
    expect(await memories(g.a)).toHaveLength(1);
  });

  it('does not copy a newly learned memory into a fork at the chapter completed before learning', async () => {
    const g = await group();
    await respond(g);
    await ready(g.a);
    await finish(g.a);
    await respond(g, g.b, g.f.no);
    await ready(g.a);
    const detail = await lives.detail(g.a.id, g.a.branchId),
      p = detail.periods[1]!;
    const candidate = p.candidate as {
      events: { decision: { options: { id: string }[] } | null }[];
    };
    const child = await lives.fork(
      g.a.id,
      detail.branch.id,
      String(p.id),
      detail.branch.revision,
      candidate.events.at(-1)!.decision!.options[1]!.id,
      randomUUID(),
    );
    const job = (await jobs.claim())!;
    expect(job.id).toBe(child.jobId);
    expect(job.payload.memory).not.toHaveProperty('sharedEvents');
    await processLifeJob(job, jobs, lifeTestAi);
  });

  it('detaches unlearned memories on leave and retains already learned historical memory', async () => {
    for (const learned of [false, true]) {
      const g = await group();
      await respond(g);
      await respond(g, g.b, g.f.no);
      if (learned) await ready(g.a);
      const detail = await shared.detail(g.a.id, g.contextId);
      await shared.lifecycle(
        g.a.id,
        g.contextId,
        detail.revision,
        'leave',
        randomUUID(),
      );
      if (!learned) await ready(g.a);
      expect(await memories(g.a)).toHaveLength(learned ? 1 : 0);
      await finish(g.a);
    }
  });

  it('exports only own memory, enforces RLS/immutability and deletes private snapshots while retaining common canon', async () => {
    const g = await group();
    await respond(g);
    await respond(g, g.b);
    await ready(g.a);
    const repo = new Repository(db),
      exported = await repo.exportAccount(g.a.id);
    expect(
      (exported.shared as { personalMemories: unknown[] }).personalMemories,
    ).toHaveLength(1);
    const peerExport = await repo.exportAccount(g.b.id);
    expect(
      (peerExport.shared as { personalMemories: unknown[] }).personalMemories,
    ).toEqual([]);
    await expect(lives.branch(g.b.id, g.a.branchId)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
    const [access] = await db.query(
      "SELECT has_table_privilege('anon','aw_shared_personal_memories','SELECT') AS anon,has_table_privilege('authenticated','aw_shared_personal_memories','INSERT') AS client",
    );
    expect(access).toEqual({ anon: false, client: false });
    await expect(
      db.query(
        "UPDATE aw_shared_personal_memories SET payload='{}' WHERE user_id=$1",
        [g.a.id],
      ),
    ).rejects.toThrow();
    await repo.markDeleting(g.a.id);
    const deletingBranch = await lives.branch(g.a.id, g.a.branchId);
    await expect(
      lives.continue(
        g.a.id,
        g.a.branchId,
        deletingBranch.revision,
        randomUUID(),
      ),
    ).rejects.toMatchObject({
      code: 'ACCOUNT_DELETING',
    });
    await repo.deleteAccountData(g.a.id);
    expect(
      await db.query(
        'SELECT id FROM aw_shared_personal_memories WHERE user_id=$1',
        [g.a.id],
      ),
    ).toEqual([]);
    expect(
      await db.query('SELECT id FROM aw_shared_events WHERE id=$1', [
        g.f.candidate.eventId,
      ]),
    ).toHaveLength(1);
    await ready(g.b);
    expect(await memories(g.b)).toHaveLength(1);
  });

  it('rejects future, duplicate, private and unsupported projections before use', () => {
    const f = sharedEventFixture(
      randomUUID(),
      1,
      '2030-01-01',
      [randomUUID(), randomUUID()],
      null,
    );
    const impact = sharedMemoryImpact(
      f.candidate,
      f.candidate.participantMemberIds[0]!,
      null,
      f.yes,
      null,
    );
    const m = projectPersonalSharedMemory(impact, '2030-07-01');
    expect(() => projectPersonalSharedMemory(impact, '2029-12-01')).toThrow(
      DomainError,
    );
    expect(() => validatePersonalSharedMemories([m], '2030-01-01')).toThrow(
      DomainError,
    );
    expect(() => validatePersonalSharedMemories([m, m], m.knownAt)).toThrow(
      DomainError,
    );
    expect(() =>
      validatePersonalSharedMemories([{ ...m, privateState: {} }], m.knownAt),
    ).toThrow();
    expect(() =>
      validatePersonalSharedMemories(
        [{ ...m, contextType: 'work_project' }],
        m.knownAt,
      ),
    ).toThrow(DomainError);
    expect(validatePersonalSharedMemories(undefined, '2030-01-01')).toEqual([]);
  });
  it('retains every applied impact while bounding the next AI input to the eight most recent memories', async () => {
    const g = await group();
    await respond(g);
    await respond(g, g.b, g.f.no);
    const ids = [g.f.candidate.eventId];
    for (let i = 0; i < 9; i++) {
      const current = await shared.detail(g.a.id, g.contextId),
        f = sharedEventFixture(
          g.contextId,
          current.revision,
          g.a.date,
          current.members.map((m) => String(m.id)),
          null,
        );
      f.candidate.decision = null;
      f.candidate.title = `Synthetic common background ${i}`;
      await shared.commitCandidate(
        g.a.id,
        g.contextId,
        f.candidate,
        randomUUID(),
      );
      ids.push(f.candidate.eventId);
    }
    const before = await lives.branch(g.a.id, g.a.branchId),
      chosen = await ready(g.a);
    expect(chosen.revision).toBe(before.revision + 2);
    expect(await memories(g.a)).toHaveLength(10);
    const next = await finish(g.a);
    expect(next.payload.memory.sharedEvents!.map((m) => m.eventId)).toEqual(
      ids.slice(-8),
    );
    expect(await memories(g.a)).toHaveLength(10);
  });
  it('advances the common generation anchor once both personal branches reach the same later month', async () => {
    const g = await group();
    await respond(g);
    await respond(g, g.b);
    await ready(g.a);
    await ready(g.b);
    await finish(g.a);
    const old = await shared.detail(g.a.id, g.contextId);
    await expect(
      shared.enqueue(g.a.id, g.contextId, old.revision, randomUUID()),
    ).rejects.toMatchObject({ code: 'SHARED_TIME_MISMATCH' });
    expect((await shared.detail(g.a.id, g.contextId)).simulationAt).toBe(
      old.simulationAt,
    );
    await finish(g.b);
    const before = await lives.branch(g.a.id, g.a.branchId),
      peer = await lives.branch(g.b.id, g.b.branchId);
    const queued = await shared.enqueue(
        g.a.id,
        g.contextId,
        old.revision,
        randomUUID(),
      ),
      job = (await shared.claim())!;
    expect(job.id).toBe(queued.jobId);
    expect(job.payload.context.simulationAt).toBe(before.state.effectiveAt);
    expect(job.payload.history[0]!.effectiveAt).toBe(g.a.date);
    await shared.complete(job, candidateFor(job.payload));
    expect(await lives.branch(g.a.id, g.a.branchId)).toEqual(before);
    expect(await lives.branch(g.b.id, g.b.branchId)).toEqual(peer);
  });
  it('accepts different days in one month, anchors at the latest day and defers a future-dated memory', async () => {
    const g = await group();
    await respond(g);
    await respond(g, g.b, g.f.no);
    const later = g.a.date.slice(0, 8) + '28';
    await db.query(
      "UPDATE aw_branches SET state=jsonb_set(state,'{effectiveAt}',to_jsonb($2::text)) WHERE id=$1",
      [g.b.branchId, later],
    );
    const d = await shared.detail(g.a.id, g.contextId),
      q = await shared.enqueue(g.a.id, g.contextId, d.revision, randomUUID()),
      j = (await shared.claim())!;
    expect(j.id).toBe(q.jobId);
    expect(j.payload.context.simulationAt).toBe(later);
    const c = candidateFor(j.payload);
    await shared.complete(j, c);
    const vote = async (p: Group['a']) =>
      shared.submitIntent(
        p.id,
        g.contextId,
        c.eventId,
        {
          contextRevision: (await shared.detail(p.id, g.contextId)).revision,
          optionId: j.payload.decision.participationOptionId,
        },
        randomUUID(),
      );
    await vote(g.a);
    expect((await vote(g.b)).status).toBe('resolved');
    await ready(g.a);
    expect(
      (await shared.pendingImpacts(g.a.id, g.a.branchId)).map(
        (m) => m.event_id,
      ),
    ).toEqual([c.eventId]);
    const next = await finish(g.a);
    expect(next.payload.memory.sharedEvents!.map((m) => m.eventId)).toEqual([
      g.f.candidate.eventId,
    ]);
    await ready(g.a);
    const all = await memories(g.a);
    expect(all).toHaveLength(2);
    expect((all[1]!.payload as { knownAt: string }).knownAt > later).toBe(true);
  });
  it('uses a monotonic calendar-month anchor and rejects invalid, backward and incompatible dates', () => {
    expect(sharedTimeAnchor('2030-01-20', ['2030-01-02', '2030-01-10'])).toBe(
      '2030-01-20',
    );
    expect(sharedTimeAnchor('2030-01-20', ['2030-07-02', '2030-07-10'])).toBe(
      '2030-07-10',
    );
    for (const dates of [
      [],
      ['2030-02-30'],
      ['2030-01-10', '2030-02-10'],
      ['2029-12-10'],
    ])
      expect(() => sharedTimeAnchor('2030-01-20', dates)).toThrow(DomainError);
  });
  it('repairs one invalid background-derived event date without changing the request or common memory', async () => {
    const g = await group();
    await respond(g);
    await respond(g, g.b, g.f.no);
    await ready(g.a);
    const period = vi.fn(
      async (
        input: Parameters<typeof lifeTestAi.period>[0],
        repair?: string,
      ) => {
        const response = await lifeTestAi.period(input);
        if (!repair) response.output.events[0]!.effectiveAt = input.startDate;
        return response;
      },
    );
    const job = await finish(g.a, { ...lifeTestAi, period });
    expect(period).toHaveBeenCalledTimes(2);
    expect(period.mock.calls[1]![1]).toContain('strictly after startDate');
    expect(period.mock.calls[1]![0]).toEqual(period.mock.calls[0]![0]);
    expect(job.checkpoints.repairUsed).toBe(true);
    expect(job.checkpoints.repairReasonCode).toBe('LIFE_INVALID_TIMELINE');
    expect((await lives.detail(g.a.id, g.a.branchId)).periods).toHaveLength(2);
    expect(await memories(g.a)).toHaveLength(1);
  });
});

describe('standalone private-value check', () => {
  it('ignores digits inside UUIDs but finds the value in every real form', () => {
    for (const uuid of [
      'f942123e-16be-4ada-898b-ed41f622d37c',
      '2123abcd-0000-4000-8000-000000000000',
      'aaaaaaaa-2123-4000-8000-000000000000',
      'aaaaaaaa-bbbb-4000-8000-000000002123',
      '00000000-0000-4000-8000-a00000002123',
    ])
      expect(standaloneToken(JSON.stringify({ id: uuid }), '2123')).toBe(false);
    for (const leak of [
      '{"monthlyIncome":2123}',
      '["2123"]',
      '{"note":"income 2123 EUR"}',
      '{"x":2123.5}',
      '[2123,1]',
    ])
      expect(standaloneToken(leak, '2123')).toBe(true);
  });
});
