import { existsSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import OpenAI from 'openai';
import {
  ExperimentAiBudget,
  OpenAiProvider,
  type AiReceipt,
  type AiRequestGuard,
} from '@future-flow/ai';
import {
  fidelitySchema,
  fictionRepairSchemaFor,
  fictionV9Policy,
  type FictionAuthorResult,
  type NarrativePeriodInput,
  type NarrativePlanningResult,
} from '@future-flow/contracts';
import {
  DomainError,
  fictionFactsOnlyEligible,
  fictionFidelityDiscrepancyMessage,
  fictionScope,
  validateFictionAuthor,
  type FictionRepair,
} from '@future-flow/core';
import { authorPackages } from './narrative-author-packages';
import {
  approvalCumulativeBudgetUsd,
  evaluationV9MeasurementApproval,
} from './narrative-evaluation-approval';
import {
  evaluationApprovedCumulativeBudgetUsd,
  evaluationCreativeMaxRequestBytes,
  evaluationPriceEvidence,
  evaluationPrices,
} from './narrative-evaluation-options';
import {
  ledgerTotals,
  readLedgerCalls,
  summariseLedger,
  type LedgerCall,
} from './paid-ledger-summary';
import type { StoredChapter } from './narrative-request-breakdown';

// The paid probe of the reduced v9 repairs (cost-measurement plan, part B).
// Two stages, both through the shared experiment ledger and never off it:
//   schema smoke: one tiny call per reduced schema on the real strict API, so
//   an API that refuses a schema shows up for cents (open risk L8);
//   forced facts-only: the real facts-only repair request of a stored chapter
//   whose fidelity check reported only unregistered facts, sent once, so the
//   real cost and the real acceptance of the reduced answer are measured
//   without waiting for a chapter to trigger it.
// The cumulative budget is the ledger total at the start plus the run's own
// cap: the probe cannot spend more than its cap, and never more than the
// owner-approved cumulative ceiling. Nothing here lowers a guard of the ledger.
export const PROBE_CASE_NAME_PREFIX = 'paid-probe';
export const PROBE_DEFAULT_MAX_SPEND_USD = 0.5;
// The repair message is clipped to the same budget as in the worker.
const REPAIR_MESSAGE_LIMIT = 1800;
// A smoke answer is tiny; the case calls use the product's own limit.
const SMOKE_MAX_OUTPUT_TOKENS = 4000;
const CASE_MAX_OUTPUT_TOKENS = 12000;
const STOP_AFTER_FAILURES = 2;
const FATAL_CODES = new Set(['AI_AUTH_FAILED', 'AI_QUOTA_EXHAUSTED']);

export type FactsOnlyCase = {
  id: string;
  source: 'stored' | 'synthetic';
  caseId: string;
  payload: NarrativePeriodInput;
  plan: NarrativePlanningResult;
  previous: FictionAuthorResult;
  message: string;
  reasons: string[];
};

const lastPlanBefore = (chapter: StoredChapter, ordinal: number) =>
  chapter.attempts
    .filter(
      (a) =>
        a.task === 'life_narrative_plan' &&
        a.status === 'completed' &&
        a.output &&
        a.ordinal < ordinal,
    )
    .at(-1)?.output as NarrativePlanningResult | undefined;

// Stored fidelity failures that the product's facts-only gate would send to
// the facts-only repair: every reason an unregistered material fact, none
// offering removal, on a living-world chapter. The package is the last author
// package before the fidelity call.
export function storedFactsOnlyCases(
  chapters: StoredChapter[],
  label: string,
): FactsOnlyCase[] {
  const cases: FactsOnlyCase[] = [];
  for (const chapter of chapters) {
    if (!fictionScope(chapter.payload).characters) continue;
    const packages = authorPackages(chapter.attempts);
    for (const attempt of chapter.attempts) {
      if (attempt.task !== 'life_fidelity' || !attempt.output) continue;
      const checked = fidelitySchema.safeParse(attempt.output);
      if (
        !checked.success ||
        (checked.data.valid && !checked.data.issues.length) ||
        !fictionFactsOnlyEligible(checked.data.issues)
      )
        continue;
      const ordinal = [...packages.keys()]
        .filter((o) => o < attempt.ordinal)
        .at(-1);
      const previous =
        ordinal === undefined ? undefined : packages.get(ordinal);
      const plan =
        ordinal === undefined ? undefined : lastPlanBefore(chapter, ordinal);
      if (!previous || !plan) continue;
      cases.push({
        id: `${label}:${chapter.chapter}:${attempt.ordinal}`,
        source: 'stored',
        caseId: chapter.caseId,
        payload: chapter.payload,
        plan,
        previous,
        message: fictionFidelityDiscrepancyMessage(checked.data.issues).slice(
          0,
          REPAIR_MESSAGE_LIMIT,
        ),
        reasons: checked.data.issues.map((i) => i.reason),
      });
    }
  }
  return cases;
}

// When no stored run has such a failure, a synthetic case reuses a stored
// chapter's final package with a fidelity-shaped reason built from that
// chapter's own prose (its longest paragraph's first sentence), so the request
// has the size and the shape of the real one. The report marks it synthetic:
// it measures cost and acceptance, not what the model would have found.
export function syntheticFactsOnlyCase(
  chapter: StoredChapter,
  label: string,
): FactsOnlyCase | null {
  if (!fictionScope(chapter.payload).characters) return null;
  const packages = authorPackages(chapter.attempts);
  const ordinal = [...packages.keys()].at(-1);
  const previous = ordinal === undefined ? undefined : packages.get(ordinal);
  const plan =
    ordinal === undefined ? undefined : lastPlanBefore(chapter, ordinal);
  if (!previous || !plan) return null;
  const paragraph = [...previous.chapter.body.split(/\n{2,}/)].sort(
    (a, b) => b.length - a.length,
  )[0]!;
  const sentence = paragraph
    .split(/(?<=[.!?])\s+/)[0]!
    .trim()
    .slice(0, 200);
  const reason = `unregistered_material_fact: the chapter states "${sentence}" as a lasting claim that no story fact registers.`;
  return {
    id: `${label}:${chapter.chapter}:synthetic`,
    source: 'synthetic',
    caseId: chapter.caseId,
    payload: chapter.payload,
    plan,
    previous,
    message: fictionFidelityDiscrepancyMessage([{ reason }]),
    reasons: [reason],
  };
}

export type ProbeStage = 'schema-smoke' | 'forced-facts-only';
export type ProbeCallRecord = {
  stage: ProbeStage;
  mode: 'facts_only' | 'prose_only';
  caseId: string | null;
  source: FactsOnlyCase['source'] | null;
  startedAt: string;
  status: 'ok' | 'error';
  errorCode: string | null;
  // What the answer was: facts_only merged and valid, asked for the full
  // repair, rejected by the merge, or a package that failed the server's own
  // validation; null when no answer came back.
  outcome: string | null;
  requestBytes: number | null;
  receipt: Pick<
    AiReceipt,
    | 'requestId'
    | 'model'
    | 'inputTokens'
    | 'outputTokens'
    | 'cachedInputTokens'
    | 'cacheWriteTokens'
    | 'reasoningTokens'
    | 'latencyMs'
  > | null;
  // Every ledger reservation this call made (more than one means a transport
  // retry of the provider) and what the ledger accounted for them.
  ledgerCallIds: string[];
  accountedUsd: number | null;
  estimatedUsd: number | null;
};

// Records which ledger reservations belong to the current call, and the size of
// the request each one carried, while leaving the ledger's guard untouched.
export function recordingGuard(inner: AiRequestGuard) {
  const reservations: { id: string; bytes: number }[] = [];
  const guard: AiRequestGuard = {
    reserve: async (raw) => {
      const id = await inner.reserve(raw);
      reservations.push({
        id,
        bytes: Buffer.byteLength(JSON.stringify(raw), 'utf8'),
      });
      return id;
    },
    settle: (id, usage) => inner.settle(id, usage),
  };
  return { guard, take: () => reservations.splice(0) };
}

type Generate = (
  schema: unknown,
  task: string,
  model: string,
  instructions: string,
  input: unknown,
  locale: 'en' | 'hu',
  promptVersion: string,
) => Promise<{ output: unknown; receipt: AiReceipt }>;

const SMOKE_INSTRUCTIONS: Record<'facts_only' | 'prose_only', string> = {
  facts_only:
    'Schema smoke test. Return outcome needs_full_repair and an empty storyFacts array.',
  prose_only:
    'Schema smoke test. Return a short title and a body of at least six plain sentences (over 600 characters) about nothing in particular.',
};

export type PaidProbeOptions = {
  ledgerPath: string;
  maxSpendUsd: number;
  approvalId: string;
  cases: FactsOnlyCase[];
  smoke: boolean;
  apiKey: string;
  project?: string;
  // Test seam: the SDK client.
  client?: OpenAI;
  now?: () => number;
  onProgress?: (partial: PaidProbeResult) => void;
};

export type PaidProbeResult = {
  approvalId: string;
  startedAt: string;
  endedAt: string | null;
  ledger: {
    path: string;
    start: ReturnType<typeof ledgerTotals>;
    end: ReturnType<typeof ledgerTotals> | null;
    cumulativeBudgetUsd: number;
    maxSpendUsd: number;
    spentAccountedUsd: number | null;
    spentEstimatedUsd: number | null;
  };
  calls: ProbeCallRecord[];
  stoppedBy: string | null;
  summary: ReturnType<typeof summariseLedger> | null;
};

const symlinked = (path: string) =>
  existsSync(path) && lstatSync(path).isSymbolicLink();

export async function runPaidProbe(
  options: PaidProbeOptions,
): Promise<PaidProbeResult> {
  const now = options.now ?? Date.now;
  if (
    !Number.isFinite(options.maxSpendUsd) ||
    options.maxSpendUsd <= 0 ||
    options.maxSpendUsd > evaluationApprovedCumulativeBudgetUsd
  )
    throw new DomainError('SMOKE_BUDGET_CONFIG', 'Invalid probe spend cap.');
  const ledgerPath = resolve(options.ledgerPath);
  for (const path of [
    resolve(ledgerPath, '..', '..'),
    resolve(ledgerPath, '..'),
    ledgerPath,
  ])
    if (symlinked(path))
      throw new DomainError(
        'SMOKE_BUDGET_CONFIG',
        'Experimental accounting cannot use symlinked paths.',
      );
  // Only the source-bound owner approval covers paid calls: its whole spend,
  // the probe's included, stays under the approval's cap.
  if (options.approvalId !== evaluationV9MeasurementApproval.approvalId)
    throw new DomainError(
      'SMOKE_BUDGET_CONFIG',
      `The paid probe is approved only under ${evaluationV9MeasurementApproval.approvalId}.`,
    );
  const ledgerCalls = readLedgerCalls(ledgerPath);
  const start = ledgerTotals(ledgerCalls);
  // The ledger enforces the cumulative figure; a probe cap that would reach
  // past the owner-approved ceiling is refused, never clamped.
  const cumulativeBudgetUsd = Math.min(
    start.accountedUsd + options.maxSpendUsd,
    approvalCumulativeBudgetUsd(
      ledgerCalls,
      options.approvalId,
      evaluationV9MeasurementApproval.maxSpendUsd,
    ),
  );
  if (cumulativeBudgetUsd > evaluationApprovedCumulativeBudgetUsd + 1e-9)
    throw new DomainError(
      'SMOKE_BUDGET_CONFIG',
      `The ledger holds USD ${start.accountedUsd.toFixed(4)}; a probe cap of USD ${options.maxSpendUsd} would pass the approved ceiling USD ${evaluationApprovedCumulativeBudgetUsd}.`,
    );
  const caseName = `${PROBE_CASE_NAME_PREFIX}:${options.approvalId}`;
  const startedAt = new Date(now()).toISOString();
  const budget = new ExperimentAiBudget(
    ledgerPath,
    cumulativeBudgetUsd,
    caseName,
    evaluationPrices,
    evaluationApprovedCumulativeBudgetUsd,
    evaluationCreativeMaxRequestBytes,
  );
  const result: PaidProbeResult = {
    approvalId: options.approvalId,
    startedAt,
    endedAt: null,
    ledger: {
      path: ledgerPath,
      start,
      end: null,
      cumulativeBudgetUsd,
      maxSpendUsd: options.maxSpendUsd,
      spentAccountedUsd: null,
      spentEstimatedUsd: null,
    },
    calls: [],
    stoppedBy: null,
    summary: null,
  };
  try {
    const { guard, take } = recordingGuard(budget);
    const sdk =
      options.client ??
      new OpenAI({
        apiKey: options.apiKey,
        project: options.project,
        baseURL: 'https://api.openai.com/v1',
        organization: null,
        logLevel: 'off',
        maxRetries: 0,
        timeout: 180000,
      });
    const provider = (maxOutputTokens: number) =>
      new OpenAiProvider(
        {
          apiKey: options.apiKey,
          eventModel: 'gpt-6.1-sol',
          storyModel: 'gpt-6.1-sol',
          checkModel: 'gpt-6.1-sol',
          timeoutMs: 180000,
          fictionTimeoutMs: 180000,
          maxOutputTokens,
          guard,
        },
        sdk,
      );
    const policy = fictionV9Policy();
    let failures = 0;
    const finish = (
      base: Omit<
        ProbeCallRecord,
        'requestBytes' | 'ledgerCallIds' | 'accountedUsd' | 'estimatedUsd'
      >,
    ) => {
      const reservations = take();
      const record: ProbeCallRecord = {
        ...base,
        requestBytes: reservations[0]?.bytes ?? null,
        ledgerCallIds: reservations.map((r) => r.id),
        accountedUsd: null,
        estimatedUsd: null,
      };
      result.calls.push(record);
      failures = record.status === 'ok' ? 0 : failures + 1;
      if (record.errorCode && FATAL_CODES.has(record.errorCode))
        result.stoppedBy = `${record.errorCode} on ${record.stage}`;
      else if (record.errorCode === 'SMOKE_BUDGET_EXCEEDED')
        result.stoppedBy =
          'The probe cap is reached (the ledger refused the next call).';
      else if (failures >= STOP_AFTER_FAILURES)
        result.stoppedBy = `${failures} failed calls in a row.`;
      options.onProgress?.(result);
    };
    const receiptOf = (r: AiReceipt): ProbeCallRecord['receipt'] => ({
      requestId: r.requestId,
      model: r.model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cachedInputTokens: r.cachedInputTokens,
      cacheWriteTokens: r.cacheWriteTokens,
      reasoningTokens: r.reasoningTokens,
      latencyMs: r.latencyMs,
    });

    if (options.smoke)
      for (const mode of ['facts_only', 'prose_only'] as const) {
        if (result.stoppedBy) break;
        const schema = fictionRepairSchemaFor(policy, mode)!;
        const base = {
          stage: 'schema-smoke' as const,
          mode,
          caseId: null,
          source: null,
          startedAt: new Date(now()).toISOString(),
        };
        try {
          const ai = provider(SMOKE_MAX_OUTPUT_TOKENS);
          const { output, receipt } = await (
            ai as unknown as { generate: Generate }
          ).generate.call(
            ai,
            schema,
            'life_narrative_chapter',
            'gpt-6.1-sol',
            SMOKE_INSTRUCTIONS[mode],
            { check: 'schema-smoke', mode },
            'en',
            `${policy.promptVersions.writer}.en`,
          );
          finish({
            ...base,
            status: 'ok',
            errorCode: null,
            outcome:
              mode === 'facts_only'
                ? (output as { outcome: string }).outcome
                : 'chapter_returned',
            receipt: receiptOf(receipt),
          });
        } catch (error) {
          finish({
            ...base,
            status: 'error',
            errorCode: error instanceof DomainError ? error.code : 'UNKNOWN',
            outcome: null,
            receipt: null,
          });
          // A refused strict schema (a 400 surfaces as AI_PROVIDER_FAILED)
          // ends the probe: the case calls would only be refused too.
          if (
            error instanceof DomainError &&
            error.code === 'AI_PROVIDER_FAILED'
          )
            result.stoppedBy = `The API refused the ${mode} schema (${error.code}).`;
        }
      }

    for (const item of options.cases) {
      if (result.stoppedBy) break;
      const base = {
        stage: 'forced-facts-only' as const,
        mode: 'facts_only' as const,
        caseId: item.id,
        source: item.source,
        startedAt: new Date(now()).toISOString(),
      };
      const repair: FictionRepair = {
        mode: 'facts_only',
        message: item.message,
        previous: item.previous,
      };
      try {
        const ai = provider(CASE_MAX_OUTPUT_TOKENS);
        const { output, receipt } = await ai.authorFiction(
          item.payload,
          item.plan,
          repair,
        );
        // The product's own deterministic validation of the merged package.
        let outcome = 'merged_valid';
        try {
          validateFictionAuthor(item.payload, output);
        } catch (error) {
          outcome = `merged_invalid: ${(error as Error).message.slice(0, 160)}`;
        }
        finish({
          ...base,
          status: 'ok',
          errorCode: null,
          outcome,
          receipt: receiptOf(receipt),
        });
      } catch (error) {
        const code = error instanceof DomainError ? error.code : 'UNKNOWN';
        const receipt = (error as { receipt?: AiReceipt }).receipt;
        finish({
          ...base,
          // A merge refusal still paid for an answer: the receipt is there.
          status: receipt ? 'ok' : 'error',
          errorCode: code,
          outcome: receipt
            ? /full package repair/.test((error as Error).message)
              ? 'needs_full_repair'
              : `merge_rejected: ${(error as Error).message.slice(0, 160)}`
            : null,
          receipt: receipt ? receiptOf(receipt) : null,
        });
      }
    }
  } finally {
    budget.close();
  }
  const calls = readLedgerCalls(result.ledger.path);
  const end = ledgerTotals(calls);
  const byId = new Map<string, LedgerCall>(
    calls.flatMap((c) => (c.id ? [[c.id, c] as const] : [])),
  );
  for (const record of result.calls) {
    const rows = record.ledgerCallIds.flatMap((id) => byId.get(id) ?? []);
    record.accountedUsd = rows.reduce((s, c) => s + c.accountedUsd, 0);
    record.estimatedUsd = rows.reduce((s, c) => s + (c.estimatedUsd ?? 0), 0);
  }
  result.endedAt = new Date(now()).toISOString();
  result.ledger.end = end;
  result.ledger.spentAccountedUsd = end.accountedUsd - start.accountedUsd;
  result.ledger.spentEstimatedUsd = end.estimatedUsd - start.estimatedUsd;
  result.summary = summariseLedger(calls, {
    since: startedAt,
    caseNamePrefix: `${PROBE_CASE_NAME_PREFIX}:${options.approvalId}`,
  });
  options.onProgress?.(result);
  return result;
}

// The paid environment the evaluation also requires: a dedicated development
// key and project, never the application key; and fresh price evidence.
export function paidProbeEnvironment(
  env: Record<string, string | undefined>,
  today = Date.now(),
) {
  if (
    !/^sk-(proj-|svcacct-)[A-Za-z0-9_-]{20,}$/.test(
      env.NARRATIVE_EVAL_API_KEY ?? '',
    ) ||
    !/^proj_[A-Za-z0-9_-]+$/.test(env.NARRATIVE_EVAL_PROJECT_ID ?? '') ||
    env.NARRATIVE_EVAL_PROJECT_CONFIRMATION !== 'dedicated-development'
  )
    throw new Error(
      'A separately approved development project and its evaluation key are required (NARRATIVE_EVAL_API_KEY, NARRATIVE_EVAL_PROJECT_ID, NARRATIVE_EVAL_PROJECT_CONFIRMATION=dedicated-development). The application key is never reused.',
    );
  const age =
    today - Date.parse(evaluationPriceEvidence.checkedOn + 'T00:00:00Z');
  if (age > 7 * 86400000 || age < -86400000)
    throw new Error(
      'Recheck the official experiment model prices before paid execution.',
    );
  return {
    apiKey: env.NARRATIVE_EVAL_API_KEY!,
    project: env.NARRATIVE_EVAL_PROJECT_ID!,
  };
}

const usd = (n: number | null) => (n === null ? '-' : n.toFixed(4));
const budapest = (iso: string) =>
  new Date(iso).toLocaleTimeString('hu-HU', {
    timeZone: 'Europe/Budapest',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

export function paidProbeMarkdown(result: PaidProbeResult) {
  const l = result.ledger;
  return [
    '# Paid probe: schema smoke and forced facts-only',
    '',
    `Approval ${result.approvalId}. Times are Hungarian local time.`,
    ...(result.stoppedBy ? ['', `**Stopped early:** ${result.stoppedBy}`] : []),
    '',
    `Ledger at the start: ${l.start.calls} calls, accounted USD ${usd(l.start.accountedUsd)}, usage-estimated USD ${usd(l.start.estimatedUsd)}.`,
    l.end
      ? `Ledger at the end: ${l.end.calls} calls, accounted USD ${usd(l.end.accountedUsd)}, usage-estimated USD ${usd(l.end.estimatedUsd)}.`
      : 'Ledger at the end: not yet.',
    `This probe spent: accounted USD ${usd(l.spentAccountedUsd)}, usage-estimated USD ${usd(l.spentEstimatedUsd)} (cap USD ${l.maxSpendUsd}; the ledger's cumulative budget for it was USD ${usd(l.cumulativeBudgetUsd)}).`,
    ...(result.calls.some((c) => c.source === 'synthetic')
      ? [
          '',
          `**Synthetic cases:** ${result.calls.filter((c) => c.source === 'synthetic').length} of the forced calls used a synthetic reason built from the chapter's own prose, not a stored fidelity failure. They measure cost and whether the reduced answer is accepted; draw no quality conclusion from them.`,
        ]
      : []),
    '',
    '| time | stage | mode | case | status | outcome | request B | input | cached | output | reasoning | latency s | accounted USD | estimated USD | request id |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...result.calls.map(
      (c) =>
        `| ${budapest(c.startedAt)} | ${c.stage} | ${c.mode} | ${c.caseId ?? '-'}${c.source === 'synthetic' ? ' (synthetic)' : ''} | ${c.status}${c.errorCode ? ` ${c.errorCode}` : ''} | ${c.outcome ?? '-'} | ${c.requestBytes ?? '-'} | ${c.receipt?.inputTokens ?? '-'} | ${c.receipt?.cachedInputTokens ?? '-'} | ${c.receipt?.outputTokens ?? '-'} | ${c.receipt?.reasoningTokens ?? '-'} | ${c.receipt ? (c.receipt.latencyMs / 1000).toFixed(0) : '-'} | ${usd(c.accountedUsd)} | ${usd(c.estimatedUsd)} | ${c.receipt?.requestId ?? '-'} |`,
    ),
    '',
  ].join('\n');
}
