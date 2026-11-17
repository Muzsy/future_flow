// Plan 051: an Official life written on the reader's story (v10) fiction path.
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
  type Database,
  type LifeJob,
} from '@future-flow/database';
import {
  FICTION_MODE,
  fictionV11Policy,
  lifeStoryDraftRequestV2Schema,
  officialLifeEvidenceSchema,
  scenarioTemplateSchema,
  storySetupFromDraft,
} from '@future-flow/contracts';
import { applyMigrations } from '../scripts/lib/migrations';
import { processLifeJob } from '../apps/worker/src/life-processor';
import { fictionFixture } from './fiction-fixtures';
import { setupFixture } from './life-fixtures';
import { scenarioFixture } from './scenario-fixtures';
import {
  officialBundleFixture,
  officialGrant,
  officialLifeFixture,
} from './official-life-fixtures';

let engine: PGlite, db: Database, jobs: LifeJobRepository;
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
  jobs = new LifeJobRepository(db);
});
afterAll(async () => {
  await engine?.close();
});

function storyTemplate() {
  const draft = lifeStoryDraftRequestV2Schema.parse({
    ...setupFixture(),
    story: {
      contractVersion: '1.0.0',
      catalogVersion: '1.0.0',
      direction: 'relationships',
      subtype: 'friendship',
      answers: {},
      startingSituation: { id: 'rel.new_city', note: null },
      boundaries: [],
      title: null,
      goalChoice: 'set',
    },
  });
  const { cast: _cast, ...story } = storySetupFromDraft(draft)!.story as Record<
    string,
    unknown
  > & { cast?: unknown };
  return scenarioTemplateSchema.parse({
    ...scenarioFixture(),
    story: { ...story, cast: [] },
  });
}

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

// Offline provider: answers each fiction stage from the canonical fixture and
// accounts every request through the real guarded budget, like production.
// `boundaryFailures` makes the first fidelity checks report a boundary wording
// issue, so the v11 further prose-only repair runs (plan 052).
async function processFiction(
  owner: string,
  job: LifeJob,
  boundaryFailures = 0,
) {
  const f = fictionFixture(job.payload);
  let fidelityCalls = 0;
  const parse = vi.fn(
    async (request: {
      model: string;
      input: { role: string; content: string }[];
      text: { format: { name: string } };
    }) => {
      const task = request.text.format.name;
      const user = JSON.parse(
        request.input.find((i) => i.role === 'user')!.content,
      ) as { authorRepair?: { mode: string } };
      const output =
        task === 'life_narrative_plan'
          ? f.draft
          : task === 'life_narrative_chapter'
            ? user.authorRepair?.mode === 'prose_only'
              ? {
                  chapter: {
                    title: f.authored.chapter.title,
                    body: f.authored.chapter.body,
                  },
                }
              : f.authored
            : task === 'life_narrative_plan_review'
              ? f.review
              : task === 'life_fidelity'
                ? ++fidelityCalls <= boundaryFailures
                  ? {
                      valid: false,
                      issues: [
                        {
                          chapterNo: 1,
                          reason:
                            'hard_boundary_violation: a supplied person is given a gendered pronoun.',
                        },
                      ],
                    }
                  : f.fidelity
                : f.editor;
      return {
        status: 'completed',
        model: request.model,
        _request_id: `req_isolated_${randomUUID()}`,
        output_parsed: output,
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
        { projectUsd: 10, userUsd: 10 },
        job.lease_token,
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

describe('Official life on the story (v10) fiction path', () => {
  it('starts the v10 path, proves every period and grants the source', async () => {
    const f = await officialLifeFixture(db, undefined, storyTemplate());
    const created = await f.official.start(
      f.owner,
      f.startRequest,
      randomUUID(),
    );
    const first = (await jobs.claim())!;
    expect(first.id).toBe(created.jobId);
    expect(first.payload.input.story).toBeDefined();
    expect(first.payload.narrativeContext?.policy).toEqual(fictionV11Policy());
    expect((await processFiction(f.owner, first)).status).toBe('completed');

    // A reader's choice and a second v10 period, as the operator would do.
    const lives = new LifeRepository(
      db,
      { daily: 100, concurrent: 10 },
      storyConfig(f.owner),
    );
    const detail = await lives.detail(f.owner, created.branchId),
      decision = detail.branch.pending_decision!;
    await lives.choose(
      f.owner,
      created.branchId,
      detail.branch.revision,
      decision.id,
      decision.options[0]!.id,
      randomUUID(),
    );
    const branch = await lives.branch(f.owner, created.branchId);
    await lives.continue(f.owner, branch.id, branch.revision, randomUUID());
    const second = (await jobs.claim())!;
    expect(second.payload.narrativeContext?.policy).toEqual(fictionV11Policy());
    expect((await processFiction(f.owner, second)).status).toBe('completed');

    const content = await officialBundleFixture(db, f, created);
    const inspected = await f.official.inspect(
      f.owner,
      content.bundle.bundleId,
    );
    const evidence = officialLifeEvidenceSchema.parse(inspected.evidence);
    expect(evidence.periods).toHaveLength(2);
    for (const period of evidence.periods) {
      expect(period).toHaveProperty('narrativeGeneration');
      expect(period.receipts.length).toBeGreaterThanOrEqual(5);
    }
    const granted = await f.official.grant(f.owner, officialGrant(inspected));
    expect(granted.grant).toMatchObject({ status: 'active', usable: true });
  });

  it('proves a v11 period written with the further prose-only repair (10 calls)', async () => {
    const f = await officialLifeFixture(db, undefined, storyTemplate());
    const created = await f.official.start(
      f.owner,
      f.startRequest,
      randomUUID(),
    );
    const job = (await jobs.claim())!;
    const done = await processFiction(f.owner, job, 2);
    expect(done.status).toBe('completed');
    expect(done.checkpoints.proseRepairUsed).toBe(true);
    const content = await officialBundleFixture(db, f, created);
    const inspected = await f.official.inspect(
      f.owner,
      content.bundle.bundleId,
    );
    const evidence = officialLifeEvidenceSchema.parse(inspected.evidence);
    const [period] = evidence.periods as { receipts: unknown[] }[];
    expect(period!.receipts).toHaveLength(10);
    const granted = await f.official.grant(f.owner, officialGrant(inspected));
    expect(granted.grant).toMatchObject({ status: 'active', usable: true });
  });

  it('refuses a fiction period whose completion binding was altered', async () => {
    const f = await officialLifeFixture(db, undefined, storyTemplate());
    const created = await f.official.start(
      f.owner,
      f.startRequest,
      randomUUID(),
    );
    const job = (await jobs.claim())!;
    await processFiction(f.owner, job);
    const content = await officialBundleFixture(db, f, created);
    // Saved periods are immutable in the database; the job's completion
    // binding is what ties them to their receipts, so alter that instead.
    await db.query(
      "UPDATE aw_jobs SET checkpoints=jsonb_set(checkpoints,'{narrativeGenerationBinding,artifactHash}',to_jsonb(repeat('0',64))) WHERE id=$1",
      [job.id],
    );
    await expect(
      f.official.inspect(f.owner, content.bundle.bundleId),
    ).rejects.toMatchObject({ code: 'OFFICIAL_LIFE_EVIDENCE_REQUIRED' });
  });

  it('refuses a story start for politics and keeps public starts story-free', async () => {
    const template = storyTemplate();
    const politics = scenarioTemplateSchema.safeParse({
      ...template,
      story: {
        ...template.story!,
        emphases: [{ direction: 'politics' }],
      },
    });
    // Either the contract or the start refuses a politics story.
    if (politics.success) {
      const f = await officialLifeFixture(db, undefined, politics.data);
      await expect(
        f.official.start(f.owner, f.startRequest, randomUUID()),
      ).rejects.toThrow();
    }
    const f = await officialLifeFixture(db, undefined, template);
    // A normal (non-operator) start of a story template is refused.
    await expect(
      f.scenarios.start(
        f.owner,
        f.version.id,
        { templateHash: f.version.templateHash, acknowledged: true },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'STORY_DIRECTION_INVALID' });
  });
});
