// Plan 051 M3: the two everyday sample stories and the operator's lease.
// Isolated database and an offline provider stub only; no real AI call.
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import type OpenAI from 'openai';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { OpenAiProvider } from '@future-flow/ai';
import {
  DatabaseAiBudget,
  LifeJobRepository,
  LifeRepository,
  OfficialLifeRepository,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import {
  FICTION_MODE,
  fictionV11Policy,
  storyCatalogs,
} from '@future-flow/contracts';
import { DomainError } from '@future-flow/core';
import { applyMigrations } from '../scripts/lib/migrations';
import { processLifeJob } from '../apps/worker/src/life-processor';
import {
  claimSampleStoryJob,
  sampleStoryTemplates,
  SAMPLE_STORY_KEYS,
} from '../scripts/lib/official-sample-stories';
import { fictionFixture } from './fiction-fixtures';
import { officialLifeFixture } from './official-life-fixtures';

let engine: PGlite, db: Database;
function adapter(
  client: Pick<PGlite, 'query' | 'transaction'>,
  nested = false,
): Database {
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) => (await client.query<T>(sql, values)).rows,
    transaction: (run) =>
      nested
        ? run(adapter(client, true))
        : client.transaction((tx) =>
            run(adapter(tx as unknown as PGlite, true)),
          ),
  };
}
beforeAll(async () => {
  engine = new PGlite();
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await applyMigrations(engine);
  db = adapter(engine);
});
afterAll(async () => {
  await engine?.close();
});

const window = {
  startsAt: new Date(Date.now() - 60000).toISOString(),
  endsAt: new Date(Date.now() + 86400000).toISOString(),
};
const storyConfig = (owner: string) => ({
  mode: FICTION_MODE,
  cohortUserIds: [owner],
  fictionGeneration: 'v9' as const,
  storyDirections: {
    enabled: true,
    politicsEnabled: false,
    cohortUserIds: [owner],
  },
});

async function processSample(owner: string, job: LifeJob) {
  const jobs = new LifeJobRepository(db, 600);
  const f = fictionFixture(job.payload);
  const parse = vi.fn(
    async (request: { model: string; text: { format: { name: string } } }) => {
      const task = request.text.format.name;
      return {
        status: 'completed',
        model: request.model,
        _request_id: `req_isolated_${randomUUID()}`,
        output_parsed:
          task === 'life_narrative_plan'
            ? f.draft
            : task === 'life_narrative_chapter'
              ? f.authored
              : task === 'life_narrative_plan_review'
                ? f.review
                : task === 'life_fidelity'
                  ? f.fidelity
                  : f.editor,
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
      beforePhysicalRequest: () => jobs.admitNarrativeRequest(job),
      guard: new DatabaseAiBudget(
        db,
        owner,
        job.id,
        { provider: 'openai', projectUsd: 3, userUsd: 3, window },
        job.lease_token,
        196608,
      ),
    },
    { responses: { parse } } as unknown as OpenAI,
  );
  await processLifeJob(job, jobs, ai);
  const [saved] = await db.query<LifeJob>('SELECT * FROM aw_jobs WHERE id=$1', [
    job.id,
  ]);
  return saved!;
}

describe('Plan 051 sample stories', () => {
  it('are everyday, titled, non-political story templates', () => {
    for (const key of SAMPLE_STORY_KEYS) {
      const template = sampleStoryTemplates[key];
      const emphasis = template.story!.emphases[0]!;
      expect(emphasis.direction).not.toBe('politics');
      const direction = storyCatalogs['1.0.0'].directions[emphasis.direction];
      expect(direction.selectable).toBe(true);
      expect(
        Object.hasOwn(
          direction.situations,
          template.story!.startingSituation.id,
        ),
      ).toBe(true);
      expect(template.story!.title).toBe(template.title);
      expect(template.goals.length).toBeGreaterThan(0);
    }
  });

  it('writes v11 periods under the operator lease, unseen by the worker', async () => {
    const f = await officialLifeFixture(
      db,
      undefined,
      sampleStoryTemplates.promotion,
    );
    const job = (await db.transaction(async (tx) => {
      const created = await new OfficialLifeRepository(tx, true).start(
        f.owner,
        f.startRequest,
        randomUUID(),
      );
      return claimSampleStoryJob(tx, f.owner, created.jobId, randomUUID());
    })) as unknown as LifeJob;
    expect(job.status).toBe('running');
    expect(job.payload.narrativeContext?.policy).toEqual(fictionV11Policy());
    // The service worker never picks up a leased operator job.
    expect(await new LifeJobRepository(db).claim()).toBeNull();
    expect((await processSample(f.owner, job)).status).toBe('completed');

    const lives = new LifeRepository(
      db,
      { daily: 100, concurrent: 10 },
      storyConfig(f.owner),
    );
    const detail = await lives.detail(f.owner, job.branch_id);
    expect(detail.periods).toHaveLength(1);
    const decision = detail.branch.pending_decision!;
    const next = (await db.transaction(async (tx) => {
      const l = new LifeRepository(
        tx,
        { daily: 100, concurrent: 10 },
        storyConfig(f.owner),
      );
      await l.choose(
        f.owner,
        detail.branch.id,
        detail.branch.revision,
        decision.id,
        decision.options[0]!.id,
        randomUUID(),
      );
      const ready = await l.branch(f.owner, detail.branch.id);
      const c = await l.continue(
        f.owner,
        ready.id,
        ready.revision,
        randomUUID(),
      );
      return claimSampleStoryJob(tx, f.owner, c.jobId, randomUUID());
    })) as unknown as LifeJob;
    expect(next.payload.narrativeContext?.policy).toEqual(fictionV11Policy());
    expect((await processSample(f.owner, next)).status).toBe('completed');
    expect((await lives.detail(f.owner, job.branch_id)).periods).toHaveLength(
      2,
    );
  });

  it('starts the story again from the same grant after a failed life', async () => {
    const f = await officialLifeFixture(
      db,
      undefined,
      sampleStoryTemplates.promotion,
    );
    const first = (await db.transaction(async (tx) => {
      const created = await new OfficialLifeRepository(tx, true).start(
        f.owner,
        f.startRequest,
        randomUUID(),
      );
      return claimSampleStoryJob(tx, f.owner, created.jobId, randomUUID());
    })) as unknown as LifeJob;
    await new LifeJobRepository(db, 600).fail(
      first,
      new DomainError('NARRATIVE_QUALITY_FAILED', 'Quality gate failed.'),
    );
    const again = (await db.transaction(async (tx) => {
      const created = await new OfficialLifeRepository(tx, true).start(
        f.owner,
        f.startRequest,
        randomUUID(),
      );
      return claimSampleStoryJob(tx, f.owner, created.jobId, randomUUID());
    })) as unknown as LifeJob;
    expect(again.branch_id).not.toBe(first.branch_id);
    expect((await processSample(f.owner, again)).status).toBe('completed');
  });

  it('claims only a queued job inside its creation transaction', async () => {
    await expect(
      db.transaction((tx) =>
        claimSampleStoryJob(tx, randomUUID(), randomUUID(), randomUUID()),
      ),
    ).rejects.toThrow(/creation transaction/);
  });
});
