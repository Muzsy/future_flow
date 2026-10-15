import { existsSync, readFileSync, readdirSync, lstatSync } from 'node:fs';
import { mkdir, writeFile, rename, open, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import OpenAI from 'openai';
import {
  OpenAiProvider,
  ExperimentAiBudget,
  combineAiGuards,
  type AiReceipt,
  type AiResult,
  type AiRequestGuard,
} from '@future-flow/ai';
import {
  Repository,
  LifeRepository,
  LifeJobRepository,
  DatabaseAiBudget,
  type Database,
  type LifeJob,
} from '@future-flow/database';
import {
  hash,
  DomainError,
  narrativeCanon,
  narrativePlannerRequest,
  narrativeReferenceSnapshot,
  narrativeReferencesFromMemory,
  validatePeriodChapterV2,
  validateNarrativeChapterV1,
  evaluateNarrativeEditorialGate,
  narrativeWriterRequest,
  narrativeFidelityRequest,
  narrativeEditorialRequest,
} from '@future-flow/core';
import {
  narrativeV1Policy,
  NARRATIVE_WITHHELD_SUMMARY,
  type NarrativePeriodInput,
  type PeriodChapterV2,
} from '@future-flow/contracts';
import { processLifeJob } from '../../apps/worker/src/life-processor';
import {
  narrativeInput,
  narrativeProfiles,
  narrativePeriod,
  narrativeChapter,
  narrativeFixtureId,
} from '../../tests/narrative-fixtures';
import {
  narrativePlanFixture,
  longNarrativeChapterFixture,
  narrativeEditorialFixture,
} from '../../tests/narrative-plan-fixtures';
import { applyMigrations } from './migrations';
import { fixedNarrativeFixture } from './narrative-evaluation-fixtures';
import {
  evaluationCostReport,
  type EvaluationBudgetBinding,
  type ExperimentalCall,
} from './narrative-evaluation-costs';
import {
  evaluationVersion,
  choiceOverrideSchema,
  choiceIntent,
  selectEvaluationChoice,
  type EvaluationMode,
  type ChoiceOverride,
} from './narrative-evaluation-contract';
import {
  evaluationPrices,
  evaluationPriceEvidence,
  verifyEvaluationAuthorization,
  type EvaluationOptions,
} from './narrative-evaluation-options';

export type EvaluationSample = {
  id: string;
  fixtureId: string;
  mode: EvaluationMode;
  kind: 'full' | 'fixed-canon' | 'fork';
  periodIndex: number;
  chapter: PeriodChapterV2;
  prefix: { title: string; body: string }[];
  canon: unknown;
  plan: unknown;
  receipts: AiReceipt[];
  requestCount: number;
  transportCalls: number;
  physicalLatenciesMs: number[];
  elapsedMs: number;
  repairUsed: boolean;
  errorCode: string | null;
  choiceMappings: unknown[];
  mock: boolean;
};
export type EvaluationRun = {
  version: string;
  sourceCommit: string;
  sourceHash: string;
  mock: boolean;
  models: EvaluationOptions['models'];
  priceEvidence: typeof evaluationPriceEvidence;
  samples: EvaluationSample[];
  failures: {
    caseId: string;
    code: string;
    chapter: unknown;
    editorialReport: unknown;
  }[];
  choiceReviewRequests: unknown[];
  safetyProbe: { passed: boolean; markerExcluded: boolean };
  complete: boolean;
  accounting: ReturnType<typeof evaluationCostReport> | null;
};
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
async function save(path: string, value: unknown) {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path + '.tmp', JSON.stringify(value, null, 2) + '\n', {
    mode: 0o600,
  });
  await rename(path + '.tmp', path);
}
function read<T>(path: string): T | null {
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as T)
    : null;
}
function code(error: unknown) {
  return error instanceof DomainError ? error.code : 'EVAL_INTERRUPTED';
}
function sourceIdentity() {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  // A dirty implementation cannot become paid release evidence.
  const dirty = execFileSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
  }).trim();
  return {
    commit,
    dirty,
    sourceHash: hash({
      commit,
      harness: [
        'contract',
        'options',
        'runner',
        'artifacts',
        'costs',
        'fixtures',
      ].map((name) =>
        hash(
          readFileSync(`scripts/lib/narrative-evaluation-${name}.ts`, 'utf8'),
        ),
      ),
      version: evaluationVersion,
      migrations: readdirSync('database/migrations')
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map((f) => hash(readFileSync(join('database/migrations', f), 'utf8'))),
    }),
  };
}
function safetyProbe() {
  const input = narrativeInput(narrativeProfiles[0]),
    f = narrativePlanFixture(input),
    marker = 'WITHHELD_SYNTHETIC_SECRET_MARKER';
  const payload: NarrativePeriodInput = {
    ...input,
    memory: {
      recentEvents: [
        {
          id: input.periodId,
          title: marker,
          summary: marker,
          effectiveAt: input.startDate,
        },
      ],
      choices: [],
    },
    narrativeContext: {
      policy: narrativeV1Policy(),
      memory: {
        ...f.memory,
        withheld: true,
        history: [
          {
            periodId: narrativeFixtureId('withheld-history'),
            position: 1,
            startDate: '2025-01-15',
            endDate: '2025-07-15',
            summary: NARRATIVE_WITHHELD_SUMMARY,
            salientEventIds: [],
            excerpt: null,
          },
        ],
      },
    },
    narrativeReferences: narrativeReferenceSnapshot(
      narrativeReferencesFromMemory(f.memory),
    ),
  };
  const markerExcluded = !JSON.stringify(
    narrativePlannerRequest(
      payload as Parameters<typeof narrativePlannerRequest>[0],
    ),
  ).includes(marker);
  return { passed: markerExcluded, markerExcluded };
}
type TransportRecord = { caseId: string; task: string; latencyMs: number };
function clientFor(
  options: EvaluationOptions,
  env: Record<string, string | undefined>,
  job: LifeJob | undefined,
  caseId: string,
  transports: TransportRecord[],
) {
  if (options.kind === 'paid') {
    const sdk = new OpenAI({
      apiKey: env.NARRATIVE_EVAL_API_KEY!,
      project: env.NARRATIVE_EVAL_PROJECT_ID!,
      baseURL: 'https://api.openai.com/v1',
      organization: null,
      logLevel: 'off',
      maxRetries: 0,
      timeout: 120000,
    });
    const original = sdk.responses.parse.bind(sdk.responses);
    const parse = (async (parameters: Parameters<typeof original>[0]) => {
      const started = Date.now();
      try {
        // Explicit standard tier; do not inherit a project's faster, pricier default.
        return await original({ ...parameters, service_tier: 'default' });
      } finally {
        transports.push({
          caseId,
          task:
            (parameters.text?.format as { name?: string } | undefined)?.name ??
            'unknown',
          latencyMs: Date.now() - started,
        });
        await save(join(options.out, 'transport-records.json'), transports);
      }
    }) as typeof sdk.responses.parse;
    return { responses: { parse } } as unknown as OpenAI;
  }
  const parse = async (parameters: {
    model: string;
    text: { format: { name: string } };
  }) => {
    if (!job)
      throw new DomainError(
        'EVAL_CONFIG_INVALID',
        'A mock generation needs its frozen fixture job.',
      );
    const start = Date.now(),
      task = parameters.text.format.name,
      f = caseId.startsWith('fixed:')
        ? fixedNarrativeFixture(caseId.split(':')[1]!)
        : narrativePlanFixture(job.payload),
      candidate = narrativePeriod(job.payload);
    const canon = f.canon;
    const story = {
      locale: job.payload.input.locale,
      identity: job.payload.input.identity,
      goals: job.payload.input.goals,
      events: canon.events,
    };
    const output =
      task === 'life_period'
        ? candidate
        : task === 'life_narrative_plan'
          ? f.result
          : task === 'life_chapter'
            ? narrativeChapter(story)
            : task === 'life_narrative_chapter'
              ? longNarrativeChapterFixture(f)
              : task === 'life_fidelity'
                ? { valid: true, issues: [] }
                : narrativeEditorialFixture();
    transports.push({ caseId, task, latencyMs: Date.now() - start });
    await save(join(options.out, 'transport-records.json'), transports);
    return {
      status: 'completed',
      model: parameters.model,
      output_parsed: output,
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  };
  return { responses: { parse } } as unknown as OpenAI;
}
function receiptsInOrder(
  rows: { metadata: AiReceipt }[],
  order: unknown,
): AiReceipt[] {
  if (!Array.isArray(order))
    throw new DomainError('EVAL_STATE_INVALID', 'Missing receipt order.');
  const buckets = new Map<string, AiReceipt[]>();
  for (const { metadata } of rows) {
    const key = hash(metadata);
    buckets.set(key, [...(buckets.get(key) ?? []), metadata]);
  }
  return order.map((key) => {
    const receipt = buckets.get(String(key))?.shift();
    if (!receipt)
      throw new DomainError('EVAL_STATE_INVALID', 'Receipt order differs.');
    return receipt;
  });
}

async function fixedCanonComparison(
  fixtureId: string,
  options: EvaluationOptions,
  env: Record<string, string | undefined>,
  report: EvaluationRun,
  transports: TransportRecord[],
  guardFor: (caseId: string) => AiRequestGuard | undefined,
) {
  const profile = narrativeProfiles.find((p) => p.id === fixtureId)!,
    input = narrativeInput(profile),
    fixture = fixedNarrativeFixture(fixtureId);
  // This is an authored fixed plan, not a fresh planner result. Keep its IDs
  // stable across process restarts so cached writer receipts remain reusable.
  fixture.result.plan.scenes.forEach((scene, index) => {
    scene.sceneId = narrativeFixtureId(`fixed:${fixtureId}:scene:${index}`);
  });
  const payload: NarrativePeriodInput = {
    ...input,
    narrativeContext: { policy: narrativeV1Policy(), memory: fixture.memory },
    narrativeReferences: narrativeReferenceSnapshot(
      narrativeReferencesFromMemory(fixture.memory),
    ),
  };
  const run = narrativeCanon(payload, fixture.result),
    legacyStory = {
      locale: input.input.locale,
      identity: input.input.identity,
      goals: input.input.goals,
      events: run.canon.events,
    };
  const path = join(options.out, 'state', `fixed-${fixtureId}.json`),
    binding = hash({
      sourceHash: report.sourceHash,
      canon: run.canon.events,
      plan: run.result.plan,
      models: options.models,
    });
  // Standalone writer comparison: an explicitly fixture-authored, validated plan.
  // No planner receipt is fabricated and no application period is committed.
  const state = read<{
    binding: string;
    requestCount: number;
    admittedByMode: Record<EvaluationMode, number>;
    responses: Record<string, AiResult<unknown>>;
    startedAt: number;
  }>(path) ?? {
    binding,
    requestCount: 0,
    admittedByMode: { legacy: 0, 'narrative-v1': 0 },
    responses: {},
    startedAt: Date.now(),
  };
  if (state.binding !== binding)
    throw new DomainError('EVAL_STATE_INVALID', 'Fixed-canon cache differs.');
  const frozenJob = { payload } as LifeJob;
  let activeMode: EvaluationMode = 'legacy';
  const beforePhysicalRequest = async () => {
    if (
      !Number.isSafeInteger(state.requestCount) ||
      state.requestCount < 0 ||
      state.requestCount >= 7
    )
      throw new DomainError(
        'NARRATIVE_REQUEST_LIMIT',
        'Fixed-canon request ceiling reached.',
      );
    state.requestCount++;
    state.admittedByMode[activeMode]++;
    await save(path, state);
  };
  async function response<T>(
    key: string,
    inputHash: string,
    make: () => Promise<AiResult<T>>,
  ): Promise<AiResult<T>> {
    const cached = state.responses[key] as AiResult<T> | undefined;
    if (cached) {
      if (
        cached.receipt.inputHash !== inputHash ||
        cached.receipt.outputHash !== hash(cached.output)
      )
        throw new DomainError(
          'EVAL_STATE_INVALID',
          'Fixed-canon response binding differs.',
        );
      return cached;
    }
    const result = await make();
    if (
      result.receipt.inputHash !== inputHash ||
      result.receipt.outputHash !== hash(result.output)
    )
      throw new DomainError(
        'EVAL_STATE_INVALID',
        'Fixed-canon provider binding differs.',
      );
    state.responses[key] = result;
    await save(path, state);
    return result;
  }
  for (const mode of ['legacy', 'narrative-v1'] as const) {
    activeMode = mode;
    const caseId = `fixed:${fixtureId}:${mode}:0`,
      sampleId = `fixed-canon:${fixtureId}:${mode}:0`;
    if (report.samples.some((s) => s.id === sampleId)) continue;
    const ai = new OpenAiProvider(
      {
        apiKey:
          options.kind === 'paid'
            ? env.NARRATIVE_EVAL_API_KEY!
            : 'offline-evaluation-only',
        eventModel: options.models.event,
        storyModel: options.models.story,
        checkModel: options.models.check,
        timeoutMs: 120000,
        maxOutputTokens: 6500,
        guard: guardFor(caseId),
        beforePhysicalRequest,
      },
      clientFor(options, env, frozenJob, caseId, transports),
    );
    const chapterResult =
      mode === 'legacy'
        ? await response(
            `${mode}:chapter`,
            hash({ ...legacyStory, repair: null }),
            () => ai.periodChapter(legacyStory),
          )
        : await response(
            `${mode}:chapter`,
            hash(narrativeWriterRequest(run.story)),
            () => ai.writeNarrativeChapter(run.story),
          );
    const chapter = chapterResult.output;
    if (mode === 'legacy') validatePeriodChapterV2(chapter, run.canon.events);
    else validateNarrativeChapterV1(chapter, run.canon.events);
    const fidelity =
      mode === 'legacy'
        ? await response(
            `${mode}:fidelity`,
            hash({ ...legacyStory, chapter }),
            () => ai.checkPeriodChapter(legacyStory, chapter),
          )
        : await response(
            `${mode}:fidelity`,
            hash(narrativeFidelityRequest(run.story, chapter)),
            () => ai.checkNarrativeChapter(run.story, chapter),
          );
    if (!fidelity.output.valid || fidelity.output.issues.length)
      throw new DomainError(
        'EVAL_FIXED_QUALITY_FAILED',
        'Fixed-canon fidelity failed.',
      );
    const receipts = [chapterResult.receipt, fidelity.receipt];
    let editor: unknown = null;
    if (mode === 'narrative-v1') {
      const result = await response(
        'editor',
        hash(narrativeEditorialRequest(run.story, chapter)),
        () => ai.editNarrativeChapter(run.story, chapter),
      );
      editor = result.output;
      receipts.push(result.receipt);
      if (!evaluateNarrativeEditorialGate(result.output).passed)
        throw new DomainError(
          'EVAL_FIXED_QUALITY_FAILED',
          'Fixed-canon editorial gate failed.',
        );
    }
    const calls = transports.filter((t) => t.caseId === caseId);
    report.samples.push({
      id: sampleId,
      fixtureId,
      mode,
      kind: 'fixed-canon',
      periodIndex: 0,
      chapter,
      prefix: [],
      canon: run.canon.events,
      plan: {
        source: 'fixture-authored-fixed-canon',
        validatedPlan: run.result.plan,
        editorialReport: editor,
      },
      receipts,
      requestCount: state.admittedByMode[mode],
      transportCalls: calls.length,
      physicalLatenciesMs: calls.map((t) => t.latencyMs),
      elapsedMs: receipts.reduce((s, r) => s + r.latencyMs, 0),
      repairUsed: false,
      errorCode: null,
      choiceMappings: [],
      mock: options.kind !== 'paid',
    });
    await save(join(options.out, 'report.json'), report);
  }
}

async function forkComparison(
  fixtureId: string,
  mode: EvaluationMode,
  owner: string,
  branchId: string,
  db: Database,
  lives: LifeRepository,
  jobs: LifeJobRepository,
  options: EvaluationOptions,
  env: Record<string, string | undefined>,
  report: EvaluationRun,
  overrides: ChoiceOverride[],
  transports: TransportRecord[],
  guardFor: (caseId: string) => AiRequestGuard | undefined,
) {
  const sampleId = `fork:${fixtureId}:${mode}:2`;
  if (report.samples.some((s) => s.id === sampleId)) return;
  const parent = await lives.detail(owner, branchId);
  if (parent.periods.length < 3) return;
  const period = parent.periods[1] as {
      id: string;
      candidate: ReturnType<typeof narrativePeriod>;
    },
    decision = period.candidate.events.at(-1)!.decision!,
    intent = choiceIntent(fixtureId, 1, 'fork');
  const override = overrides.find(
    (o) =>
      o.fixtureId === fixtureId &&
      o.mode === mode &&
      o.periodIndex === 1 &&
      o.branchKind === 'fork',
  );
  let mapping: ReturnType<typeof selectEvaluationChoice>;
  try {
    mapping = selectEvaluationChoice(decision.options, intent, override);
  } catch (error) {
    if (code(error) !== 'EVAL_CHOICE_REVIEW_REQUIRED') throw error;
    report.choiceReviewRequests.push({
      fixtureId,
      mode,
      periodIndex: 1,
      branchKind: 'fork',
      intent,
      decisionHash: hash(decision.options),
      options: decision.options,
    });
    return;
  }
  const parentChoice = parent.choices.find(
    (c) => c.decision_id === decision.id,
  );
  if (parentChoice?.option_id === mapping.optionId)
    throw new DomainError(
      'EVAL_CHOICE_REVIEW_INVALID',
      'The fork must select the other semantic direction.',
    );
  const [existing] = await db.query<{ id: string }>(
    'SELECT id FROM aw_branches WHERE user_id=$1 AND parent_branch_id=$2 AND fork_period_id=$3',
    [owner, branchId, period.id],
  );
  const childId =
    existing?.id ??
    (
      await lives.fork(
        owner,
        branchId,
        period.id,
        parent.branch.revision,
        mapping.optionId,
        narrativeFixtureId(`${fixtureId}:${mode}:fork`),
      )
    ).branchId;
  let child = await lives.detail(owner, childId);
  if (child.periods.length < 3) {
    if (child.branch.status === 'failed' && child.job?.retryAvailable)
      await lives.retry(
        owner,
        child.job.id,
        child.branch.revision,
        narrativeFixtureId(
          `${fixtureId}:${mode}:fork-retry:${child.job.attempt}`,
        ),
      );
    const job = await jobs.claim();
    if (!job) return;
    if (job.user_id !== owner || job.branch_id !== childId)
      throw new DomainError(
        'EVAL_STATE_INVALID',
        'The fork job belongs to another fixture.',
      );
    if (
      job.payload.narrativeContext?.memory.history.some(
        (p) => p.periodId === parent.periods[2]!.id,
      )
    )
      throw new DomainError(
        'EVAL_STATE_INVALID',
        'A fork inherited the later parent period.',
      );
    const caseId = `fork:${fixtureId}:${mode}:2`,
      guard = guardFor(caseId);
    const localBudget = new DatabaseAiBudget(
      db,
      owner,
      job.id,
      { projectUsd: options.budgetUsd ?? 5, userUsd: options.budgetUsd ?? 5 },
      job.lease_token,
    );
    const combined = guard ? combineAiGuards(guard, localBudget) : localBudget;
    const ai = new OpenAiProvider(
      {
        apiKey:
          options.kind === 'paid'
            ? env.NARRATIVE_EVAL_API_KEY!
            : 'offline-evaluation-only',
        eventModel: options.models.event,
        storyModel: options.models.story,
        checkModel: options.models.check,
        timeoutMs: 120000,
        maxOutputTokens: 6500,
        guard: combined,
        ...(mode === 'narrative-v1'
          ? { beforePhysicalRequest: () => jobs.admitNarrativeRequest(job) }
          : {}),
      },
      clientFor(options, env, job, caseId, transports),
    );
    const heartbeat = setInterval(() => {
      void jobs.heartbeat(job).catch(() => {});
    }, 15000);
    try {
      await processLifeJob(job, jobs, ai);
    } catch (error) {
      await jobs.fail(job, error);
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
    child = await lives.detail(owner, childId);
  }
  const result = child.periods[2] as Record<string, unknown> | undefined;
  if (!result) return;
  const [job] = await db.query<LifeJob>(
    "SELECT * FROM aw_jobs WHERE branch_id=$1 AND user_id=$2 AND status='completed' ORDER BY completed_at DESC LIMIT 1",
    [childId, owner],
  );
  if (!job)
    throw new DomainError(
      'EVAL_STATE_INVALID',
      'The fork has no completed job evidence.',
    );
  const receipts = receiptsInOrder(
      await db.query<{ metadata: AiReceipt }>(
        'SELECT metadata FROM aw_ai_runs WHERE job_id=$1',
        [job.id],
      ),
      job.checkpoints.receiptOrder,
    ),
    calls = transports.filter(
      (t) => t.caseId === `fork:${fixtureId}:${mode}:2`,
    );
  const [artifact] = await db.query(
    'SELECT narrative_artifact FROM aw_periods WHERE id=$1 AND user_id=$2',
    [result.id, owner],
  );
  const chosen = decision.options.find((o) => o.id === mapping.optionId)!;
  report.choiceReviewRequests = report.choiceReviewRequests.filter((raw) => {
    const r = raw as Record<string, unknown>;
    return !(
      r.fixtureId === fixtureId &&
      r.mode === mode &&
      r.branchKind === 'fork'
    );
  });
  report.samples.push({
    id: sampleId,
    fixtureId,
    mode,
    kind: 'fork',
    periodIndex: 2,
    chapter: result.chapter as PeriodChapterV2,
    prefix: child.periods
      .slice(0, 2)
      .map((p) => p.chapter as { title: string; body: string }),
    canon: result.events,
    plan: artifact?.narrative_artifact ?? null,
    receipts,
    requestCount:
      mode === 'narrative-v1'
        ? Number(job.checkpoints.providerRequestCount)
        : calls.length,
    transportCalls: calls.length,
    physicalLatenciesMs: calls.map((c) => c.latencyMs),
    elapsedMs:
      new Date(job.completed_at as string).getTime() -
      new Date(job.created_at as string).getTime(),
    repairUsed: job.checkpoints.repairUsed === true,
    errorCode: null,
    choiceMappings: [
      {
        ...mapping,
        label: chosen.label,
        description: chosen.description,
        reviewed: !!override,
      },
    ],
    mock: options.kind !== 'paid',
  });
}

async function runEvaluationUnlocked(
  options: EvaluationOptions,
  env: Record<string, string | undefined> = {},
): Promise<EvaluationRun> {
  verifyEvaluationAuthorization(options, env);
  if (options.kind === 'assess')
    throw new DomainError(
      'EVAL_CONFIG_INVALID',
      'Assessment cannot generate provider work.',
    );
  const identity = sourceIdentity();
  if (options.kind === 'paid' && identity.dirty)
    throw new DomainError(
      'EVAL_SOURCE_DIRTY',
      'Paid evidence requires a clean, reviewed source commit.',
    );
  const manifestPath = join(options.out, 'manifest.json'),
    previous = read<{ binding: string }>(manifestPath);
  if (
    existsSync(options.out) &&
    (lstatSync(options.out).isSymbolicLink() ||
      (!previous &&
        readdirSync(options.out).filter((name) => name !== '.run.lock').length))
  )
    throw new DomainError(
      'EVAL_OUTPUT_INVALID',
      'The output must be an empty or existing evaluation directory.',
    );
  const binding = hash({
    sourceHash: identity.sourceHash,
    mock: options.kind !== 'paid',
    models: options.models,
    seed: options.seed,
    project:
      options.kind === 'paid' ? hash(env.NARRATIVE_EVAL_PROJECT_ID) : null,
  });
  if (previous && previous.binding !== binding)
    throw new DomainError(
      'EVAL_STATE_INVALID',
      'Saved evaluation belongs to different source, models or project.',
    );
  await mkdir(options.out, { recursive: true });
  if (!previous)
    await save(manifestPath, {
      version: evaluationVersion,
      binding,
      sourceCommit: identity.commit,
      sourceHash: identity.sourceHash,
      mock: options.kind !== 'paid',
      models: options.models,
      priceEvidence: evaluationPriceEvidence,
    });
  const reportPath = join(options.out, 'report.json'),
    prior = read<EvaluationRun>(reportPath);
  if (
    prior &&
    (prior.sourceHash !== identity.sourceHash ||
      prior.mock !== (options.kind !== 'paid'))
  )
    throw new DomainError(
      'EVAL_STATE_INVALID',
      'Saved report identity differs.',
    );
  const report: EvaluationRun = prior ?? {
    version: evaluationVersion,
    sourceCommit: identity.commit,
    sourceHash: identity.sourceHash,
    mock: options.kind !== 'paid',
    models: options.models,
    priceEvidence: evaluationPriceEvidence,
    samples: [],
    failures: [],
    choiceReviewRequests: [],
    safetyProbe: safetyProbe(),
    complete: false,
    accounting: null,
  };
  const overrides = options.choicesFile
    ? choiceOverrideSchema
        .array()
        .parse(read<unknown>(resolve(options.choicesFile)))
    : [];
  const overrideKeys = overrides.map(
    (o) => `${o.fixtureId}:${o.mode}:${o.periodIndex}:${o.branchKind}`,
  );
  if (new Set(overrideKeys).size !== overrideKeys.length)
    throw new DomainError(
      'EVAL_CHOICE_REVIEW_INVALID',
      'Duplicate semantic reviews.',
    );
  const ledgerPath = resolve('.local/narrative-evaluation/paid-usage.json');
  const bindingPath = resolve(
    '.local/narrative-evaluation/budget-bindings.json',
  );
  if (options.kind === 'paid')
    for (const path of [
      resolve('.local'),
      resolve('.local/narrative-evaluation'),
      ledgerPath,
      bindingPath,
    ])
      if (existsSync(path) && lstatSync(path).isSymbolicLink())
        throw new DomainError(
          'EVAL_OUTPUT_INVALID',
          'Experimental accounting cannot use symlinked paths.',
        );
  const experiment =
    options.kind === 'paid'
      ? new ExperimentAiBudget(
          ledgerPath,
          options.budgetUsd!,
          `narrative-evaluation:${options.approvalId}`,
          evaluationPrices,
        )
      : undefined;
  try {
    const budgetBindings =
      options.kind === 'paid'
        ? (read<Record<string, EvaluationBudgetBinding>>(bindingPath) ?? {})
        : {};
    const transports: TransportRecord[] =
      read<TransportRecord[]>(join(options.out, 'transport-records.json')) ??
      [];
    const caseGuard = (caseId: string) =>
      experiment
        ? {
            reserve: async (raw: unknown) => {
              const id = await experiment.reserve(raw);
              budgetBindings[id] = { sourceHash: identity.sourceHash, caseId };
              await save(bindingPath, budgetBindings);
              return id;
            },
            settle: (
              id: string,
              usage: Parameters<ExperimentAiBudget['settle']>[1],
            ) => experiment.settle(id, usage),
          }
        : undefined;
    let stop = false;
    for (const fixtureId of options.fixtureIds)
      for (const mode of ['legacy', 'narrative-v1'] as const) {
        if (stop) break;
        const profile = narrativeProfiles.find((p) => p.id === fixtureId)!,
          caseId = `${fixtureId}:${mode}`,
          statePath = join(options.out, 'state', `${fixtureId}-${mode}`);
        await mkdir(statePath, { recursive: true });
        const engine = new PGlite(statePath),
          db = adapter(engine);
        try {
          const [present] = await db.query(
            "SELECT to_regclass('public.aw_jobs') IS NOT NULL AS present",
          );
          if (!present?.present) {
            await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
            await applyMigrations(engine);
          }
          const owner = narrativeFixtureId(`${caseId}:owner`),
            repository = new Repository(db),
            jobs = new LifeJobRepository(db, 60),
            lives = new LifeRepository(
              db,
              { daily: 100, concurrent: 10 },
              {
                mode: mode === 'legacy' ? 'legacy' : 'narrative-v1',
                cohortUserIds: mode === 'legacy' ? [] : [owner],
              },
            );
          await repository.ensureUser(owner);
          await repository.acceptPrivacy(owner);
          const input = narrativeInput(profile),
            existing = await db.query<{ id: string }>(
              'SELECT id FROM aw_lives WHERE id=$1 AND user_id=$2',
              [input.input.lifeId, owner],
            );
          if (!existing.length)
            await lives.createPrepared(
              owner,
              input.input,
              narrativeFixtureId(`${caseId}:start`),
            );
          for (
            let periodIndex = 0;
            periodIndex < options.periods;
            periodIndex++
          ) {
            const before = await lives.detail(owner, input.input.branchId);
            if (before.periods.length <= periodIndex) {
              if (before.branch.status === 'decision') {
                const decision = before.branch.pending_decision!,
                  intent = choiceIntent(fixtureId, periodIndex - 1),
                  override = overrides.find(
                    (o) =>
                      o.fixtureId === fixtureId &&
                      o.mode === mode &&
                      o.periodIndex === periodIndex - 1 &&
                      o.branchKind === 'main',
                  );
                try {
                  const mapping = selectEvaluationChoice(
                    decision.options,
                    intent,
                    override,
                  );
                  report.choiceReviewRequests =
                    report.choiceReviewRequests.filter((raw) => {
                      const r = raw as Record<string, unknown>;
                      return !(
                        r.fixtureId === fixtureId &&
                        r.mode === mode &&
                        r.periodIndex === periodIndex - 1
                      );
                    });
                  await save(
                    join(
                      options.out,
                      'state',
                      `${fixtureId}-${mode}`,
                      `choice-${periodIndex - 1}.json`,
                    ),
                    {
                      ...mapping,
                      fixtureId,
                      mode,
                      periodIndex: periodIndex - 1,
                      branchKind: 'main',
                      reviewed: !!override,
                      label: decision.options.find(
                        (o) => o.id === mapping.optionId,
                      )!.label,
                      description: decision.options.find(
                        (o) => o.id === mapping.optionId,
                      )!.description,
                    },
                  );
                  await lives.choose(
                    owner,
                    before.branch.id,
                    before.branch.revision,
                    decision.id,
                    mapping.optionId,
                    narrativeFixtureId(`${caseId}:choose:${periodIndex - 1}`),
                  );
                  const ready = await lives.branch(owner, before.branch.id);
                  await lives.continue(
                    owner,
                    ready.id,
                    ready.revision,
                    narrativeFixtureId(`${caseId}:continue:${periodIndex}`),
                  );
                } catch (error) {
                  if (code(error) !== 'EVAL_CHOICE_REVIEW_REQUIRED')
                    throw error;
                  const request = {
                    fixtureId,
                    mode,
                    periodIndex: periodIndex - 1,
                    branchKind: 'main',
                    intent,
                    decisionHash: hash(decision.options),
                    options: decision.options,
                  };
                  if (
                    !report.choiceReviewRequests.some(
                      (r) => hash(r) === hash(request),
                    )
                  )
                    report.choiceReviewRequests.push(request);
                  break;
                }
              } else if (before.branch.status === 'ready') {
                // A crash after choose but before continue must not strand the corpus.
                await lives.continue(
                  owner,
                  before.branch.id,
                  before.branch.revision,
                  narrativeFixtureId(`${caseId}:continue:${periodIndex}`),
                );
              } else if (
                before.branch.status === 'failed' &&
                before.job?.retryAvailable
              ) {
                await lives.retry(
                  owner,
                  before.job.id,
                  before.branch.revision,
                  narrativeFixtureId(
                    `${caseId}:retry:${periodIndex}:${before.job.attempt}`,
                  ),
                );
              }
              const job = await jobs.claim();
              if (!job) break;
              if (job.user_id !== owner || job.branch_id !== before.branch.id)
                throw new DomainError(
                  'EVAL_STATE_INVALID',
                  'The claimed job differs from the selected fixture.',
                );
              const physical = () => jobs.admitNarrativeRequest(job);
              const localBudget = new DatabaseAiBudget(
                db,
                owner,
                job.id,
                {
                  projectUsd: options.budgetUsd ?? 5,
                  userUsd: options.budgetUsd ?? 5,
                },
                job.lease_token,
              );
              const guard = experiment
                ? combineAiGuards(
                    caseGuard(`${caseId}:${periodIndex}`)!,
                    localBudget,
                  )
                : localBudget;
              const ai = new OpenAiProvider(
                {
                  apiKey:
                    options.kind === 'paid'
                      ? env.NARRATIVE_EVAL_API_KEY!
                      : 'offline-evaluation-only',
                  eventModel: options.models.event,
                  storyModel: options.models.story,
                  checkModel: options.models.check,
                  timeoutMs: 120000,
                  maxOutputTokens: 6500,
                  guard,
                  ...(mode === 'narrative-v1'
                    ? { beforePhysicalRequest: physical }
                    : {}),
                },
                clientFor(
                  options,
                  env,
                  job,
                  `${caseId}:${periodIndex}`,
                  transports,
                ),
              );
              const heartbeat = setInterval(() => {
                void jobs.heartbeat(job).catch(() => {});
              }, 15000);
              try {
                await processLifeJob(job, jobs, ai);
              } catch (error) {
                await jobs.fail(job, error);
                const [saved] = await db.query<LifeJob>(
                  'SELECT * FROM aw_jobs WHERE id=$1',
                  [job.id],
                );
                report.failures.push({
                  caseId: `${caseId}:${periodIndex}`,
                  code: code(error),
                  chapter: saved?.checkpoints.chapter ?? null,
                  editorialReport: saved?.checkpoints.editorialReport ?? null,
                });
                if (
                  ['SMOKE_BUDGET_EXCEEDED', 'AI_BUDGET_EXCEEDED'].includes(
                    code(error),
                  )
                )
                  stop = true;
                break;
              } finally {
                clearInterval(heartbeat);
              }
            }
            const after = await lives.detail(owner, input.input.branchId),
              period = after.periods[periodIndex] as
                Record<string, unknown> | undefined;
            if (!period) break;
            const sampleId = `full:${fixtureId}:${mode}:${periodIndex}`;
            if (report.samples.some((s) => s.id === sampleId)) continue;
            const [completed] = await db.query<LifeJob>(
              "SELECT * FROM aw_jobs WHERE user_id=$1 AND payload->>'periodId'=$2 AND status='completed'",
              [owner, period.id],
            );
            if (!completed)
              throw new DomainError(
                'EVAL_STATE_INVALID',
                'A completed period has no job evidence.',
              );
            const receipts = receiptsInOrder(
              await db.query<{ metadata: AiReceipt }>(
                'SELECT metadata FROM aw_ai_runs WHERE job_id=$1',
                [completed.id],
              ),
              completed.checkpoints.receiptOrder,
            );
            const [artifact] = await db.query(
              'SELECT narrative_artifact FROM aw_periods WHERE id=$1 AND user_id=$2',
              [period.id, owner],
            );
            const caseTransports = transports.filter(
              (t) => t.caseId === `${caseId}:${periodIndex}`,
            );
            report.samples.push({
              id: sampleId,
              fixtureId,
              mode,
              kind: 'full',
              periodIndex,
              chapter: period.chapter as PeriodChapterV2,
              prefix: after.periods
                .slice(0, periodIndex)
                .map((p) => p.chapter as { title: string; body: string }),
              canon: period.events,
              plan: artifact?.narrative_artifact ?? null,
              receipts,
              requestCount:
                mode === 'narrative-v1'
                  ? Number(completed.checkpoints.providerRequestCount)
                  : caseTransports.length,
              transportCalls: caseTransports.length,
              physicalLatenciesMs: caseTransports.map((t) => t.latencyMs),
              elapsedMs:
                new Date(completed.completed_at as string).getTime() -
                new Date(completed.created_at as string).getTime(),
              repairUsed: completed.checkpoints.repairUsed === true,
              errorCode: null,
              choiceMappings: Array.from({ length: periodIndex }, (_, i) =>
                read(join(statePath, `choice-${i}.json`)),
              ).filter(Boolean),
              mock: options.kind !== 'paid',
            });
            await save(reportPath, report);
          }
          if (
            !stop &&
            options.periods === 3 &&
            ['bounded-career', 'career-transition'].includes(fixtureId)
          ) {
            try {
              await forkComparison(
                fixtureId,
                mode,
                owner,
                input.input.branchId,
                db,
                lives,
                jobs,
                options,
                env,
                report,
                overrides,
                transports,
                caseGuard,
              );
            } catch (error) {
              report.failures.push({
                caseId: `fork:${fixtureId}:${mode}`,
                code: code(error),
                chapter: null,
                editorialReport: null,
              });
              if (
                ['SMOKE_BUDGET_EXCEEDED', 'AI_BUDGET_EXCEEDED'].includes(
                  code(error),
                )
              )
                stop = true;
            }
          }
        } finally {
          await engine.close();
        }
        await save(reportPath, report);
      }
    if (!stop)
      for (const fixtureId of options.fixtureIds) {
        try {
          await fixedCanonComparison(
            fixtureId,
            options,
            env,
            report,
            transports,
            caseGuard,
          );
        } catch (error) {
          const state = read<{ responses: Record<string, AiResult<unknown>> }>(
            join(options.out, 'state', `fixed-${fixtureId}.json`),
          );
          report.failures.push({
            caseId: `fixed:${fixtureId}`,
            code: code(error),
            chapter:
              state?.responses['narrative-v1:chapter']?.output ??
              state?.responses['legacy:chapter']?.output ??
              null,
            editorialReport: state?.responses.editor?.output ?? null,
          });
          if (
            ['SMOKE_BUDGET_EXCEEDED', 'AI_BUDGET_EXCEEDED'].includes(
              code(error),
            )
          )
            break;
        }
      }
    for (const sample of report.samples) {
      if (sample.kind === 'fixed-canon') continue;
      sample.choiceMappings = sample.choiceMappings.map((raw, index) => {
        const stored = raw as Record<string, unknown>;
        const periodIndex = sample.kind === 'fork' ? 1 : index;
        const branchKind = sample.kind === 'fork' ? 'fork' : 'main';
        const override = overrides.find(
          (o) =>
            o.fixtureId === sample.fixtureId &&
            o.mode === sample.mode &&
            o.periodIndex === periodIndex &&
            o.branchKind === branchKind,
        );
        if (!override) return stored;
        if (
          override.decisionHash !== stored.decisionHash ||
          override.optionId !== stored.optionId ||
          override.intent !==
            choiceIntent(sample.fixtureId, periodIndex, branchKind)
        )
          throw new DomainError(
            'EVAL_CHOICE_REVIEW_INVALID',
            'A completed choice cannot be changed by review.',
          );
        return { ...stored, reviewed: true, rationale: override.rationale };
      });
    }
    report.complete =
      report.samples.filter((s) => s.kind === 'full').length === 8 * 3 * 2 &&
      report.samples.filter((s) => s.kind === 'fixed-canon').length === 8 * 2 &&
      report.samples.filter((s) => s.kind === 'fork').length === 2 * 2 &&
      report.failures.length === 0 &&
      report.choiceReviewRequests.length === 0;
    if (experiment) {
      const ledger = read<{ calls: ExperimentalCall[] }>(ledgerPath);
      if (!ledger)
        throw new DomainError(
          'EVAL_LEDGER_INVALID',
          'Missing experimental accounting.',
        );
      report.accounting = evaluationCostReport(
        ledger.calls,
        budgetBindings,
        identity.sourceHash,
      );
    }
    await save(reportPath, report);
    return report;
  } finally {
    experiment?.close();
  }
}

// One writer per corpus; ExperimentAiBudget owns the shared paid-run lock. Never silently
// break a stale lock: an operator must verify the previous process has stopped.
export async function runNarrativeEvaluation(
  options: EvaluationOptions,
  env: Record<string, string | undefined> = {},
): Promise<EvaluationRun> {
  verifyEvaluationAuthorization(options, env);
  if (existsSync(options.out) && lstatSync(options.out).isSymbolicLink())
    throw new DomainError(
      'EVAL_OUTPUT_INVALID',
      'Symlinked output is forbidden.',
    );
  if (options.kind === 'paid') {
    for (const path of [
      resolve('.local'),
      resolve('.local/narrative-evaluation'),
    ])
      if (existsSync(path) && lstatSync(path).isSymbolicLink())
        throw new DomainError(
          'EVAL_OUTPUT_INVALID',
          'Symlinked accounting directory is forbidden.',
        );
  }
  await mkdir(options.out, { recursive: true });
  const paths = [join(options.out, '.run.lock')];
  const acquired: string[] = [];
  try {
    for (const path of paths) {
      await mkdir(resolve(path, '..'), { recursive: true });
      const handle = await open(path, 'wx', 0o600);
      acquired.push(path);
      await handle.writeFile(
        JSON.stringify({
          pid: process.pid,
          startedAt: new Date().toISOString(),
        }),
      );
      await handle.close();
    }
    return await runEvaluationUnlocked(options, env);
  } finally {
    for (const path of acquired.reverse()) await unlink(path);
  }
}
