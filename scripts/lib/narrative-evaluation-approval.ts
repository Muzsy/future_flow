import { DomainError } from '@future-flow/core';
import type { LedgerCall } from './paid-ledger-summary';

// Owner authorization 2026-10-22 21:08 (Hungarian time, Ákos): "3.44 dollár van
// az api balance-omon. Azt használhatod majd nyugodtan" and "minden használatot
// mérj szigorúan". The coordinator fixed the measurement at the "M" plan of
// koltsegmeres-javaslat-65.md with a hard cap of USD 2.70 for EVERYTHING the
// approval spends: the two schema smokes, the forced facts-only calls and the
// five-chapter run (career-transition, four periods and the fork, rotating
// choices, v9 only). The probe's own cap is part of the 2.70, not on top of it.
// The cap is cumulative on the shared ledger: the budget this approval may
// reach is the ledger total WITHOUT its own calls, plus the cap, so it holds
// across restarts and between the probe and the run. The approved cumulative
// ceiling of the evaluation (52.93296) still applies on top of it. A different
// approval id, fixture or period count is not covered by this note.
export const evaluationV9MeasurementApproval = {
  approvalId: 'v9-m-20261022',
  maxSpendUsd: 2.7,
  // No new chapter starts once the approval's accounted spend has reached this:
  // the worst nine-request chapter costs about 0.60, so one in progress cannot
  // pass the cap.
  noNewChapterAtUsd: 2.1,
  // A cost signal (not a gate): after this many chapters the run stops when the
  // mean usage-estimated cost per chapter is above the figure.
  costSignalAfterChapters: 2,
  costSignalMeanUsd: 0.5,
  fixtureId: 'career-transition',
  maxPeriods: 4,
} as const;

const prefixes = (approvalId: string) => [
  `narrative-evaluation:${approvalId}`,
  `paid-probe:${approvalId}`,
];
const own = (call: LedgerCall, approvalId: string) =>
  prefixes(approvalId).includes(call.caseName ?? '');

export function approvalSpend(calls: LedgerCall[], approvalId: string) {
  const mine = calls.filter((c) => own(c, approvalId));
  const run = mine.filter(
    (c) => c.caseName === `narrative-evaluation:${approvalId}`,
  );
  return {
    accountedUsd: mine.reduce((s, c) => s + c.accountedUsd, 0),
    runEstimatedUsd: run.reduce((s, c) => s + (c.estimatedUsd ?? 0), 0),
  };
}

// The cumulative ledger figure the approval may reach: everything the ledger
// held that is not this approval's, plus the approval's cap.
export function approvalCumulativeBudgetUsd(
  calls: LedgerCall[],
  approvalId: string,
  maxSpendUsd: number,
) {
  const total = calls.reduce((s, c) => s + c.accountedUsd, 0);
  return total - approvalSpend(calls, approvalId).accountedUsd + maxSpendUsd;
}

// Why a new chapter must not start, or null. `chaptersDone` counts the chapters
// this run has completed.
export function approvalChapterHalt(
  calls: LedgerCall[],
  chaptersDone: number,
  approval: Pick<
    typeof evaluationV9MeasurementApproval,
    | 'approvalId'
    | 'noNewChapterAtUsd'
    | 'costSignalAfterChapters'
    | 'costSignalMeanUsd'
  > = evaluationV9MeasurementApproval,
) {
  const spend = approvalSpend(calls, approval.approvalId);
  if (spend.accountedUsd >= approval.noNewChapterAtUsd)
    return `The approval has accounted USD ${spend.accountedUsd.toFixed(4)}, at or over USD ${approval.noNewChapterAtUsd}: no new chapter starts.`;
  if (
    chaptersDone >= approval.costSignalAfterChapters &&
    spend.runEstimatedUsd / chaptersDone > approval.costSignalMeanUsd
  )
    return `Cost signal: the mean usage-estimated cost of ${chaptersDone} chapters is USD ${(spend.runEstimatedUsd / chaptersDone).toFixed(4)}, above USD ${approval.costSignalMeanUsd}: stopped for analysis.`;
  return null;
}

// The closed v8 Stage B ledger total (875 calls) that the owner-approved
// cumulative ceiling was built on: a ledger below it is not the shared ledger.
// A missing file or another working directory would otherwise start the
// approval's cap from zero and hide the cumulative ceiling.
export const evaluationLedgerFloorUsd = 46.69296;
export function verifyApprovalLedger(calls: LedgerCall[]) {
  const total = calls.reduce((s, c) => s + c.accountedUsd, 0);
  if (total < evaluationLedgerFloorUsd)
    throw new DomainError(
      'EVAL_LEDGER_INVALID',
      `The ledger holds USD ${total.toFixed(4)}, below the closed v8 total USD ${evaluationLedgerFloorUsd}: it is missing or is not the shared ledger (run from the measuring checkout's root).`,
    );
}

// The largest --budget-usd the approval allows, and the refusal of a larger one.
export function verifyApprovalBudget(
  calls: LedgerCall[],
  budgetUsd: number,
  approval: Pick<
    typeof evaluationV9MeasurementApproval,
    'approvalId' | 'maxSpendUsd'
  > = evaluationV9MeasurementApproval,
) {
  const allowed = approvalCumulativeBudgetUsd(
    calls,
    approval.approvalId,
    approval.maxSpendUsd,
  );
  if (budgetUsd > allowed + 1e-9)
    throw new DomainError(
      'EVAL_BUDGET_INVALID',
      `The approval ${approval.approvalId} may reach a cumulative ledger total of USD ${(Math.floor(allowed * 1e6) / 1e6).toFixed(6)} at most (its own spend counted); pass that or less as --budget-usd.`,
    );
}
