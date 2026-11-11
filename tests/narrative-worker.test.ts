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
import {
  DomainError,
  hash,
  validatedNarrativeCheckpoint,
} from '@future-flow/core';
import { applyMigrations } from '../scripts/lib/migrations';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { setupFixture } from './life-fixtures';
import { prepareNarrativeJobFixture } from './narrative-storage-fixtures';
import {
  narrativeEditorialFixture,
  narrativePlanReviewFixture,
  narrativePlanReadinessFixture,
} from './narrative-plan-fixtures';
import {
  readyNarrativePolicy,
  reviewedNarrativePolicy,
} from '@future-flow/contracts';
import { lifeJobReadyToCommit } from '@future-flow/database';

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
        : task === 'life_narrative_plan_review'
          ? narrativePlanReviewFixture()
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
  it('stops a canon-dependent editorial failure without a prose repair and preserves the prior chapter and choice', async () => {
    const first = await fixture();
    await processLifeJob(first.job, jobs, provider(first).ai);
    const selected = new LifeRepository(
      db,
      { daily: 100, concurrent: 10 },
      { mode: 'narrative-v1', cohortUserIds: [first.owner] },
    );
    const detail = await selected.detail(first.owner, first.job.branch_id),
      decision = detail.branch.pending_decision!;
    await selected.choose(
      first.owner,
      first.job.branch_id,
      detail.branch.revision,
      decision.id,
      decision.options[0]!.id,
      randomUUID(),
    );
    const branch = await selected.branch(first.owner, first.job.branch_id);
    await selected.continue(
      first.owner,
      branch.id,
      branch.revision,
      randomUUID(),
    );
    const job = (await jobs.claim())!,
      f = {
        ...first,
        job,
        ...(await prepareNarrativeJobFixture(db, job, false)),
      };
    const p = provider(f, job, (task) => {
      if (task === 'life_narrative_editor') {
        const report = narrativeEditorialFixture();
        report.issues = [
          {
            dimension: 'momentum',
            severity: 'minor',
            repairScope: 'canon',
            paragraphIndex: 1,
            eventIds: [f.plan.candidate.events[0]!.id],
            explanation:
              'A different canonical outcome is required to create this stronger story beat.',
            suggestedFix:
              'Record a different event; prose alone must not fabricate this outcome.',
          },
        ];
        return report;
      }
      return defaultOutput(f, task);
    });
    await expect(processLifeJob(job, jobs, p.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_QUALITY_FAILED',
    });
    expect(p.parse).toHaveBeenCalledTimes(4);
    expect((await saved(job)).checkpoints.repairUsed).not.toBe(true);
    await jobs.fail(
      job,
      new DomainError('NARRATIVE_QUALITY_FAILED', 'Canon limitation'),
    );
    const after = await selected.detail(first.owner, branch.id);
    expect(after.periods).toHaveLength(1);
    expect(after.choices).toHaveLength(1);
    expect(after.periods[0]!.chapter).toEqual(first.chapter);
    expect(after.job!.retryAvailable).toBe(false);
    expect(after.job).not.toHaveProperty('checkpoints');
    expect(after.job).not.toHaveProperty('payload');
    await expect(
      selected.retry(first.owner, job.id, after.branch.revision, randomUUID()),
    ).rejects.toMatchObject({ code: 'LIFE_RETRY_UNAVAILABLE' });
    expect((await saved(job)).checkpoints.providerRequestCount).toBe(4);
  });
  it('offers a bounded retry after budget denial while retaining the already admitted request slot', async () => {
    const f = await fixture(),
      p = provider(f, f.job, undefined, 0);
    await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
      code: 'AI_BUDGET_EXCEEDED',
    });
    await jobs.fail(
      f.job,
      new DomainError('AI_BUDGET_EXCEEDED', 'Budget unavailable'),
    );
    const detail = await lives.detail(f.owner, f.job.branch_id);
    expect(detail.job!.retryAvailable).toBe(true);
    await lives.retry(f.owner, f.job.id, detail.branch.revision, randomUUID());
    const retried = (await jobs.claim())!;
    expect(retried.id).toBe(f.job.id);
    expect(retried.checkpoints.providerRequestCount).toBe(1);
    await processLifeJob(retried, jobs, provider(f, retried).ai);
    expect((await saved(retried)).checkpoints.providerRequestCount).toBe(5);
  });
  it('closes an exhausted partial job at claim without a provider request or a misleading retry', async () => {
    const f = await fixture();
    await db.query(
      "UPDATE aw_jobs SET status='queued',lease_token=NULL,lease_until=NULL,checkpoints=checkpoints||$2::jsonb WHERE id=$1",
      [f.job.id, JSON.stringify({ providerRequestCount: 7 })],
    );
    expect(await jobs.claim()).toBeNull();
    const current = await saved(f.job);
    expect(current.status).toBe('failed');
    expect(current.error_code).toBe('NARRATIVE_REQUEST_LIMIT');
    const detail = await lives.detail(f.owner, f.job.branch_id);
    expect(detail.job!.retryAvailable).toBe(false);
    await expect(
      lives.retry(f.owner, f.job.id, detail.branch.revision, randomUUID()),
    ).rejects.toMatchObject({ code: 'LIFE_RETRY_UNAVAILABLE' });
    expect(
      await db.query('SELECT id FROM aw_budget_reservations WHERE job_id=$1', [
        f.job.id,
      ]),
    ).toEqual([]);
  });
  it('still offers and commits a fully bound result at both ceilings without any new paid work', async () => {
    const f = await fixture();
    await prepareNarrativeJobFixture(db, f.job);
    await db.query(
      'UPDATE aw_jobs SET attempt=5,checkpoints=checkpoints||$2::jsonb WHERE id=$1',
      [f.job.id, JSON.stringify({ providerRequestCount: 7 })],
    );
    await jobs.fail(f.job, new Error('Interrupted before complete'));
    const detail = await lives.detail(f.owner, f.job.branch_id);
    expect(detail.job!.retryAvailable).toBe(true);
    await lives.retry(f.owner, f.job.id, detail.branch.revision, randomUUID());
    const ready = (await jobs.claim())!,
      p = provider(f, ready);
    await processLifeJob(ready, jobs, p.ai);
    expect(p.parse).not.toHaveBeenCalled();
    expect((await saved(ready)).status).toBe('completed');
    expect(
      await db.query('SELECT id FROM aw_budget_reservations WHERE job_id=$1', [
        f.job.id,
      ]),
    ).toEqual([]);
  });
  it('refuses a malformed persisted physical-request count at claim and in retry availability', async () => {
    const f = await fixture();
    await db.query(
      "UPDATE aw_jobs SET status='queued',lease_token=NULL,lease_until=NULL,checkpoints=checkpoints||$2::jsonb WHERE id=$1",
      [f.job.id, JSON.stringify({ providerRequestCount: null })],
    );
    expect(await jobs.claim()).toBeNull();
    expect((await saved(f.job)).error_code).toBe('NARRATIVE_CONTEXT_INVALID');
    expect(
      (await lives.detail(f.owner, f.job.branch_id)).job!.retryAvailable,
    ).toBe(false);
  });
});

async function reviewedFixture() {
  const f = await fixture();
  f.job.payload.narrativeContext!.policy = reviewedNarrativePolicy();
  await db.query('UPDATE aw_jobs SET payload=$2 WHERE id=$1', [
    f.job.id,
    JSON.stringify(f.job.payload),
  ]);
  return f;
}
describe('reviewed story plans before drafting', () => {
  it('makes five guarded calls and binds the passed plan review into the committed artifact', async () => {
    const f = await reviewedFixture(),
      p = provider(f);
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse.mock.calls.map(([r]) => r.text.format.name)).toEqual([
      'life_narrative_plan',
      'life_narrative_plan_review',
      'life_narrative_chapter',
      'life_fidelity',
      'life_narrative_editor',
    ]);
    const ready = validatedNarrativeCheckpoint(
      f.job.checkpoints,
      f.job.payload,
    );
    expect(ready.artifact.planningReview).toEqual(narrativePlanReviewFixture());
    expect(ready.artifact.provenance.receiptRefs).toHaveLength(5);
    expect(f.job.checkpoints.providerRequestCount).toBe(5);
    expect(ready.artifact.policy.maxPhysicalRequests).toBe(8);
  });
  it('replans after a failed computed review before paying for any prose', async () => {
    const f = await reviewedFixture();
    const p = provider(f, f.job, (task, ordinal) =>
      task === 'life_narrative_plan_review'
        ? ordinal === 1
          ? {
              ...narrativePlanReviewFixture(),
              scores: { ...narrativePlanReviewFixture().scores, novelty: 3 },
            }
          : narrativePlanReviewFixture()
        : task === 'life_narrative_plan'
          ? f.plan.result
          : task === 'life_narrative_chapter'
            ? f.chapter
            : task === 'life_fidelity'
              ? { valid: true, issues: [] }
              : narrativeEditorialFixture(),
    );
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse.mock.calls.map(([r]) => r.text.format.name)).toEqual([
      'life_narrative_plan',
      'life_narrative_plan_review',
      'life_narrative_plan',
      'life_narrative_plan_review',
      'life_narrative_chapter',
      'life_fidelity',
      'life_narrative_editor',
    ]);
    expect(f.job.checkpoints.repairUsed).toBe(true);
    expect(f.job.checkpoints.providerRequestCount).toBe(7);
  });
  it('stops a twice-failed plan review without a writer call or a committed period', async () => {
    const f = await reviewedFixture(),
      p = provider(f, f.job, (task) =>
        task === 'life_narrative_plan'
          ? f.plan.result
          : task === 'life_narrative_plan_review'
            ? {
                ...narrativePlanReviewFixture(),
                scores: { ...narrativePlanReviewFixture().scores, agency: 3 },
              }
            : f.chapter,
      );
    await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_QUALITY_FAILED',
    });
    expect(p.parse.mock.calls.map(([r]) => r.text.format.name)).toEqual([
      'life_narrative_plan',
      'life_narrative_plan_review',
      'life_narrative_plan',
      'life_narrative_plan_review',
    ]);
    expect(
      (await lives.detail(f.owner, f.created.branchId)).periods,
    ).toHaveLength(0);
  });
  it('rejects missing or forged review proof even at the request ceiling', async () => {
    const f = await reviewedFixture(),
      p = provider(f);
    await processLifeJob(f.job, jobs, p.ai);
    const valid = structuredClone(f.job.checkpoints);
    valid.providerRequestCount = 8;
    expect(lifeJobReadyToCommit(valid, f.job.payload)).toBe(true);
    for (const patch of [
      { planningReview: null },
      { planningReviewInputHash: hash('forged') },
      { planningReviewOutputHash: hash('forged') },
      {
        planningReview: {
          ...narrativePlanReviewFixture(),
          scores: { ...narrativePlanReviewFixture().scores, novelty: 3 },
        },
      },
    ]) {
      expect(
        lifeJobReadyToCommit(
          { ...valid, ...patch, planningReviewPassed: true },
          f.job.payload,
        ),
      ).toBe(false);
    }
  });
  it('reserves the eighth physical slot once and denies the ninth without changing old ceilings', async () => {
    const f = await reviewedFixture();
    f.job.checkpoints.providerRequestCount = 7;
    await db.query('UPDATE aw_jobs SET checkpoints=$2 WHERE id=$1', [
      f.job.id,
      JSON.stringify(f.job.checkpoints),
    ]);
    await jobs.admitNarrativeRequest(f.job);
    expect(f.job.checkpoints.providerRequestCount).toBe(8);
    await expect(jobs.admitNarrativeRequest(f.job)).rejects.toMatchObject({
      code: 'NARRATIVE_REQUEST_LIMIT',
    });
  });
});

describe('planning-review recovery and physical ceilings', () => {
  it('recovers a saved passed review without repeating either planning call', async () => {
    const f = await reviewedFixture(),
      first = provider(f),
      original = jobs.checkpoint.bind(jobs);
    const checkpoint = vi
      .spyOn(jobs, 'checkpoint')
      .mockImplementation(async (job, stage, patch) => {
        await original(job, stage, patch);
        if (stage === 'NARRATIVE_PLAN_REVIEW_RESULT')
          throw new Error('Injected review crash');
      });
    await expect(processLifeJob(f.job, jobs, first.ai)).rejects.toThrow(
      'Injected review crash',
    );
    checkpoint.mockRestore();
    await expire(f.job);
    const recovered = (await jobs.claim())!,
      next = provider(f, recovered);
    await processLifeJob(recovered, jobs, next.ai);
    expect(first.parse.mock.calls.length + next.parse.mock.calls.length).toBe(
      5,
    );
    expect(next.parse.mock.calls.map(([r]) => r.text.format.name)).toEqual([
      'life_narrative_chapter',
      'life_fidelity',
      'life_narrative_editor',
    ]);
  });
  it('fits one prose repair into eight calls while preserving the already passed plan review', async () => {
    const f = await reviewedFixture();
    const p = provider(f, f.job, (task, ordinal) =>
      task === 'life_narrative_plan_review'
        ? narrativePlanReviewFixture()
        : task === 'life_narrative_editor' && ordinal === 1
          ? {
              ...narrativeEditorialFixture(),
              scores: { ...narrativeEditorialFixture().scores, character: 3 },
            }
          : defaultOutput(f, task),
    );
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse).toHaveBeenCalledTimes(8);
    expect(
      p.parse.mock.calls.filter(
        ([r]) => r.text.format.name === 'life_narrative_plan_review',
      ),
    ).toHaveLength(1);
    expect(f.job.checkpoints.providerRequestCount).toBe(8);
  });
});

describe('planning-review integrity at recovery boundaries', () => {
  it('requires review capability before the first paid slot of a reviewed-policy job', async () => {
    const f = await reviewedFixture(),
      p = provider(f);
    p.ai.reviewNarrativePlan = undefined as never;
    await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
      code: 'AI_NOT_CONFIGURED',
    });
    expect(p.parse).not.toHaveBeenCalled();
    expect(f.job.checkpoints.providerRequestCount).toBeUndefined();
  });
  it('rechecks a stale saved review while retaining the valid original proposal', async () => {
    const f = await reviewedFixture(),
      first = provider(f),
      original = jobs.checkpoint.bind(jobs);
    const checkpoint = vi
      .spyOn(jobs, 'checkpoint')
      .mockImplementation(async (job, stage, patch) => {
        await original(job, stage, patch);
        if (stage === 'NARRATIVE_PLAN_REVIEW_RESULT')
          throw new Error('Injected review crash');
      });
    await expect(processLifeJob(f.job, jobs, first.ai)).rejects.toThrow(
      'Injected review crash',
    );
    checkpoint.mockRestore();
    await expire(f.job);
    await db.query(
      'UPDATE aw_jobs SET checkpoints=checkpoints||$2::jsonb WHERE id=$1',
      [f.job.id, JSON.stringify({ planningReviewOutputHash: hash('stale') })],
    );
    const recovered = (await jobs.claim())!,
      next = provider(f, recovered);
    await processLifeJob(recovered, jobs, next.ai);
    expect(next.parse.mock.calls.map(([r]) => r.text.format.name)).toEqual([
      'life_narrative_plan_review',
      'life_narrative_chapter',
      'life_fidelity',
      'life_narrative_editor',
    ]);
    expect(recovered.checkpoints.providerRequestCount).toBe(6);
  });
  it('commits a fully bound reviewed result at both ceilings without a provider repeat', async () => {
    const f = await reviewedFixture(),
      first = provider(f),
      original = jobs.checkpoint.bind(jobs);
    const checkpoint = vi
      .spyOn(jobs, 'checkpoint')
      .mockImplementation(async (job, stage, patch) => {
        await original(job, stage, patch);
        if (stage === 'NARRATIVE_READY_TO_COMMIT')
          throw new Error('Injected ready crash');
      });
    await expect(processLifeJob(f.job, jobs, first.ai)).rejects.toThrow(
      'Injected ready crash',
    );
    checkpoint.mockRestore();
    await expire(f.job);
    await db.query(
      'UPDATE aw_jobs SET attempt=5,checkpoints=checkpoints||\'{"providerRequestCount":8}\'::jsonb WHERE id=$1',
      [f.job.id],
    );
    const recovered = (await jobs.claim())!,
      next = provider(f, recovered);
    await processLifeJob(recovered, jobs, next.ai);
    expect(next.parse).not.toHaveBeenCalled();
    expect((await saved(recovered)).status).toBe('completed');
  });
});

describe('readiness failures before a paid writer slot', () => {
  async function readyFixture() {
    const f = await reviewedFixture();
    f.job.payload.narrativeContext!.policy = readyNarrativePolicy();
    await db.query('UPDATE aw_jobs SET payload=$2 WHERE id=$1', [
      f.job.id,
      JSON.stringify(f.job.payload),
    ]);
    return f;
  }
  it.each([
    'summariesComplete',
    'decisionPatternComplete',
    'periodDevelopmentSufficient',
  ] as const)(
    'never drafts or commits a plan with %s=false, even after its one repair',
    async (flag) => {
      const f = await readyFixture();
      const report = narrativePlanReadinessFixture();
      report.readiness[flag] = false;
      const p = provider(f, f.job, (task) =>
        task === 'life_narrative_plan'
          ? f.plan.result
          : task === 'life_narrative_plan_review'
            ? report
            : f.chapter,
      );
      await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
        code: 'NARRATIVE_QUALITY_FAILED',
      });
      expect(p.parse.mock.calls.map(([r]) => r.text.format.name)).toEqual([
        'life_narrative_plan',
        'life_narrative_plan_review',
        'life_narrative_plan',
        'life_narrative_plan_review',
      ]);
      expect(f.job.checkpoints.repairUsed).toBe(true);
      expect(f.job.checkpoints.providerRequestCount).toBe(4);
      expect(
        (await lives.detail(f.owner, f.created.branchId)).periods,
      ).toHaveLength(0);
    },
  );
  it('rechecks a repaired plan and commits only after readiness passes, without changing limits', async () => {
    const f = await readyFixture();
    const p = provider(f, f.job, (task, ordinal) =>
      task === 'life_narrative_plan'
        ? f.plan.result
        : task === 'life_narrative_plan_review'
          ? {
              ...narrativePlanReadinessFixture(),
              readiness: {
                ...narrativePlanReadinessFixture().readiness,
                summariesComplete: ordinal > 1,
              },
            }
          : task === 'life_narrative_chapter'
            ? f.chapter
            : task === 'life_fidelity'
              ? { valid: true, issues: [] }
              : narrativeEditorialFixture(),
    );
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse.mock.calls.map(([r]) => r.text.format.name)).toEqual([
      'life_narrative_plan',
      'life_narrative_plan_review',
      'life_narrative_plan',
      'life_narrative_plan_review',
      'life_narrative_chapter',
      'life_fidelity',
      'life_narrative_editor',
    ]);
    const ready = validatedNarrativeCheckpoint(
      f.job.checkpoints,
      f.job.payload,
    );
    expect(ready.artifact.planningReview).toEqual(
      narrativePlanReadinessFixture(),
    );
    expect(f.job.checkpoints.providerRequestCount).toBe(7);
    expect(ready.artifact.policy.maxPhysicalRequests).toBe(8);
    expect(ready.artifact.policy.maxContentRepairs).toBe(1);
    const badArtifact = {
      ...ready.artifact,
      planningReview: narrativePlanReviewFixture(),
    };
    const { narrativeArtifactSchema } = await import('@future-flow/contracts');
    expect(narrativeArtifactSchema.safeParse(badArtifact).success).toBe(false);
  });
});
