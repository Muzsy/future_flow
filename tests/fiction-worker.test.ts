import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import type OpenAI from 'openai';
import { OpenAiProvider } from '@future-flow/ai';
import {
  LifeRepository,
  LifeJobRepository,
  Repository,
  DatabaseAiBudget,
  personalFictionContext,
  personalNarrativeMemory,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import {
  DomainError,
  fictionAuthorRequest,
  hash,
  preparePublicEditorSource,
  type SnapshotSourcePeriod,
} from '@future-flow/core';
import { FICTION_MODE, type FictionAuthorResult } from '@future-flow/contracts';
import { applyMigrations } from '../scripts/lib/migrations';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { setupFixture } from './life-fixtures';
import { fictionFixture } from './fiction-fixtures';

let engine: PGlite, db: Database, jobs: LifeJobRepository, repo: Repository;
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
  const lives = new LifeRepository(
    db,
    { daily: 100, concurrent: 10 },
    { mode: FICTION_MODE, cohortUserIds: [owner] },
  );
  const created = await lives.create(owner, setupFixture(), randomUUID());
  const job = (await jobs.claim())!;
  return { owner, lives, created, job, f: fictionFixture(job.payload) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function provider(
  f: Fixture,
  respond?: (task: string, ordinal: number, output: unknown) => unknown,
  budgetUsd = 10,
) {
  const parse = vi.fn(
    async (
      request: { model: string; text: { format: { name: string } } },
      _options?: { timeout?: number },
    ) => {
      const task = request.text.format.name,
        ordinal = parse.mock.calls.filter(
          (c) => c[0].text.format.name === task,
        ).length;
      const output =
        task === 'life_narrative_plan'
          ? f.f.draft
          : task === 'life_narrative_chapter'
            ? f.f.authored
            : task === 'life_narrative_plan_review'
              ? f.f.review
              : task === 'life_fidelity'
                ? f.f.fidelity
                : f.f.editor;
      return {
        status: 'completed',
        model: request.model,
        output_parsed: respond
          ? respond(task, ordinal, structuredClone(output))
          : output,
        usage: { input_tokens: 10, output_tokens: 20 },
      };
    },
  );
  const ai = new OpenAiProvider(
    {
      apiKey: 'offline-fiction-only',
      eventModel: 'gpt-6.1-sol',
      storyModel: 'gpt-6.1-sol',
      checkModel: 'gpt-6.1-sol',
      timeoutMs: 1000,
      maxOutputTokens: 12000,
      beforePhysicalRequest: () => jobs.admitNarrativeRequest(f.job),
      guard: new DatabaseAiBudget(
        db,
        f.owner,
        f.job.id,
        { projectUsd: budgetUsd, userUsd: budgetUsd },
        f.job.lease_token,
      ),
    },
    { responses: { parse } } as unknown as OpenAI,
  );
  return { ai, parse };
}
async function saved(job: LifeJob) {
  return (
    await db.query<LifeJob>('SELECT * FROM aw_jobs WHERE id=$1', [job.id])
  )[0]!;
}

describe('creative final author package through real guarded provider and database', () => {
  it('makes five calls, reviews AFTER authoring and atomically saves new fictional outcomes', async () => {
    const f = await fixture(),
      p = provider(f);
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse.mock.calls.map((c) => c[0].text.format.name)).toEqual([
      'life_narrative_plan',
      'life_narrative_chapter',
      'life_narrative_plan_review',
      'life_fidelity',
      'life_narrative_editor',
    ]);
    const [period] = await db.query(
      'SELECT candidate,narrative_artifact FROM aw_periods WHERE id=$1',
      [f.job.payload.periodId],
    );
    expect(period!.candidate).toEqual(f.f.authored.candidate);
    expect(period!.candidate).not.toEqual(f.f.draft.candidate);
    expect(
      (period!.narrative_artifact as { storyFacts: unknown }).storyFacts,
    ).toEqual(f.f.authored.storyFacts);
    expect((await saved(f.job)).checkpoints.providerRequestCount).toBe(5);
    const request = p.parse.mock.calls[1]![0] as unknown as {
      text: {
        format: {
          schema: {
            properties: {
              plan: { properties: { decisionPattern: { pattern: string } } };
            };
          };
        };
      };
    };
    expect(
      request.text.format.schema.properties.plan.properties.decisionPattern
        .pattern,
    ).toContain('[a-z]');
    expect(
      p.parse.mock.calls.every((call) => call[1]?.timeout === 180000),
    ).toBe(true);
  });
  it('repairs prose once in eight calls and reuses the exact reviewed final material', async () => {
    const f = await fixture(),
      p = provider(f, (task, n, output) => {
        if (task === 'life_narrative_editor' && n === 1)
          return { ...f.f.editor, scores: { ...f.f.editor.scores, prose: 3 } };
        return output;
      });
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse).toHaveBeenCalledTimes(8);
    expect(
      p.parse.mock.calls.filter(
        (c) => c[0].text.format.name === 'life_narrative_plan_review',
      ),
    ).toHaveLength(1);
    expect((await saved(f.job)).status).toBe('completed');
  });
  it('allows one late structural repair, reruns final review and stays within nine calls', async () => {
    const f = await fixture(),
      p = provider(f, (task, n, output) => {
        if (task === 'life_narrative_editor' && n === 1)
          return {
            ...f.f.editor,
            issues: [
              {
                dimension: 'novelty',
                severity: 'major',
                repairScope: 'canon',
                paragraphIndex: null,
                eventIds: [],
                explanation:
                  'The final dilemma repeats the earlier decision without a consequence.',
                suggestedFix:
                  'Create a distinct new consequence within the existing user boundaries.',
              },
            ],
            verdict: 'revise',
          };
        return output;
      });
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse).toHaveBeenCalledTimes(9);
    expect(
      p.parse.mock.calls.filter(
        (c) => c[0].text.format.name === 'life_narrative_plan_review',
      ),
    ).toHaveLength(2);
  });
  it('stops after a second quality failure without a partial period', async () => {
    const f = await fixture(),
      p = provider(f, (task, _n, output) =>
        task === 'life_narrative_editor'
          ? { ...f.f.editor, scores: { ...f.f.editor.scores, sceneCraft: 3 } }
          : output,
      );
    await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_QUALITY_FAILED',
    });
    expect(p.parse).toHaveBeenCalledTimes(8);
    expect(
      await db.query('SELECT id FROM aw_periods WHERE id=$1', [
        f.job.payload.periodId,
      ]),
    ).toHaveLength(0);
  });
  it.each([
    'FICTION_DRAFT_RESULT',
    'FICTION_AUTHOR_RESULT',
    'FICTION_FINAL_REVIEW_RESULT',
    'FICTION_FIDELITY_RESULT',
    'FICTION_EDITOR_RESULT',
    'FICTION_READY_TO_COMMIT',
  ])(
    'resumes after %s without repeating saved provider work',
    async (stage) => {
      const f = await fixture(),
        p = provider(f),
        original = jobs.checkpoint.bind(jobs);
      let crashed = false;
      vi.spyOn(jobs, 'checkpoint').mockImplementation(async (job, s, patch) => {
        await original(job, s, patch);
        if (!crashed && s === stage) {
          crashed = true;
          throw new Error('Simulated crash');
        }
      });
      await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toThrow(
        'Simulated crash',
      );
      const callsBefore = p.parse.mock.calls.length;
      vi.restoreAllMocks();
      const recovered = await saved(f.job);
      f.job = recovered;
      await processLifeJob(recovered, jobs, p.ai);
      expect(callsBefore + p.parse.mock.calls.length).toBe(5);
      expect((await saved(recovered)).status).toBe('completed');
    },
  );
  it('blocks another physical call at the ceiling and monetary admission before transport', async () => {
    const f = await fixture(),
      p = provider(f);
    await jobs.checkpoint(f.job, 'TEST_CAP', { providerRequestCount: 9 });
    await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_REQUEST_LIMIT',
    });
    expect(p.parse).not.toHaveBeenCalled();
    const g = await fixture(),
      q = provider(g, undefined, 0);
    await expect(processLifeJob(g.job, jobs, q.ai)).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(q.parse).not.toHaveBeenCalled();
  });
  it('rejects a prose-only repair that changes a lasting fact', async () => {
    const f = await fixture(),
      p = provider(f, (task, n, output) => {
        if (task === 'life_narrative_editor' && n === 1)
          return { ...f.f.editor, scores: { ...f.f.editor.scores, prose: 3 } };
        if (task === 'life_narrative_chapter' && n === 2) {
          const a = output as FictionAuthorResult;
          a.storyFacts[0]!.assertion += ' Changed the actual drawing.';
          return a;
        }
        return output;
      });
    await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_QUALITY_FAILED',
    });
    expect(p.parse).toHaveBeenCalledTimes(6);
  });
  it('folds committed fiction into the next queued chapter and blocks incompatible fallback', async () => {
    const f = await fixture(),
      p = provider(f);
    await processLifeJob(f.job, jobs, p.ai);
    const detail = await f.lives.detail(f.owner, f.job.branch_id),
      decision = detail.branch.pending_decision!;
    await f.lives.choose(
      f.owner,
      detail.branch.id,
      detail.branch.revision,
      decision.id,
      decision.options[0]!.id,
      randomUUID(),
    );
    const ready = await f.lives.branch(f.owner, detail.branch.id);
    const legacy = new LifeRepository(db, { daily: 100, concurrent: 10 });
    await expect(
      legacy.continue(f.owner, ready.id, ready.revision, randomUUID()),
    ).rejects.toMatchObject({ code: 'NARRATIVE_CONTEXT_INVALID' });
    await f.lives.continue(f.owner, ready.id, ready.revision, randomUUID());
    const next = (await jobs.claim())!;
    expect(next.payload.narrativeContext?.policy.mode).toBe(FICTION_MODE);
    if (next.payload.narrativeContext?.policy.mode !== FICTION_MODE)
      throw Error();
    expect(next.payload.narrativeContext.storyFacts).toEqual(
      f.f.authored.storyFacts,
    );
    expect(
      hash(
        fictionAuthorRequest(next.payload, fictionFixture(next.payload).draft),
      ),
    ).not.toBe(hash(fictionAuthorRequest(f.job.payload, f.f.draft)));
  });
  it('does not load fiction assertions in withheld context', async () => {
    const f = await fixture(),
      p = provider(f);
    await processLifeJob(f.job, jobs, p.ai);
    const memory = await personalNarrativeMemory(
      db,
      f.owner,
      f.job.branch_id,
      1,
      [],
      true,
      true,
    );
    const spy = vi.spyOn(db, 'query');
    const c = await personalFictionContext(
      db,
      f.owner,
      f.job.branch_id,
      memory,
    );
    expect(c.storyFacts).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
  it('inherits only the owned fork prefix and remembers the alternative accepted option', async () => {
    const f = await fixture();
    await processLifeJob(f.job, jobs, provider(f).ai);
    const first = await f.lives.detail(f.owner, f.job.branch_id),
      decision = first.branch.pending_decision!;
    await f.lives.choose(
      f.owner,
      first.branch.id,
      first.branch.revision,
      decision.id,
      decision.options[0]!.id,
      randomUUID(),
    );
    const b = await f.lives.branch(f.owner, first.branch.id);
    await f.lives.continue(f.owner, b.id, b.revision, randomUUID());
    const secondJob = (await jobs.claim())!;
    const second = {
      ...f,
      job: secondJob,
      f: fictionFixture(secondJob.payload),
    };
    second.f.authored.storyFacts[0]!.supersedesFactId =
      f.f.authored.storyFacts[0]!.id;
    await processLifeJob(secondJob, jobs, provider(second).ai);
    const parent = await f.lives.branch(f.owner, b.id);
    const fork = await f.lives.fork(
      f.owner,
      b.id,
      f.job.payload.periodId,
      parent.revision,
      decision.options[1]!.id,
      randomUUID(),
    );
    const child = (await jobs.claim())!;
    expect(child.branch_id).toBe(fork.branchId);
    if (child.payload.narrativeContext?.policy.mode !== FICTION_MODE)
      throw Error();
    expect(child.payload.narrativeContext.storyFacts.map((x) => x.id)).toEqual(
      f.f.authored.storyFacts.map((x) => x.id),
    );
    expect(
      child.payload.fictionReferences!.facts.map((x) => x.id),
    ).not.toContain(second.f.authored.storyFacts[0]!.id);
    expect(
      child.payload.narrativeContext.memory.recentChoices.at(-1)!.optionId,
    ).toBe(decision.options[1]!.id);
    const childFixture = { ...f, job: child, f: fictionFixture(child.payload) };
    await processLifeJob(child, jobs, provider(childFixture).ai);
    expect((await f.lives.detail(f.owner, b.id)).periods).toHaveLength(2);
  });
  it('keeps fictional NPC provenance and voice across a subsequent queued period', async () => {
    const f = await fixture(),
      a = f.f.authored,
      id = randomUUID(),
      event = a.candidate.events[0]!;
    event.changes.push({
      type: 'actor_add',
      value: { id, label: 'Mara', relationship: 'other' },
    });
    event.actorIds.push(id);
    a.plan.scenes[0]!.actorIds.push(id);
    a.plan.memoryDelta.actorUpdates.push({
      actorId: id,
      introducedByEventId: event.id,
      role: 'A wholly fictional independent gallery organiser.',
      desire: 'Wants a clear small selection that visitors can read.',
      resistance: 'Dislikes having to explain every image to visitors.',
      voiceCue: 'Speaks in short concrete visual questions.',
      lastSeenPeriodId: a.candidate.periodId,
    });
    a.storyFacts[0]!.aboutActorIds = [id];
    await processLifeJob(f.job, jobs, provider(f).ai);
    const d = await f.lives.detail(f.owner, f.job.branch_id),
      decision = d.branch.pending_decision!;
    await f.lives.choose(
      f.owner,
      d.branch.id,
      d.branch.revision,
      decision.id,
      decision.options[0]!.id,
      randomUUID(),
    );
    const b = await f.lives.branch(f.owner, d.branch.id);
    await f.lives.continue(f.owner, b.id, b.revision, randomUUID());
    const job = (await jobs.claim())!;
    expect(
      job.payload.narrativeContext!.memory.fictionalActors[0]!.actorId,
    ).toBe(id);
    expect(
      job.payload.narrativeContext!.memory.fictionalActors[0]!.voiceCue,
    ).toContain('visual questions');
    expect(job.payload.input.initialState.actors.some((x) => x.id === id)).toBe(
      false,
    );
  });
  it('exports the correct artifact version only to its owner, excludes it from public preparation and deletes it', async () => {
    const f = await fixture();
    await processLifeJob(f.job, jobs, provider(f).ai);
    const own = await repo.exportAccount(f.owner);
    expect(own.narrativeArtifactVersion).toBe('2.0.0');
    expect(
      (own.aw_periods as { narrative_artifact: { storyFacts: unknown } }[])[0]!
        .narrative_artifact.storyFacts,
    ).toEqual(f.f.authored.storyFacts);
    const other = randomUUID();
    await repo.ensureUser(other);
    expect((await repo.exportAccount(other)).aw_periods).toEqual([]);
    const detail = await f.lives.detail(f.owner, f.job.branch_id);
    expect(detail.periods[0]).not.toHaveProperty('narrative_artifact');
    expect(detail.job).not.toHaveProperty('checkpoints');
    const publicSource = preparePublicEditorSource(
      detail.branch.input,
      detail.periods as unknown as SnapshotSourcePeriod[],
      detail.branch.revision,
    );
    expect(JSON.stringify(publicSource)).not.toContain(
      f.f.authored.storyFacts[0]!.id,
    );
    await repo.markDeleting(f.owner);
    await repo.deleteAccountData(f.owner);
    expect(
      await db.query('SELECT id FROM aw_periods WHERE user_id=$1', [f.owner]),
    ).toEqual([]);
  });
  it('rejects a creative checkpoint routed to the legacy path before transport', async () => {
    const f = await fixture(),
      p = provider(f);
    f.job.checkpoints.pipelineVersion = FICTION_MODE;
    delete f.job.payload.narrativeContext;
    await expect(processLifeJob(f.job, jobs, p.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_CONTEXT_INVALID',
    });
    expect(p.parse).not.toHaveBeenCalled();
  });
});
