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
import type OpenAIClient from 'openai';
import { OpenAiProvider } from '@future-flow/ai';
import {
  DatabaseAiBudget,
  LifeRepository,
  LifeJobRepository,
  Repository,
  SharedJobRepository,
  ownedNarrativeReferences,
  personalNarrativeMemory,
  boundNarrativeMemory,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import {
  simulatePeriodV2,
  narrativeCanon,
  narrativePlannerRequest,
  narrativeReferencesFromSnapshot,
  narrativeReferenceSnapshot,
} from '@future-flow/core';
import {
  NARRATIVE_MEMORY_BYTES,
  type FictionalActorMemory,
  type NarrativeThread,
} from '@future-flow/contracts';
import { sharedAiGroup } from './shared-ai-fixtures';
import { sharedEventFixture } from './shared-engine-fixtures';
import { testInviteSecret } from './shared-fixtures';
import { applyMigrations } from '../scripts/lib/migrations';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { narrativeSetup, narrativeProfiles } from './narrative-fixtures';
import {
  narrativePlanFixture,
  longNarrativeChapterFixture,
  narrativeEditorialFixture,
  narrativePlanReviewFixture,
} from './narrative-plan-fixtures';

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
async function owner() {
  const id = randomUUID();
  await repo.ensureUser(id);
  await repo.acceptPrivacy(id);
  return id;
}
const selected = (id: string) =>
  new LifeRepository(
    db,
    { daily: 100, concurrent: 10 },
    { mode: 'narrative-v1', cohortUserIds: [id] },
  );
type Fixture = ReturnType<typeof narrativePlanFixture>;
function recanon(f: Fixture) {
  f.canon = simulatePeriodV2(
    f.candidate,
    f.input.state,
    f.input.input.constraints,
    {
      lifeId: f.input.input.lifeId,
      branchId: f.input.input.branchId,
      revision: f.input.revision,
      acceptedDecisionIds: f.input.acceptedDecisionIds,
    },
  );
}
async function finish(mutate?: (f: Fixture, job: LifeJob) => void) {
  const job = (await jobs.claim())!;
  expect(job).toBeTruthy();
  const f = narrativePlanFixture(job.payload);
  mutate?.(f, job);
  recanon(f);
  narrativeCanon(job.payload, f.result);
  const chapter = longNarrativeChapterFixture(f);
  const parse = vi.fn(
    async (request: { text: { format: { name: string } } }) => ({
      status: 'completed',
      model: 'gpt-6.1-sol',
      usage: { input_tokens: 10, output_tokens: 20 },
      output_parsed:
        request.text.format.name === 'life_narrative_plan_review'
          ? narrativePlanReviewFixture()
          : request.text.format.name === 'life_narrative_plan'
            ? f.result
            : request.text.format.name === 'life_narrative_chapter'
              ? chapter
              : request.text.format.name === 'life_fidelity'
                ? { valid: true, issues: [] }
                : narrativeEditorialFixture(),
    }),
  );
  const ai = new OpenAiProvider(
    {
      apiKey: 'offline-only',
      eventModel: 'gpt-6.1-sol',
      storyModel: 'gpt-6.1-sol',
      checkModel: 'gpt-6.1-sol',
      timeoutMs: 1000,
      maxOutputTokens: 6500,
      guard: new DatabaseAiBudget(
        db,
        job.user_id,
        job.id,
        { projectUsd: 10, userUsd: 2 },
        job.lease_token,
      ),
      beforePhysicalRequest: () => jobs.admitNarrativeRequest(job),
    },
    { responses: { parse } } as unknown as OpenAIClient,
  );
  await processLifeJob(job, jobs, ai);
  expect(parse).toHaveBeenCalledTimes(5);
  return { job, f, parse };
}
async function chooseAndContinue(
  id: string,
  lives: LifeRepository,
  branchId: string,
  index = 0,
) {
  const detail = await lives.detail(id, branchId),
    d = detail.branch.pending_decision!;
  await lives.choose(
    id,
    branchId,
    detail.branch.revision,
    d.id,
    d.options[index]!.id,
    randomUUID(),
  );
  const branch = await lives.branch(id, branchId);
  await lives.continue(id, branchId, branch.revision, randomUUID());
  return d.options[index]!.id;
}

describe('owned multi-period narrative memory integration', () => {
  it('carries a choice consequence, fixed two-period thread deadline and fictional voice across three committed chapters', async () => {
    const id = await owner(),
      lives = selected(id),
      created = await lives.create(
        id,
        narrativeSetup(narrativeProfiles[0]),
        randomUUID(),
      );
    const actorId = randomUUID(),
      threadId = randomUUID();
    let actor: FictionalActorMemory, thread: NarrativeThread;
    const first = await finish((f) => {
      f.candidate.events[0]!.changes.push({
        type: 'actor_add',
        value: {
          id: actorId,
          label: 'Fictional workshop colleague',
          relationship: 'colleague',
        },
      });
      actor = {
        actorId,
        introducedByEventId: f.candidate.events[0]!.id,
        role: 'A fictional colleague helping with the bounded trial.',
        desire: 'Wants a usable observation before committing more time.',
        resistance:
          'Resists treating an uncertain trial as a guaranteed success.',
        voiceCue: 'Uses short questions about the concrete evidence at hand.',
        lastSeenPeriodId: f.candidate.periodId,
      };
      thread = {
        id: threadId,
        originPeriodId: f.candidate.periodId,
        originEventId: f.candidate.events[0]!.id,
        kind: 'goal',
        summary:
          'Resolve the practical obstacle with a recorded result within two following periods.',
        status: 'open',
        dueByPeriodOffset: 2,
        lastTouchedPeriodId: f.candidate.periodId,
        eventRefs: [f.candidate.events[0]!.id],
      };
      f.result.plan.memoryDelta.actorUpdates = [actor];
      f.result.plan.memoryDelta.threadUpdates = [thread];
    });
    const firstOption = await chooseAndContinue(id, lives, created.branchId);
    const second = await finish((f, job) => {
      expect(job.payload.narrativeContext!.memory.fictionalActors).toEqual([
        actor,
      ]);
      expect(job.payload.narrativeContext!.memory.openThreads).toEqual([
        thread,
      ]);
      expect(
        job.payload.narrativeContext!.memory.recentChoices.at(-1)!.optionId,
      ).toBe(firstOption);
      expect(f.result.plan.choiceConsequences[0]!.optionId).toBe(firstOption);
      f.result.plan.memoryDelta.threadUpdates = [
        {
          ...thread,
          status: 'progressed',
          lastTouchedPeriodId: f.candidate.periodId,
          eventRefs: [f.candidate.events[0]!.id],
        },
      ];
      f.result.plan.memoryDelta.actorUpdates = [
        { ...actor, lastSeenPeriodId: f.candidate.periodId },
      ];
    });
    await chooseAndContinue(id, lives, created.branchId);
    const third = await finish((f, job) => {
      expect(
        job.payload.narrativeContext!.memory.fictionalActors[0]!.voiceCue,
      ).toBe(actor.voiceCue);
      expect(
        job.payload.narrativeContext!.memory.openThreads[0]!.originPeriodId,
      ).toBe(first.job.payload.periodId);
      expect(() => narrativeCanon(job.payload, f.result)).toThrow('deadline');
      f.result.plan.memoryDelta.threadUpdates = [
        {
          ...thread,
          status: 'resolved',
          lastTouchedPeriodId: f.candidate.periodId,
          eventRefs: [f.candidate.events[0]!.id],
        },
      ];
      f.result.plan.memoryDelta.actorUpdates = [
        { ...actor, lastSeenPeriodId: f.candidate.periodId },
      ];
    });
    const branch = await lives.branch(id, created.branchId);
    const memory = await personalNarrativeMemory(
      db,
      id,
      created.branchId,
      branch.revision,
      branch.accepted_decision_ids,
      false,
      true,
    );
    expect(memory.openThreads).toEqual([]);
    expect(memory.history).toHaveLength(3);
    expect(memory.history[1]!.summary).toBe(
      second.f.result.plan.memoryDelta.periodSummary,
    );
    const refs = await ownedNarrativeReferences(db, id, created.branchId);
    expect(refs.usedThreadIds.has(threadId)).toBe(true);
    expect(refs.fictionalActorOrigins?.get(actorId)).toBe(
      first.f.candidate.events[0]!.id,
    );
    expect(memory.fictionalActors[0]!.lastSeenPeriodId).toBe(
      third.job.payload.periodId,
    );
    expect(
      narrativePlannerRequest(
        second.job.payload as Parameters<typeof narrativePlannerRequest>[0],
      ),
    ).not.toHaveProperty('narrativeReferences');
  });

  it('forks only the owned prefix and remembers the alternative accepted option without later parent artifacts', async () => {
    const id = await owner(),
      lives = selected(id),
      created = await lives.create(
        id,
        narrativeSetup(narrativeProfiles[0]),
        randomUUID(),
      );
    const first = await finish();
    const firstDetail = await lives.detail(id, created.branchId),
      decision = firstDetail.branch.pending_decision!;
    const parentOption = await chooseAndContinue(
      id,
      lives,
      created.branchId,
      0,
    );
    const second = await finish();
    const parent = await lives.branch(id, created.branchId);
    const fork = await lives.fork(
      id,
      created.branchId,
      first.job.payload.periodId,
      parent.revision,
      decision.options[1]!.id,
      randomUUID(),
    );
    const forked = await finish((f, job) => {
      expect(
        job.payload.narrativeContext!.memory.history.map((p) => p.periodId),
      ).toEqual([first.job.payload.periodId]);
      expect(
        job.payload.narrativeContext!.memory.recentChoices.at(-1)!.optionId,
      ).toBe(decision.options[1]!.id);
      expect(f.result.plan.choiceConsequences[0]!.optionId).not.toBe(
        parentOption,
      );
      expect(job.payload.narrativeReferences!.historyEventIds).not.toContain(
        second.f.candidate.events[0]!.id,
      );
      expect(job.payload.state).not.toEqual(second.job.payload.state);
    });
    expect(forked.f.result.plan.choiceConsequences[0]!.optionId).toBe(
      decision.options[1]!.id,
    );
    expect((await lives.detail(id, created.branchId)).periods).toHaveLength(2);
  });

  it('loads no historical prose/artifact/choice text for withheld narrative memory', async () => {
    const id = await owner(),
      lives = selected(id),
      created = await lives.create(
        id,
        narrativeSetup(narrativeProfiles[0]),
        randomUUID(),
      );
    const marker = 'PRIVATE_DELTA_TEXT_'.repeat(8);
    await finish((f) => {
      f.result.plan.memoryDelta.periodSummary = marker;
    });
    const branch = await lives.branch(id, created.branchId),
      queries: string[] = [];
    const traced: Database = {
      ...db,
      query: async <T extends Record<string, unknown>>(
        sql: string,
        values: unknown[] = [],
      ) => {
        queries.push(sql);
        return db.query<T>(sql, values);
      },
    };
    const memory = await personalNarrativeMemory(
      traced,
      id,
      created.branchId,
      branch.revision,
      branch.accepted_decision_ids,
      true,
      true,
    );
    expect(memory.withheld).toBe(true);
    expect(memory.history[0]!.excerpt).toBeNull();
    expect(memory.fictionalActors).toEqual([]);
    expect(memory.openThreads).toEqual([]);
    expect(
      queries.some((sql) =>
        /p\.chapter|p\.events|narrative_artifact|FROM aw_choices/.test(sql),
      ),
    ).toBe(false);
    expect(queries.some((sql) => /NULL AS chapter/.test(sql))).toBe(true);
    const returned: unknown[] = [];
    const metadata: Database = {
      ...db,
      query: async <T extends Record<string, unknown>>(
        sql: string,
        values: unknown[] = [],
      ) => {
        const rows = await db.query<T>(sql, values);
        returned.push(rows);
        return rows;
      },
    };
    await ownedNarrativeReferences(metadata, id, created.branchId);
    expect(JSON.stringify(returned)).not.toContain('PRIVATE_DELTA_TEXT_');
    expect(JSON.stringify(returned)).not.toContain('narrative_artifact');
  });

  it('drops whole older NPC profiles for the UTF-8 limit without losing active thread origins or the latest choice', async () => {
    const id = await owner(),
      lives = selected(id),
      created = await lives.create(
        id,
        narrativeSetup(narrativeProfiles[0]),
        randomUUID(),
      );
    const job = (await jobs.claim())!,
      raw = structuredClone(job.payload.narrativeContext!.memory);
    raw.fictionalActors = Array.from({ length: 12 }, () => ({
      actorId: randomUUID(),
      introducedByEventId: randomUUID(),
      role: '😀'.repeat(60),
      desire: '😀'.repeat(100),
      resistance: '😀'.repeat(100),
      voiceCue: '😀'.repeat(60),
      lastSeenPeriodId: randomUUID(),
    }));
    raw.recentChoices = [
      {
        decisionId: randomUUID(),
        optionId: randomUUID(),
        acceptedAt: '2026-01-01T00:00:00Z',
        label: 'Latest choice',
        changesSummary: '😀'.repeat(240),
      },
    ];
    raw.openThreads = [
      {
        id: randomUUID(),
        originPeriodId: randomUUID(),
        originEventId: randomUUID(),
        kind: 'goal',
        summary: '😀'.repeat(140),
        status: 'open',
        dueByPeriodOffset: 2,
        lastTouchedPeriodId: randomUUID(),
        eventRefs: [randomUUID()],
      },
    ];
    const memory = boundNarrativeMemory(raw);
    expect(
      Buffer.byteLength(JSON.stringify(memory), 'utf8'),
    ).toBeLessThanOrEqual(NARRATIVE_MEMORY_BYTES);
    expect(memory.fictionalActors.length).toBeLessThan(12);
    expect(memory.openThreads).toEqual(raw.openThreads);
    expect(memory.recentChoices).toEqual(raw.recentChoices);
    expect(raw.fictionalActors).toHaveLength(12);
    expect(created.branchId).toBe(job.branch_id);
  });
  it('blocks Shared member IDs and aliases from fictional introductions and redacts owned export artifacts after participant deletion', async () => {
    const shared = new SharedJobRepository(db, testInviteSecret),
      g = await sharedAiGroup(db, shared),
      a = g.people[0]!,
      b = g.people[1]!;
    const lives = selected(a.id),
      refs = await ownedNarrativeReferences(db, a.id, a.branchId);
    expect(refs.forbiddenActorIds.has(b.id)).toBe(true);
    expect(refs.forbiddenActorIds.has(g.detail.members[1]!.id)).toBe(true);
    expect(refs.forbiddenActorLabels?.has('test casey')).toBe(true);
    const f = sharedEventFixture(
      g.contextId,
      g.detail.revision,
      a.date,
      g.detail.members.map((m) => m.id),
      null,
    );
    await shared.commitCandidate(
      a.id,
      g.contextId,
      f.candidate,
      randomUUID(),
      f.rules,
    );
    for (const person of [a, b]) {
      const detail = await shared.detail(person.id, g.contextId);
      await shared.submitIntent(
        person.id,
        g.contextId,
        f.candidate.eventId,
        { contextRevision: detail.revision, optionId: f.yes },
        randomUUID(),
      );
    }
    await chooseAndContinue(a.id, lives, a.branchId);
    const fictionalId = randomUUID();
    let priorProfile!: FictionalActorMemory;
    const completed = await finish((plan, job) => {
      plan.candidate.events[0]!.changes.push({
        type: 'actor_add',
        value: {
          id: fictionalId,
          label: 'A fictional workshop colleague',
          relationship: 'colleague',
        },
      });
      priorProfile = {
        actorId: fictionalId,
        introducedByEventId: plan.candidate.events[0]!.id,
        role: 'A fictional colleague introduced during this recorded trial.',
        desire: 'Wants concrete evidence before proposing a follow-up trial.',
        resistance:
          'Resists treating limited observations as a guaranteed result.',
        voiceCue:
          'PRIVATE_PROFILE_CUE: short questions about the observed evidence.',
        lastSeenPeriodId: plan.candidate.periodId,
      };
      plan.result.plan.memoryDelta.actorUpdates = [priorProfile];
      const bad = structuredClone(plan.result);
      bad.candidate.events[0]!.changes.push({
        type: 'actor_add',
        value: {
          id: randomUUID(),
          label: ' Test Casey ',
          relationship: 'friend',
        },
      });
      expect(() => narrativeCanon(job.payload, bad)).toThrow(
        'supplied identity',
      );
      bad.candidate.events[0]!.changes.at(-1)!.value = {
        id: b.id,
        label: 'Other invented label',
        relationship: 'friend',
      } as never;
      expect(() => narrativeCanon(job.payload, bad)).toThrow('Shared identity');
    });
    const before = await repo.exportAccount(a.id);
    expect(
      (before.aw_periods as { id: string; narrative_artifact: unknown }[]).find(
        (p) => p.id === completed.job.payload.periodId,
      )!.narrative_artifact,
    ).not.toBeNull();
    await repo.deleteAccountData(b.id);
    const after = await repo.exportAccount(a.id);
    expect(
      (after.aw_periods as { id: string; narrative_artifact: unknown }[]).find(
        (p) => p.id === completed.job.payload.periodId,
      )!.narrative_artifact,
    ).toBeNull();
    const [stored] = await db.query(
      'SELECT narrative_artifact FROM aw_periods WHERE id=$1',
      [completed.job.payload.periodId],
    );
    expect(stored!.narrative_artifact).not.toBeNull();
    await chooseAndContinue(a.id, lives, a.branchId);
    await finish((_plan, job) => {
      expect(job.payload.narrativeContext!.memory.withheld).toBe(true);
      expect(job.payload.narrativeContext!.memory.recentChoices).toEqual([]);
      expect(job.payload.narrativeContext!.memory.openThreads).toEqual([]);
      const prompt = narrativePlannerRequest(
        job.payload as Parameters<typeof narrativePlannerRequest>[0],
      );
      expect(prompt.memory.recentEvents).toEqual([]);
      expect(prompt.memory.choices).toEqual([]);
      expect(JSON.stringify(prompt)).not.toContain('Test Casey');
      expect(JSON.stringify(prompt)).not.toContain('PRIVATE_PROFILE_CUE');
      const leaked = structuredClone(_plan.result);
      leaked.plan.memoryDelta.actorUpdates = [
        { ...priorProfile, lastSeenPeriodId: _plan.candidate.periodId },
      ];
      expect(() => narrativeCanon(job.payload, leaked)).toThrow('Withheld');
    });
  });
  it('keeps supplied people out of fictional profiles even when their IDs or labels are reused', async () => {
    const id = await owner(),
      lives = selected(id),
      created = await lives.create(
        id,
        narrativeSetup(narrativeProfiles[6]),
        randomUUID(),
      );
    await finish((f, job) => {
      const supplied = job.payload.input.initialState.actors[0]!;
      expect(supplied).toBeTruthy();
      expect(job.payload.narrativeReferences!.forbiddenActorIds).toContain(
        supplied.id,
      );
      const bad = structuredClone(f.result);
      bad.plan.memoryDelta.actorUpdates = [
        {
          actorId: supplied.id,
          introducedByEventId: f.candidate.events[0]!.id,
          role: 'An invented role that the user did not supply.',
          desire: 'An invented private desire that must be rejected.',
          resistance: 'An invented secret that must never become biography.',
          voiceCue: 'An invented private manner of speech that is unsupported.',
          lastSeenPeriodId: f.candidate.periodId,
        },
      ];
      expect(() => narrativeCanon(job.payload, bad)).toThrow('foreign scope');
      bad.plan.memoryDelta.actorUpdates = [];
      bad.candidate.events[0]!.changes.push({
        type: 'actor_add',
        value: {
          id: randomUUID(),
          label: supplied.label,
          relationship: 'friend',
        },
      });
      expect(() => narrativeCanon(job.payload, bad)).toThrow(
        'supplied identity',
      );
    });
    const refs = await ownedNarrativeReferences(db, id, created.branchId);
    expect(refs.fictionalActorOrigins?.size).toBe(0);
  });
});
