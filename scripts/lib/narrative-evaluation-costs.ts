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
  ledgerPath?: string,
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
    // The resolved absolute ledger these figures were read from.
    ...(ledgerPath ? { ledgerPath } : {}),
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

// Engineering yield, not independent human quality proof. All current-source
// full narrative attempts count, including those without an accepted manuscript.
export function evaluationNarrativeYield(
  accounting: ReturnType<typeof evaluationCostReport> | null | undefined,
  samples: {
    fixtureId: string;
    mode: string;
    kind: string;
    periodIndex: number;
  }[],
) {
  if (!accounting) return null;
  const rows = accounting.perCase.filter((c) =>
    /^[^:]+:narrative-v1:[0-7]$/.test(c.caseId),
  );
  const accepted = samples.filter(
    (s) => s.mode === 'narrative-v1' && s.kind === 'full',
  );
  const acceptedIds = new Set(
    accepted.map((s) => `${s.fixtureId}:${s.mode}:${s.periodIndex}`),
  );
  const covered = [...acceptedIds].every((id) =>
    rows.some((c) => c.caseId === id),
  );
  const accountedUsd = rows.reduce((sum, c) => sum + c.accountedUsd, 0);
  const usageEstimatedUsd = rows.reduce(
    (sum, c) => sum + c.usageEstimatedUsd,
    0,
  );
  const unknownUsageCalls = rows.reduce(
    (sum, c) => sum + c.unknownUsageCalls,
    0,
  );
  const acceptedCost = rows
    .filter((c) => acceptedIds.has(c.caseId))
    .reduce((sum, c) => sum + c.accountedUsd, 0);
  return {
    attemptedChapters: rows.length,
    gateAcceptedChapters: acceptedIds.size,
    acceptedCostCoverage: covered,
    acceptanceRate:
      rows.length && covered ? acceptedIds.size / rows.length : null,
    accountedUsd,
    usageEstimatedUsd,
    unacceptedAttemptAccountedUsd: accountedUsd - acceptedCost,
    accountedUsdPerGateAcceptedChapter:
      acceptedIds.size && covered && accounting.unassignedReservations === 0
        ? accountedUsd / acceptedIds.size
        : null,
    usageEstimatedUsdPerGateAcceptedChapter:
      acceptedIds.size &&
      covered &&
      accounting.unassignedReservations === 0 &&
      unknownUsageCalls === 0
        ? usageEstimatedUsd / acceptedIds.size
        : null,
    unknownUsageCalls,
    note: 'Current-source full narrative attempts only; rejected attempts and repairs are included. Fixed-canon/fork comparisons and prior development sources remain separately accounted. A gate-accepted chapter is not independent human quality approval. No accepted chapter means no finite unit-cost estimate.',
  };
}
