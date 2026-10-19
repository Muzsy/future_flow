import { resolve } from 'node:path';
import {
  EXPERIMENT_CREATIVE_MAX_REQUEST_BYTES,
  EXPERIMENT_DEFAULT_MAX_REQUEST_BYTES,
} from '@future-flow/ai';
import { DomainError } from '@future-flow/core';
import { narrativeProfiles } from '../../tests/narrative-fixtures';

// Owner authorization on 2026-10-18: USD 23 total v6 development spend
// (initial USD 8, then USD 12/17; extended to USD 23 after quality2.5 checks).
// from the unchanged canonical ledger baseline USD 10.732030 (305 calls;
// prior unused v5 headroom USD 4.472505 is not added again). This is a
// cumulative accounting ceiling, not a provider balance or a ledger reset.
// Owner authorization on 2026-10-19: USD 7.39 v7/quality2.6 development
// spend on top of the closed v6 ledger total USD 33.4716975 (652 calls); the
// unused v6 remainder USD 0.2603325 is not added again.
export const evaluationApprovedCumulativeBudgetUsd = 40.8616975;
export const evaluationDefaultMaxRequestBytes =
  EXPERIMENT_DEFAULT_MAX_REQUEST_BYTES;
export const evaluationCreativeMaxRequestBytes =
  EXPERIMENT_CREATIVE_MAX_REQUEST_BYTES;

export function evaluationMaxRequestBytes(
  options: Pick<EvaluationOptions, 'creative'>,
) {
  return options.creative
    ? evaluationCreativeMaxRequestBytes
    : evaluationDefaultMaxRequestBytes;
}

// Development-only creative calibration after seven 180s transport timeouts.
// Fixed, source-bound ceiling; runtime defaults and retry/request budgets stay put.
export function evaluationTimeouts(
  options: Pick<EvaluationOptions, 'creative'>,
) {
  return {
    timeoutMs: 120000,
    ...(options.creative ? { fictionTimeoutMs: 300000 } : {}),
  };
}

export const evaluationPrices = {
  'gpt-6.1-sol': { input: 2, cachedInput: 0.1, inputCeiling: 2.5, output: 10 },
  'gpt-6-luna': {
    input: 0.1,
    cachedInput: 0.01,
    inputCeiling: 0.125,
    output: 0.5,
  },
};
export const evaluationPriceEvidence = {
  checkedOn: '2026-10-18',
  tier: 'default',
  context: 'short',
  source: 'https://developers.openai.com/api/docs/pricing',
};
export type EvaluationOptions = {
  kind: 'offline' | 'paid' | 'assess';
  creative?: true;
  creativeOnly?: true;
  noForks?: true;
  out: string;
  fixtureIds: string[];
  periods: number;
  seed: string;
  budgetUsd: number | null;
  approvalId: string | null;
  allowPaid: boolean;
  ratingsFile: string | null;
  sequenceRatingsFile?: string | null;
  choicesFile: string | null;
  models: { event: string; story: string; check: string };
  maxMeanCostUsd: number | null;
  maxP95Ms: number | null;
};
function invalid(message: string): never {
  throw new DomainError('EVAL_CONFIG_INVALID', message);
}
export function parseEvaluationOptions(
  argv: string[],
  env: Record<string, string | undefined> = {},
): EvaluationOptions {
  const values = new Map<string, string>(),
    boolean = new Set<string>();
  const flags = new Set([
    '--mode',
    '--out',
    '--fixtures',
    '--periods',
    '--seed',
    '--budget-usd',
    '--approval-id',
    '--ratings-file',
    '--sequence-ratings',
    '--sequence-ratings-file',
    '--choices-file',
    '--event-model',
    '--story-model',
    '--check-model',
    '--max-mean-cost-usd',
    '--max-p95-ms',
  ]);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]!;
    if (
      key === '--allow-paid' ||
      key === '--creative' ||
      key === '--creative-only' ||
      key === '--no-forks' ||
      key === '--no-fork'
    ) {
      if (boolean.has(key)) invalid('Duplicate flag.');
      boolean.add(key);
      continue;
    }
    if (
      !flags.has(key) ||
      values.has(key) ||
      !argv[i + 1] ||
      argv[i + 1]!.startsWith('--')
    )
      invalid('Unknown, duplicate or incomplete evaluation option.');
    values.set(key, argv[++i]!);
  }
  if (boolean.has('--no-forks') && boolean.has('--no-fork'))
    invalid('Duplicate flag.');
  if (values.has('--sequence-ratings') && values.has('--sequence-ratings-file'))
    invalid('Duplicate sequence ratings option.');
  const kind = values.get('--mode') ?? 'offline';
  if (!['offline', 'paid', 'assess'].includes(kind))
    invalid('Unsupported evaluation mode.');
  const fixtureIds =
    (values.get('--fixtures') ?? 'all') === 'all'
      ? narrativeProfiles.map((p) => p.id)
      : (values.get('--fixtures') ?? '').split(',');
  if (
    !fixtureIds.length ||
    new Set(fixtureIds).size !== fixtureIds.length ||
    fixtureIds.some((id) => !narrativeProfiles.some((p) => p.id === id))
  )
    invalid('Only the checked synthetic fixtures are allowed.');
  const periods = Number(values.get('--periods') ?? 3);
  const maxPeriods = boolean.has('--creative-only') ? 8 : 3;
  if (!Number.isInteger(periods) || periods < 1 || periods > maxPeriods)
    invalid(
      boolean.has('--creative-only')
        ? 'Creative-only evaluation requires one to eight periods.'
        : 'Evaluation requires one to three periods.',
    );
  const noForks = boolean.has('--no-forks') || boolean.has('--no-fork');
  if (
    noForks &&
    (!boolean.has('--creative-only') ||
      periods !== 3 ||
      fixtureIds.length !== 1 ||
      fixtureIds[0] !== 'career-transition')
  )
    invalid(
      'The --no-forks option is reserved for the three-period career-transition creative-only smoke run.',
    );
  const models = {
    event: values.get('--event-model') ?? 'gpt-6.1-sol',
    story: values.get('--story-model') ?? 'gpt-6.1-sol',
    check: values.get('--check-model') ?? 'gpt-6.1-sol',
  };
  if (
    Object.values(models).some(
      (model) => !Object.hasOwn(evaluationPrices, model),
    )
  )
    invalid(
      'The experiment must use a currently reviewed short-context model price.',
    );
  if (
    (boolean.has('--creative') || boolean.has('--creative-only')) &&
    Object.values(models).some((m) => m !== 'gpt-6.1-sol')
  )
    invalid(
      'Creative fiction keeps the existing gpt-6.1-sol model in every stage.',
    );
  const allowPaid = boolean.has('--allow-paid'),
    budgetUsd = values.has('--budget-usd')
      ? Number(values.get('--budget-usd'))
      : null,
    approvalId = values.get('--approval-id') ?? null;
  if (
    kind !== 'paid' &&
    (allowPaid || budgetUsd !== null || approvalId !== null)
  )
    invalid('Paid options require the explicit paid mode.');
  if (kind === 'paid') {
    if (
      !allowPaid ||
      budgetUsd === null ||
      !Number.isFinite(budgetUsd) ||
      budgetUsd <= 0 ||
      budgetUsd > evaluationApprovedCumulativeBudgetUsd ||
      !approvalId ||
      approvalId.length > 160 ||
      !values.has('--out')
    )
      invalid(
        'Paid runs require explicit approval, output directory and a positive budget within the owner-approved cumulative ceiling.',
      );
    if (
      !/^sk-(proj-|svcacct-)[A-Za-z0-9_-]{20,}$/.test(
        env.NARRATIVE_EVAL_API_KEY ?? '',
      ) ||
      !/^proj_[A-Za-z0-9_-]+$/.test(env.NARRATIVE_EVAL_PROJECT_ID ?? '') ||
      env.NARRATIVE_EVAL_PROJECT_CONFIRMATION !== 'dedicated-development'
    )
      invalid(
        'A separately approved development project and its evaluation key are required. The application key is never reused.',
      );
    const age =
      Date.now() - Date.parse(evaluationPriceEvidence.checkedOn + 'T00:00:00Z');
    if (age > 7 * 86400000 || age < -86400000)
      invalid(
        'Recheck the official experiment model prices before paid execution.',
      );
  }
  const number = (flag: string) => {
    if (!values.has(flag)) return null;
    const value = Number(values.get(flag));
    if (!Number.isFinite(value) || value <= 0)
      invalid('Operational limits must be positive.');
    return value;
  };
  const sequenceRatingsFile =
    values.get('--sequence-ratings') ??
    values.get('--sequence-ratings-file') ??
    null;
  if (
    kind === 'assess' &&
    !values.has('--ratings-file') &&
    !sequenceRatingsFile
  )
    invalid('Assessment requires human ratings.');
  return {
    kind: kind as EvaluationOptions['kind'],
    ...(boolean.has('--creative') || boolean.has('--creative-only')
      ? { creative: true as const }
      : {}),
    ...(boolean.has('--creative-only') ? { creativeOnly: true as const } : {}),
    ...(noForks ? { noForks: true as const } : {}),
    out: resolve(values.get('--out') ?? '.local/narrative-evaluation/offline'),
    fixtureIds,
    periods,
    seed: values.get('--seed') ?? 'alterward-narrative-evaluation-v1',
    models,
    budgetUsd,
    approvalId,
    allowPaid,
    ratingsFile: values.get('--ratings-file') ?? null,
    ...(sequenceRatingsFile ? { sequenceRatingsFile } : {}),
    choicesFile: values.get('--choices-file') ?? null,
    maxMeanCostUsd: number('--max-mean-cost-usd'),
    maxP95Ms: number('--max-p95-ms'),
  };
}

// The exported runner repeats CLI authorization checks; callers cannot bypass
// payment gates by constructing an options object directly.
export function verifyEvaluationAuthorization(
  options: EvaluationOptions,
  env: Record<string, string | undefined>,
) {
  const args = [
    '--mode',
    options.kind,
    '--out',
    options.out,
    '--fixtures',
    options.fixtureIds.join(','),
    '--periods',
    String(options.periods),
    '--seed',
    options.seed,
    '--event-model',
    options.models.event,
    '--story-model',
    options.models.story,
    '--check-model',
    options.models.check,
  ];
  if (options.allowPaid) args.push('--allow-paid');
  if (options.creativeOnly && !options.creative)
    invalid('Creative-only diagnostics require the creative policy.');
  if (options.creative) args.push('--creative');
  if (options.creativeOnly) args.push('--creative-only');
  if (options.noForks) args.push('--no-forks');
  if (options.budgetUsd !== null)
    args.push('--budget-usd', String(options.budgetUsd));
  if (options.approvalId !== null)
    args.push('--approval-id', options.approvalId);
  if (options.ratingsFile) args.push('--ratings-file', options.ratingsFile);
  if (options.sequenceRatingsFile)
    args.push('--sequence-ratings', options.sequenceRatingsFile);
  if (options.choicesFile) args.push('--choices-file', options.choicesFile);
  if (options.maxMeanCostUsd !== null)
    args.push('--max-mean-cost-usd', String(options.maxMeanCostUsd));
  if (options.maxP95Ms !== null)
    args.push('--max-p95-ms', String(options.maxP95Ms));
  parseEvaluationOptions(args, env);
}
