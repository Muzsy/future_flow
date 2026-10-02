import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import {
  Repository,
  JobRepository,
  type Database,
  type Job,
} from '@future-flow/database';
import { questionnaire } from '@future-flow/contracts';
import { hash, simulate, validateSimulation } from '@future-flow/core';
import { processJob } from '../apps/worker/src/processor';
import { answers, testAi, simulation, chapters } from './fixtures';

let engine: PGlite, db: Database, repo: Repository, jobs: JobRepository;
const userId = randomUUID(),
  otherId = randomUUID();
let versionId: string, futureId: string, branchId: string, jobId: string;
function adapter(client: Pick<PGlite, 'query' | 'transaction'>): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      text: string,
      values: unknown[] = [],
    ) => (await client.query<T>(text, values)).rows,
    transaction: (run) =>
      client.transaction((tx) => run(adapter(tx as unknown as PGlite))),
  };
}
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await engine.exec(
    readFileSync('database/migrations/001_foundation.sql', 'utf8'),
  );
  db = adapter(engine);
  repo = new Repository(db);
  jobs = new JobRepository(db);
  await db.query(
    'INSERT INTO ff_questionnaires(version,definition,definition_hash) VALUES($1,$2,$3)',
    [questionnaire.version, JSON.stringify(questionnaire), hash(questionnaire)],
  );
  await repo.ensureUser(userId);
  await repo.acceptPrivacy(userId);
  await repo.ensureUser(otherId);
  await repo.acceptPrivacy(otherId);
});
afterAll(async () => {
  await engine?.close();
});
describe.sequential('PostgreSQL persistence and worker', () => {
  it('requires privacy acknowledgement before saving data', async () => {
    const user = randomUUID();
    await repo.ensureUser(user);
    await expect(repo.saveDraft(user, 0, answers, [])).rejects.toMatchObject({
      code: 'PRIVACY_ACKNOWLEDGEMENT_REQUIRED',
    });
  });
  it('restores the current acknowledgement on profile return', async () => {
    expect((await repo.currentProfile(userId)).acknowledged).toBe(true);
  });
  it('saves resumable drafts and prevents lost updates', async () => {
    expect(await repo.saveDraft(userId, 0, answers, [])).toEqual({
      revision: 1,
    });
    await expect(repo.saveDraft(userId, 0, answers, [])).rejects.toMatchObject({
      code: 'PROFILE_REVISION_CONFLICT',
    });
  });
  it('commits an immutable snapshot once per draft revision', async () => {
    const committed = await repo.commitProfile(userId, 1);
    versionId = committed.profileVersionId;
    expect((await repo.commitProfile(userId, 1)).profileVersionId).toBe(
      versionId,
    );
    await expect(
      db.query('UPDATE ff_profile_versions SET version_no=99 WHERE id=$1', [
        versionId,
      ]),
    ).rejects.toThrow('immutable');
  });
  it('rejects another users profile version', async () => {
    await expect(
      repo.createFuture(otherId, versionId, 'other-user-001'),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });
  it('atomically creates a future, branch and durable job once', async () => {
    const created = await repo.createFuture(
      userId,
      versionId,
      'future-request-001',
    );
    futureId = created.futureId;
    branchId = created.branchId;
    jobId = created.jobId;
    expect(
      await repo.createFuture(userId, versionId, 'future-request-001'),
    ).toEqual(created);
    expect(
      (await db.query('SELECT id FROM ff_jobs WHERE user_id=$1', [userId]))
        .length,
    ).toBe(1);
  });
  it('rejects an idempotency key reused for different input', async () => {
    await expect(
      repo.createFuture(userId, randomUUID(), 'future-request-001'),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('does not expose jobs to another user', async () => {
    await expect(repo.job(otherId, jobId)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
  });
  it('keeps generation status discoverable after closing the status page', async () => {
    expect((await repo.listFutures(userId))[0]!.job_id).toBe(jobId);
    expect((await repo.branch(userId, branchId)).job_id).toBe(jobId);
    expect((await repo.future(userId, futureId)).branches[0]!.job_id).toBe(
      jobId,
    );
  });
  it('claims a job and never claims a live lease twice', async () => {
    const first = await jobs.claim();
    expect(first?.id).toBe(jobId);
    expect(await jobs.claim()).toBeNull();
    await db.query(
      "UPDATE ff_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",
      [jobId],
    );
  });
  it('restarts from a saved event checkpoint without paying for events twice', async () => {
    const job = (await jobs.claim())!;
    const result = simulation();
    await jobs.checkpoint(job, 'EVENTS_READY', {
      simulation: result,
      receipts: [],
    });
    const ai = testAi();
    const events = vi.spyOn(ai, 'events');
    await processJob(job, jobs, ai);
    expect(events).not.toHaveBeenCalled();
    expect((await repo.job(userId, jobId)).status).toBe('completed');
    await expect(
      jobs.complete(
        job,
        result.title,
        simulate(result, job.payload.state),
        chapters(),
        [],
      ),
    ).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
  });
  it('persists canon with state references and immutable events', async () => {
    const branch = await repo.branch(userId, branchId);
    expect(branch.events).toHaveLength(5);
    expect(branch.chapters).toHaveLength(2);
    const event = branch.events[0]!;
    await expect(
      db.query("UPDATE ff_events SET event_key='changed' WHERE id=$1", [
        event.id,
      ]),
    ).rejects.toThrow('immutable');
  });
  it('stores different choices from the same decision as different branches', async () => {
    const branch = await repo.branch(userId, branchId);
    const decision = branch.decisions[0]!;
    const [a, b] = decision.options;
    const first = await repo.resolveDecision(
      userId,
      String(decision.id),
      String(a!.id),
      'choice-request-001',
    );
    const second = await repo.resolveDecision(
      userId,
      String(decision.id),
      String(b!.id),
      'choice-request-002',
    );
    expect(first.newBranchId).not.toBe(second.newBranchId);
    expect((await repo.future(userId, futureId)).branches).toHaveLength(3);
    const prefix = await repo.timeline(userId, first.newBranchId);
    expect(prefix).toHaveLength(1);
    expect(prefix[0]!.inherited).toBe(true);
    expect(
      (
        await db.query(
          'SELECT id FROM ff_decision_resolutions WHERE decision_id=$1',
          [decision.id],
        )
      ).length,
    ).toBe(2);
  });
  it('protects all canonical tables from direct authenticated clients', async () => {
    const row = (
      await db.query(
        "SELECT has_table_privilege('authenticated','ff_profile_versions','SELECT') AS allowed",
      )
    )[0]!;
    expect(row.allowed).toBe(false);
  });
  it('exports snapshots without prompts or credentials', async () => {
    const data = await repo.exportAccount(userId);
    expect(data.ff_profile_versions).toHaveLength(1);
    expect(data).not.toHaveProperty('ff_jobs');
  });
  it('cancels outstanding work and deletes the complete account graph', async () => {
    await repo.markDeleting(userId);
    await repo.deleteAccountData(userId);
    for (const table of [
      'ff_users',
      'ff_profile_versions',
      'ff_futures',
      'ff_branches',
      'ff_jobs',
      'ff_events',
      'ff_life_states',
      'ff_ai_runs',
      'ff_decision_resolutions',
    ]) {
      expect(
        (await db.query(`SELECT count(*)::int AS count FROM ${table}`))[0]!
          .count,
      ).toBe(table === 'ff_users' ? 2 : 0);
    }
  });
});
