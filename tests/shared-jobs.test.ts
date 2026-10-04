import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import {
  Repository,
  SharedJobRepository,
  DatabaseAiBudget,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { sharedAdapter, testInviteSecret } from './shared-fixtures';
import { sharedAiGroup, candidateFor } from './shared-ai-fixtures';
import { processSharedJob } from '../apps/worker/src/shared-processor';
let engine: PGlite,
  db: Database,
  jobs: SharedJobRepository,
  g: Awaited<ReturnType<typeof sharedAiGroup>>;
beforeAll(async () => {
  engine = new PGlite();
  await applyMigrations(engine);
  db = sharedAdapter(engine);
  jobs = new SharedJobRepository(db, testInviteSecret, 180, 172800);
});
beforeEach(async () => {
  g = await sharedAiGroup(db, jobs);
});
afterEach(async () => {
  const [c] = await db.query(
    'SELECT revision,status FROM aw_shared_contexts WHERE id=$1',
    [g.contextId],
  );
  if (c && ['active', 'inviting', 'paused'].includes(String(c.status)))
    await jobs.lifecycle(
      g.people[0]!.id,
      g.contextId,
      Number(c.revision),
      'end',
      randomUUID(),
    );
});
afterAll(async () => {
  await engine?.close();
});
const enqueue = (key = randomUUID()) =>
  jobs.enqueue(g.people[0]!.id, g.contextId, g.detail.revision, key);
describe('Shared queued generation persistence', () => {
  it('enqueues once with strict safe input and no private state or branch writes', async () => {
    const before = await db.query(
        'SELECT id,state,revision,status FROM aw_branches WHERE id=ANY($1::uuid[]) ORDER BY id',
        [g.people.map((p) => p.branchId)],
      ),
      key = randomUUID(),
      q = await enqueue(key);
    expect(await enqueue(key)).toEqual(q);
    await expect(enqueue()).rejects.toMatchObject({
      code: 'SHARED_REVISION_CONFLICT',
    });
    const [row] = await db.query('SELECT * FROM aw_shared_jobs WHERE id=$1', [
      q.jobId,
    ]);
    expect(row!.requested_by_user_id).toBe(g.people[0]!.id);
    expect(row!.base_revision).toBe(q.revision);
    expect(row!.payload).toMatchObject({
      locale: 'en',
      context: { revision: q.revision },
      decision: { rules: { deadlineSeconds: 172800 } },
    });
    const text = JSON.stringify(row!.payload);
    for (const forbidden of [
      'Private goal',
      'Private employer',
      '2123',
      '4765',
      'user_id',
      'branchId',
      ...g.people.flatMap((p) => [p.id, p.lifeId, p.branchId]),
    ])
      expect(text).not.toContain(forbidden);
    expect(
      await db.query(
        'SELECT id,state,revision,status FROM aw_branches WHERE id=ANY($1::uuid[]) ORDER BY id',
        [g.people.map((p) => p.branchId)],
      ),
    ).toEqual(before);
    await expect(
      jobs.enqueue(g.people[0]!.id, g.contextId, q.revision, key),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      jobs.enqueue(g.people[1]!.id, g.contextId, q.revision, randomUUID()),
    ).rejects.toMatchObject({ code: 'SHARED_GENERATION_ACTIVE' });
  });
  it('claims once, stores receipts, commits once and exposes only safe job progress', async () => {
    const q = await enqueue(),
      claims = await Promise.all([jobs.claim(), jobs.claim()]),
      j = claims.find(Boolean)!;
    expect(claims.filter(Boolean)).toHaveLength(1);
    await jobs.verify(j);
    await jobs.heartbeat(j);
    const candidate = candidateFor(j.payload);
    await jobs.checkpoint(
      j,
      'OUTPUT_RETURNED',
      { candidate, initialCallStarted: true },
      { task: 'shared_event', inputTokens: 20, outputTokens: 100 },
    );
    const before = await db.query(
      'SELECT state,revision FROM aw_branches WHERE id=ANY($1::uuid[]) ORDER BY id',
      [g.people.map((p) => p.branchId)],
    );
    const result = await jobs.complete(j, candidate);
    await expect(jobs.complete(j, candidate)).rejects.toMatchObject({
      code: 'JOB_LEASE_LOST',
    });
    expect(
      await db.query('SELECT id FROM aw_shared_events WHERE context_id=$1', [
        g.contextId,
      ]),
    ).toHaveLength(1);
    expect(
      await db.query(
        'SELECT charged_user_id FROM aw_shared_ai_runs WHERE shared_job_id=$1',
        [j.id],
      ),
    ).toEqual([{ charged_user_id: g.people[0]!.id }]);
    expect(
      await db.query(
        'SELECT state,revision FROM aw_branches WHERE id=ANY($1::uuid[]) ORDER BY id',
        [g.people.map((p) => p.branchId)],
      ),
    ).toEqual(before);
    const dto = await jobs.job(g.people[1]!.id, q.jobId);
    expect(dto).toMatchObject({ status: 'completed', eventId: result.eventId });
    for (const field of [
      'payload',
      'checkpoints',
      'lease_token',
      'requested_by_user_id',
    ])
      expect(dto).not.toHaveProperty(field);
  });
  it('loses all write rights on expired lease, reclaims and resumes saved canon without an AI repeat', async () => {
    await enqueue();
    const old = (await jobs.claim())!,
      candidate = candidateFor(old.payload);
    await jobs.checkpoint(old, 'OUTPUT_RETURNED', {
      candidate,
      initialCallStarted: true,
    });
    await db.query(
      "UPDATE aw_shared_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",
      [old.id],
    );
    for (const op of [
      () => jobs.heartbeat(old),
      () => jobs.checkpoint(old, 'FORGED', {}),
      () => jobs.complete(old, candidate),
    ])
      await expect(op()).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
    const next = (await jobs.claim())!;
    expect(next.lease_token).not.toBe(old.lease_token);
    expect(next.attempt).toBe(2);
    const ai = { sharedEvent: vi.fn() };
    await processSharedJob(next, jobs, ai);
    expect(ai.sharedEvent).not.toHaveBeenCalled();
    expect((await jobs.job(g.people[0]!.id, next.id)).status).toBe('completed');
  });
  it('rolls back invalid canon and preserves pending generation without impacts', async () => {
    await enqueue();
    const j = (await jobs.claim())!,
      bad = candidateFor(j.payload);
    bad.participantMemberIds[0] = randomUUID();
    await expect(jobs.complete(j, bad)).rejects.toThrow();
    expect(
      await db.query('SELECT id FROM aw_shared_events WHERE context_id=$1', [
        g.contextId,
      ]),
    ).toHaveLength(0);
    expect(
      await db.query('SELECT id FROM aw_shared_impacts WHERE context_id=$1', [
        g.contextId,
      ]),
    ).toHaveLength(0);
    expect((await jobs.job(g.people[0]!.id, j.id)).status).toBe('running');
  });
  it('cancels an in-flight job on participant leave and cannot resurrect canon', async () => {
    await enqueue();
    const j = (await jobs.claim())!,
      d = await jobs.detail(g.people[0]!.id, g.contextId);
    await jobs.lifecycle(
      g.people[1]!.id,
      g.contextId,
      d.revision,
      'leave',
      randomUUID(),
    );
    await expect(jobs.verify(j)).rejects.toMatchObject({
      code: 'JOB_LEASE_LOST',
    });
    await expect(
      jobs.complete(j, candidateFor(j.payload)),
    ).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
    expect(
      await db.query('SELECT id FROM aw_shared_events WHERE context_id=$1', [
        g.contextId,
      ]),
    ).toHaveLength(0);
  });
  it('cancels a deleting participant job before another caller can commit', async () => {
    await enqueue();
    const j = (await jobs.claim())!;
    await new Repository(db).markDeleting(g.people[1]!.id);
    await expect(jobs.verify(j)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETING',
    });
    await expect(jobs.complete(j, candidateFor(j.payload))).rejects.toThrow();
    expect(await jobs.claim()).toBeNull();
    expect((await jobs.job(g.people[0]!.id, j.id)).status).toBe('cancelled');
    expect(
      await db.query('SELECT id FROM aw_shared_events WHERE context_id=$1', [
        g.contextId,
      ]),
    ).toHaveLength(0);
    await new Repository(db).deleteAccountData(g.people[1]!.id);
  });
  it('rejects stale group state and never runs a queued stale or exhausted job', async () => {
    const q = await enqueue();
    await db.query(
      'UPDATE aw_shared_contexts SET revision=revision+1 WHERE id=$1',
      [g.contextId],
    );
    expect(await jobs.claim()).toBeNull();
    expect((await jobs.job(g.people[0]!.id, q.jobId)).errorCode).toBe(
      'SHARED_REVISION_CONFLICT',
    );
    const d = await jobs.detail(g.people[0]!.id, g.contextId),
      next = await jobs.enqueue(
        g.people[0]!.id,
        g.contextId,
        d.revision,
        randomUUID(),
      );
    await db.query('UPDATE aw_shared_jobs SET attempt=5 WHERE id=$1', [
      next.jobId,
    ]);
    expect(await jobs.claim()).toBeNull();
    expect((await jobs.job(g.people[0]!.id, next.jobId)).errorCode).toBe(
      'JOB_ATTEMPTS_EXHAUSTED',
    );
  });
  it('rechecks private branch date and individual entitlement before a provider request', async () => {
    const q = await enqueue();
    await db.query(
      "UPDATE aw_branches SET state=jsonb_set(state,'{effectiveAt}','\"2040-01-01\"') WHERE id=$1",
      [g.people[1]!.branchId],
    );
    expect(await jobs.claim()).toBeNull();
    expect((await jobs.job(g.people[0]!.id, q.jobId)).errorCode).toBe(
      'SHARED_TIME_MISMATCH',
    );
    await db.query(
      "UPDATE aw_branches SET state=jsonb_set(state,'{effectiveAt}',$2::jsonb) WHERE id=$1",
      [g.people[1]!.branchId, JSON.stringify(g.detail.simulationAt)],
    );
    const d = await jobs.detail(g.people[0]!.id, g.contextId),
      next = await jobs.enqueue(
        g.people[0]!.id,
        g.contextId,
        d.revision,
        randomUUID(),
      );
    await db.query(
      "UPDATE aw_user_entitlements SET tier='free' WHERE user_id=$1",
      [g.people[1]!.id],
    );
    expect(await jobs.claim()).toBeNull();
    expect((await jobs.job(g.people[0]!.id, next.jobId)).errorCode).toBe(
      'SUBSCRIPTION_REQUIRED',
    );
  });
  it('charges only the initiating user and keeps zero allowance a hard stop', async () => {
    const q = await enqueue(),
      p = {
        model: 'gpt-6.1-sol',
        max_output_tokens: 4500,
        text: { format: { name: 'shared_event' } },
      };
    await expect(
      new DatabaseAiBudget(db, g.people[0]!.id, q.jobId, {
        projectUsd: 0,
        userUsd: 0,
      }).reserve(p),
    ).rejects.toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });
    const budget = new DatabaseAiBudget(db, g.people[0]!.id, q.jobId, {
        projectUsd: 5,
        userUsd: 1,
      }),
      id = await budget.reserve(p);
    await budget.settle(id, { input_tokens: 100, output_tokens: 500 });
    expect(
      await db.query(
        'SELECT user_id,job_id,task FROM aw_budget_reservations WHERE id=$1',
        [id],
      ),
    ).toEqual([
      { user_id: g.people[0]!.id, job_id: q.jobId, task: 'shared_event' },
    ]);
    expect(
      await db.query('SELECT id FROM aw_budget_accounts WHERE user_id=$1', [
        g.people[1]!.id,
      ]),
    ).toHaveLength(0);
  });
  it('enforces blocks and current privacy consent before accepting a generation', async () => {
    await db.query(
      'INSERT INTO aw_user_blocks(user_id,blocked_user_id) VALUES($1,$2)',
      [g.people[0]!.id, g.people[1]!.id],
    );
    await expect(enqueue()).rejects.toMatchObject({ code: 'SHARED_BLOCKED' });
    await db.query('DELETE FROM aw_user_blocks WHERE user_id=$1', [
      g.people[0]!.id,
    ]);
    await db.query('DELETE FROM ff_consents WHERE user_id=$1', [
      g.people[1]!.id,
    ]);
    await expect(enqueue()).rejects.toMatchObject({
      code: 'PRIVACY_ACKNOWLEDGEMENT_REQUIRED',
    });
    expect(
      await db.query('SELECT id FROM aw_shared_jobs WHERE context_id=$1', [
        g.contextId,
      ]),
    ).toHaveLength(0);
  });
  it('enforces a daily Shared quota even when the previous job failed', async () => {
    const limited = new SharedJobRepository(db, testInviteSecret, 180, null, {
      daily: 1,
      concurrent: 1,
    });
    const q = await limited.enqueue(
        g.people[0]!.id,
        g.contextId,
        g.detail.revision,
        randomUUID(),
      ),
      j = (await limited.claim())!;
    await limited.fail(j, new Error('Synthetic provider failure'));
    await expect(
      limited.enqueue(g.people[0]!.id, g.contextId, q.revision, randomUUID()),
    ).rejects.toMatchObject({ code: 'GENERATION_LIMIT', status: 429 });
  });
  it('scrubs failed private AI snapshots at the deleting marker while retaining receipts', async () => {
    await enqueue();
    const j = (await jobs.claim())!;
    await jobs.checkpoint(
      j,
      'REJECTED',
      { candidate: candidateFor(j.payload) },
      { task: 'shared_event', inputHash: 'synthetic', outputHash: 'synthetic' },
    );
    await jobs.fail(j, new Error('Synthetic rejection'));
    await new Repository(db).markDeleting(g.people[1]!.id);
    expect(
      await db.query(
        'SELECT payload,checkpoints FROM aw_shared_jobs WHERE id=$1',
        [j.id],
      ),
    ).toEqual([{ payload: {}, checkpoints: {} }]);
    expect(
      await db.query(
        'SELECT metadata FROM aw_shared_ai_runs WHERE shared_job_id=$1',
        [j.id],
      ),
    ).toHaveLength(1);
    await new Repository(db).deleteAccountData(g.people[1]!.id);
  });
});
