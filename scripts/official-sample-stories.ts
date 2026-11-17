import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  connectDatabase,
  DatabaseAiBudget,
  LifeJobRepository,
  LifeRepository,
  OfficialLifeRepository,
  Repository,
  ScenarioReleaseRepository,
  ScenarioRepository,
  type LifeJob,
  type NarrativeConfig,
} from '@future-flow/database';
import { OpenAiProvider } from '@future-flow/ai';
import { processLifeJob } from '../apps/worker/src/life-processor';
import {
  privateReportDirectory,
  privateReportFile,
} from './lib/private-report';
import { catalogSourceEditorialSchema } from './lib/closed-beta-catalog';
import { runScenarioReview } from './lib/scenario-release';
import {
  claimSampleStoryJob,
  isSampleStoryKey,
  sampleStoryTemplates,
  SAMPLE_STORY_BUDGET_USD,
  SAMPLE_STORY_USER_BUDGET_USD,
  SAMPLE_STORY_KEYS,
  SAMPLE_STORY_LEASE_SECONDS,
  SAMPLE_STORY_MAX_REQUEST_BYTES,
  SAMPLE_STORY_PERIODS,
  SAMPLE_STORY_WINDOW_DAYS,
} from './lib/official-sample-stories';

// Plan 051 M3. Protected operator job: one explicitly selected stage per
// invocation, no automatic retry, publication or grant from an AI verdict.
// Paid stages use one fixed 3 USD window of their own, never the service
// budget. Run as the service's worker identity, but outside the service: the
// sample accounts are operator-owned fictional sources, not admitted users.
//
// Phases: init | review <story> | source <story> | first <story> |
//         next <story> <saved-periods> <option-number> | show <story> | status
const dir = privateReportDirectory('official-sample-stories');
const load = (name: string) =>
  JSON.parse(readFileSync(resolve(dir, name + '.json'), 'utf8'));
const save = (name: string, value: unknown) =>
  privateReportFile(dir, name + '.json', value);
const lock = resolve(dir, 'operator.lock');
const lockFd = openSync(lock, 'wx');
writeFileSync(lockFd, JSON.stringify({ pid: process.pid }));
closeSync(lockFd);

const paidPhases = ['review', 'first', 'next'];
let db: ReturnType<typeof connectDatabase> | undefined;

function storyNarrative(owner: string): NarrativeConfig {
  return {
    mode: 'narrative-fiction-v2',
    cohortUserIds: [owner],
    fictionGeneration: 'v9',
    storyDirections: {
      enabled: true,
      politicsEnabled: false,
      cohortUserIds: [owner],
    },
  } as NarrativeConfig;
}

async function main() {
  const [phase, story, ...rest] = process.argv.slice(2);
  assert.ok(
    ['init', 'review', 'source', 'first', 'next', 'show', 'status'].includes(
      phase!,
    ),
    'Explicit phase required',
  );
  // The operator process never runs the service's admission: the sample
  // accounts hold no subscription or wave seat and must not take one.
  assert.equal(
    process.env.SERVICE_ACCESS_ENFORCEMENT,
    'false',
    'Run outside service admission (SERVICE_ACCESS_ENFORCEMENT=false)',
  );
  if (!['init', 'status'].includes(phase!))
    assert.ok(isSampleStoryKey(story), 'Sample story key required');
  let state: any = existsSync(resolve(dir, 'state.json'))
    ? load('state')
    : null;
  db = connectDatabase(
    process.env.DATABASE_URL ?? '',
    process.env.DATABASE_SSL === 'true',
  );
  const database = db;
  const mark = (name: string, extra: unknown = {}) => {
    const fd = openSync(resolve(dir, `attempt-${name}.json`), 'wx');
    writeFileSync(
      fd,
      JSON.stringify({ phase, at: new Date().toISOString(), extra }, null, 2),
    );
    closeSync(fd);
  };
  const projectKey = () =>
    `project:window:${state.window.startsAt}:${state.window.endsAt}`;
  const budgetConfig = () => ({
    provider: 'openai' as const,
    projectUsd: SAMPLE_STORY_BUDGET_USD,
    userUsd: SAMPLE_STORY_USER_BUDGET_USD,
    window: state.window,
  });
  const entry = () => state.stories[story!];
  const models = {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    eventModel: process.env.AI_EVENT_MODEL ?? '',
    storyModel: process.env.AI_STORY_MODEL ?? '',
    checkModel: process.env.AI_CHECK_MODEL || undefined,
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 90000),
    fictionTimeoutMs: Number(process.env.AI_FICTION_TIMEOUT_MS ?? 300000),
    maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 12000),
  };

  if (paidPhases.includes(phase!)) {
    assert.ok(state, 'Initialize before any paid phase');
    assert.ok(Date.parse(state.window.endsAt) > Date.now(), 'Window ended');
    const open = await database.query(
      "SELECT id FROM aw_budget_reservations WHERE project_key=$1 AND status<>'completed'",
      [projectKey()],
    );
    assert.equal(open.length, 0, 'Unresolved reservation: inspect first');
    // A stored window limit only ever rises to the reviewed allocation above;
    // the budget guard uses the lower of the stored and configured limits.
    const raised = await database.query(
      'UPDATE aw_budget_accounts SET limit_micro=$2 WHERE id=$1 AND limit_micro<$2 RETURNING id',
      [projectKey(), Math.floor(SAMPLE_STORY_BUDGET_USD * 1e6)],
    );
    if (raised.length)
      console.error(
        JSON.stringify({ projectLimitRaisedToUsd: SAMPLE_STORY_BUDGET_USD }),
      );
  }

  async function usage() {
    if (!state) return null;
    const [account] = await database.query<{
      limit_micro: string;
      accounted_micro: string;
    }>(
      'SELECT limit_micro,accounted_micro FROM aw_budget_accounts WHERE id=$1',
      [projectKey()],
    );
    const calls = await database.query<{ status: string; task: string }>(
      'SELECT task,model,status,reserved_micro,accounted_micro,input_tokens,output_tokens,created_at FROM aw_budget_reservations WHERE project_key=$1 ORDER BY created_at',
      [projectKey()],
    );
    const result = {
      window: state.window,
      accountedUsd: Number(account?.accounted_micro ?? 0) / 1e6,
      limitUsd: SAMPLE_STORY_BUDGET_USD,
      paidCalls: calls.length,
      unresolved: calls.filter((c) => c.status !== 'completed').length,
    };
    save('usage', { ...result, calls });
    return result;
  }

  async function detail() {
    return new LifeRepository(
      database,
      { daily: 100, concurrent: 10 },
      storyNarrative(entry().owner),
    ).detail(entry().owner, entry().branchId);
  }

  async function generate(claimed: LifeJob) {
    const owner = entry().owner;
    const jobs = new LifeJobRepository(database, SAMPLE_STORY_LEASE_SECONDS);
    const job = claimed;
    const beat = setInterval(() => {
      jobs
        .heartbeat(job)
        .catch(() => console.error(JSON.stringify({ heartbeat: 'refused' })));
    }, 60000);
    try {
      const ai = new OpenAiProvider({
        ...models,
        beforePhysicalRequest: () => jobs.admitNarrativeRequest(job),
        guard: new DatabaseAiBudget(
          database,
          owner,
          job.id,
          budgetConfig(),
          job.lease_token,
          SAMPLE_STORY_MAX_REQUEST_BYTES,
        ),
      });
      await processLifeJob(job, jobs, ai);
    } catch (error) {
      await jobs.fail(job, error).catch(() => undefined);
      throw error;
    } finally {
      clearInterval(beat);
    }
    const life = await detail();
    assert.equal(life.branch.status, 'decision');
    entry().periods = life.periods.length;
    save('state', state);
    save(`${story}-story`, life);
  }

  if (phase === 'init') {
    assert.equal(state, null, 'Already initialized');
    mark('init');
    assert.ok(
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
    const startsAt = new Date().toISOString();
    state = {
      runId: randomUUID(),
      window: {
        startsAt,
        endsAt: new Date(
          Date.parse(startsAt) + SAMPLE_STORY_WINDOW_DAYS * 86400000,
        ).toISOString(),
      },
      stories: {},
    };
    save('state', state);
    const admin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const repo = new Repository(database);
    for (const key of SAMPLE_STORY_KEYS) {
      // Unusable fictional source account: no address, password discarded.
      const created = await admin.auth.admin.createUser({
        email: `alterward-sample-${key}-${state.runId}@example.invalid`,
        password: randomBytes(32).toString('base64url') + 'A1!',
        email_confirm: true,
        user_metadata: { alterward_fictional_sample: state.runId },
      });
      assert.ok(!created.error && created.data.user, 'Account creation failed');
      const owner = created.data.user.id;
      state.stories[key] = { owner, periods: 0 };
      save('state', state);
      await repo.ensureUser(owner);
      await repo.acceptPrivacy(owner);
      state.stories[key].version = await new ScenarioRepository(
        database,
        true,
      ).create(owner, { template: sampleStoryTemplates[key] }, randomUUID());
      save('state', state);
    }
  } else if (phase === 'review') {
    assert.ok(entry().version && !entry().reviewed);
    mark(`${story}-review`);
    const result = await runScenarioReview(
      database,
      {
        operatorEnabled: true,
        daily: 20,
        projectUsd: SAMPLE_STORY_BUDGET_USD,
        userUsd: SAMPLE_STORY_USER_BUDGET_USD,
      },
      entry().owner,
      {
        scenarioVersionId: entry().version.id,
        templateHash: entry().version.templateHash,
        policyVersion: 'scenario-review-1',
        acknowledged: true,
      },
      (id) =>
        new OpenAiProvider({
          ...models,
          maxOutputTokens: 2200,
          guard: new DatabaseAiBudget(
            database,
            entry().owner,
            id,
            budgetConfig(),
          ),
        }),
    );
    save(`${story}-scenario-review`, result);
    assert.equal(result.view.review?.report?.verdict, 'no_findings');
    entry().reviewed = true;
    save('state', state);
  } else if (phase === 'source') {
    assert.ok(entry().reviewed && !entry().grant);
    const release = new ScenarioReleaseRepository(database, {
      operatorEnabled: true,
      daily: 20,
      projectUsd: SAMPLE_STORY_BUDGET_USD,
      userUsd: SAMPLE_STORY_USER_BUDGET_USD,
    });
    const version = await release.get(entry().owner, entry().version.id);
    const approval = catalogSourceEditorialSchema.parse(
      load(`${story}-editorial-approval`),
    );
    assert.equal(approval.templateHash, version.templateHash);
    assert.equal(approval.reviewId, version.review!.id);
    assert.equal(approval.reportHash, version.review!.reportHash);
    mark(`${story}-source`);
    const binding = {
      scenarioVersionId: version.scenarioVersionId,
      templateHash: version.templateHash,
      reviewId: version.review!.id,
      reportHash: version.review!.reportHash,
      policyVersion: 'scenario-review-1',
      curationVersion: 'scenario-curation-1',
    };
    const curated = await release.decide({
      ...binding,
      status: 'scenario_reviewed',
      reasonCode: null,
      actorLabel: approval.actor,
      privacyChecked: true,
      contentChecked: true,
      meaningChecked: true,
      qualityChecked: true,
    });
    const granted = await release.grant({
      ...binding,
      curationId: curated.curation!.id,
      sourceVersion: 'official-scenario-source-1',
      fictionalSourceChecked: true,
      rightsChecked: true,
      acknowledged: true,
      actorLabel: approval.actor,
    });
    entry().grant = granted.sourceGrant!.id;
    save(`${story}-source-grant`, granted);
    save('state', state);
  } else if (phase === 'first') {
    assert.ok(entry().grant && !entry().branchId);
    const key = randomUUID();
    mark(`${story}-first`, { key });
    const job = await database.transaction(async (tx) => {
      const created = await new OfficialLifeRepository(tx, true).start(
        entry().owner,
        {
          scenarioVersionId: entry().version.id,
          scenarioGrantId: entry().grant,
          templateHash: entry().version.templateHash,
          acknowledged: true,
        },
        key,
      );
      entry().created = created;
      entry().branchId = created.branchId;
      return claimSampleStoryJob(
        tx,
        entry().owner,
        created.jobId,
        randomUUID(),
      );
    });
    save('state', state);
    await generate(job as unknown as LifeJob);
  } else if (phase === 'next') {
    const expected = Number(rest[0]),
      option = Number(rest[1]);
    assert.ok(Number.isInteger(expected) && expected >= 1);
    assert.ok(expected < SAMPLE_STORY_PERIODS, 'All chapters are written');
    assert.ok([1, 2, 3].includes(option), 'Option number 1-3 required');
    const life = await detail();
    assert.equal(life.periods.length, expected);
    assert.equal(entry().periods, expected);
    const decision = life.branch.pending_decision!;
    const chosen = decision?.options[option - 1];
    assert.ok(chosen, 'Unknown option');
    const chooseKey = randomUUID(),
      continueKey = randomUUID();
    mark(`${story}-period-${expected + 1}`, {
      chooseKey,
      continueKey,
      decisionId: decision.id,
      optionId: chosen.id,
      label: chosen.label,
    });
    const job = await database.transaction(async (tx) => {
      const lives = new LifeRepository(
        tx,
        { daily: 100, concurrent: 10 },
        storyNarrative(entry().owner),
      );
      await lives.choose(
        entry().owner,
        life.branch.id,
        life.branch.revision,
        decision.id,
        chosen.id,
        chooseKey,
      );
      const ready = await lives.branch(entry().owner, life.branch.id);
      const next = await lives.continue(
        entry().owner,
        ready.id,
        ready.revision,
        continueKey,
      );
      return claimSampleStoryJob(tx, entry().owner, next.jobId, randomUUID());
    });
    await generate(job as unknown as LifeJob);
  } else if (phase === 'show') {
    const life = await detail();
    const lines = [`# ${sampleStoryTemplates[story as 'promotion'].title}`, ''];
    for (const period of life.periods as any[]) {
      lines.push(
        `## ${period.chapter.title}`,
        '',
        `${period.candidate.startDate} – ${period.candidate.endDate}`,
        '',
        period.chapter.body,
        '',
      );
    }
    const decision = life.branch.pending_decision as any;
    if (decision) {
      lines.push(`### ${decision.prompt}`, '');
      decision.options.forEach((o: any, i: number) =>
        lines.push(`${i + 1}. **${o.label}** — ${o.description}`),
      );
    }
    writeFileSync(resolve(dir, `${story}.md`), lines.join('\n'), {
      mode: 0o600,
    });
  }

  console.log(
    JSON.stringify({
      phase,
      story: story ?? null,
      stories: state
        ? Object.fromEntries(
            Object.entries(state.stories).map(([k, v]: [string, any]) => [
              k,
              {
                reviewed: Boolean(v.reviewed),
                granted: Boolean(v.grant),
                periods: v.periods,
              },
            ]),
          )
        : null,
      usage: await usage(),
    }),
  );
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        failed: true,
        code: error?.code ?? null,
        message: String(error?.message ?? error).slice(0, 300),
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db?.close().catch(() => undefined);
    unlinkSync(lock);
  });
