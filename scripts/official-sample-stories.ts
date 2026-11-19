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
  OfficialPublicationRepository,
  PublicContentCurationRepository,
  PublicContentRepository,
  PublicContentReviewJobRepository,
  PublicDraftRepository,
  Repository,
  ScenarioReleaseRepository,
  ScenarioRepository,
  type LifeJob,
  type NarrativeConfig,
} from '@future-flow/database';
import { OpenAiProvider } from '@future-flow/ai';
import { hash } from '@future-flow/core';
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
  sampleLifeEditorialSchema,
  samplePublishAuthorizationSchema,
  correctedSampleCopy,
  validateSamplePublicationApproval,
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
//         next <story> <saved-periods> <option-number> | restart <story> |
//         retry <story> |
//         show <story> | status
//
// restart: a chapter that failed its quality gate is final and an Official
// life must stay on its root branch, so the story starts again as a new
// Official life from the same reviewed and granted source. The failed life is
// kept (never published).
const dir = privateReportDirectory('official-sample-stories');
const load = (name: string) =>
  JSON.parse(readFileSync(resolve(dir, name + '.json'), 'utf8'));
const save = (name: string, value: unknown) =>
  privateReportFile(dir, name + '.json', value);
const lock = resolve(dir, 'operator.lock');
const lockFd = openSync(lock, 'wx');
writeFileSync(lockFd, JSON.stringify({ pid: process.pid }));
closeSync(lockFd);

const paidPhases = [
  'review',
  'first',
  'next',
  'restart',
  'retry',
  'prepare',
  'publish',
];
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
    [
      'init',
      'review',
      'source',
      'first',
      'next',
      'restart',
      'retry',
      'prepare',
      'curate',
      'publication-preview',
      'publication-confirm',
      'copy',
      'publish',
      'show',
      'status',
    ].includes(phase!),
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
    // The per-account ceilings follow the same rule.
    const accounts = await database.query(
      "UPDATE aw_budget_accounts SET limit_micro=$2 WHERE id LIKE 'user:%' AND id LIKE $1 AND user_id=ANY($3::uuid[]) AND limit_micro<$2 RETURNING id",
      [
        `%:window:${state.window.startsAt}:${state.window.endsAt}`,
        Math.floor(SAMPLE_STORY_USER_BUDGET_USD * 1e6),
        Object.values(state.stories).map((v: any) => v.owner),
      ],
    );
    if (accounts.length)
      console.error(
        JSON.stringify({
          accountLimitsRaisedToUsd: SAMPLE_STORY_USER_BUDGET_USD,
        }),
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
  } else if (phase === 'first' || phase === 'restart') {
    if (phase === 'restart') {
      assert.ok(entry().branchId, 'Nothing to restart');
      const failed = await detail();
      assert.equal(
        failed.branch.status,
        'failed',
        'Only a failed life restarts',
      );
      (entry().abandonedLives ??= []).push({
        branchId: entry().branchId,
        periods: entry().periods,
      });
      entry().branchId = undefined;
      entry().created = undefined;
      entry().periods = 0;
      save('state', state);
    }
    assert.ok(entry().grant && !entry().branchId);
    const key = randomUUID();
    mark(
      `${story}-${phase === 'restart' ? `restart-${(entry().abandonedLives ?? []).length}` : 'first'}`,
      { key },
    );
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
  } else if (phase === 'retry') {
    // A chapter that stopped is retried with the product's own retry: same
    // job, same choice. After a quality failure (plan 052 K2) the retry is a
    // fresh attempt with the same gates.
    const life = await detail();
    assert.equal(life.branch.status, 'failed', 'Only a failed chapter retries');
    const failed = life.job as { id: string; error_code: string } | null;
    assert.ok(failed, 'No failed job');
    // The product decides: a non-quality stop, or a quality failure that
    // plan 052 K2 recovers as a fresh attempt on the same choice.
    assert.ok(
      (life.job as { retryAvailable?: boolean } | null)?.retryAvailable,
      'The product offers no retry for this chapter',
    );
    const key = randomUUID();
    mark(`${story}-retry-${failed.id}`, { key, errorCode: failed.error_code });
    const job = await database.transaction(async (tx) => {
      await new LifeRepository(
        tx,
        { daily: 100, concurrent: 10 },
        storyNarrative(entry().owner),
      ).retry(entry().owner, failed.id, life.branch.revision, key);
      return claimSampleStoryJob(tx, entry().owner, failed.id, randomUUID());
    });
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
  } else if (phase === 'prepare') {
    // Publication copy: the exact story copy, no fork checkpoints, then one
    // complete AI content review. Nothing is published here.
    const life = await detail();
    assert.equal(life.branch.status, 'decision', 'Finish the story first');
    assert.equal(life.periods.length, SAMPLE_STORY_PERIODS);
    assert.ok(!entry().bundle, 'Already prepared');
    mark(`${story}-prepare-${entry().branchId}`);
    const drafts = new PublicDraftRepository(database);
    const ws = await drafts.workspace(entry().owner, entry().branchId);
    save(`${story}-workspace`, ws);
    const preview = await drafts.prepare(
      entry().owner,
      entry().branchId,
      ws.source.sourceRevision,
      ws.source.copy,
      randomUUID(),
    );
    const bundle = await new PublicContentRepository(database, true).save(
      entry().owner,
      preview.draftId,
      {
        snapshotHash: preview.snapshotHash,
        sourceRevision: preview.sourceRevision,
        selectedCheckpointIds: [],
        acknowledged: true,
      },
      randomUUID(),
    );
    entry().bundle = bundle;
    save(`${story}-bundle`, bundle);
    save('state', state);
    const reviewConfig = {
      enabled: true,
      operatorEnabled: true,
      daily: 20,
      projectUsd: SAMPLE_STORY_BUDGET_USD,
      userUsd: SAMPLE_STORY_USER_BUDGET_USD,
    };
    const job = await database.transaction(async (tx) => {
      const queued = await new PublicContentReviewJobRepository(
        tx,
        reviewConfig as never,
      ).enqueue(
        entry().owner,
        bundle.bundleId,
        {
          contentHash: bundle.contentHash,
          policyVersion: 'public-content-review-1',
          acknowledged: true,
        },
        randomUUID(),
      );
      const [claimed] = await tx.query<any>(
        "UPDATE aw_public_content_reviews SET status='running',lease_token=$3,lease_until=now()+interval '15 minutes' WHERE id=$1 AND user_id=$2 AND status='queued' RETURNING *",
        [queued.job!.id, entry().owner, randomUUID()],
      );
      assert.ok(claimed, 'Review must be claimed inside its creation');
      return claimed;
    });
    const reviews = new PublicContentReviewJobRepository(
      database,
      reviewConfig as never,
      900,
    );
    try {
      const input = await reviews.input(job);
      const result = await new OpenAiProvider({
        ...models,
        maxOutputTokens: 2200,
        guard: new DatabaseAiBudget(
          database,
          entry().owner,
          job.id,
          budgetConfig(),
        ),
      }).reviewPublicContent(input);
      await reviews.complete(job, result.output, result.receipt);
      save(`${story}-content-review`, result);
      entry().contentReviewId = job.id;
      entry().contentReviewHash = hash(result.output);
      entry().contentReviewVerdict = result.output.verdict;
      save('state', state);
    } catch (error) {
      await reviews.fail(job).catch(() => undefined);
      throw error;
    }
    writeFileSync(
      resolve(dir, `${story}-public-copy.json`),
      JSON.stringify(preview.snapshot, null, 2),
      { mode: 0o600 },
    );
  } else if (phase === 'curate') {
    // Curation and the Official LIFE grant, from the explicit editorial record.
    const b = entry().bundle;
    assert.ok(b && entry().contentReviewId && !entry().officialGrant);
    assert.equal(entry().contentReviewVerdict, 'no_findings');
    const approval = sampleLifeEditorialSchema.parse(
      load(`${story}-content-editorial-approval`),
    );
    assert.equal(approval.contentHash, b.contentHash);
    assert.equal(approval.reviewId, entry().contentReviewId);
    assert.equal(approval.reviewHash, entry().contentReviewHash);
    mark(`${story}-curate-${b.contentHash.slice(0, 16)}`);
    const curations = new PublicContentCurationRepository(database, true);
    const request = {
      contentHash: b.contentHash,
      reviewId: entry().contentReviewId,
      reviewHash: entry().contentReviewHash,
      policyVersion: 'public-content-review-1',
      curationVersion: 'public-content-curation-1',
      acknowledged: true,
    };
    const submitted = await curations.submit(
      entry().owner,
      b.bundleId,
      request,
      randomUUID(),
    );
    const { acknowledged: _ack, ...binding } = request;
    await curations.decide({
      curationId: submitted.curation!.id,
      bundleId: b.bundleId,
      draftId: b.draftId,
      snapshotHash: b.snapshotHash,
      sourceRevision: b.sourceRevision,
      ...binding,
      status: 'content_reviewed',
      reasonCode: null,
      actorLabel: approval.actor,
      privacyChecked: true,
      contentChecked: true,
      consistencyChecked: true,
    } as never);
    const official = new OfficialLifeRepository(database, true);
    const inspected = await official.inspect(entry().owner, b.bundleId);
    save(`${story}-official-evidence`, inspected);
    entry().officialGrant = await official.grant(entry().owner, {
      sourceVersion: 'official-life-source-1',
      binding: inspected.evidence.binding,
      evidenceHash: inspected.evidenceHash,
      fictionalSourceChecked: true,
      rightsChecked: true,
      qualityChecked: true,
      acknowledged: true,
      actorLabel: approval.actor,
    } as never);
    save('state', state);
  } else if (phase === 'publication-preview') {
    const b = entry().bundle;
    assert.ok(entry().officialGrant && !entry().publication);
    assert.ok(
      /^[a-f0-9]{64}$/.test(process.env.PUBLICATION_LINK_SECRET ?? ''),
      'The service publication link secret is required',
    );
    const bound = await new OfficialLifeRepository(
      database,
      true,
    ).forPublication(entry().owner, b.bundleId);
    mark(`${story}-publication-preview-${b.bundleId.slice(0, 8)}`);
    const preview = await new OfficialPublicationRepository(database, {
      enabled: true,
      linkSecret: process.env.PUBLICATION_LINK_SECRET!,
    } as never).prepare(
      entry().owner,
      {
        binding: bound.binding,
        settings: {
          visibility: 'public',
          authorMode: 'anonymous',
          indexable: false,
        },
      },
      randomUUID(),
    );
    save(`${story}-publication-preview`, preview);
    entry().publicationPreview = preview;
    save('state', state);
  } else if (phase === 'publication-confirm') {
    const preview = load(`${story}-publication-preview`);
    assert.ok(entry().publicationPreview && !entry().publication);
    assert.equal(hash(preview), hash(entry().publicationPreview));
    assert.equal(rest[0], preview.previewHash, 'Exact preview hash required');
    validateSamplePublicationApproval(
      load(`${story}-publication-approval`),
      preview,
      load(`${story}-content-editorial-approval`),
    );
    mark(`${story}-publication-confirm-${preview.previewId.slice(0, 8)}`);
    const publications = new OfficialPublicationRepository(database, {
      enabled: true,
      linkSecret: process.env.PUBLICATION_LINK_SECRET!,
    } as never);
    const published = await publications.confirm(
      entry().owner,
      {
        previewId: preview.previewId,
        previewHash: preview.previewHash,
        acknowledged: true,
      },
      randomUUID(),
    );
    entry().publication = published;
    save(`${story}-publication`, published);
    save('state', state);
    const reader = await publications.readPublic(published.slug);
    assert.equal(hash(reader.snapshot), published.snapshotHash);
  } else if (phase === 'copy') {
    // The exact final public copy (approved corrections applied) and its
    // hash, for the owner to read before authorizing publication. Free.
    const ws = await new PublicDraftRepository(database).workspace(
      entry().owner,
      entry().branchId,
    );
    const copy = correctedSampleCopy(story as never, ws.source.copy);
    const copyHash = hash(copy);
    writeFileSync(
      resolve(dir, `${story}-final-copy.json`),
      JSON.stringify({ copyHash, copy }, null, 2),
      { mode: 0o600 },
    );
    const lines = [`# ${copy.title}`, '', copy.summary, ''];
    copy.periods.forEach((period: any, index: number) => {
      lines.push(
        `## ${index + 1}. ${period.chapter.title}`,
        '',
        period.chapter.body,
        '',
      );
      lines.push('Timeline:', '');
      for (const event of period.events)
        lines.push(`- **${event.title}** — ${event.summary}`);
      lines.push('');
      if (period.decision) {
        lines.push(`### ${period.decision.prompt}`, '');
        for (const option of period.decision.options ?? [])
          lines.push(`- **${option.label}** — ${option.description}`);
        lines.push('');
      }
    });
    lines.push(`copyHash: ${copyHash}`);
    writeFileSync(resolve(dir, `${story}-final-copy.md`), lines.join('\n'), {
      mode: 0o600,
    });
    console.error(JSON.stringify({ story, copyHash }));
  } else if (phase === 'publish') {
    // One run from the owner's authorization: copy check, bundle, complete AI
    // review, curation, Official grant, preview, confirmation.
    const auth = samplePublishAuthorizationSchema.parse(
      load(`${story}-publish-authorization`),
    );
    assert.equal(auth.story, story);
    assert.ok(!entry().publication, 'Already published');
    const drafts = new PublicDraftRepository(database);
    const ws = await drafts.workspace(entry().owner, entry().branchId);
    const copy = correctedSampleCopy(story as never, ws.source.copy);
    assert.equal(hash(copy), auth.copyHash, 'The authorized copy changed');
    mark(`${story}-publish-${auth.copyHash.slice(0, 16)}`);
    if (entry().bundle) (entry().expiredBundles ??= []).push(entry().bundle);
    const preview = await drafts.prepare(
      entry().owner,
      entry().branchId,
      ws.source.sourceRevision,
      copy,
      randomUUID(),
    );
    const bundle = await new PublicContentRepository(database, true).save(
      entry().owner,
      preview.draftId,
      {
        snapshotHash: preview.snapshotHash,
        sourceRevision: preview.sourceRevision,
        selectedCheckpointIds: [],
        acknowledged: true,
      },
      randomUUID(),
    );
    entry().bundle = bundle;
    save(`${story}-bundle`, bundle);
    save('state', state);
    const reviewConfig = {
      enabled: true,
      operatorEnabled: true,
      daily: 20,
      projectUsd: SAMPLE_STORY_BUDGET_USD,
      userUsd: SAMPLE_STORY_USER_BUDGET_USD,
    };
    const job = await database.transaction(async (tx) => {
      const queued = await new PublicContentReviewJobRepository(
        tx,
        reviewConfig as never,
      ).enqueue(
        entry().owner,
        bundle.bundleId,
        {
          contentHash: bundle.contentHash,
          policyVersion: 'public-content-review-1',
          acknowledged: true,
        },
        randomUUID(),
      );
      const [claimed] = await tx.query<any>(
        "UPDATE aw_public_content_reviews SET status='running',lease_token=$3,lease_until=now()+interval '15 minutes' WHERE id=$1 AND user_id=$2 AND status='queued' RETURNING *",
        [queued.job!.id, entry().owner, randomUUID()],
      );
      assert.ok(claimed, 'Review must be claimed inside its creation');
      return claimed;
    });
    const reviews = new PublicContentReviewJobRepository(
      database,
      reviewConfig as never,
      900,
    );
    let output: any;
    try {
      const input = await reviews.input(job);
      const result = await new OpenAiProvider({
        ...models,
        maxOutputTokens: 2200,
        guard: new DatabaseAiBudget(
          database,
          entry().owner,
          job.id,
          budgetConfig(),
        ),
      }).reviewPublicContent(input);
      await reviews.complete(job, result.output, result.receipt);
      save(`${story}-content-review`, result);
      output = result.output;
    } catch (error) {
      await reviews.fail(job).catch(() => undefined);
      throw error;
    }
    entry().contentReviewId = job.id;
    entry().contentReviewHash = hash(output);
    entry().contentReviewVerdict = output.verdict;
    save('state', state);
    const blocking = (output.findings as { category: string }[]).filter(
      (f) =>
        !(auth.allowedFindingCategories as readonly string[]).includes(
          f.category,
        ),
    );
    assert.ok(
      output.verdict === 'no_findings' ||
        (output.verdict === 'review_required' && blocking.length === 0),
      `Review findings outside the authorized fiction categories: ${blocking.map((f) => f.category).join(', ') || output.verdict}`,
    );
    // The editorial record this run acted on, bound to what it reviewed.
    const editorial = sampleLifeEditorialSchema.parse({
      at: new Date().toISOString(),
      actor: auth.actor,
      contentHash: bundle.contentHash,
      reviewId: job.id,
      reviewHash: hash(output),
      fullCopyRead: true,
      privacyChecked: true,
      contentChecked: true,
      consistencyChecked: true,
      qualityChecked: true,
      fictionalSourceChecked: true,
      rightsChecked: true,
      note: auth.note,
    });
    save(`${story}-content-editorial-approval`, editorial);
    const curations = new PublicContentCurationRepository(database, true);
    const request = {
      contentHash: bundle.contentHash,
      reviewId: job.id,
      reviewHash: hash(output),
      policyVersion: 'public-content-review-1',
      curationVersion: 'public-content-curation-1',
      acknowledged: true,
    };
    const submitted = await curations.submit(
      entry().owner,
      bundle.bundleId,
      request,
      randomUUID(),
    );
    const { acknowledged: _ack, ...binding } = request;
    await curations.decide({
      curationId: submitted.curation!.id,
      bundleId: bundle.bundleId,
      draftId: bundle.draftId,
      snapshotHash: bundle.snapshotHash,
      sourceRevision: bundle.sourceRevision,
      ...binding,
      status: 'content_reviewed',
      reasonCode: null,
      actorLabel: auth.actor,
      privacyChecked: true,
      contentChecked: true,
      consistencyChecked: true,
    } as never);
    const official = new OfficialLifeRepository(database, true);
    const inspected = await official.inspect(entry().owner, bundle.bundleId);
    save(`${story}-official-evidence`, inspected);
    entry().officialGrant = await official.grant(entry().owner, {
      sourceVersion: 'official-life-source-1',
      binding: inspected.evidence.binding,
      evidenceHash: inspected.evidenceHash,
      fictionalSourceChecked: true,
      rightsChecked: true,
      qualityChecked: true,
      acknowledged: true,
      actorLabel: auth.actor,
    } as never);
    save('state', state);
    assert.ok(
      /^[a-f0-9]{64}$/.test(process.env.PUBLICATION_LINK_SECRET ?? ''),
      'The service publication link secret is required',
    );
    const publications = new OfficialPublicationRepository(database, {
      enabled: true,
      linkSecret: process.env.PUBLICATION_LINK_SECRET!,
    } as never);
    const bound = await official.forPublication(entry().owner, bundle.bundleId);
    const publicationPreview = await publications.prepare(
      entry().owner,
      { binding: bound.binding, settings: auth.settings },
      randomUUID(),
    );
    save(`${story}-publication-preview`, publicationPreview);
    const published = await publications.confirm(
      entry().owner,
      {
        previewId: publicationPreview.previewId,
        previewHash: publicationPreview.previewHash,
        acknowledged: true,
      },
      randomUUID(),
    );
    entry().publication = published;
    save(`${story}-publication`, published);
    save('state', state);
    const reader = await publications.readPublic(published.slug);
    assert.equal(hash(reader.snapshot), published.snapshotHash);
    console.error(JSON.stringify({ story, published: published.slug }));
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
