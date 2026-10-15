import { DomainError } from '@future-flow/core';
export type EvaluationBudgetBinding = { sourceHash: string; caseId: string };
export type ExperimentalCall = {
  id?: string;
  accountedUsd: number;
  estimatedUsd?: number;
  reservedUsd: number;
  usage?: { input_tokens: number; output_tokens: number };
  status: string;
};
export function evaluationCostReport(
  calls: ExperimentalCall[],
  bindings: Record<string, EvaluationBudgetBinding>,
  sourceHash: string,
) {
  if (
    calls.some(
      (call) =>
        ![call.accountedUsd, call.reservedUsd, call.estimatedUsd ?? 0].every(
          (v) => Number.isFinite(v) && v >= 0,
        ),
    )
  )
    throw new DomainError(
      'EVAL_LEDGER_INVALID',
      'Invalid experimental accounting.',
    );
  const cases = new Map<string, ExperimentalCall[]>();
  let unassigned = 0;
  for (const call of calls) {
    const binding = call.id ? bindings[call.id] : undefined;
    if (!binding) {
      unassigned++;
      continue;
    }
    if (binding.sourceHash !== sourceHash) continue;
    cases.set(binding.caseId, [...(cases.get(binding.caseId) ?? []), call]);
  }
  const perCase = [...cases].map(([caseId, rows]) => ({
    caseId,
    reservations: rows.length,
    accountedUsd: rows.reduce((s, c) => s + c.accountedUsd, 0),
    usageEstimatedUsd: rows.reduce((s, c) => s + (c.estimatedUsd ?? 0), 0),
    unknownUsageCalls: rows.filter((c) => !c.usage).length,
    peakReservationUsd: Math.max(0, ...rows.map((c) => c.reservedUsd)),
    inputTokens: rows.reduce((s, c) => s + (c.usage?.input_tokens ?? 0), 0),
    outputTokens: rows.reduce((s, c) => s + (c.usage?.output_tokens ?? 0), 0),
  }));
  return {
    totalDevelopmentAccountedUsd: calls.reduce((s, c) => s + c.accountedUsd, 0),
    totalDevelopmentUsageEstimatedUsd: calls.reduce(
      (s, c) => s + (c.estimatedUsd ?? 0),
      0,
    ),
    unassignedReservations: unassigned,
    currentSourceAccountedUsd: perCase.reduce((s, c) => s + c.accountedUsd, 0),
    currentSourceUsageEstimatedUsd: perCase.reduce(
      (s, c) => s + c.usageEstimatedUsd,
      0,
    ),
    currentSourceUnknownUsageCalls: perCase.reduce(
      (s, c) => s + c.unknownUsageCalls,
      0,
    ),
    perCase,
    note: 'Usage-priced estimates are not an invoice. Budget accounting includes conservative input rates and retains the full reservation when usage is unknown; it is never reset on a retry or new output folder.',
  };
}
