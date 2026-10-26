// Database half of the privileged operator. Every operation is transaction-
// scoped; host authority, writer hold, backup and ingress stay the root caller's
// responsibility. This module never creates an Auth user or calls a provider.
import { hash } from '@future-flow/core';
import type { Database } from '@future-flow/database';
import { captureFundedRuntime } from './funded-runtime';
import { reviewedPrivacyRecoveryTables } from './privacy-recovery-schema';
import { validateParticipants } from './personal-beta-admission-observation.mjs';
import {
  successorPlan,
  captureSuccessorAccounts,
  closeAndSeedSuccessorAccounts,
  reconcileSuccessorAccounts,
  type BetaTerms,
  type SuccessorSelection,
} from './beta-successor';

type Identity = Parameters<typeof captureFundedRuntime>[1];
function refuse(): never {
  throw Error('Beta successor operation refused');
}
function participants(previous: BetaTerms, selection: SuccessorSelection) {
  validateParticipants(previous.participants);
  validateParticipants(selection.next.participants);
  const all = [...previous.participants, ...selection.next.participants];
  const unique = all.filter(
    (p, i) => all.findIndex((q) => q.userId === p.userId) === i,
  );
  // One identity cannot be rebound to another email across the two authorities.
  if (
    all.some(
      (p) => unique.find((q) => q.userId === p.userId)?.email !== p.email,
    )
  )
    refuse();
  validateParticipants(unique);
  return unique;
}
async function protectedState(tx: Database, identity: Identity) {
  const full = await captureFundedRuntime(tx, identity);
  if (full.schema !== 38) refuse();
  // Budget accounts are the ONLY intentionally changed table, validated in full
  // by the accounting primitive. Reservations/usage/history/artifacts stay here.
  const tables = reviewedPrivacyRecoveryTables.filter(
    (t) => t !== 'aw_budget_accounts',
  );
  const records = await tx.query(
    tables
      .map(
        (t) => `SELECT '${t}' AS "table",count(*)::text AS count,
    md5(coalesce(string_agg(h,'' ORDER BY h),'')) AS digest FROM
    (SELECT md5(to_jsonb(r)::text) AS h FROM public.${t} r) v`,
      )
      .join(' UNION ALL ') + ' ORDER BY "table"',
  );
  const { dataSha256: _accountsIncluded, ...metadata } = full;
  return { ...metadata, protectedDataSha256: hash(records) };
}
function selected(
  previous: BetaTerms,
  selection: SuccessorSelection,
  identity: Omit<Identity, 'participants'>,
): Identity {
  return { ...identity, participants: participants(previous, selection) };
}
export async function captureSuccessorOperation(
  tx: Database,
  previous: BetaTerms,
  selection: SuccessorSelection,
  identity: Omit<Identity, 'participants'>,
) {
  const [clock] = await tx.query<{ now: Date }>(
    'SELECT clock_timestamp() AS now',
  );
  const plan = successorPlan(
    previous,
    selection,
    new Date(clock!.now).toISOString(),
  );
  const runtime = await protectedState(
    tx,
    selected(previous, selection, identity),
  );
  const accounts = await captureSuccessorAccounts(tx, plan);
  return {
    version: 'alterward-beta-successor-operation-1',
    plan,
    runtime,
    accounts,
  };
}
export type SuccessorOperation = Awaited<
  ReturnType<typeof captureSuccessorOperation>
>;
function validate(
  previous: BetaTerms,
  selection: SuccessorSelection,
  expected: SuccessorOperation,
) {
  if (
    !expected ||
    Object.keys(expected).sort().join(',') !==
      'accounts,plan,runtime,version' ||
    expected.version !== 'alterward-beta-successor-operation-1' ||
    hash(successorPlan(previous, selection, expected.plan.observedAt)) !==
      hash(expected.plan)
  )
    refuse();
}
export async function reconcileSuccessorOperation(
  tx: Database,
  previous: BetaTerms,
  selection: SuccessorSelection,
  identity: Omit<Identity, 'participants'>,
  expected: SuccessorOperation,
) {
  validate(previous, selection, expected);
  const runtime = await protectedState(
    tx,
    selected(previous, selection, identity),
  );
  if (hash(runtime) !== hash(expected.runtime)) refuse();
  const accounting = await reconcileSuccessorAccounts(
    tx,
    previous,
    selection,
    expected.plan,
    expected.accounts,
  );
  return {
    ...accounting,
    version: expected.version,
    operationSha256: hash(expected),
    protectedDataUnchanged: true,
  };
}
export async function applySuccessorOperation(
  tx: Database,
  previous: BetaTerms,
  selection: SuccessorSelection,
  identity: Omit<Identity, 'participants'>,
  expected: SuccessorOperation,
) {
  validate(previous, selection, expected);
  const before = await reconcileSuccessorOperation(
    tx,
    previous,
    selection,
    identity,
    expected,
  );
  if (before.state !== 'uncommitted') refuse(); // Recovery reconciles, never replays SQL.
  await closeAndSeedSuccessorAccounts(
    tx,
    previous,
    selection,
    expected.plan,
    expected.accounts,
  );
  const after = await reconcileSuccessorOperation(
    tx,
    previous,
    selection,
    identity,
    expected,
  );
  if (after.state !== 'committed') refuse();
  return after;
}

// The transport owns BEGIN/COMMIT. Fixed modes cannot run arbitrary SQL, inject
// an alternate DB identity, relax schema checks or call the normal migrate path.
export async function successorDatabaseRequest(
  tx: Database,
  raw: unknown,
  identity: Omit<Identity, 'participants'>,
) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.keys(raw).sort().join(',') !== 'expected,mode,previous,selection'
  )
    refuse();
  const input = raw as {
    mode: string;
    previous: BetaTerms;
    selection: SuccessorSelection;
    expected: SuccessorOperation | null;
  };
  if (input.mode === 'capture') {
    if (input.expected !== null) refuse();
    return captureSuccessorOperation(
      tx,
      input.previous,
      input.selection,
      identity,
    );
  }
  if (!input.expected) refuse();
  if (input.mode === 'apply')
    return applySuccessorOperation(
      tx,
      input.previous,
      input.selection,
      identity,
      input.expected,
    );
  if (input.mode === 'reconcile')
    return reconcileSuccessorOperation(
      tx,
      input.previous,
      input.selection,
      identity,
      input.expected,
    );
  refuse();
}
