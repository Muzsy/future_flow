import { fictionFixture } from '../../tests/fiction-fixtures';
import {
  failureDiagnostic,
  type FailureDiagnostic,
} from './narrative-failure-diagnostic';
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
  isMintedUuidProperty,
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
  fictionCharacterOmitted,
  fictionContinuityCoverage,
  fictionMechanicsFigures,
  fictionMechanicsRecount,
  type FictionMechanicsFigure,
} from '@future-flow/core';
import {
  fictionAuthorSchemaFor,
  fictionRepairSchemaFor,
  fictionDraftSchemaFor,
  narrativeV1Policy,
  NARRATIVE_WITHHELD_SUMMARY,
  type FictionCharacterEnvelope,
  type FictionCharacterProjection,
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
  narrativePlanReviewFixture,
  narrativePlanReadinessFixture,
} from '../../tests/narrative-plan-fixtures';
import { applyMigrations } from './migrations';
import { currentFixedNarrativeFixture as fixedNarrativeFixture } from './narrative-evaluation-fixtures';
import type { RequestParts } from './narrative-request-parts';
import {
  evaluationCostReport,
  type EvaluationBudgetBinding,
  type ExperimentalCall,
} from './narrative-evaluation-costs';
import {
  approvalChapterHalt,
  chapterHaltApproval,
  runEstimatedUsd,
  evaluationV9MeasurementApproval,
  measurementApproval,
  evaluationC5FlexApproval,
  verifyApprovalBudget,
  verifyApprovalLedger,
} from './narrative-evaluation-approval';
import { readLedgerCalls } from './paid-ledger-summary';
import {
  evaluationVersion,
  choiceOverrideSchema,
  choiceIntent,
  selectEvaluationChoice,
  type EvaluationMode,
  type ChoiceOverride,
  type CreativeSequenceBundle,
  type CreativeSequenceAssessment,
} from './narrative-evaluation-contract';
import {
  evaluationPrices,
  evaluationPriceEvidence,
  evaluationFlexPriceEvidence,
  verifyEvaluationAuthorization,
  evaluationCumulativeCeiling,
  evaluationMaxRequestBytes,
  evaluationTimeouts,
  type EvaluationOptions,
} from './narrative-evaluation-options';
import {
  writeCreativeSequenceArtifacts,
  type CreativeSequenceBundleFiles,
} from './narrative-evaluation-artifacts';
import {
  wrapEvaluationParse,
  evaluationResponseOutput,
  verifyExistingEvaluationAttempts,
  verifyTraceCoversCheckpointReceipts,
  readAttemptTrace,
  type EvaluationAttemptTrace,
  type AttemptTraceBinding,
} from './narrative-evaluation-attempts';
import {
  repairTriggerOf,
  type RepairTrigger,
} from './narrative-repair-trigger';
import {
  turnDiagnostics,
  type TurnDiagnostics,
} from './narrative-turn-diagnostics';

export type OfflineMockResponseOverride = {
  __rawResponse: {
    status?: string;
    model?: string;
    output_parsed?: unknown;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      input_tokens_details?: {
        cached_tokens?: number;
        cache_write_tokens?: number;
      };
    } | null;
    _request_id?: string | null;
  };
};
export type OfflineMockResponder = (context: {
  caseId: string;
  task: string;
  model: string;
  ordinal: number;
  parameters: {
    model: string;
    input?: unknown;
    // The API request's output cap and the effective per-call deadline, so a
    // local transport can enforce the same limits the product call has.
    max_output_tokens?: number;
    text: { format: { name: string; $parseRaw?: (raw: string) => unknown } };
  };
  timeoutMs?: number;
  job: LifeJob;
  defaultOutput: () => unknown;
}) =>
  | unknown
  | OfflineMockResponseOverride
  | Promise<unknown | OfflineMockResponseOverride>;

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
  // Living-world generation only: request and artifact bytes of the character
  // state, so the phase 5 diagnostics can check the provisional bounds.
  character?: {
    projectionBytes: number;
    deltaBytes: number;
    omittedActors: number;
    // Output cost of the author call(s), which now also carry the delta, and
    // whether the single repair was about the character state (review F4).
    authorOutputTokens: number[];
    authorReasoningTokens: number[];
    repairMessage: string | null;
    characterRepair: boolean;
    // What made the repair necessary, from the message wording only (the
    // fidelity-triggered wordings are fixed text, never model text).
    repairTrigger: RepairTrigger | null;
    // The planner's turn label and where it stood in the request's rotation
    // (diagnostics, never a gate); null before the label existed.
    turn: TurnDiagnostics | null;
    // The exact numbers of the life's state and the draft's typed changes (the
    // author request's mechanicsFigures) and the ones the chapter's prose
    // restates as a numeral or a spelled-out number. A flag for the reader of
    // the evaluation, never a gate (a match can be a coincidence); null before
    // the figures existed or outside the living-world generation.
    mechanics: { figures: number; recounted: FictionMechanicsFigure[] } | null;
    // Provider answers the strict response format let through that the
    // server schema refused (malformed), of which uuid-shaped refusals, and
    // requests the API itself rejected (HTTP 400). The v9 request schemas drop
    // the uuid pattern on copied ids, so this is the check that it costs no
    // validity (paid and Codex measurements count it v9 against v8).
    schemaFailures: SchemaFailureCounts;
    // Output tokens of every answered request by stage (receipts; paid runs).
    stageTokens: { task: string; outputTokens: number }[];
    // Wall-clock of every physical call by stage (the fiction deadline is
    // 180 s); independent of whether the transport reports output sizes.
    stageLatencies: { task: string; latencyMs: number }[];
    // The local Codex/agy transports report no token usage, so the cost gate
    // cannot be judged from them: only output lengths are recorded (per stage
    // and for the prose and the delta) with a rough token estimate. The gate
    // is decided by the paid measurement (appendix D.8).
    outputSizes: {
      stages: {
        task: string;
        outputChars: number;
        outputBytes: number;
        estimatedTokens: number;
        // Raw request bytes of the call; the production guard adds 4096.
        requestBytes: number | null;
        // The same bytes by part (system, schema, user by key, context by
        // key); absent for a transport record written before the split existed.
        requestParts?: RequestParts;
      }[];
      proseChars: number;
      proseBytes: number;
      deltaChars: number;
      deltaBytes: number;
      estimatedProseTokens: number;
      estimatedDeltaTokens: number;
    };
    // Relevant people the projection could not show, with their reasons.
    omitted: { actorId: string; reasons: string[] }[];
    // Planner continuity decisions against the open matters of the projected
    // people (diagnostics only; null when the draft or projection is absent).
    continuity: {
      required: string[];
      missing: string[];
      intentMissing: string[];
      decisions: { carry: number; defer: number; resolve: number };
    } | null;
  };
};
// What the attempt trace adds for a completed sample: the planner draft the
// package was authored from and the wording of the last repair.
export type SchemaFailureCounts = {
  malformed: number;
  // Malformed plan/author answers refused because of a uuid (the check
  // stages' schemas are unchanged, so they are not classified), and of those
  // the ones on a field whose pattern the v9 request schema drops (anything
  // but a minted `id` / `sceneId`).
  uuid: number;
  uuidOnCompactFields: number;
  rejected: number;
};
export type AttemptEvidence = {
  draft: {
    characterIntent?: { actorId: string }[];
    continuityDecisions?: { actorId: string; decision: string }[];
  } | null;
  repairMessage: string | null;
  schemaFailures: SchemaFailureCounts;
};
type EvidencePolicy = Parameters<typeof fictionAuthorSchemaFor>[0];
// Counts the attempts whose answer the server schema refused (status
// malformed), whether the refusal was about a uuid, and the requests the API
// answered with HTTP 400 (a rejected response format).
export function schemaFailureCounts(
  trace: EvaluationAttemptTrace,
  policy?: EvidencePolicy,
): SchemaFailureCounts {
  const counts: SchemaFailureCounts = {
    malformed: 0,
    uuid: 0,
    uuidOnCompactFields: 0,
    rejected: 0,
  };
  for (const attempt of trace.attempts) {
    if (attempt.status === 'failed' && attempt.errorCode === 'AI_HTTP_400')
      counts.rejected += 1;
    if (attempt.status !== 'malformed') continue;
    counts.malformed += 1;
    const schema = !policy
      ? null
      : attempt.task === 'life_narrative_plan'
        ? fictionDraftSchemaFor(policy)
        : attempt.task === 'life_narrative_chapter'
          ? (attempt.repairFeedback?.mode &&
              fictionRepairSchemaFor(policy, attempt.repairFeedback.mode)) ||
            fictionAuthorSchemaFor(policy)
          : null;
    const parsed = schema?.safeParse(attempt.output);
    if (!parsed || parsed.success) continue;
    const uuidIssues = parsed.error.issues.filter(
      (issue) =>
        issue.code === 'invalid_format' &&
        (issue as { format?: string }).format === 'uuid',
    );
    if (!uuidIssues.length) continue;
    counts.uuid += 1;
    if (
      uuidIssues.some(
        (issue) =>
          !isMintedUuidProperty(
            [...issue.path]
              .reverse()
              .find(
                (segment): segment is string => typeof segment === 'string',
              ),
          ),
      )
    )
      counts.uuidOnCompactFields += 1;
  }
  return counts;
}
export function attemptEvidence(
  trace: EvaluationAttemptTrace | null,
  policy?: EvidencePolicy,
): AttemptEvidence | null {
  if (!trace) return null;
  const draft = trace.attempts
    .filter(
      (a) =>
        a.task === 'life_narrative_plan' &&
        a.status === 'completed' &&
        a.output,
    )
    .at(-1)?.output;
  const repair = trace.attempts.filter((a) => a.repairFeedback).at(-1)
    ?.repairFeedback?.message;
  return {
    draft: (draft ?? null) as AttemptEvidence['draft'],
    repairMessage: repair ?? null,
    schemaFailures: schemaFailureCounts(trace, policy),
  };
}
// Messages that carry a checker's (model) feedback, not a validator's wording:
// they quote scores and reasons that may well contain the word "character".
// The v9 editor-triggered wording ("Correct the final package's literary
// issues:") starts with the first alternative; the older prefixes stay so that
// the stored runs classify exactly as before.
const CHECKER_FEEDBACK_PATTERN =
  /^(?:Correct the final package|Rewrite the weak story|Fix BOTH final checks|The existing literary check)/;
// Validator wording of a character-state failure (never model text).
const CHARACTER_REPAIR_PATTERN =
  /character|profile|delta|archiv|supplied person|user supplied|actor_remove|dynamic state|relationship state/i;
// The label comes from the stored artifact (the draft's copy), so a draft kept
// only in the attempt trace still counts; a draft without the key is `absent`.
function livingTurn(
  payload: unknown,
  artifact: unknown,
  draft: unknown,
): TurnDiagnostics | null {
  const living = (artifact as { characterDelta?: unknown } | null)
    ?.characterDelta;
  if (living === undefined) return null;
  const ledger = (
    payload as {
      narrativeContext?: {
        seriesLedger?: { turnQueue?: string[]; restingTurns?: string[] };
      };
    }
  ).narrativeContext?.seriesLedger;
  const carrier = [artifact, draft].find(
    (value) => value && typeof value === 'object' && 'turnType' in value,
  ) as { turnType?: unknown } | undefined;
  const report = (
    artifact as {
      editorialReport?: { sequenceSignature?: Record<string, string> };
    }
  ).editorialReport;
  return turnDiagnostics({
    turnType: carrier ? carrier.turnType : undefined,
    ledger,
    signature: report?.sequenceSignature ?? null,
  });
}
function livingMechanics(
  payload: unknown,
  delta: unknown,
  draft: unknown,
  chapterBody: string,
): { figures: number; recounted: FictionMechanicsFigure[] } | null {
  if (delta === undefined) return null;
  const input = payload as {
    state?: Parameters<typeof fictionMechanicsFigures>[0];
    input?: { locale?: string };
  };
  if (!input.state) return null;
  const events =
    (draft as { candidate?: { events?: { changes?: unknown }[] } } | null)
      ?.candidate?.events ?? [];
  const figures = fictionMechanicsFigures(input.state, events);
  return {
    figures: figures.length,
    recounted: fictionMechanicsRecount(
      chapterBody,
      figures,
      input.input?.locale === 'hu' ? 'hu' : 'en',
    ),
  };
}
export function characterBytes(
  payload: unknown,
  artifact: unknown,
  receipts: readonly AiReceipt[] = [],
  checkpoints: unknown = null,
  transports: readonly TransportRecord[] = [],
  chapterBody = '',
  trace: AttemptEvidence | null = null,
): NonNullable<EvaluationSample['character']> {
  const context = (
    payload as {
      narrativeContext?: {
        characterProjection?: {
          omittedActors?: number;
          actors?: { actorId: string }[];
        } & Partial<FictionCharacterProjection>;
        memory?: { withheld?: boolean };
      };
      fictionCharacters?: FictionCharacterEnvelope;
    }
  ).narrativeContext;
  const projection = context?.characterProjection;
  const envelope = (payload as { fictionCharacters?: FictionCharacterEnvelope })
    .fictionCharacters;
  const delta = (artifact as { characterDelta?: unknown } | null)
    ?.characterDelta;
  const bytes = (value: unknown) =>
    value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value), 'utf8');
  const cp = (checkpoints ?? {}) as {
    fictionRepair?: { message?: string } | null;
    planningRepair?: string | null;
    fictionDraft?: {
      characterIntent?: { actorId: string }[];
      continuityDecisions?: { actorId: string; decision: string }[];
    } | null;
  };
  // A completed job keeps only its binding checkpoints, so the stored draft
  // and the repair wording come from the attempt trace when it has them.
  const repairMessage =
    cp.fictionRepair?.message ??
    cp.planningRepair ??
    trace?.repairMessage ??
    null;
  const draft = cp.fictionDraft ?? trace?.draft ?? null;
  const author = receipts.filter((r) => r.task === 'life_narrative_chapter');
  // About 3.5 bytes per token (the 047 price estimate); never a measurement.
  const estimate = (outputBytes: number) => Math.ceil(outputBytes / 3.5);
  const deltaJson = delta === undefined ? '' : JSON.stringify(delta);
  return {
    projectionBytes: bytes(projection),
    deltaBytes: bytes(delta),
    omittedActors: projection?.omittedActors ?? 0,
    authorOutputTokens: author.map((r) => r.outputTokens),
    authorReasoningTokens: author.map((r) => r.reasoningTokens ?? 0),
    repairMessage: repairMessage ? repairMessage.slice(0, 160) : null,
    characterRepair: repairMessage
      ? !CHECKER_FEEDBACK_PATTERN.test(repairMessage) &&
        CHARACTER_REPAIR_PATTERN.test(repairMessage)
      : false,
    repairTrigger: repairTriggerOf(repairMessage),
    turn: livingTurn(payload, artifact, draft),
    mechanics: livingMechanics(payload, delta, draft, chapterBody),
    schemaFailures: trace?.schemaFailures ?? {
      malformed: 0,
      uuid: 0,
      uuidOnCompactFields: 0,
      rejected: 0,
    },
    stageTokens: receipts.map((r) => ({
      task: r.task,
      outputTokens: r.outputTokens,
    })),
    stageLatencies: transports.map((t) => ({
      task: t.task,
      latencyMs: t.latencyMs,
    })),
    outputSizes: {
      stages: transports.flatMap((t) =>
        t.outputBytes === undefined
          ? []
          : [
              {
                task: t.task,
                outputChars: t.outputChars ?? 0,
                outputBytes: t.outputBytes,
                estimatedTokens: estimate(t.outputBytes),
                requestBytes: t.requestBytes ?? null,
                ...(t.requestParts ? { requestParts: t.requestParts } : {}),
              },
            ],
      ),
      proseChars: [...chapterBody].length,
      proseBytes: Buffer.byteLength(chapterBody, 'utf8'),
      deltaChars: [...deltaJson].length,
      deltaBytes: Buffer.byteLength(deltaJson, 'utf8'),
      estimatedProseTokens: estimate(Buffer.byteLength(chapterBody, 'utf8')),
      estimatedDeltaTokens: estimate(Buffer.byteLength(deltaJson, 'utf8')),
    },
    omitted:
      envelope && !context?.memory?.withheld
        ? fictionCharacterOmitted(
            envelope.state,
            envelope.signals,
            (projection?.actors ?? []).map((a) => a.actorId),
          )
        : [],
    continuity:
      draft && projection?.actors
        ? fictionContinuityCoverage(
            projection as FictionCharacterProjection,
            draft,
          )
        : null,
  };
}
export type EvaluationRun = {
  version: string;
  variant?: 'narrative-fiction-v2';
  diagnosticOnly?: true;
  noForks?: true;
  fictionGeneration?: 'v9';
  choiceMix?: 'rotate';
  serviceTier?: 'flex';
  flexAccounting?: {
    standardRateAccountedUsd: number;
    standardRateUsageEstimatedUsd: number;
    flexUsageEstimatedUsd: number;
    unknownUsageCalls: number;
    returnedTiers: (string | null)[];
    note: string;
  };
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
    // Evaluation-only: the stage the job stopped at and the validator's own
    // message and throwing frames (the job record keeps just the error code).
    stage?: string | null;
    diagnostic?: FailureDiagnostic;
  }[];
  choiceReviewRequests: unknown[];
  safetyProbe: { passed: boolean; markerExcluded: boolean };
  complete: boolean;
  accounting: ReturnType<typeof evaluationCostReport> | null;
  sequenceBundles?: CreativeSequenceBundle[];
  sequenceBundleFiles?: CreativeSequenceBundleFiles | null;
  sequenceAssessment?: CreativeSequenceAssessment | null;
};
export function adapter(
  client: Pick<PGlite, 'query' | 'transaction'>,
): Database {
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
function shouldStopEvaluation(error: unknown, options: EvaluationOptions) {
  const c = code(error);
  return (
    [
      'SMOKE_BUDGET_EXCEEDED',
      'AI_BUDGET_EXCEEDED',
      'EVAL_APPROVAL_LIMIT',
    ].includes(c) ||
    (options.kind === 'paid' &&
      [
        'AI_QUOTA_EXHAUSTED',
        'AI_AUTH_FAILED',
        'AI_RATE_LIMIT',
        'AI_PROVIDER_FAILED',
        'AI_REQUEST_FAILED',
        'AI_INCOMPLETE_OR_REFUSED',
      ].includes(c))
  );
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
        'attempts',
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
// An option that ends or closes the story rather than continuing it; the
// rotating mix avoids it when any other option exists (plan D.8 / 9.4).
const EXIT_OPTION =
  /\b(end|conclude|stop|close|wrap up|let .{0,30}(stand|be complete)|keep .{0,30}(personal|outside)|retain)\b/i;
// Synthetic unpaired diagnostic path only. This is NOT semantic/human review.
// `rotate` (creative-only diagnostic) walks the non-exit options in turn: the
// main branch takes candidate k mod n at its k-th decision, the fork (k+1) mod n.
function diagnosticChoice(
  options: { id: string; label: string; description: string }[],
  intent: ReturnType<typeof choiceIntent>,
  alternate = false,
  rotate?: { k: number },
) {
  if (rotate) return rotatingChoice(options, intent, alternate, rotate.k);
  const option = options[alternate ? 1 : 0];
  if (!option)
    throw new DomainError(
      'EVAL_STATE_INVALID',
      'A diagnostic choice is unavailable.',
    );
  return {
    optionId: option.id,
    intent,
    decisionHash: hash(options),
    selection: 'diagnostic-index' as const,
    rationale: `UNREVIEWED DIAGNOSTIC: deterministic ${alternate ? 'second' : 'first'} option, not a semantic equivalence or human approval.`,
  };
}
export function rotatingChoice(
  options: { id: string; label: string; description: string }[],
  intent: ReturnType<typeof choiceIntent>,
  alternate: boolean,
  k: number,
) {
  if (!options.length)
    throw new DomainError(
      'EVAL_STATE_INVALID',
      'A diagnostic choice is unavailable.',
    );
  const stay = options.filter(
    (o) => !EXIT_OPTION.test(`${o.label} ${o.description}`),
  );
  const candidates = stay.length ? stay : options;
  const main = candidates[k % candidates.length]!;
  // A single candidate cannot give the fork a different direction: widen to
  // every option and take the first one that is not the main branch's choice.
  const widened = !alternate || candidates.length > 1 ? null : options;
  const option = alternate
    ? widened
      ? (widened.find((o) => o.id !== main.id) ?? main)
      : candidates[(k + 1) % candidates.length]!
    : main;
  return {
    optionId: option.id,
    intent,
    decisionHash: hash(options),
    selection: 'diagnostic-rotate' as const,
    rationale: `UNREVIEWED DIAGNOSTIC: rotating ${alternate ? 'fork' : 'main'} choice, decision ${k}, ${candidates.length} candidate(s) of ${options.length} option(s), exit filter ${stay.length && stay.length < options.length ? 'applied' : 'not applied'}${widened ? ', widened for the fork' : ''}; not a semantic equivalence or human approval.`,
  };
}
type TransportRecord = {
  requestedServiceTier?: 'flex';
  returnedServiceTier?: string | null;
  caseId: string;
  task: string;
  latencyMs: number;
  outputChars?: number;
  outputBytes?: number;
  requestBytes?: number;
  requestParts?: RequestParts;
};
export function clientFor(
  options: EvaluationOptions,
  env: Record<string, string | undefined>,
  job: LifeJob | undefined,
  caseId: string,
  transports: TransportRecord[],
  traceBinding: Omit<AttemptTraceBinding, 'caseId'>,
  mockResponder?: OfflineMockResponder,
) {
  const caseBinding: AttemptTraceBinding = { ...traceBinding, caseId };
  // SDK-wide fallback; fiction calls pass their own per-call timeout instead.
  const sdkTimeoutMs =
    options.serviceTier === 'flex'
      ? 900000
      : options.creative
        ? 180000
        : 120000;
  const saveTransports = () =>
    save(join(options.out, 'transport-records.json'), transports);
  if (options.kind === 'paid') {
    const sdk = new OpenAI({
      apiKey: env.NARRATIVE_EVAL_API_KEY!,
      project: env.NARRATIVE_EVAL_PROJECT_ID!,
      baseURL: 'https://api.openai.com/v1',
      organization: null,
      logLevel: 'off',
      maxRetries: 0,
      // Keep the SDK fallback unchanged; only fiction calls override it below.
      timeout: sdkTimeoutMs,
    });
    type ParseParameters = Parameters<typeof sdk.responses.parse>[0];
    const parse = wrapEvaluationParse({
      outDir: options.out,
      binding: caseBinding,
      env,
      transports,
      saveTransports,
      requestedServiceTier: options.serviceTier,
      execute: async (
        parameters: ParseParameters,
        _ordinal,
        requestOptions,
      ) => {
        // Keep the selected tier explicit; never retry with Standard. Parse AFTER
        // local capture so even a schema-invalid candidate retains evidence.
        const response = await sdk.responses.create(
          {
            ...parameters,
            stream: false,
            service_tier: options.serviceTier ?? 'default',
          },
          options.serviceTier === 'flex'
            ? { ...requestOptions, timeout: 900000 }
            : requestOptions,
        );
        return {
          ...response,
          _request_id: response._request_id,
          output_parsed: evaluationResponseOutput(response),
        };
      },
    }) as typeof sdk.responses.parse;
    return { responses: { parse } } as unknown as OpenAI;
  }
  const parse = wrapEvaluationParse({
    outDir: options.out,
    binding: caseBinding,
    env,
    transports,
    saveTransports,
    execute: async (
      parameters: {
        model: string;
        input?: unknown;
        max_output_tokens?: number;
        text: {
          format: { name: string; $parseRaw?: (raw: string) => unknown };
        };
      },
      ordinal: number,
      requestOptions?: { timeout?: number },
    ) => {
      if (!job)
        throw new DomainError(
          'EVAL_CONFIG_INVALID',
          'A mock generation needs its frozen fixture job.',
        );
      const task = parameters.text.format.name;
      const defaultOutput = () => {
        const f = caseId.startsWith('fixed:')
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
        const creative =
          job.payload.narrativeContext?.policy.mode === 'narrative-fiction-v2';
        const cf = creative ? fictionFixture(job.payload) : null;
        return creative && task === 'life_narrative_plan'
          ? cf!.draft
          : creative && task === 'life_narrative_chapter'
            ? reducedMockAuthor(parameters.input, cf!.authored)
            : creative && task === 'life_narrative_editor'
              ? cf!.editor
              : creative && task === 'life_narrative_plan_review'
                ? narrativePlanReadinessFixture()
                : task === 'life_narrative_plan_review'
                  ? job.payload.narrativeContext?.policy.mode ===
                      'narrative-v1' &&
                    job.payload.narrativeContext.policy.promptVersions
                      .planReviewer === 'life_narrative_plan_review.v2'
                    ? narrativePlanReadinessFixture()
                    : narrativePlanReviewFixture()
                  : task === 'life_period'
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
      };
      if (mockResponder) {
        const custom = await mockResponder({
          caseId,
          task,
          model: parameters.model,
          ordinal,
          parameters,
          timeoutMs: requestOptions?.timeout ?? sdkTimeoutMs,
          job,
          defaultOutput,
        });
        if (
          custom &&
          typeof custom === 'object' &&
          '__rawResponse' in (custom as Record<string, unknown>)
        ) {
          const raw = (custom as OfflineMockResponseOverride).__rawResponse;
          return {
            status: raw.status ?? 'completed',
            model: raw.model ?? parameters.model,
            output_parsed: raw.output_parsed,
            usage: raw.usage ?? { input_tokens: 0, output_tokens: 0 },
            ...(raw._request_id !== undefined
              ? { _request_id: raw._request_id }
              : {}),
          };
        }
        if (custom !== undefined) {
          return {
            status: 'completed',
            model: parameters.model,
            output_parsed: custom,
            usage: { input_tokens: 0, output_tokens: 0 },
          };
        }
      }
      return {
        status: 'completed',
        model: parameters.model,
        output_parsed: defaultOutput(),
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    },
  });
  return { responses: { parse } } as unknown as OpenAI;
}
// What a model asked for a reduced v9 repair returns: only the chapter text for
// a prose-only repair, and (as the safe default) a request for the full repair
// for a facts-only one; a mock responder supplies real facts when it needs them.
function reducedMockAuthor(input: unknown, authored: unknown) {
  const user = (
    input as { role: string; content: unknown }[] | undefined
  )?.find((m) => m.role === 'user')?.content;
  let repair: { mode?: string; repairRule?: string } | undefined;
  try {
    repair = (JSON.parse(String(user)) as { authorRepair?: typeof repair })
      .authorRepair;
  } catch {
    repair = undefined;
  }
  if (!repair?.repairRule) return authored;
  const { chapter } = authored as { chapter: { title: string; body: string } };
  return repair.mode === 'prose_only'
    ? { chapter: { title: chapter.title, body: chapter.body } }
    : repair.mode === 'facts_only'
      ? { outcome: 'needs_full_repair', storyFacts: [] }
      : authored;
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
  traceBinding: Omit<AttemptTraceBinding, 'caseId'>,
  mockResponder?: OfflineMockResponder,
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
    narrativeContext: {
      policy: {
        ...narrativeV1Policy(),
        promptVersions: {
          ...narrativeV1Policy().promptVersions,
          writer: 'life_narrative_chapter.v3',
        },
      },
      memory: fixture.memory,
    },
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
    const cachedReceipts = [
      state.responses[`${mode}:chapter`]?.receipt,
      state.responses[`${mode}:fidelity`]?.receipt,
      ...(mode === 'narrative-v1' ? [state.responses.editor?.receipt] : []),
    ].filter((r): r is AiReceipt => Boolean(r));
    if (cachedReceipts.length)
      verifyTraceCoversCheckpointReceipts(
        options.out,
        { ...traceBinding, caseId },
        cachedReceipts,
        env,
      );
    const ai = new OpenAiProvider(
      {
        apiKey:
          options.kind === 'paid'
            ? env.NARRATIVE_EVAL_API_KEY!
            : 'offline-evaluation-only',
        eventModel: options.models.event,
        storyModel: options.models.story,
        checkModel: options.models.check,
        ...evaluationTimeouts(options),
        maxOutputTokens: options.creative ? 12000 : 6500,
        guard: guardFor(caseId),
        beforePhysicalRequest,
      },
      clientFor(
        options,
        env,
        frozenJob,
        caseId,
        transports,
        traceBinding,
        mockResponder,
      ),
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
    verifyTraceCoversCheckpointReceipts(
      options.out,
      { ...traceBinding, caseId },
      receipts,
      env,
    );
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
        materialVersion: fixture.materialVersion,
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
  report.failures = report.failures.filter(
    (f) => f.caseId !== `fixed:${fixtureId}`,
  );
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
  traceBinding: Omit<AttemptTraceBinding, 'caseId'>,
  mockResponder?: OfflineMockResponder,
  chapterHalt: () => string | null = () => null,
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
  let mapping:
    | ReturnType<typeof selectEvaluationChoice>
    | ReturnType<typeof diagnosticChoice>;
  try {
    mapping = options.creativeOnly
      ? diagnosticChoice(
          decision.options,
          intent,
          true,
          options.choiceMix ? { k: 1 } : undefined,
        )
      : selectEvaluationChoice(decision.options, intent, override);
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
    if (child.branch.status === 'failed' && child.job?.retryAvailable) {
      const [priorForkJob] = await db.query<LifeJob>(
        'SELECT * FROM aw_jobs WHERE id=$1 AND user_id=$2',
        [child.job.id, owner],
      );
      if (priorForkJob)
        verifyTraceCoversCheckpointReceipts(
          options.out,
          { ...traceBinding, caseId: `fork:${fixtureId}:${mode}:2` },
          priorForkJob.checkpoints.receipts,
          env,
        );
      await lives.retry(
        owner,
        child.job.id,
        child.branch.revision,
        narrativeFixtureId(
          `${fixtureId}:${mode}:fork-retry:${child.job.attempt}`,
        ),
      );
    }
    const halt = chapterHalt();
    if (halt) throw new DomainError('EVAL_APPROVAL_LIMIT', halt);
    const job = await jobs.claim();
    if (!job) return;
    if (job.user_id !== owner || job.branch_id !== childId)
      throw new DomainError(
        'EVAL_STATE_INVALID',
        'The fork job belongs to another fixture.',
      );
    const laterParentIds = new Set(parent.periods.slice(2).map((p) => p.id));
    if (
      job.payload.narrativeContext?.memory.history.some((p) =>
        laterParentIds.has(p.periodId),
      )
    )
      throw new DomainError(
        'EVAL_STATE_INVALID',
        'A fork inherited the later parent period.',
      );
    const caseId = `fork:${fixtureId}:${mode}:2`,
      guard = guardFor(caseId);
    verifyTraceCoversCheckpointReceipts(
      options.out,
      { ...traceBinding, caseId },
      job.checkpoints.receipts,
      env,
    );
    const localBudget = new DatabaseAiBudget(
      db,
      owner,
      job.id,
      { projectUsd: options.budgetUsd ?? 5, userUsd: options.budgetUsd ?? 5 },
      job.lease_token,
      evaluationMaxRequestBytes(options),
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
        ...evaluationTimeouts(options),
        maxOutputTokens: options.creative ? 12000 : 6500,
        guard: combined,
        ...(mode === 'narrative-v1'
          ? { beforePhysicalRequest: () => jobs.admitNarrativeRequest(job) }
          : {}),
      },
      clientFor(
        options,
        env,
        job,
        caseId,
        transports,
        traceBinding,
        mockResponder,
      ),
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
  verifyTraceCoversCheckpointReceipts(
    options.out,
    { ...traceBinding, caseId: `fork:${fixtureId}:${mode}:2` },
    receipts,
    env,
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
  report.failures = report.failures.filter(
    (f) => f.caseId !== `fork:${fixtureId}:${mode}`,
  );
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
        reviewed: !options.creativeOnly && !!override,
      },
    ],
    mock: options.kind !== 'paid',
  });
}

// Programmatic seams of the exported runner (tests); the command line has none.
// `ledgerDir` replaces the accounting directory (the shared-ledger floor still
// applies to a paid v9 run); `approval` switches the approval's chapter halts on
// in an offline mock run, which a paid run never takes from the caller.
export type EvaluationSeams = {
  ledgerDir?: string;
  approval?: typeof evaluationV9MeasurementApproval;
};
const ledgerDirectory = (seams?: EvaluationSeams) =>
  seams?.ledgerDir ?? '.local/narrative-evaluation';
const ledgerFile = (seams?: EvaluationSeams) =>
  resolve(ledgerDirectory(seams), 'paid-usage.json');

async function runEvaluationUnlocked(
  options: EvaluationOptions,
  env: Record<string, string | undefined> = {},
  mockResponder?: OfflineMockResponder,
  seams?: EvaluationSeams,
): Promise<EvaluationRun> {
  verifyEvaluationAuthorization(options, env);
  // The source-bound v9 approval holds the whole measurement, probe included, to
  // its cap on the shared ledger: the ledger must be the shared one, and a
  // budget above what it leaves the approval is refused, before any work.
  if (
    options.kind === 'paid' &&
    options.fictionGeneration &&
    options.approvalId !== measurementApproval(options).approvalId
  )
    throw new DomainError(
      'EVAL_CONFIG_INVALID',
      'A paid v9 measurement needs its own owner-approved budget.',
    );
  const v9Approval =
    options.kind === 'paid' && options.fictionGeneration
      ? measurementApproval(options)
      : undefined;
  if (v9Approval) {
    const calls = readLedgerCalls(ledgerFile(seams));
    verifyApprovalLedger(
      calls,
      ledgerFile(seams),
      v9Approval === evaluationC5FlexApproval ? 51.6490625 : undefined,
    );
    verifyApprovalBudget(calls, options.budgetUsd!, v9Approval);
  }
  const haltApproval = chapterHaltApproval(options, seams?.approval);
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
  const projectHash =
    options.kind === 'paid' ? hash(env.NARRATIVE_EVAL_PROJECT_ID) : null;
  const binding = hash({
    sourceHash: identity.sourceHash,
    ...(options.serviceTier ? { serviceTier: options.serviceTier } : {}),
    ...(options.creative ? { variant: 'narrative-fiction-v2' } : {}),
    ...(options.creativeOnly ? { diagnosticOnly: true } : {}),
    ...(options.noForks ? { noForks: true } : {}),
    ...(options.fictionGeneration
      ? { fictionGeneration: options.fictionGeneration }
      : {}),
    ...(options.choiceMix ? { choiceMix: options.choiceMix } : {}),
    mock: options.kind !== 'paid',
    models: options.models,
    seed: options.seed,
    project: projectHash,
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
      ...(options.noForks ? { noForks: true } : {}),
      models: options.models,
      ...(options.serviceTier ? { serviceTier: options.serviceTier } : {}),
      priceEvidence:
        options.serviceTier === 'flex'
          ? evaluationFlexPriceEvidence
          : evaluationPriceEvidence,
    });
  const reportPath = join(options.out, 'report.json'),
    prior = read<EvaluationRun>(reportPath);
  if (
    prior &&
    (prior.sourceHash !== identity.sourceHash ||
      prior.mock !== (options.kind !== 'paid') ||
      Boolean(prior.noForks) !== Boolean(options.noForks))
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
    ...(options.serviceTier ? { serviceTier: options.serviceTier } : {}),
    models: options.models,
    ...(options.creative ? { variant: 'narrative-fiction-v2' as const } : {}),
    ...(options.creativeOnly ? { diagnosticOnly: true as const } : {}),
    ...(options.noForks ? { noForks: true as const } : {}),
    ...(options.fictionGeneration
      ? { fictionGeneration: options.fictionGeneration }
      : {}),
    ...(options.choiceMix ? { choiceMix: options.choiceMix } : {}),
    priceEvidence:
      options.serviceTier === 'flex'
        ? evaluationFlexPriceEvidence
        : evaluationPriceEvidence,
    samples: [],
    failures: [],
    choiceReviewRequests: [],
    safetyProbe: safetyProbe(),
    complete: false,
    accounting: null,
  };
  const traceBinding: Omit<AttemptTraceBinding, 'caseId'> = {
    sourceCommit: identity.commit,
    sourceHash: identity.sourceHash,
    manifestBinding: binding,
    mock: options.kind !== 'paid',
    models: options.models,
    projectHash,
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
  const ledgerPath = ledgerFile(seams);
  const bindingPath = resolve(ledgerDirectory(seams), 'budget-bindings.json');
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
  const chapterHalt = () => {
    if (!haltApproval) return null;
    const calls = readLedgerCalls(ledgerPath);
    return approvalChapterHalt(
      calls,
      report.samples.filter((s) => s.kind !== 'fixed-canon').length,
      runEstimatedUsd(
        calls,
        read<Record<string, EvaluationBudgetBinding>>(bindingPath) ?? {},
        haltApproval.approvalId,
        resolve(options.out),
      ),
      haltApproval,
    );
  };
  const experiment =
    options.kind === 'paid'
      ? new ExperimentAiBudget(
          ledgerPath,
          options.budgetUsd!,
          `narrative-evaluation:${options.approvalId}`,
          evaluationPrices,
          evaluationCumulativeCeiling(options),
          evaluationMaxRequestBytes(options),
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
    verifyExistingEvaluationAttempts(
      options.out,
      traceBinding,
      transports,
      report.samples,
      env,
    );
    const caseGuard = (caseId: string) =>
      experiment
        ? {
            reserve: async (raw: unknown) => {
              const id = await experiment.reserve(raw);
              budgetBindings[id] = {
                sourceHash: identity.sourceHash,
                caseId,
                out: resolve(options.out),
              };
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
      for (const mode of options.creativeOnly
        ? (['narrative-v1'] as const)
        : (['legacy', 'narrative-v1'] as const)) {
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
                mode:
                  mode === 'legacy'
                    ? 'legacy'
                    : options.creative
                      ? 'narrative-fiction-v2'
                      : 'narrative-v1',
                cohortUserIds: mode === 'legacy' ? [] : [owner],
                ...(options.fictionGeneration && options.creative
                  ? { fictionGeneration: options.fictionGeneration }
                  : {}),
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
                  const mapping = options.creativeOnly
                    ? diagnosticChoice(
                        decision.options,
                        intent,
                        false,
                        options.choiceMix ? { k: periodIndex - 1 } : undefined,
                      )
                    : selectEvaluationChoice(
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
                      reviewed: !options.creativeOnly && !!override,
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
                const [priorJob] = await db.query<LifeJob>(
                  'SELECT * FROM aw_jobs WHERE id=$1 AND user_id=$2',
                  [before.job.id, owner],
                );
                if (priorJob)
                  verifyTraceCoversCheckpointReceipts(
                    options.out,
                    { ...traceBinding, caseId: `${caseId}:${periodIndex}` },
                    priorJob.checkpoints.receipts,
                    env,
                  );
                await lives.retry(
                  owner,
                  before.job.id,
                  before.branch.revision,
                  narrativeFixtureId(
                    `${caseId}:retry:${periodIndex}:${before.job.attempt}`,
                  ),
                );
              }
              const halt = chapterHalt();
              if (halt) {
                report.failures.push({
                  caseId: `${caseId}:${periodIndex}`,
                  code: 'EVAL_APPROVAL_LIMIT',
                  chapter: null,
                  editorialReport: null,
                  diagnostic: failureDiagnostic(
                    new DomainError('EVAL_APPROVAL_LIMIT', halt),
                  ),
                });
                stop = true;
                break;
              }
              const job = await jobs.claim();
              if (!job) break;
              if (job.user_id !== owner || job.branch_id !== before.branch.id)
                throw new DomainError(
                  'EVAL_STATE_INVALID',
                  'The claimed job differs from the selected fixture.',
                );
              verifyTraceCoversCheckpointReceipts(
                options.out,
                { ...traceBinding, caseId: `${caseId}:${periodIndex}` },
                job.checkpoints.receipts,
                env,
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
                evaluationMaxRequestBytes(options),
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
                  ...evaluationTimeouts(options),
                  maxOutputTokens: options.creative ? 12000 : 6500,
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
                  traceBinding,
                  mockResponder,
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
                  stage: saved?.stage ? String(saved.stage) : null,
                  diagnostic: failureDiagnostic(error),
                });
                if (shouldStopEvaluation(error, options)) stop = true;
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
            verifyTraceCoversCheckpointReceipts(
              options.out,
              { ...traceBinding, caseId: `${caseId}:${periodIndex}` },
              receipts,
              env,
            );
            const [artifact] = await db.query(
              'SELECT narrative_artifact FROM aw_periods WHERE id=$1 AND user_id=$2',
              [period.id, owner],
            );
            const caseTransports = transports.filter(
              (t) => t.caseId === `${caseId}:${periodIndex}`,
            );
            report.failures = report.failures.filter(
              (f) => f.caseId !== `${caseId}:${periodIndex}`,
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
              ...(options.fictionGeneration
                ? {
                    character: characterBytes(
                      completed.payload,
                      artifact?.narrative_artifact ?? null,
                      receipts,
                      completed.checkpoints,
                      caseTransports,
                      (period.chapter as PeriodChapterV2).body,
                      attemptEvidence(
                        readAttemptTrace(
                          options.out,
                          {
                            ...traceBinding,
                            caseId: `${caseId}:${periodIndex}`,
                          },
                          env,
                        ),
                        (
                          completed.payload as {
                            narrativeContext?: { policy?: EvidencePolicy };
                          }
                        ).narrativeContext?.policy,
                      ),
                    ),
                  }
                : {}),
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
            !options.noForks &&
            options.periods >= 3 &&
            (['bounded-career', 'career-transition'].includes(fixtureId) ||
              (options.creativeOnly &&
                (options.fixtureIds[0] === fixtureId ||
                  (options.fixtureIds.length <= 2 &&
                    fixtureId === 'creative-portfolio'))))
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
                traceBinding,
                mockResponder,
                chapterHalt,
              );
            } catch (error) {
              report.failures.push({
                caseId: `fork:${fixtureId}:${mode}`,
                code: code(error),
                chapter: null,
                editorialReport: null,
                diagnostic: failureDiagnostic(error),
              });
              if (shouldStopEvaluation(error, options)) stop = true;
            }
          }
        } finally {
          await engine.close();
        }
        await save(reportPath, report);
      }
    if (!stop && !options.creativeOnly)
      for (const fixtureId of options.fixtureIds) {
        try {
          await fixedCanonComparison(
            fixtureId,
            options,
            env,
            report,
            transports,
            caseGuard,
            traceBinding,
            mockResponder,
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
            diagnostic: failureDiagnostic(error),
          });
          if (shouldStopEvaluation(error, options)) break;
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
        if (!override || options.creativeOnly) return stored;
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
      !options.creativeOnly &&
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
        ledgerPath,
      );
      if (options.serviceTier === 'flex') {
        const own = ledger.calls.filter(
          (c) => c.id && budgetBindings[c.id]?.out === resolve(options.out),
        );
        const standardUsage = own.reduce(
          (s, c) => s + (c.estimatedUsd ?? 0),
          0,
        );
        report.flexAccounting = {
          standardRateAccountedUsd: own.reduce((s, c) => s + c.accountedUsd, 0),
          standardRateUsageEstimatedUsd: standardUsage,
          flexUsageEstimatedUsd: standardUsage * 0.5,
          unknownUsageCalls: own.filter((c) => !c.usage).length,
          returnedTiers: [
            ...new Set(transports.map((t) => t.returnedServiceTier ?? null)),
          ],
          note: 'This run only. Ledger and reservations retain conservative Standard prices; Flex usage estimate is half the known Standard usage estimate, not an invoice. Unknown usage retains the full reservation. A missing or non-Flex returned tier rejects the chapter.',
        };
      }
    }
    verifyExistingEvaluationAttempts(
      options.out,
      traceBinding,
      transports,
      report.samples,
      env,
    );
    const sequenceOut = await writeCreativeSequenceArtifacts(report, options);
    if (sequenceOut) {
      report.sequenceBundles = sequenceOut.bundles;
      report.sequenceBundleFiles = sequenceOut.files;
      report.sequenceAssessment = sequenceOut.assessment;
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
  mockResponder?: OfflineMockResponder,
  seams?: EvaluationSeams,
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
    return await runEvaluationUnlocked(options, env, mockResponder, seams);
  } finally {
    for (const path of acquired.reverse()) await unlink(path);
  }
}
