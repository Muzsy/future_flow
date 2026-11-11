import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  LifeJobRepository,
  LifeRepository,
  Repository,
  type Database,
} from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { lifeTestAi, setupFixture } from './life-fixtures';
import {
  narrativeArtifactFixture,
  longNarrativeChapterFixture,
} from './narrative-plan-fixtures';
import { prepareNarrativeJobFixture } from './narrative-storage-fixtures';
import {
  preparePublicEditorSource,
  type SnapshotSourcePeriod,
} from '@future-flow/core';

let engine: PGlite,
  db: Database,
  jobs: LifeJobRepository,
  lives: LifeRepository,
  repo: Repository;
function adapter(client: Pick<PGlite, 'query' | 'transaction'>): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) => (await client.query<T>(sql, values)).rows,
    transaction: (run) =>
      client.transaction((tx) => run(adapter(tx as unknown as PGlite))),
  };
}
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await applyMigrations(engine);
  db = adapter(engine);
  jobs = new LifeJobRepository(db);
  lives = new LifeRepository(db);
  repo = new Repository(db);
});
afterEach(async () => {
  await db.query(
    "UPDATE aw_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE status IN ('queued','running')",
  );
});
afterAll(async () => {
  await engine?.close();
});
async function created() {
  const owner = randomUUID();
  await repo.ensureUser(owner);
  await repo.acceptPrivacy(owner);
  const life = await lives.create(owner, setupFixture(), randomUUID());
  const job = (await jobs.claim())!;
  return { owner, life, job };
}
async function prepared() {
  const f = await created();
  return { ...f, ...(await prepareNarrativeJobFixture(db, f.job)) };
}
const complete = (f: Awaited<ReturnType<typeof prepared>>) =>
  jobs.complete(f.job, f.plan.candidate, f.chapter, f.receipts, f.commit);
describe('immutable narrative storage preparation', () => {
  it('keeps old worker inserts null and projects no artifacts or private checkpoints', async () => {
    const f = await created();
    await processLifeJob(f.job, jobs, lifeTestAi);
    const [row] = await db.query(
      'SELECT narrative_artifact FROM aw_periods WHERE user_id=$1',
      [f.owner],
    );
    expect(row!.narrative_artifact).toBeNull();
    const detail = await lives.detail(f.owner, f.life.branchId);
    expect(detail.periods[0]).not.toHaveProperty('narrative_artifact');
    expect(detail.job).not.toHaveProperty('checkpoints');
  });
  it('requires a narrative artifact and rolls back before writing canon', async () => {
    const f = await prepared();
    await expect(
      jobs.complete(f.job, f.plan.candidate, f.chapter, f.receipts),
    ).rejects.toMatchObject({ code: 'NARRATIVE_CONTEXT_INVALID' });
    expect(
      await db.query('SELECT id FROM aw_periods WHERE user_id=$1', [f.owner]),
    ).toEqual([]);
    expect((await lives.branch(f.owner, f.life.branchId)).status).toBe(
      'generating',
    );
  });
  it('atomically stores the exact validated artifact and exposes it only in owned export', async () => {
    const f = await prepared();
    await complete(f);
    const [stored] = await db.query(
      'SELECT chapter,narrative_artifact FROM aw_periods WHERE id=$1',
      [f.plan.candidate.periodId],
    );
    expect(stored).toEqual({
      chapter: f.chapter,
      narrative_artifact: f.artifact,
    });
    const detail = await lives.detail(f.owner, f.life.branchId);
    expect(detail.periods[0]).not.toHaveProperty('narrative_artifact');
    expect(detail.job).not.toHaveProperty('checkpoints');
    const own = await repo.exportAccount(f.owner);
    expect(own.narrativeArtifactVersion).toBe('1.0.0');
    expect(
      (own.aw_periods as Record<string, unknown>[])[0]!.narrative_artifact,
    ).toEqual(f.artifact);
    const other = randomUUID();
    await repo.ensureUser(other);
    expect((await repo.exportAccount(other)).aw_periods).toEqual([]);
    const publicPreparation = preparePublicEditorSource(
      detail.branch.input,
      detail.periods as unknown as SnapshotSourcePeriod[],
      detail.branch.revision,
    );
    expect(JSON.stringify(publicPreparation)).not.toContain(
      'narrative_artifact',
    );
    expect(JSON.stringify(publicPreparation)).not.toContain(
      f.plan.result.plan.centralTension,
    );
    await expect(
      engine.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE authenticated');
        await tx.query('SELECT narrative_artifact FROM aw_periods');
      }),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.query('UPDATE aw_periods SET narrative_artifact=NULL WHERE id=$1', [
        f.plan.candidate.periodId,
      ]),
    ).rejects.toThrow(/immutable/i);
    await expect(complete(f)).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
    await repo.markDeleting(f.owner);
    await repo.deleteAccountData(f.owner);
    expect(
      await db.query('SELECT id FROM aw_periods WHERE id=$1', [
        f.plan.candidate.periodId,
      ]),
    ).toEqual([]);
  });
  it('refuses a changed chapter, false fidelity or forged receipt without saving any partial result', async () => {
    const f = await prepared();
    f.chapter.body += ' changed';
    await expect(complete(f)).rejects.toThrow('binding');
    f.chapter = longNarrativeChapterFixture(f.plan);
    f.commit.expectedBindings.fidelityOutputHash =
      f.artifact.bindings.fidelityOutputHash = 'a'.repeat(64);
    await expect(complete(f)).rejects.toThrow('binding');
    f.commit = {
      artifact: narrativeArtifactFixture(f.plan),
      expectedBindings: narrativeArtifactFixture(f.plan).bindings,
    };
    f.receipts[0]!.model = 'forged';
    await expect(complete(f)).rejects.toMatchObject({
      code: 'NARRATIVE_CONTEXT_INVALID',
    });
    expect(
      await db.query('SELECT id FROM aw_periods WHERE user_id=$1', [f.owner]),
    ).toEqual([]);
  });
  it('rejects an artifact attached to a legacy job and stale in-memory queue payloads', async () => {
    const f = await prepared();
    delete f.job.payload.narrativeContext;
    await expect(complete(f)).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
    await db.query('UPDATE aw_jobs SET payload=$2 WHERE id=$1', [
      f.job.id,
      JSON.stringify(f.job.payload),
    ]);
    await expect(complete(f)).rejects.toMatchObject({
      code: 'NARRATIVE_CONTEXT_INVALID',
    });
  });
});
