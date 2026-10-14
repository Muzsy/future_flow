import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  contextNarrativePolicy,
  narrativeContextSchema,
  NARRATIVE_MEMORY_BYTES,
  NARRATIVE_WITHHELD_SUMMARY,
  type NarrativeMemory,
} from '@future-flow/contracts';
import {
  LifeRepository,
  LifeJobRepository,
  Repository,
  boundNarrativeMemory,
  narrativeConfigFromEnv,
  personalNarrativeMemory,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { applyMigrations } from '../scripts/lib/migrations';
import { setupFixture, lifeTestAi } from './life-fixtures';
import type { LifeAiProvider, PeriodStoryInput } from '@future-flow/ai';

let engine: PGlite, db: Database, repo: Repository, jobs: LifeJobRepository;
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
  repo = new Repository(db);
  jobs = new LifeJobRepository(db);
});
afterEach(async () => {
  await db.query(
    "UPDATE aw_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE status IN ('queued','running')",
  );
});
afterAll(async () => {
  await engine?.close();
});
function memory(branchId = randomUUID()): NarrativeMemory {
  return {
    version: '1.0.0',
    branchId,
    baseRevision: 0,
    history: [],
    recentChoices: [],
    openThreads: [],
    fictionalActors: [],
    recentDecisionPatterns: [],
    withheld: false,
  };
}
async function owner() {
  const id = randomUUID();
  await repo.ensureUser(id);
  await repo.acceptPrivacy(id);
  return id;
}
async function finish(ai: LifeAiProvider = lifeTestAi) {
  const job = (await jobs.claim())!;
  expect(job).toBeTruthy();
  await processLifeJob(job, jobs, ai);
  return job;
}

describe('queue-bound personal narrative memory', () => {
  it('defaults closed and rejects unsupported modes or malformed cohorts', () => {
    expect(narrativeConfigFromEnv({})).toEqual({
      mode: 'legacy',
      cohortUserIds: [],
    });
    expect(
      narrativeConfigFromEnv({ NARRATIVE_PIPELINE_MODE: 'context' })
        .cohortUserIds,
    ).toEqual([]);
    expect(() =>
      narrativeConfigFromEnv({ NARRATIVE_PIPELINE_MODE: 'narrative-v1' }),
    ).toThrow();
    expect(() =>
      narrativeConfigFromEnv({ NARRATIVE_COHORT_USER_IDS: 'not-a-user-id' }),
    ).toThrow();
    const id = randomUUID();
    expect(() =>
      narrativeConfigFromEnv({ NARRATIVE_COHORT_USER_IDS: `${id},${id}` }),
    ).toThrow();
  });
  it('keeps non-cohort and old queued jobs on the exact legacy path', async () => {
    const selected = await owner(),
      other = await owner();
    const lives = new LifeRepository(
      db,
      { daily: 100, concurrent: 10 },
      { mode: 'context', cohortUserIds: [selected] },
    );
    await lives.create(other, setupFixture(), randomUUID());
    const writer = vi.fn(lifeTestAi.periodChapter);
    const job = await finish({ ...lifeTestAi, periodChapter: writer });
    expect(Object.hasOwn(job.payload, 'narrativeContext')).toBe(false);
    expect(Object.hasOwn(writer.mock.calls[0]![0], 'narrativeContext')).toBe(
      false,
    );
    // A pre-rollout snapshot for a now-selected owner stays legacy.
    await new LifeRepository(db, { daily: 100, concurrent: 10 }).create(
      selected,
      setupFixture(),
      randomUUID(),
    );
    const old = await finish({ ...lifeTestAi, periodChapter: writer });
    expect(Object.hasOwn(old.payload, 'narrativeContext')).toBe(false);
    expect(Object.hasOwn(writer.mock.calls[1]![0], 'narrativeContext')).toBe(
      false,
    );
  });
  it('passes persisted history and the accepted option to the writer, then forks only the prefix', async () => {
    const id = await owner();
    const lives = new LifeRepository(
      db,
      { daily: 100, concurrent: 10 },
      { mode: 'context', cohortUserIds: [id] },
    );
    const created = await lives.create(id, setupFixture(), randomUUID());
    const first = await finish();
    expect(first.payload.narrativeContext?.memory.history).toEqual([]);
    const detail = await lives.detail(id, created.branchId),
      decision = detail.branch.pending_decision!;
    await lives.choose(
      id,
      created.branchId,
      detail.branch.revision,
      decision.id,
      decision.options[0]!.id,
      randomUUID(),
    );
    const chosen = await lives.detail(id, created.branchId);
    await lives.continue(
      id,
      created.branchId,
      chosen.branch.revision,
      randomUUID(),
    );
    const writer = vi.fn(lifeTestAi.periodChapter);
    await finish({ ...lifeTestAi, periodChapter: writer });
    const context = writer.mock.calls[0]![0].narrativeContext!;
    expect(context.memory.history).toHaveLength(1);
    expect(context.memory.history[0]!.periodId).toBe(detail.periods[0]!.id);
    expect(context.memory.recentChoices[0]!.optionId).toBe(
      decision.options[0]!.id,
    );
    expect(context.policy.promptVersions.writer).toBe(
      'life_chapter.v5.context',
    );
    const parent = await lives.detail(id, created.branchId);
    const fork = await lives.fork(
      id,
      created.branchId,
      String(detail.periods[0]!.id),
      parent.branch.revision,
      decision.options[1]!.id,
      randomUUID(),
    );
    const forkJob = (await jobs.claim())!;
    expect(forkJob.branch_id).toBe(fork.branchId);
    const child = forkJob.payload.narrativeContext!.memory;
    expect(child.history.map((p) => p.periodId)).toEqual([
      detail.periods[0]!.id,
    ]);
    expect(child.history.map((p) => p.periodId)).not.toContain(
      parent.periods[1]!.id,
    );
    expect(child.recentChoices.map((c) => c.optionId)).toEqual([
      decision.options[1]!.id,
    ]);
    expect(child.recentChoices.map((c) => c.optionId)).not.toContain(
      decision.options[0]!.id,
    );
    await processLifeJob(forkJob, jobs, lifeTestAi);
  });
  it('withholds all old prose and choice text and does not read a chapter column', async () => {
    const id = await owner();
    const lives = new LifeRepository(db, { daily: 100, concurrent: 10 });
    const created = await lives.create(id, setupFixture(), randomUUID());
    await finish();
    const queried: string[] = [];
    const observed: Database = {
      query: async (sql, values) => {
        queried.push(sql);
        return db.query(sql, values);
      },
      transaction: db.transaction,
    };
    const result = await personalNarrativeMemory(
      observed,
      id,
      created.branchId,
      1,
      [],
      true,
    );
    expect(result.history).toHaveLength(1);
    expect(result.history[0]!.summary).toBe(NARRATIVE_WITHHELD_SUMMARY);
    expect(result.history[0]!.excerpt).toBeNull();
    expect(result.recentChoices).toEqual([]);
    expect(queried.some((sql) => sql.includes('p.chapter'))).toBe(false);
    expect(
      narrativeContextSchema.safeParse({
        policy: contextNarrativePolicy(),
        memory: {
          ...result,
          history: [{ ...result.history[0], excerpt: 'withdrawn secret' }],
        },
      }).success,
    ).toBe(false);
  });
  it('omits whole oldest elements to satisfy the UTF-8 limit while preserving the latest choice', () => {
    const raw = memory();
    raw.history = Array.from({ length: 8 }, (_, index) => ({
      periodId: randomUUID(),
      startDate: '2020-01-01',
      endDate: '2020-07-01',
      position: index + 1,
      summary: '😀'.repeat(240),
      salientEventIds: [],
      excerpt: '😀'.repeat(500),
    }));
    raw.recentChoices = Array.from({ length: 10 }, () => ({
      decisionId: randomUUID(),
      optionId: randomUUID(),
      acceptedAt: '2026-01-01T00:00:00Z',
      label: 'Chosen option',
      changesSummary: '😀'.repeat(240),
    }));
    const result = boundNarrativeMemory(raw);
    expect(
      Buffer.byteLength(JSON.stringify(result), 'utf8'),
    ).toBeLessThanOrEqual(NARRATIVE_MEMORY_BYTES);
    expect(result.recentChoices.at(-1)).toEqual(raw.recentChoices.at(-1));
    expect(raw.history[0]!.excerpt).not.toBeNull();
    expect(boundNarrativeMemory(raw)).toEqual(result);
  });
  it('rejects mismatched branch context before any paid boundary', async () => {
    const id = await owner();
    const lives = new LifeRepository(
      db,
      { daily: 100, concurrent: 10 },
      { mode: 'context', cohortUserIds: [id] },
    );
    await lives.create(id, setupFixture(), randomUUID());
    const job = (await jobs.claim())!;
    job.payload.narrativeContext!.memory.branchId = randomUUID();
    const ai = {
      period: vi.fn(lifeTestAi.period),
      periodChapter: vi.fn(lifeTestAi.periodChapter),
      checkPeriodChapter: vi.fn(lifeTestAi.checkPeriodChapter),
    };
    await expect(processLifeJob(job, jobs, ai)).rejects.toMatchObject({
      code: 'NARRATIVE_CONTEXT_INVALID',
    });
    expect(ai.period).not.toHaveBeenCalled();
  });
  it('does not replay writer or checker calls after a context checkpoint interruption', async () => {
    const id = await owner();
    const lives = new LifeRepository(
      db,
      { daily: 100, concurrent: 10 },
      { mode: 'context', cohortUserIds: [id] },
    );
    await lives.create(id, setupFixture(), randomUUID());
    const job = (await jobs.claim())!;
    class Interrupted extends LifeJobRepository {
      async complete() {
        throw new Error('offline interruption');
      }
    }
    const ai = {
      period: vi.fn(lifeTestAi.period),
      periodChapter: vi.fn(lifeTestAi.periodChapter),
      checkPeriodChapter: vi.fn(lifeTestAi.checkPeriodChapter),
    };
    await expect(processLifeJob(job, new Interrupted(db), ai)).rejects.toThrow(
      'offline interruption',
    );
    await processLifeJob(job, jobs, ai);
    expect(ai.period).toHaveBeenCalledTimes(1);
    expect(ai.periodChapter).toHaveBeenCalledTimes(1);
    expect(ai.checkPeriodChapter).toHaveBeenCalledTimes(1);
  });
});
