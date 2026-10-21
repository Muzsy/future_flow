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
import type OpenAI from 'openai';
import { OpenAiProvider } from '@future-flow/ai';
import {
  DatabaseAiBudget,
  LifeJobRepository,
  LifeRepository,
  Repository,
  narrativeConfigFromEnv,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import { DomainError, hash } from '@future-flow/core';
import {
  FICTION_CHARACTER_VERSION,
  FICTION_MODE,
  fictionArtifactSchema,
  fictionContextSchema,
  fictionV9Policy,
  type FictionAuthorResult,
  type FictionCharacterDelta,
  type FictionCharacterEnvelope,
} from '@future-flow/contracts';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  replayFailedCommit,
  replayJobOn,
} from '../scripts/lib/narrative-commit-replay';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { failureDiagnostic } from '../scripts/lib/narrative-failure-diagnostic';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { setupFixture } from './life-fixtures';
import {
  fictionFixture,
  fictionFixtureCharacterDelta,
} from './fiction-fixtures';

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

type Generation = 'v8' | 'v9';
const configFor = (owner: string, generation: Generation) => ({
  mode: FICTION_MODE,
  cohortUserIds: [owner],
  ...(generation === 'v9' ? { fictionGeneration: 'v9' as const } : {}),
});
async function fixture(generation: Generation = 'v9') {
  const owner = randomUUID();
  await repo.ensureUser(owner);
  await repo.acceptPrivacy(owner);
  const lives = new LifeRepository(
    db,
    { daily: 100, concurrent: 10 },
    configFor(owner, generation),
  );
  const created = await lives.create(owner, setupFixture(), randomUUID());
  const job = (await jobs.claim())!;
  return { owner, lives, created, job, f: fictionFixture(job.payload) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Authored = FictionAuthorResult & { characterDelta: FictionCharacterDelta };
function provider(
  f: Fixture,
  respond?: (task: string, ordinal: number, output: unknown) => unknown,
) {
  const parse = vi.fn(
    async (request: { model: string; text: { format: { name: string } } }) => {
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
        { projectUsd: 10, userUsd: 10 },
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
async function artifactOf(periodId: string) {
  const [row] = await db.query<{ narrative_artifact: unknown }>(
    'SELECT narrative_artifact FROM aw_periods WHERE id=$1',
    [periodId],
  );
  return fictionArtifactSchema.parse(row!.narrative_artifact);
}
const envelopeOf = (job: LifeJob) =>
  job.payload.fictionCharacters as FictionCharacterEnvelope;

// The author introduces one durable fictional person with a profile, a changed
// state and a relationship, so the next period can fold and project her.
function introduce(f: Fixture, actorId: string) {
  const authored = f.f.authored as Authored,
    event = authored.candidate.events[0]!;
  event.changes.push({
    type: 'actor_add',
    value: { id: actorId, label: 'Odile', relationship: 'friend' },
  });
  event.actorIds.push(actorId);
  const periodId = f.job.payload.periodId;
  authored.characterDelta = {
    ...fictionFixtureCharacterDelta(periodId, authored),
    dynamicUpdates: [
      {
        actorId,
        currentAim: 'Keeping the coming weekend free.',
        currentPressure: 'A double shift is coming up this month.',
        attentionOn: 'her own schedule',
        stanceTowardProtagonist:
          'Still likes the protagonist, wary of art talk.',
        unresolvedMatter: 'Protagonist turns casual meetings into art reviews.',
        lastMeaningfulChangePeriodId: periodId,
        provenance: 'branch_fiction',
      },
    ],
    relationshipUpdates: [
      {
        actorId,
        currentDynamic:
          'Warm friendship, but art feedback now dominates meetings.',
        expectation:
          'Expects ordinary shared time, not another structured critique.',
        unresolvedInteraction:
          'Protagonist over-explained a small disagreement.',
        provenance: 'interaction_derived',
      },
    ],
  } as FictionCharacterDelta;
}
async function nextPeriod(f: Fixture) {
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
  const job = (await jobs.claim())!;
  return { ...f, job, f: fictionFixture(job.payload), branch: b, decision };
}

describe('living-world generation through the real guarded provider and database', () => {
  it('is selected only explicitly and queues the v9 policy with its character envelope', async () => {
    const v8 = await fixture('v8');
    expect(v8.job.payload.narrativeContext!.policy.qualityPolicyVersion).toBe(
      '2.7.0',
    );
    expect(v8.job.payload.fictionCharacters).toBeUndefined();
    expect(
      fictionContextSchema.parse(v8.job.payload.narrativeContext)
        .characterProjection,
    ).toBeUndefined();
    const v9 = await fixture('v9');
    expect(v9.job.payload.narrativeContext!.policy).toEqual(fictionV9Policy());
    expect(envelopeOf(v9.job).state.actors).toEqual([]);
    expect(
      fictionContextSchema.parse(v9.job.payload.narrativeContext)
        .characterProjection,
    ).toEqual({
      version: FICTION_CHARACTER_VERSION,
      actors: [],
      omittedActors: 0,
    });
  });

  it('keeps the five-call stage graph, binds the delta and never sends the envelope to the model', async () => {
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
    expect((await saved(f.job)).status).toBe('completed');
    expect(
      p.parse.mock.calls.every(
        (c) => !JSON.stringify(c[0]).includes('fictionCharacters'),
      ),
    ).toBe(true);
    // Output limits are measured before they change (plan section 47).
    const limits = p.parse.mock.calls.map(
      (c) =>
        (c[0] as unknown as { max_output_tokens: number }).max_output_tokens,
    );
    expect(limits).toEqual([6500, 12000, 6500, 6500, 6500]);
    const artifact = await artifactOf(f.job.payload.periodId);
    expect(artifact.policy).toEqual(fictionV9Policy());
    expect(artifact.characterDelta).toEqual(
      (f.f.authored as Authored).characterDelta,
    );
    expect(artifact.bindings.characterStateHash).toBe(
      hash(envelopeOf(f.job).state),
    );
  });

  it('folds the committed delta into the next period and only a fork prefix is shared', async () => {
    const f = await fixture(),
      actorId = randomUUID();
    introduce(f, actorId);
    await processLifeJob(f.job, jobs, provider(f).ai);
    expect((await saved(f.job)).status).toBe('completed');
    const second = await nextPeriod(f),
      state = envelopeOf(second.job).state;
    expect(state.ownedPeriods).toBe(1);
    const entry = state.actors.find((a) => a.actorId === actorId)!;
    expect(entry.profile?.establishedAtPeriodId).toBe(f.job.payload.periodId);
    expect(
      fictionContextSchema
        .parse(second.job.payload.narrativeContext)
        .characterProjection!.actors.map((a) => a.actorId),
    ).toEqual([actorId]);
    // The second chapter changes her state again.
    const authored = second.f.authored as Authored;
    authored.characterDelta = {
      ...authored.characterDelta,
      dynamicUpdates: [
        {
          ...entry.dynamic!,
          currentAim: 'Finding someone to cover the double shift.',
          lastMeaningfulChangePeriodId: second.job.payload.periodId,
        },
      ],
    };
    await processLifeJob(second.job, jobs, provider(second).ai);
    expect((await saved(second.job)).status).toBe('completed');
    // Fork back to the first period: the child shares that prefix only.
    const parent = await f.lives.branch(f.owner, second.branch.id);
    const fork = await f.lives.fork(
      f.owner,
      second.branch.id,
      f.job.payload.periodId,
      parent.revision,
      second.decision.options[1]!.id,
      randomUUID(),
    );
    const child = (await jobs.claim())!;
    expect(child.branch_id).toBe(fork.branchId);
    const childEntry = envelopeOf(child).state.actors.find(
      (a) => a.actorId === actorId,
    )!;
    expect(childEntry.dynamic?.currentAim).toBe(entry.dynamic!.currentAim);
    expect(childEntry.dynamic?.currentAim).not.toBe(
      'Finding someone to cover the double shift.',
    );
    expect(envelopeOf(child).state.ownedPeriods).toBe(1);
  });

  it('commits a chapter whose planner gave continuity decisions, bound to the review that saw them', async () => {
    // The review request carries the decisions, so every place that hashes it
    // (receipt, binding, resume, prose-only reuse) has to pass the same draft.
    const f = await fixture(),
      actorId = randomUUID();
    introduce(f, actorId);
    await processLifeJob(f.job, jobs, provider(f).ai);
    const second = await nextPeriod(f);
    const draft = second.f.draft as {
      characterIntent: unknown[];
      continuityDecisions: unknown[];
    };
    draft.continuityDecisions = [
      {
        actorId,
        decision: 'defer',
        reason: 'The double shift stays offstage.',
      },
    ];
    const p = provider(second);
    await processLifeJob(second.job, jobs, p.ai);
    expect((await saved(second.job)).status).toBe('completed');
    const reviewCall = p.parse.mock.calls
      .map(
        (c) => c[0] as { text: { format: { name: string } }; input: unknown },
      )
      .find((c) => c.text.format.name === 'life_narrative_plan_review')!;
    expect(JSON.stringify(reviewCall.input)).toContain('continuityDecisions');
    const artifact = await artifactOf(second.job.payload.periodId);
    expect(artifact.bindings.reviewInputHash).toBeTruthy();
  });

  // A job that stops after its last checkpoint, like the failed live run, and
  // has used all its physical requests.
  async function failAfterLastCheckpoint(f: Fixture) {
    const real = jobs.checkpoint.bind(jobs);
    vi.spyOn(jobs, 'checkpoint').mockImplementation(
      async (job, stage, patch) => {
        if (stage === 'FICTION_READY_TO_COMMIT')
          throw new DomainError(
            'NARRATIVE_CONTEXT_INVALID',
            'Injected failure.',
          );
        return real(job, stage, patch);
      },
    );
    const error = await processLifeJob(f.job, jobs, provider(f).ai).catch(
      (e: unknown) => e,
    );
    vi.restoreAllMocks();
    await jobs.fail(f.job, error);
    await db.query(
      'UPDATE aw_jobs SET checkpoints=checkpoints||\'{"providerRequestCount":9}\'::jsonb WHERE id=$1',
      [f.job.id],
    );
  }

  it('replays a job that failed after its last checkpoint without any model call', async () => {
    const f = await fixture();
    await failAfterLastCheckpoint(f);
    const failed = await saved(f.job);
    expect(failed.status).toBe('failed');
    expect(failed.error_code).toBe('NARRATIVE_CONTEXT_INVALID');
    expect(failed.stage).toBe('FICTION_EDITOR_RESULT');
    // The checkpoints serve every stage, so the replay commits the job even
    // though it used all its requests (a normal claim would refuse it).
    const replay = await replayJobOn(db, f.job.id);
    expect(replay).toMatchObject({
      outcome: 'committed',
      stage: 'FICTION_EDITOR_RESULT',
      providerRequestCount: 9,
      failure: null,
    });
    expect((await saved(f.job)).status).toBe('completed');
  });

  it('replays a saved state directory on a copy, and swaps it in place only when asked and only if it commits', async () => {
    const base = mkdtempSync(join(tmpdir(), 'alterward-replay-test-'));
    const stateDir = join(base, 'state');
    const mem = { engine, db, jobs, repo };
    let failedId: string;
    try {
      // A real on-disk state with one job that failed after its last checkpoint.
      engine = new PGlite(stateDir);
      await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
      await applyMigrations(engine);
      db = adapter(engine);
      jobs = new LifeJobRepository(db);
      repo = new Repository(db);
      const f = await fixture();
      await failAfterLastCheckpoint(f);
      failedId = f.job.id;
      await engine.close();
    } finally {
      ({ engine, db, jobs, repo } = mem);
    }
    const status = async () => {
      const disk = new PGlite(stateDir);
      try {
        const rows = (
          await disk.query<{ status: string }>(
            'SELECT status FROM aw_jobs WHERE id=$1',
            [failedId],
          )
        ).rows;
        return rows[0]!.status;
      } finally {
        await disk.close();
      }
    };
    try {
      // Default: the original directory is left exactly as it was.
      const dry = await replayFailedCommit({ stateDir });
      expect(dry).toMatchObject({ outcome: 'committed', wroteState: false });
      expect(await status()).toBe('failed');
      // In place: the original is kept as .bak, the new state takes its place.
      const live = await replayFailedCommit({ stateDir, inPlace: true });
      expect(live).toMatchObject({ outcome: 'committed', wroteState: true });
      expect(await status()).toBe('completed');
      expect(existsSync(`${stateDir}.bak`)).toBe(true);
      expect(existsSync(`${stateDir}.replayed`)).toBe(false);
      // A second in-place run refuses to clobber the earlier backup.
      await expect(
        replayFailedCommit({ stateDir, inPlace: true, jobId: failedId }),
      ).rejects.toThrow('already exists');
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }, 60000);

  it('says so when a replay would need a model call, instead of failing as a content error', async () => {
    const f = await fixture();
    await failAfterLastCheckpoint(f);
    await db.query(
      'UPDATE aw_jobs SET checkpoints=checkpoints||\'{"fictionAuthor":null}\'::jsonb WHERE id=$1',
      [f.job.id],
    );
    const replay = await replayJobOn(db, f.job.id);
    expect(replay.outcome).toBe('needs_model_call');
    // The job used all its requests, so the ceiling stops the call first.
    expect(replay.failure?.code).toBe('NARRATIVE_REQUEST_LIMIT');
  });

  it('keeps the validator message and the throwing frames of a failure', () => {
    const d = failureDiagnostic(
      new DomainError(
        'NARRATIVE_CONTEXT_INVALID',
        'Fiction receipt binding or final-stage order differs.',
      ),
    );
    expect(d.code).toBe('NARRATIVE_CONTEXT_INVALID');
    expect(d.message).toContain('receipt binding');
    expect(d.frames.length).toBeGreaterThan(0);
    expect(d.frames.length).toBeLessThanOrEqual(5);
    expect(failureDiagnostic(new Error('x'.repeat(900))).message).toHaveLength(
      400,
    );
    expect(failureDiagnostic('plain').code).toBe('JOB_FAILED');
  });

  it('refuses a tampered or stale envelope before any call and commits nothing', async () => {
    const f = await fixture();
    const forged = structuredClone(f.job.payload);
    forged.fictionCharacters!.suppliedActorIds = [randomUUID()];
    await db.query('UPDATE aw_jobs SET payload=$2 WHERE id=$1', [
      f.job.id,
      JSON.stringify(forged),
    ]);
    const tampered = await saved(f.job),
      p = provider({ ...f, job: tampered });
    await expect(processLifeJob(tampered, jobs, p.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_CONTEXT_INVALID',
    });
    expect(p.parse).not.toHaveBeenCalled();
    const [period] = await db.query('SELECT id FROM aw_periods WHERE id=$1', [
      f.job.payload.periodId,
    ]);
    expect(period).toBeUndefined();
  });

  it('refuses a job whose owned prefix no longer folds to its envelope', async () => {
    const f = await fixture(),
      actorId = randomUUID();
    introduce(f, actorId);
    await processLifeJob(f.job, jobs, provider(f).ai);
    const second = await nextPeriod(f);
    expect(envelopeOf(second.job).state.actors).toHaveLength(1);
    // The stored delta of the first period changes after the job was queued
    // (canonical rows are immutable, so the trigger is bypassed for the probe).
    await engine.exec(
      `SET session_replication_role = replica;
       UPDATE aw_periods SET narrative_artifact=jsonb_set(narrative_artifact,'{characterDelta,dynamicUpdates}','[]'::jsonb) WHERE id='${f.job.payload.periodId}';
       SET session_replication_role = origin;`,
    );
    const p = provider(second);
    await expect(processLifeJob(second.job, jobs, p.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_CONTEXT_INVALID',
    });
    expect(p.parse).not.toHaveBeenCalled();
  });

  it('repairs an author package whose delta lacks the new actor profile and commits only the valid one', async () => {
    const f = await fixture(),
      actorId = randomUUID();
    introduce(f, actorId);
    const good = f.f.authored as Authored,
      p = provider(f, (task, n, output) => {
        if (task === 'life_narrative_chapter' && n === 1) {
          const bad = structuredClone(output) as Authored;
          bad.characterDelta = {
            ...bad.characterDelta,
            addedProfiles: [],
            dynamicUpdates: [],
            relationshipUpdates: [],
          };
          return bad;
        }
        return output;
      });
    await processLifeJob(f.job, jobs, p.ai);
    expect((await saved(f.job)).status).toBe('completed');
    expect(p.parse.mock.calls.length).toBeLessThanOrEqual(9);
    expect(
      p.parse.mock.calls.filter(
        (c) => c[0].text.format.name === 'life_narrative_chapter',
      ).length,
    ).toBe(2);
    const artifact = await artifactOf(f.job.payload.periodId);
    expect(artifact.characterDelta).toEqual(good.characterDelta);
  });

  it('never lets a v8 continuation silently drop the character state', async () => {
    const f = await fixture('v9');
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
    const v8 = new LifeRepository(
      db,
      { daily: 100, concurrent: 10 },
      configFor(f.owner, 'v8'),
    );
    await expect(
      v8.continue(f.owner, b.id, b.revision, randomUUID()),
    ).rejects.toMatchObject({ code: 'NARRATIVE_CONTEXT_INVALID' });
  });

  it('seeds a v9 continuation of a v8 life from recorded legacy fields only', async () => {
    const f = await fixture('v8');
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
    const v9 = new LifeRepository(
      db,
      { daily: 100, concurrent: 10 },
      configFor(f.owner, 'v9'),
    );
    await v9.continue(f.owner, b.id, b.revision, randomUUID());
    const job = (await jobs.claim())!;
    const state = envelopeOf(job).state;
    expect(job.payload.narrativeContext!.policy).toEqual(fictionV9Policy());
    expect(state.ownedPeriods).toBe(1);
    for (const entry of state.actors) {
      expect(entry.legacy).not.toBeNull();
      expect(entry.profile).toBeNull();
      expect(entry.dynamic).toBeNull();
    }
  });
});

describe('a v8 life continued under v9', () => {
  it('shows a carried-over person through the recorded legacy view and accepts state for them', async () => {
    const f = await fixture('v8'),
      a = f.f.authored,
      actorId = randomUUID(),
      event = a.candidate.events[0]!;
    event.changes.push({
      type: 'actor_add',
      value: { id: actorId, label: 'Mara', relationship: 'other' },
    });
    event.actorIds.push(actorId);
    a.plan.scenes[0]!.actorIds.push(actorId);
    a.plan.memoryDelta.actorUpdates.push({
      actorId,
      introducedByEventId: event.id,
      role: 'A wholly fictional independent gallery organiser.',
      desire: 'Wants a clear small selection that visitors can read.',
      resistance: 'Dislikes having to explain every image to visitors.',
      voiceCue: 'Speaks in short concrete visual questions.',
      lastSeenPeriodId: a.candidate.periodId,
    });
    a.plan.memoryDelta.threadUpdates = [
      {
        id: randomUUID(),
        originPeriodId: a.candidate.periodId,
        originEventId: event.id,
        kind: 'goal',
        summary:
          'A concrete open question from the new encounter remains unresolved.',
        status: 'open',
        dueByPeriodOffset: 2,
        lastTouchedPeriodId: a.candidate.periodId,
        eventRefs: [event.id],
      },
    ];
    a.storyFacts[0]!.aboutActorIds = [actorId];
    await processLifeJob(f.job, jobs, provider(f).ai);
    expect((await saved(f.job)).status).toBe('completed');
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
    const v9 = new LifeRepository(
      db,
      { daily: 100, concurrent: 10 },
      configFor(f.owner, 'v9'),
    );
    await v9.continue(f.owner, b.id, b.revision, randomUUID());
    const job = (await jobs.claim())!;
    const entry = envelopeOf(job).state.actors.find(
      (x) => x.actorId === actorId,
    )!;
    expect(entry.legacy?.role).toContain('gallery organiser');
    expect(entry.profile).toBeNull();
    // The recorded fields reach the model, and nothing else was invented.
    const shown = job.payload.narrativeContext!.characterProjection!.actors;
    expect(shown.map((x) => x.actorId)).toEqual([actorId]);
    expect(shown[0]).toMatchObject({
      profile: null,
      dynamic: null,
      legacy: { voiceCue: 'Speaks in short concrete visual questions.' },
    });
    // The next chapter may record state for them without a profile.
    const next = fictionFixture(job.payload);
    const authored = next.authored as Authored;
    authored.characterDelta = {
      ...fictionFixtureCharacterDelta(job.payload.periodId, authored),
      relationshipUpdates: [
        {
          actorId,
          currentDynamic: 'Careful collaboration that still leaves space.',
          expectation: 'Expects the protagonist to listen to her reading.',
          unresolvedInteraction: null,
          provenance: 'interaction_derived',
        },
      ],
    } as FictionCharacterDelta;
    const second = { ...f, job, f: next };
    await processLifeJob(job, jobs, provider(second).ai);
    expect((await saved(job)).status).toBe('completed');
    const stored = await artifactOf(job.payload.periodId);
    expect(
      (stored as unknown as { characterDelta: FictionCharacterDelta })
        .characterDelta.relationshipUpdates,
    ).toHaveLength(1);
  });
});

type ProviderOf = ReturnType<typeof provider>;
const stageNames = (p: ProviderOf) =>
  p.parse.mock.calls.map((c) => c[0].text.format.name);
// The repair message the repairing author was given (the last request).
function repairMessageOf(p: ProviderOf) {
  const raw = p.parse.mock.calls.at(-1)![0] as unknown as {
    input: { role: string; content: string }[];
  };
  return JSON.parse(raw.input.find((i) => i.role === 'user')!.content)
    .authorRepair as { mode: string; message: string; repairRule?: string };
}
const failedFidelity = (reason: string) => ({
  valid: false,
  issues: [{ chapterNo: 1, reason }],
});
function failingEditor(
  f: Fixture,
  issues: Partial<
    Authored['chapter'] & {
      dimension: string;
      severity: string;
      repairScope: string;
      explanation: string;
      suggestedFix: string;
    }
  >[],
) {
  return {
    ...f.f.editor,
    verdict: 'revise' as const,
    sequenceReview: { ...f.f.editor.sequenceReview, distinctEnding: false },
    issues: issues.map((issue) => ({
      dimension: 'choiceStakes',
      severity: 'minor',
      repairScope: 'prose',
      paragraphIndex: 1,
      eventIds: [],
      explanation: 'The stakes only live in the structured decision.',
      suggestedFix: 'Show the cost of the commitment inside the scene itself.',
      ...issue,
    })),
  };
}
const PLAN_STAGES = [
  'life_narrative_plan',
  'life_narrative_chapter',
  'life_narrative_plan_review',
  'life_fidelity',
];
const rowsOf = (f: Fixture) =>
  db.query('SELECT id FROM aw_periods WHERE id=$1', [f.job.payload.periodId]);

describe('v9 repairs a fidelity failure before reading the editor', () => {
  it('makes a fidelity-triggered chapter eight calls with the plain fidelity message', async () => {
    const f = await fixture();
    const p = provider(f, (task, n, output) =>
      task === 'life_fidelity' && n === 1
        ? failedFidelity('REGISTER_ATTENDANT: register the attendant.')
        : output,
    );
    await processLifeJob(f.job, jobs, p.ai);
    expect(stageNames(p)).toEqual([
      ...PLAN_STAGES,
      'life_narrative_chapter',
      'life_narrative_plan_review',
      'life_fidelity',
      'life_narrative_editor',
    ]);
    const done = await saved(f.job);
    expect(done.status).toBe('completed');
    expect(done.checkpoints.repairUsed).toBe(true);
    expect(done.checkpoints.providerRequestCount).toBe(8);
    const repairs = p.parse.mock.calls
      .map((c) =>
        JSON.parse(c[0].input.find((i) => i.role === 'user')!.content),
      )
      .filter((m) => m.authorRepair);
    expect(repairs).toHaveLength(1);
    const feedback = repairs[0].authorRepair;
    expect(feedback.mode).toBe('author_package');
    expect(feedback.message).toBe(
      'Correct the final package/prose discrepancy: REGISTER_ATTENDANT: register the attendant.',
    );
    expect(feedback.message).not.toContain('Fix BOTH');
    // The editor was called once, on the repaired package.
    expect(
      p.parse.mock.calls.filter(
        (c) => c[0].text.format.name === 'life_narrative_editor',
      ),
    ).toHaveLength(1);
  });

  it('judges the repaired package once: an editor revise or a repeated fidelity failure ends the job', async () => {
    const f = await fixture();
    const revise = provider(f, (task, n, output) => {
      if (task === 'life_fidelity' && n === 1)
        return failedFidelity('Correct a calendar word.');
      return task === 'life_narrative_editor' ? failingEditor(f, [{}]) : output;
    });
    await expect(processLifeJob(f.job, jobs, revise.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_QUALITY_FAILED',
    });
    expect(revise.parse).toHaveBeenCalledTimes(8);
    expect(await rowsOf(f)).toHaveLength(0);
    const g = await fixture();
    const again = provider(g, (task, _n, output) =>
      task === 'life_fidelity' ? failedFidelity('Still wrong.') : output,
    );
    await expect(processLifeJob(g.job, jobs, again.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_QUALITY_FAILED',
    });
    expect(stageNames(again)).toEqual([
      ...PLAN_STAGES,
      'life_narrative_chapter',
      'life_narrative_plan_review',
      'life_fidelity',
    ]);
    expect(await rowsOf(g)).toHaveLength(0);
  });

  it('fits one transport retry before the repair into the nine-call ceiling and refuses a partial repair', async () => {
    const f = await fixture();
    await jobs.checkpoint(f.job, 'EARLIER_ADMISSION', {
      providerRequestCount: 1,
    });
    const fail = (task: string, n: number, output: unknown) =>
      task === 'life_fidelity' && n === 1
        ? failedFidelity('Correct a calendar word.')
        : output;
    const p = provider(f, fail);
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse).toHaveBeenCalledTimes(8);
    expect((await saved(f.job)).checkpoints.providerRequestCount).toBe(9);
    const g = await fixture();
    await jobs.checkpoint(g.job, 'EARLIER_ADMISSIONS', {
      providerRequestCount: 2,
    });
    const q = provider(g, fail);
    await expect(processLifeJob(g.job, jobs, q.ai)).rejects.toMatchObject({
      code: 'NARRATIVE_REQUEST_LIMIT',
    });
    expect(q.parse).toHaveBeenCalledTimes(4);
    expect((await saved(g.job)).checkpoints.repairUsed).not.toBe(true);
    expect(await rowsOf(g)).toHaveLength(0);
  });

  it('keeps the plan-review failure at seven calls with its own message', async () => {
    const f = await fixture();
    const p = provider(f, (task, n, output) =>
      task === 'life_narrative_plan_review' && n === 1
        ? {
            ...(output as typeof f.f.review),
            scores: { ...f.f.review.scores, causality: 2 },
          }
        : output,
    );
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse).toHaveBeenCalledTimes(7);
    expect(
      p.parse.mock.calls.filter(
        (c) => c[0].text.format.name === 'life_fidelity',
      ),
    ).toHaveLength(1);
    const repairs = p.parse.mock.calls
      .map((c) =>
        JSON.parse(c[0].input.find((i) => i.role === 'user')!.content),
      )
      .filter((m) => m.authorRepair);
    expect(repairs[0].authorRepair.message).toMatch(
      /^Improve the final authored story: /,
    );
  });

  it('leaves the frozen v8 policy on its nine-call combined repair', async () => {
    const f = await fixture('v8');
    const p = provider(f, (task, n, output) =>
      task === 'life_fidelity' && n === 1
        ? failedFidelity('Correct a calendar word.')
        : task === 'life_narrative_editor' && n === 1
          ? failingEditor(f, [{}])
          : output,
    );
    await processLifeJob(f.job, jobs, p.ai);
    expect(p.parse).toHaveBeenCalledTimes(9);
    expect(
      p.parse.mock.calls.filter(
        (c) => c[0].text.format.name === 'life_narrative_editor',
      ),
    ).toHaveLength(2);
    const repairs = p.parse.mock.calls
      .map((c) =>
        JSON.parse(c[0].input.find((i) => i.role === 'user')!.content),
      )
      .filter((m) => m.authorRepair);
    expect(repairs[0].authorRepair.message).toMatch(
      /^Fix BOTH final checks in one full-package repair\.\nFidelity: /,
    );
  });
});

describe('the v9 editor-triggered repair message', () => {
  const blocking = (tag: string) => ({
    severity: 'major',
    repairScope: 'canon',
    explanation: `${tag}_EXPLAIN ` + 'e'.repeat(300),
    suggestedFix: `${tag}_FIX ` + 'f'.repeat(300),
  });
  async function messageFor(generation: Generation, issues: object[]) {
    const f = await fixture(generation);
    const p = provider(f, (task, n, output) =>
      task === 'life_narrative_editor' && n === 1
        ? failingEditor(f, issues)
        : output,
    );
    await processLifeJob(f.job, jobs, p.ai);
    const repairs = p.parse.mock.calls
      .map((c) =>
        JSON.parse(c[0].input.find((i) => i.role === 'user')!.content),
      )
      .filter((m) => m.authorRepair);
    return repairs[0].authorRepair.message as string;
  }

  it('formats flags and issues like the combined message, keeps every blocking fix and no raw JSON', async () => {
    const message = await messageFor('v9', [
      blocking('A'),
      {
        explanation: 'N_EXPLAIN ' + 'n'.repeat(320),
        suggestedFix: 'N_FIX ' + 'm'.repeat(320),
      },
      blocking('B'),
      blocking('C'),
      {
        explanation: 'M_EXPLAIN ' + 'n'.repeat(320),
        suggestedFix: 'M_FIX ' + 'm'.repeat(320),
      },
    ]);
    expect(message.length).toBeLessThanOrEqual(1800);
    expect(message).toMatch(/^Correct the final package's literary issues:\n/);
    expect(message).toContain(
      '\nVerdict: revise\nFailing flags: distinctEnding',
    );
    expect(message).toContain('Scores below 4:');
    expect(message).toContain(
      'choiceStakes/major/canon, paragraph 1: A_EXPLAIN',
    );
    // Every blocking issue keeps its whole suggestedFix.
    for (const tag of ['A', 'B', 'C'])
      expect(message).toContain(`Fix: ${tag}_FIX ${'f'.repeat(300)}`);
    expect(message).toContain('[clipped]');
    expect(message).not.toContain('Rewrite the weak story');
    expect(message).not.toContain('{"');
    expect(message).not.toContain('"version"');
  });

  it('stays within the budget even when the blocking fixes alone are too long', async () => {
    const message = await messageFor(
      'v9',
      Array.from({ length: 8 }, (_, i) => ({
        ...blocking(String(i)),
        suggestedFix: `${i}_FIX ` + 'f'.repeat(340),
      })),
    );
    expect(message.length).toBeLessThanOrEqual(1800);
    expect(message).toMatch(/^Correct the final package's literary issues:\n/);
    expect(message).not.toContain('{"');
  });

  it('leaves the v8 message byte-for-byte the old wording', async () => {
    const message = await messageFor('v8', [{}]);
    expect(message).toMatch(
      /^Rewrite the weak story rather than paraphrasing it: \{"version":"1\.3\.0"/,
    );
    expect(message.length).toBeLessThanOrEqual(1800);
  });
});

describe('fiction generation selection', () => {
  const base = {
    NARRATIVE_PIPELINE_MODE: 'narrative-fiction-v2',
    NARRATIVE_COHORT_USER_IDS: '',
  };
  it('defaults to the frozen generation and shows nothing about it', () => {
    expect(narrativeConfigFromEnv(base)).toEqual({
      mode: 'narrative-fiction-v2',
      cohortUserIds: [],
    });
    expect(
      narrativeConfigFromEnv({ ...base, NARRATIVE_FICTION_GENERATION: 'v8' }),
    ).not.toHaveProperty('fictionGeneration');
    expect(narrativeConfigFromEnv({})).not.toHaveProperty('fictionGeneration');
  });
  it('selects v9 explicitly and refuses every other value or mode', () => {
    expect(
      narrativeConfigFromEnv({ ...base, NARRATIVE_FICTION_GENERATION: 'v9' }),
    ).toMatchObject({ fictionGeneration: 'v9' });
    for (const bad of ['v10', '9', 'V9'])
      expect(() =>
        narrativeConfigFromEnv({ ...base, NARRATIVE_FICTION_GENERATION: bad }),
      ).toThrow(DomainError);
    expect(() =>
      narrativeConfigFromEnv({
        NARRATIVE_PIPELINE_MODE: 'narrative-v1',
        NARRATIVE_FICTION_GENERATION: 'v9',
      }),
    ).toThrow('requires narrative-fiction-v2');
  });
});

describe('turn rotation and the returning cast through the owned history', () => {
  type Ledger = {
    version: string;
    recurringCast?: {
      actorId: string;
      chaptersPresent: number;
      chaptersSinceLast: number | null;
      openMatter: boolean;
    }[];
    recentTurns?: (string | null)[];
    turnQueue?: string[];
    restingTurns?: string[];
  };
  const ledgerOf = (job: LifeJob) =>
    fictionContextSchema.parse(job.payload.narrativeContext).seriesLedger as
      Ledger | undefined;

  it('records the planner label, then orders the next request by it', async () => {
    const f = await fixture(),
      actorId = randomUUID();
    introduce(f, actorId);
    // The first chapter has no owned history, hence no ledger and no queue.
    expect(ledgerOf(f.job)).toBeUndefined();
    await processLifeJob(f.job, jobs, provider(f).ai);
    expect((await saved(f.job)).status).toBe('completed');
    expect((await artifactOf(f.job.payload.periodId)).turnType).toBe(
      'attempt_meets_resistance',
    );
    const second = await nextPeriod(f),
      ledger = ledgerOf(second.job)!;
    expect(ledger.version).toBe('1.1.0');
    expect(ledger.recentTurns).toEqual(['attempt_meets_resistance']);
    expect(ledger.turnQueue).toHaveLength(10);
    expect(ledger.turnQueue!.at(-1)).toBe('attempt_meets_resistance');
    expect(ledger.restingTurns).toEqual(['attempt_meets_resistance']);
    // The fictional person with an open matter is in the returning cast.
    expect(ledger.recurringCast).toEqual([
      {
        actorId,
        chaptersPresent: 1,
        chaptersSinceLast: 0,
        openMatter: true,
      },
    ]);
    // The planner request carries it, the proof still verifies.
    const request = JSON.stringify(
      (await import('@future-flow/core')).fictionPlannerRequest(
        second.job.payload as never,
      ),
    );
    expect(request).toContain('"turnQueue"');
    // Second chapter: a different label; the queue and resting turns follow.
    second.f.draft.turnType = 'quiet_persistence' as never;
    await processLifeJob(second.job, jobs, provider(second).ai);
    expect((await saved(second.job)).status).toBe('completed');
    const third = await nextPeriod(second),
      next = ledgerOf(third.job)!;
    expect(next.recentTurns).toEqual([
      'attempt_meets_resistance',
      'quiet_persistence',
    ]);
    expect(next.turnQueue!.slice(-2)).toEqual([
      'attempt_meets_resistance',
      'quiet_persistence',
    ]);
    expect(next.restingTurns).toEqual([
      'quiet_persistence',
      'attempt_meets_resistance',
    ]);
    // The person did not appear again: absence grows, the matter stays open.
    expect(next.recurringCast![0]).toMatchObject({
      actorId,
      chaptersPresent: 1,
      chaptersSinceLast: 1,
    });
  });

  it('builds a fork ledger from its own prefix only', async () => {
    const f = await fixture();
    await processLifeJob(f.job, jobs, provider(f).ai);
    const second = await nextPeriod(f);
    second.f.draft.turnType = 'success_with_price' as never;
    await processLifeJob(second.job, jobs, provider(second).ai);
    const parent = await f.lives.branch(f.owner, second.branch.id);
    await f.lives.fork(
      f.owner,
      second.branch.id,
      f.job.payload.periodId,
      parent.revision,
      second.decision.options[1]!.id,
      randomUUID(),
    );
    const child = (await jobs.claim())!,
      ledger = ledgerOf(child)!;
    expect(ledger.recentTurns).toEqual(['attempt_meets_resistance']);
    expect(ledger.restingTurns).toEqual(['attempt_meets_resistance']);
    expect(ledger.turnQueue!.at(-1)).toBe('attempt_meets_resistance');
  });

  it('never lists a supplied person in the returning cast, only the wholly fictional ones', async () => {
    const f = await fixture(),
      actorId = randomUUID();
    introduce(f, actorId);
    // The supplied friend takes part in the chapter too.
    const friend = f.job.payload.state.actors.find(
      (a) => a.relationship === 'friend',
    )!;
    (f.f.authored as Authored).candidate.events[0]!.actorIds.push(friend.id);
    await processLifeJob(f.job, jobs, provider(f).ai);
    expect((await saved(f.job)).status).toBe('completed');
    const second = await nextPeriod(f),
      ledger = ledgerOf(second.job)!;
    expect(ledger.recurringCast!.map((c) => c.actorId)).toEqual([actorId]);
    expect(ledger.recurringCast!.map((c) => c.actorId)).not.toContain(
      friend.id,
    );
    // The supplied person stays in the ledger's own privateLife counter.
    expect(
      (ledger as unknown as { privateLife: { actorId: string }[] }).privateLife
        .map((p) => p.actorId)
        .includes(friend.id),
    ).toBe(true);
  });

  it('counts a chapter the planner left unlabelled as no turn at all', async () => {
    const f = await fixture();
    f.f.draft.turnType = null as never;
    await processLifeJob(f.job, jobs, provider(f).ai);
    expect((await saved(f.job)).status).toBe('completed');
    expect((await artifactOf(f.job.payload.periodId)).turnType).toBeNull();
    const second = await nextPeriod(f),
      ledger = ledgerOf(second.job)!;
    expect(ledger.recentTurns).toEqual([null]);
    expect(ledger.restingTurns).toEqual([]);
    expect(ledger.turnQueue).toHaveLength(10);
  });

  it('keeps v8 on ledger 1.0.0 and its artifact free of a label', async () => {
    const f = await fixture('v8');
    await processLifeJob(f.job, jobs, provider(f).ai);
    expect(
      (await artifactOf(f.job.payload.periodId)) as Record<string, unknown>,
    ).not.toHaveProperty('turnType');
    const second = await nextPeriod(f),
      ledger = ledgerOf(second.job)!;
    expect(ledger.version).toBe('1.0.0');
    expect(ledger).not.toHaveProperty('turnQueue');
    expect(ledger).not.toHaveProperty('recurringCast');
  });
});
