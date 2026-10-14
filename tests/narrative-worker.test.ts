import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
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
import type OpenAIClient from 'openai';
import { OpenAiProvider } from '@future-flow/ai';
import {
  DatabaseAiBudget,
  LifeRepository,
  LifeJobRepository,
  Repository,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import { hash, validatedNarrativeCheckpoint } from '@future-flow/core';
import { applyMigrations } from '../scripts/lib/migrations';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { setupFixture } from './life-fixtures';
import { prepareNarrativeJobFixture } from './narrative-storage-fixtures';
import { narrativeEditorialFixture } from './narrative-plan-fixtures';

const SDK = createRequire(
  new URL('../packages/ai/package.json', import.meta.url),
)('openai').default as typeof import('openai').default;
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
  lives = new LifeRepository(db, { daily: 100, concurrent: 10 });
  repo = new Repository(db);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.query(
    "UPDATE aw_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE status IN ('running','queued')",
  );
});
afterAll(async () => {
  await engine?.close();
});
async function fixture() {
  const owner = randomUUID();
  await repo.ensureUser(owner);
  await repo.acceptPrivacy(owner);
  const created = await lives.create(owner, setupFixture(), randomUUID()),
    job = (await jobs.claim())!;
  expect(job.id).toBe(created.jobId);
  const prepared = await prepareNarrativeJobFixture(db, job, false);
  return { owner, created, job, ...prepared };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function provider(
  f: Fixture,
  job = f.job,
  respond?: (task: string, ordinal: number) => unknown,
  budgetUsd = 10,
) {
  const parse = vi.fn(
    async (request: { text: { format: { name: string } } }) => {
      const task = request.text.format.name,
        ordinal = parse.mock.calls.filter(
          (call) => call[0].text.format.name === task,
        ).length;
      const output = respond
        ? respond(task, ordinal)
        : task === 'life_narrative_plan'
          ? f.plan.result
          : task === 'life_narrative_chapter'
            ? f.chapter
            : task === 'life_fidelity'
              ? { valid: true, issues: [] }
              : narrativeEditorialFixture();
      return {
        status: 'completed',
        output_parsed: output,
        model: 'gpt-6.1-sol',
        usage: { input_tokens: 10, output_tokens: 20 },
      };
    },
  );
  const ai = new OpenAiProvider(
    {
      apiKey: 'offline-test-only',
      eventModel: 'gpt-6.1-sol',
      storyModel: 'gpt-6.1-sol',
      checkModel: 'gpt-6.1-sol',
      timeoutMs: 1000,
      maxOutputTokens: 6500,
      guard: new DatabaseAiBudget(
        db,
        job.user_id,
        job.id,
        { projectUsd: budgetUsd, userUsd: budgetUsd ? 2 : 0 },
        job.lease_token,
      ),
      beforePhysicalRequest: () => jobs.admitNarrativeRequest(job),
    },
    { responses: { parse } } as unknown as OpenAIClient,
  );
  return { ai, parse };
}
const defaultOutput = (f: Fixture, task: string) =>
  task === 'life_narrative_plan'
    ? f.plan.result
    : task === 'life_narrative_chapter'
      ? f.chapter
      : task === 'life_fidelity'
        ? { valid: true, issues: [] }
        : narrativeEditorialFixture();
async function expire(job: LifeJob) {
  await db.query(
    "UPDATE aw_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
    [job.id],
  );
}
const saved = async (job: LifeJob) =>
  (await db.query<LifeJob>('SELECT * FROM aw_jobs WHERE id=$1', [job.id]))[0]!;
describe('durable narrative pipeline and physical request admission', () => {
  it('makes four guarded calls and atomically commits a private artifact with compact audit hashes', async () => {
    const f = await fixture(),
      p = provider(f);
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse).toHaveBeenCalledTimes(4);
    const current = await saved(f.job);
    expect(current.status).toBe('completed');
    expect(current.attempt).toBe(1);
    expect(current.checkpoints.providerRequestCount).toBe(4);
    expect(current.checkpoints).not.toHaveProperty('chapter');
    expect(current.checkpoints).not.toHaveProperty('editorialReport');
    const [period] = await db.query(
      'SELECT narrative_artifact,chapter FROM aw_periods WHERE id=$1',
      [f.job.payload.periodId],
    );
    expect(period!.chapter).toEqual(f.chapter);
    expect(
      (period!.narrative_artifact as Record<string, unknown>).pipelineVersion,
    ).toBe('narrative-v1');
    expect(
      await db.query('SELECT id FROM aw_ai_runs WHERE job_id=$1', [f.job.id]),
    ).toHaveLength(4);
  });
  it.each([
    'NARRATIVE_PLANNING_RESULT',
    'NARRATIVE_PLAN_VALIDATED',
    'NARRATIVE_WRITER_RESULT',
    'NARRATIVE_FIDELITY_RESULT',
    'NARRATIVE_EDITORIAL_RESULT',
    'NARRATIVE_READY_TO_COMMIT',
  ])(
    'recovers after %s without repeating saved provider work',
    async (stage) => {
      const f = await fixture(),
        first = provider(f),
        original = jobs.checkpoint.bind(jobs);
      let crashed = false;
      const checkpoint = vi
        .spyOn(jobs, 'checkpoint')
        .mockImplementation(async (job, current, patch) => {
          await original(job, current, patch);
          if (current === stage && !crashed) {
            crashed = true;
            throw new Error('Injected process crash');
          }
        });
      await expect(processLifeJob(f.job, jobs, first.ai)).rejects.toThrow(
        'Injected process crash',
      );
      checkpoint.mockRestore();
      await expire(f.job);
      const recovered = (await jobs.claim())!;
      expect(recovered.id).toBe(f.job.id);
      const next = provider(f, recovered);
      await processLifeJob(recovered, jobs, next.ai);
      expect(first.parse.mock.calls.length + next.parse.mock.calls.length).toBe(
        4,
      );
      expect((await saved(recovered)).checkpoints.providerRequestCount).toBe(4);
      expect(
        await db.query('SELECT id FROM aw_periods WHERE id=$1', [
          recovered.payload.periodId,
        ]),
      ).toHaveLength(1);
    },
  );
  it('uses one editorial repair, rechecks unchanged canon and stops after seven physical requests', async () => {
    const f = await fixture(),
      p = provider(f, f.job, (task, ordinal) => {
        if (task === 'life_narrative_editor' && ordinal === 1) {
          const report = narrativeEditorialFixture();
          report.scores.momentum = 3;
          report.verdict = 'revise';
          return report;
        }
        return defaultOutput(f, task);
      });
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse).toHaveBeenCalledTimes(7);
    const current = await saved(f.job);
    expect(current.checkpoints.providerRequestCount).toBe(7);
    expect(current.checkpoints.repairUsed).toBe(true);
    const [period] = await db.query(
      'SELECT candidate,narrative_artifact FROM aw_periods WHERE id=$1',
      [f.job.payload.periodId],
    );
    expect(period!.candidate).toEqual(f.plan.candidate);
  });
  it('keeps a request slot spent when a response is lost before its checkpoint, then repeats only that stage', async () => {
    const f = await fixture(),
      first = provider(f),
      original = jobs.checkpoint.bind(jobs);
    let crashed = false;
    const checkpoint = vi
      .spyOn(jobs, 'checkpoint')
      .mockImplementation(async (job, stage, patch) => {
        if (stage === 'NARRATIVE_WRITER_RESULT' && !crashed) {
          crashed = true;
          throw new Error('Lost response before checkpoint');
        }
        await original(job, stage, patch);
      });
    await expect(processLifeJob(f.job, jobs, first.ai)).rejects.toThrow(
      'Lost response',
    );
    checkpoint.mockRestore();
    expect((await saved(f.job)).checkpoints.providerRequestCount).toBe(2);
    await expire(f.job);
    const recovered = (await jobs.claim())!,
      next = provider(f, recovered);
    await processLifeJob(recovered, jobs, next.ai);
    expect(first.parse.mock.calls.length + next.parse.mock.calls.length).toBe(
      5,
    );
    expect((await saved(f.job)).checkpoints.providerRequestCount).toBe(5);
    expect(
      await db.query('SELECT id FROM aw_budget_reservations WHERE job_id=$1', [
        f.job.id,
      ]),
    ).toHaveLength(5);
  });
  it('repairs a structurally valid but semantically invalid plan once before writing the chapter', async () => {
    const f = await fixture(),
      p = provider(f, f.job, (task, ordinal) => {
        if (task === 'life_narrative_plan' && ordinal === 1) {
          const wrong = structuredClone(f.plan.result);
          wrong.plan.scenes[0]!.eventIds = [randomUUID()];
          return wrong;
        }
        return defaultOutput(f, task);
      });
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse.mock.calls.map((call) => call[0].text.format.name)).toEqual([
      'life_narrative_plan',
      'life_narrative_plan',
      'life_narrative_chapter',
      'life_fidelity',
      'life_narrative_editor',
    ]);
    expect((await saved(f.job)).checkpoints.repairKind).toBe('narrative_plan');
    expect((await saved(f.job)).checkpoints.providerRequestCount).toBe(5);
  });
  it('refuses a second low-quality result without writing a period or hiding failed receipts', async () => {
    const f = await fixture(),
      p = provider(f, f.job, (task) => {
        if (task === 'life_narrative_editor') {
          const report = narrativeEditorialFixture();
          report.scores.prose = 3;
          return report;
        }
        return defaultOutput(f, task);
      });
    await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_QUALITY_FAILED',
    });
    expect(p.parse).toHaveBeenCalledTimes(7);
    expect((await saved(f.job)).checkpoints.receipts).toHaveLength(7);
    expect(
      await db.query('SELECT id FROM aw_periods WHERE user_id=$1', [f.owner]),
    ).toEqual([]);
  });
  it('charges transient retries as slots and cannot exceed seven when editorial repair no longer fits', async () => {
    const f = await fixture();
    let failures = 2;
    const p = provider(f, f.job, (task, ordinal) => {
      if (task === 'life_narrative_plan' && failures-- > 0)
        throw new SDK.InternalServerError(
          500,
          { message: 'Transient' },
          'Transient',
          new Headers({ 'retry-after': '0' }),
        );
      if (task === 'life_narrative_editor' && ordinal === 1) {
        const report = narrativeEditorialFixture();
        report.scores.sceneCraft = 3;
        return report;
      }
      return defaultOutput(f, task);
    });
    await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_REQUEST_LIMIT',
    });
    expect(p.parse).toHaveBeenCalledTimes(7);
    expect((await saved(f.job)).checkpoints.providerRequestCount).toBe(7);
    expect(
      await db.query('SELECT id FROM aw_budget_reservations WHERE job_id=$1', [
        f.job.id,
      ]),
    ).toHaveLength(7);
    expect(
      await db.query('SELECT id FROM aw_periods WHERE user_id=$1', [f.owner]),
    ).toEqual([]);
  });
  it('consumes an admitted slot conservatively when budget denies, without spending a funded attempt', async () => {
    const f = await fixture(),
      p = provider(f, f.job, undefined, 0);
    await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
      code: 'AI_BUDGET_EXCEEDED',
    });
    expect(p.parse).not.toHaveBeenCalled();
    const current = await saved(f.job);
    expect(current.checkpoints.providerRequestCount).toBe(1);
    expect(current.attempt).toBe(0);
  });
  it('serializes competing admissions, then refuses the eighth and an expired lease', async () => {
    const f = await fixture();
    await Promise.all([
      jobs.admitNarrativeRequest(f.job),
      jobs.admitNarrativeRequest(f.job),
    ]);
    expect((await saved(f.job)).checkpoints.providerRequestCount).toBe(2);
    for (let n = 2; n < 7; n++) await jobs.admitNarrativeRequest(f.job);
    await expect(jobs.admitNarrativeRequest(f.job)).rejects.toMatchObject({
      code: 'NARRATIVE_REQUEST_LIMIT',
    });
    await expire(f.job);
    await expect(jobs.admitNarrativeRequest(f.job)).rejects.toMatchObject({
      code: 'JOB_LEASE_LOST',
    });
  });
  it('commits a fully bound checkpoint after the funded attempt ceiling with no provider calls', async () => {
    const f = await fixture();
    await prepareNarrativeJobFixture(db, f.job, true);
    await db.query(
      "UPDATE aw_jobs SET status='queued',attempt=5,lease_token=NULL,lease_until=NULL WHERE id=$1",
      [f.job.id],
    );
    const reclaimed = (await jobs.claim())!;
    expect(reclaimed.id).toBe(f.job.id);
    const p = provider(f, reclaimed);
    await processLifeJob(reclaimed, jobs, p.ai);
    expect(p.parse).not.toHaveBeenCalled();
    expect((await saved(f.job)).status).toBe('completed');
  });
  it('does not accept forged true flags, modified chapter/memory or a different reference snapshot as ready', async () => {
    const f = await fixture();
    await prepareNarrativeJobFixture(db, f.job, true);
    const valid = structuredClone(f.job.checkpoints);
    expect(() =>
      validatedNarrativeCheckpoint(valid, f.job.payload),
    ).not.toThrow();
    const changed = structuredClone(valid);
    (changed.chapter as { body: string }).body += ' changed';
    expect(() =>
      validatedNarrativeCheckpoint(changed, f.job.payload),
    ).toThrow();
    const memory = structuredClone(f.job.payload);
    memory.narrativeContext!.memory.recentDecisionPatterns.push(
      'changed memory',
    );
    expect(() => validatedNarrativeCheckpoint(valid, memory)).toThrow();
    expect(() =>
      validatedNarrativeCheckpoint(
        {
          candidate: valid.candidate,
          chapter: valid.chapter,
          fidelityPassed: true,
          editorialPassed: true,
        },
        f.job.payload,
      ),
    ).toThrow();
    const refs = structuredClone(f.job.payload);
    refs.narrativeReferences!.usedThreadIds.push(randomUUID());
    expect(hash(refs.narrativeReferences)).not.toBe(
      hash(f.job.payload.narrativeReferences),
    );
    expect(() => validatedNarrativeCheckpoint(valid, refs)).toThrow();
    await db.query(
      "UPDATE aw_jobs SET status='queued',attempt=5,lease_token=NULL,lease_until=NULL,checkpoints=$2 WHERE id=$1",
      [f.job.id, JSON.stringify(changed)],
    );
    expect(await jobs.claim()).toBeNull();
    expect((await saved(f.job)).status).toBe('failed');
  });
  it('invalidates a changed cached body and regenerates only writer/fidelity/editor under the remaining slots', async () => {
    const f = await fixture();
    await prepareNarrativeJobFixture(db, f.job, true);
    (f.job.checkpoints.chapter as { body: string }).body += ' changed';
    await db.query('UPDATE aw_jobs SET checkpoints=$2 WHERE id=$1', [
      f.job.id,
      JSON.stringify(f.job.checkpoints),
    ]);
    const p = provider(f);
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse.mock.calls.map((call) => call[0].text.format.name)).toEqual([
      'life_narrative_chapter',
      'life_fidelity',
      'life_narrative_editor',
    ]);
    expect((await saved(f.job)).checkpoints.providerRequestCount).toBe(7);
  });
  it('blocks stale branch state and operator leases before reserving money or calling transport', async () => {
    const f = await fixture(),
      p = provider(f);
    await db.query('UPDATE aw_branches SET revision=revision+1 WHERE id=$1', [
      f.job.branch_id,
    ]);
    await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
      code: 'LIFE_REVISION_CONFLICT',
    });
    expect(p.parse).not.toHaveBeenCalled();
    expect((await saved(f.job)).checkpoints.repairUsed).not.toBe(true);
    const other = await fixture();
    other.job.checkpoints.catalogOperatorLease = { synthetic: true };
    await db.query('UPDATE aw_jobs SET checkpoints=$2 WHERE id=$1', [
      other.job.id,
      JSON.stringify(other.job.checkpoints),
    ]);
    const blocked = provider(other);
    await expect(
      processLifeJob(other.job, jobs, blocked.ai),
    ).rejects.toMatchObject({ code: 'NARRATIVE_CONTEXT_INVALID' });
    expect(blocked.parse).not.toHaveBeenCalled();
  });
});
