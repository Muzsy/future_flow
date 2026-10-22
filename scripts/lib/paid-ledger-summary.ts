import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Reads the shared paid-experiment ledger (`ExperimentAiBudget`'s file) and
// summarises it without touching it: totals, and the same calls grouped per
// run (the ledger's case name), per stage (the response format name), per case
// (budget bindings, when given) and per UTC day, which is how the provider's
// usage view groups them. Pure arithmetic over the file; the ledger stays the
// only place that decides what a call may cost.
type LedgerUsage = {
  input_tokens: number;
  output_tokens: number;
  input_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  };
};
export type LedgerCall = {
  id?: string;
  caseName?: string;
  model: string;
  task: string;
  startedAt: string;
  reservedUsd: number;
  accountedUsd: number;
  estimatedUsd?: number;
  status: string;
  usage?: LedgerUsage;
};
export type LedgerFilter = {
  // Only calls that started at or after this instant.
  since?: string;
  caseNamePrefix?: string;
};
export type LedgerRow = {
  key: string;
  calls: number;
  completed: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  accountedUsd: number;
  estimatedUsd: number;
};

export function readLedgerCalls(path: string): LedgerCall[] {
  if (!existsSync(path)) return [];
  const calls = (JSON.parse(readFileSync(path, 'utf8')) as { calls?: unknown })
    .calls;
  if (
    !Array.isArray(calls) ||
    calls.some(
      (c: LedgerCall) =>
        !Number.isFinite(c?.accountedUsd) ||
        c.accountedUsd < 0 ||
        typeof c.startedAt !== 'string' ||
        typeof c.task !== 'string',
    )
  )
    throw new Error('The ledger cannot be validated.');
  return calls as LedgerCall[];
}

const empty = (key: string): LedgerRow => ({
  key,
  calls: 0,
  completed: 0,
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
  accountedUsd: 0,
  estimatedUsd: 0,
});
function add(row: LedgerRow, call: LedgerCall) {
  row.calls += 1;
  row.accountedUsd += call.accountedUsd;
  row.estimatedUsd += call.estimatedUsd ?? 0;
  if (call.usage && call.status === 'completed') {
    row.completed += 1;
    row.inputTokens += call.usage.input_tokens;
    row.outputTokens += call.usage.output_tokens;
    row.cachedInputTokens +=
      call.usage.input_tokens_details?.cached_tokens ?? 0;
    row.cacheWriteTokens +=
      call.usage.input_tokens_details?.cache_write_tokens ?? 0;
  }
}
function group(
  calls: LedgerCall[],
  keyOf: (call: LedgerCall) => string,
): LedgerRow[] {
  const rows = new Map<string, LedgerRow>();
  for (const call of calls) {
    const key = keyOf(call);
    const row = rows.get(key) ?? empty(key);
    add(row, call);
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function ledgerTotals(calls: LedgerCall[]) {
  const total = empty('total');
  for (const call of calls) add(total, call);
  return {
    ...total,
    unknownUsageCalls: calls.filter((c) => !c.usage).length,
  };
}

export function summariseLedger(
  all: LedgerCall[],
  filter: LedgerFilter = {},
  bindings: Record<string, { caseId: string }> = {},
) {
  const since = filter.since ? Date.parse(filter.since) : null;
  if (since !== null && !Number.isFinite(since))
    throw new Error('--since must be an ISO date-time.');
  const calls = all.filter(
    (c) =>
      (since === null || Date.parse(c.startedAt) >= since) &&
      (!filter.caseNamePrefix ||
        (c.caseName ?? '').startsWith(filter.caseNamePrefix)),
  );
  return {
    filter,
    ledger: ledgerTotals(all),
    selected: ledgerTotals(calls),
    perRun: group(calls, (c) => c.caseName ?? 'unnamed'),
    perStage: group(calls, (c) => c.task),
    perCase: group(calls, (c) => bindings[c.id ?? '']?.caseId ?? 'unbound'),
    // The provider's usage view buckets by UTC day and model.
    perUtcDayAndModel: group(
      calls,
      (c) => `${c.startedAt.slice(0, 10)} ${c.model}`,
    ),
  };
}
export type LedgerSummary = ReturnType<typeof summariseLedger>;

const usd = (n: number) => n.toFixed(4);
const table = (title: string, rows: LedgerRow[]) => [
  `### ${title}`,
  '',
  '| key | calls (completed) | input tok | cached tok | cache-write tok | output tok | accounted USD | estimated USD |',
  '|---|---|---|---|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| ${r.key} | ${r.calls} (${r.completed}) | ${r.inputTokens} | ${r.cachedInputTokens} | ${r.cacheWriteTokens} | ${r.outputTokens} | ${usd(r.accountedUsd)} | ${usd(r.estimatedUsd)} |`,
  ),
  '',
];

export function ledgerMarkdown(summary: LedgerSummary) {
  const s = summary.selected;
  return [
    '# Paid ledger summary',
    '',
    `Whole ledger: ${summary.ledger.calls} calls, accounted USD ${usd(summary.ledger.accountedUsd)}, usage-estimated USD ${usd(summary.ledger.estimatedUsd)}, ${summary.ledger.unknownUsageCalls} call(s) without usage.`,
    `Selected${summary.filter.since ? ` since ${summary.filter.since}` : ''}${summary.filter.caseNamePrefix ? ` for ${summary.filter.caseNamePrefix}*` : ''}: ${s.calls} calls (${s.completed} with usage), accounted USD ${usd(s.accountedUsd)}, usage-estimated USD ${usd(s.estimatedUsd)}, ${s.unknownUsageCalls} without usage.`,
    '',
    "Accounted USD is the ledger's conservative figure (input at the ceiling price, which the budget guard enforces); usage-estimated USD prices the cached and uncached input at the real rates. The provider's usage view groups by UTC day and model: compare the last table with it.",
    '',
    ...table('Per run (ledger case name)', summary.perRun),
    ...table('Per stage (response format)', summary.perStage),
    ...table('Per case (budget bindings)', summary.perCase),
    ...table('Per UTC day and model', summary.perUtcDayAndModel),
  ].join('\n');
}

// The ledger's lock file survives a crashed paid process and then blocks every
// later paid run (the safe direction). This only reports it, read-only: it is
// stale when the process that wrote it no longer runs, and a person deletes it
// by hand after checking that no paid process is active.
export function paidLockStatus(ledgerPath: string) {
  const lock = join(dirname(ledgerPath), 'paid-run.lock');
  if (!existsSync(lock)) return 'Paid-run lock: none.';
  let pid: number | null = null;
  try {
    pid =
      (JSON.parse(readFileSync(lock, 'utf8')) as { pid?: number }).pid ?? null;
  } catch {
    // An unreadable lock is reported as such below.
  }
  if (pid === null)
    return `Paid-run lock: ${lock} exists and is unreadable; delete it by hand only after checking that no paid process runs.`;
  let alive = true;
  try {
    process.kill(pid, 0);
  } catch (error) {
    alive = (error as NodeJS.ErrnoException).code === 'EPERM';
  }
  return alive
    ? `Paid-run lock: held by process ${pid}, which is running: a paid process is active.`
    : `Paid-run lock: ${lock} is STALE (process ${pid} no longer runs); after checking that no paid process is active, delete it by hand.`;
}
