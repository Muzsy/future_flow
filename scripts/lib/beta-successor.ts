// Offline/isolated #77 building block. No production entry point or authority
// receipt: a root controller must still fence writers and bind backup/recovery.
import { hash } from '@future-flow/core';
import type { Database } from '@future-flow/database';
import { validateParticipants } from './personal-beta-admission-observation.mjs';

type Participant = { email: string; userId: string };
export type BetaTerms = {
  participants: Participant[];
  projectUsd: string;
  userUsd: string;
  startsAt: string;
  endsAt: string;
};
export type SuccessorSelection = {
  purpose: 'owner-e2e' | 'tester-beta';
  previousTermsSha256: string;
  closePreviousAt: string;
  next: BetaTerms;
};
const VERSION = 'alterward-beta-successor-plan-2';
const duration = 30 * 86400000;
function refuse(): never {
  throw Error('Beta successor refused');
}
function exact(
  value: unknown,
  keys: string[],
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  )
    refuse();
}
function timestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  )
    refuse();
  const time = Date.parse(value);
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString() !==
      value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z')
  )
    refuse();
  return new Date(time).toISOString();
}
function money(value: unknown, max: number): string {
  if (
    typeof value !== 'string' ||
    !/^(?:0|[1-9]\d?)(?:\.\d{1,2})?$/.test(value) ||
    Number(value) <= 0 ||
    Number(value) > max
  )
    refuse();
  return value;
}
function terms(raw: unknown): BetaTerms {
  exact(raw, ['participants', 'projectUsd', 'userUsd', 'startsAt', 'endsAt']);
  const identities = validateParticipants(raw.participants);
  const projectUsd = money(raw.projectUsd, 10),
    userUsd = money(raw.userUsd, 3.34);
  const startsAt = timestamp(raw.startsAt),
    endsAt = timestamp(raw.endsAt);
  if (
    Date.parse(endsAt) - Date.parse(startsAt) !== duration ||
    Number(userUsd) > Number(projectUsd)
  )
    refuse();
  return {
    participants: identities.users.map((userId, i) => ({
      userId,
      email: identities.emails[i]!,
    })),
    projectUsd,
    userUsd,
    startsAt,
    endsAt,
  };
}
export function successorPlan(
  previous: unknown,
  selection: unknown,
  observedAt: string,
) {
  const prior = terms(previous);
  exact(selection, [
    'purpose',
    'previousTermsSha256',
    'closePreviousAt',
    'next',
  ]);
  const next = terms(selection.next),
    now = timestamp(observedAt);
  const closePreviousAt = timestamp(selection.closePreviousAt);
  // These are two separately approved purposes, never an arbitrary participant
  // or allowance override. Passing the owner journey does not admit testers.
  const allowed =
    selection.purpose === 'owner-e2e'
      ? next.participants.length === 1 &&
        next.projectUsd === '3' &&
        next.userUsd === '3'
      : selection.purpose === 'tester-beta' &&
        next.participants.length === 3 &&
        next.projectUsd === '10' &&
        next.userUsd === '3.33';
  if (
    selection.previousTermsSha256 !== hash(previous) ||
    !allowed ||
    Date.parse(now) < Date.parse(prior.startsAt) ||
    Date.parse(now) >= Date.parse(prior.endsAt) ||
    Date.parse(closePreviousAt) < Date.parse(now) ||
    Date.parse(closePreviousAt) >= Date.parse(prior.endsAt) ||
    Date.parse(next.startsAt) <= Date.parse(closePreviousAt) ||
    Date.parse(next.startsAt) > Date.parse(now) + 900000 ||
    next.startsAt === prior.startsAt
  )
    refuse();
  const keys = (t: BetaTerms) => {
    const suffix = `window:${t.startsAt}:${t.endsAt}`;
    return {
      project: `project:${suffix}`,
      anthropicProject: `project:anthropic:${suffix}`,
      users: t.participants.map((p) => `user:${p.userId}:${suffix}`),
    };
  };
  return {
    version: VERSION,
    purpose: selection.purpose as SuccessorSelection['purpose'],
    previousTermsSha256: hash(previous),
    selectionSha256: hash(selection),
    observedAt: now,
    expiresAt: new Date(Date.parse(now) + 900000).toISOString(),
    closePreviousAt,
    previous: prior,
    next,
    previousKeys: keys(prior),
    nextKeys: keys(next),
  };
}
export type SuccessorPlan = ReturnType<typeof successorPlan>;
function micros(usd: string): string {
  const [whole, fraction = ''] = usd.split('.');
  return (
    BigInt(whole!) * 1000000n +
    BigInt(fraction.padEnd(6, '0'))
  ).toString();
}
type Account = {
  id: string;
  user_id: string | null;
  limit_micro: string;
  accounted_micro: string;
  created_at: string;
};
async function accounts(tx: Database, lock = false): Promise<Account[]> {
  const rows =
    await tx.query<Account>(`SELECT id,user_id,limit_micro::text,accounted_micro::text,(created_at AT TIME ZONE 'UTC')::text AS created_at
    FROM public.aw_budget_accounts ORDER BY id LIMIT 10001${lock ? ' FOR UPDATE' : ''}`);
  if (rows.length > 10000) refuse();
  return rows;
}
async function unsettled(tx: Database) {
  const [row] = await tx.query<{
    count: number;
  }>(`SELECT count(*)::int AS count FROM public.aw_budget_reservations
    WHERE status IN ('reserved','unknown') OR settled_at IS NULL`);
  if (!row || row.count !== 0) refuse();
}
function closingAccounts(plan: SuccessorPlan, rows: Account[]) {
  const allowed = new Set([
    plan.previousKeys.project,
    plan.previousKeys.anthropicProject,
    ...plan.previousKeys.users,
  ]);
  const suffix = `:window:${plan.previous.startsAt}:${plan.previous.endsAt}`;
  const old = rows.filter((row) => row.id.endsWith(suffix));
  const project = old.find((row) => row.id === plan.previousKeys.project);
  if (
    !project ||
    project.user_id !== null ||
    project.limit_micro !==
      String(Math.round(Number(plan.previous.projectUsd) * 1e6)) ||
    old.some(
      (row) =>
        !allowed.has(row.id) ||
        row.limit_micro === '0' ||
        (row.id.startsWith('user:') &&
          (row.limit_micro !==
            String(Math.round(Number(plan.previous.userUsd) * 1e6)) ||
            row.id !== `user:${row.user_id}${suffix}` ||
            !plan.previous.participants.some(
              (p) => p.userId === row.user_id,
            ))) ||
        (!row.id.startsWith('user:') && row.user_id !== null),
    )
  )
    refuse();
  if (
    rows.some((row) =>
      row.id.endsWith(`:window:${plan.next.startsAt}:${plan.next.endsAt}`),
    )
  )
    refuse();
  return old;
}
export async function captureSuccessorAccounts(
  tx: Database,
  plan: SuccessorPlan,
) {
  await unsettled(tx);
  const rows = await accounts(tx);
  const old = closingAccounts(plan, rows);
  return {
    version: VERSION,
    planSha256: hash(plan),
    accountsSha256: hash(rows),
    beforeAccounts: rows,
    closingAccountIds: old.map((row) => row.id),
  };
}
export type SuccessorAccounts = Awaited<
  ReturnType<typeof captureSuccessorAccounts>
>;

// Read-only reconciliation after an uncertain COMMIT response. Original rows
// must match byte-for-byte except the explicitly closed limits; all selected new
// accounts must be untouched. A mixed state or real new spending is not reset.
export async function reconcileSuccessorAccounts(
  tx: Database,
  previous: unknown,
  selection: unknown,
  plan: SuccessorPlan,
  expected: SuccessorAccounts,
) {
  if (hash(successorPlan(previous, selection, plan.observedAt)) !== hash(plan))
    refuse();
  exact(expected, [
    'version',
    'planSha256',
    'accountsSha256',
    'beforeAccounts',
    'closingAccountIds',
  ]);
  if (
    expected.version !== VERSION ||
    expected.planSha256 !== hash(plan) ||
    !Array.isArray(expected.beforeAccounts) ||
    expected.beforeAccounts.length > 10000 ||
    hash(expected.beforeAccounts) !== expected.accountsSha256
  )
    refuse();
  const closing = closingAccounts(plan, expected.beforeAccounts);
  if (hash(expected.closingAccountIds) !== hash(closing.map((row) => row.id)))
    refuse();
  await unsettled(tx);
  const current = await accounts(tx);
  if (hash(current) === expected.accountsSha256)
    return {
      state: 'uncommitted' as const,
      accountsSha256: hash(current),
      paidAiCalls: 0,
    };
  const closed = new Set(closing.map((row) => row.id));
  const expectedOld = expected.beforeAccounts.map((row) =>
    closed.has(row.id) ? { ...row, limit_micro: '0' } : row,
  );
  const oldIds = new Set(expected.beforeAccounts.map((row) => row.id));
  const retained = current.filter((row) => oldIds.has(row.id));
  const added = current.filter((row) => !oldIds.has(row.id));
  if (
    hash(retained) !== hash(expectedOld) ||
    added.length !== plan.next.participants.length + 1
  )
    refuse();
  for (const row of added) {
    const index = plan.nextKeys.users.indexOf(row.id);
    const project = row.id === plan.nextKeys.project;
    const created = Date.parse(row.created_at.replace(' ', 'T') + 'Z');
    if (
      (!project && index < 0) ||
      row.user_id !==
        (project ? null : plan.next.participants[index]!.userId) ||
      row.limit_micro !==
        micros(project ? plan.next.projectUsd : plan.next.userUsd) ||
      row.accounted_micro !== '0' ||
      !Number.isFinite(created) ||
      created < Date.parse(plan.observedAt)
    )
      refuse();
  }
  return {
    state: 'committed' as const,
    accountsSha256: hash(current),
    paidAiCalls: 0,
  };
}
// Call ONLY inside an explicitly SERIALIZABLE transaction, under the operator's
// job/activation locks with app writers held. This is not a deployment helper.
// No old row, spend, reservation or usage is deleted/re-keyed/reset. Old limits
// become zero, so even an old-config DatabaseAiBudget can no longer reserve.
export async function closeAndSeedSuccessorAccounts(
  tx: Database,
  previous: unknown,
  selection: unknown,
  plan: SuccessorPlan,
  expected: Awaited<ReturnType<typeof captureSuccessorAccounts>>,
) {
  if (hash(successorPlan(previous, selection, plan.observedAt)) !== hash(plan))
    refuse();
  const [isolation] = await tx.query<{ transaction_isolation: string }>(
    'SHOW transaction_isolation',
  );
  if (isolation?.transaction_isolation !== 'serializable') refuse();
  const [transaction] = await tx.query<{ id: string }>(
    'SELECT pg_current_xact_id()::text AS id',
  );
  await tx.query("SET LOCAL lock_timeout='5s'");
  // Project-before-user matches the normal reservation/settlement lock order.
  const before = await accounts(tx, true);
  const observed = await captureSuccessorAccounts(tx, plan);
  if (hash(observed) !== hash(expected)) refuse();
  const [clock] = await tx.query<{ now: Date; id: string }>(
    'SELECT clock_timestamp() AS now,pg_current_xact_id()::text AS id',
  );
  const now = new Date(clock!.now).getTime();
  if (
    !Number.isFinite(now) ||
    !transaction?.id ||
    clock!.id !== transaction.id ||
    now < Date.parse(plan.closePreviousAt) ||
    now >= Date.parse(plan.next.startsAt) ||
    now >= Date.parse(plan.expiresAt)
  )
    refuse();
  const closing = closingAccounts(plan, before);
  await tx.query(
    'UPDATE public.aw_budget_accounts SET limit_micro=0 WHERE id=ANY($1::text[])',
    [closing.map((row) => row.id)],
  );
  await tx.query(
    'INSERT INTO public.aw_budget_accounts(id,limit_micro,accounted_micro,created_at) VALUES($1,$2,0,clock_timestamp())',
    [plan.nextKeys.project, micros(plan.next.projectUsd)],
  );
  for (const [i, id] of plan.nextKeys.users.entries())
    await tx.query(
      'INSERT INTO public.aw_budget_accounts(id,user_id,limit_micro,accounted_micro,created_at) VALUES($1,$2,$3,0,clock_timestamp())',
      [id, plan.next.participants[i]!.userId, micros(plan.next.userUsd)],
    );
  const after = await accounts(tx);
  const expectedOld = before.map((row) =>
    closing.some((old) => old.id === row.id)
      ? { ...row, limit_micro: '0' }
      : row,
  );
  const existing = after.filter((row) =>
    before.some((old) => old.id === row.id),
  );
  if (
    hash(existing) !== hash(expectedOld) ||
    after.length !== before.length + plan.next.participants.length + 1
  )
    refuse();
  return {
    version: VERSION,
    planSha256: hash(plan),
    beforeAccountsSha256: hash(before),
    afterAccountsSha256: hash(after),
    previousAccountLimitsClosed: closing.length,
    newAccounts: plan.next.participants.length + 1,
    previousSpendPreserved: true,
    paidAiCalls: 0,
  };
}
