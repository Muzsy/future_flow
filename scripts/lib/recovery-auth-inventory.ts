import { z } from 'zod';
import { hash } from '@future-flow/core';

// Recovery evidence only. Identifiers stay in memory; email/password/token and
// arbitrary metadata are never included in this projection or its digest.
function timestamp(value: string) {
  const match = value.match(
    /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/,
  );
  if (!match) throw Error('Exact bounded Auth timestamp required');
  const milliseconds = Date.parse(match[1]! + match[3]!);
  if (!Number.isFinite(milliseconds))
    throw Error('Valid Auth timestamp required');
  return (
    BigInt(milliseconds) * 1000n +
    BigInt((match[2] ?? '').padEnd(6, '0') || '0')
  ).toString();
}
const time = z.string().datetime({ offset: true }).transform(timestamp);
const optionalTime = time
  .nullable()
  .optional()
  .transform((v) => v ?? null);
const userSchema = z.object({
  id: z
    .string()
    .uuid()
    .transform((v) => v.toLowerCase()),
  updated_at: time,
  banned_until: optionalTime,
  deleted_at: optionalTime,
  email_confirmed_at: optionalTime,
  is_anonymous: z
    .boolean()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  role: z
    .string()
    .max(64)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});
type RecoveryUser = z.infer<typeof userSchema>;
const pageSchema = z.object({
  error: z.unknown(),
  data: z.object({
    users: z.array(userSchema).max(1000),
    nextPage: z.number().int().positive().nullable(),
    total: z.number().int().min(0).max(100000),
  }),
});
function ordered(users: readonly RecoveryUser[]) {
  const ids = new Set(users.map((u) => u.id));
  if (ids.size !== users.length || users.length > 100000)
    throw Error('Unique bounded Auth inventory required');
  return [...users].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
export type RecoveryAuthInventory = {
  verifiedAt: string;
  users: readonly RecoveryUser[];
  digest: string;
  pages: number;
};
export async function readRecoveryAuthInventory(
  readPage: (page: number) => Promise<unknown>,
  now = new Date(),
): Promise<RecoveryAuthInventory> {
  if (!Number.isFinite(now.getTime()))
    throw Error('Valid Auth observation time required');
  const users: RecoveryUser[] = [];
  let pages = 0;
  for (let page = 1; page <= 100; page++) {
    const response = pageSchema.parse(await readPage(page));
    if (response.error !== null)
      throw Error('Independent Auth inventory unavailable');
    pages++;
    users.push(...response.data.users);
    ordered(users); // Reject duplicate/overflow before another request.
    if (response.data.nextPage === null) {
      // Missing SDK pagination headers may produce total=0. The caller MUST
      // compare the entire state projection with a read-only DB snapshot too.
      if (response.data.total !== 0 && response.data.total !== users.length)
        throw Error('Auth pagination total changed');
      const records = ordered(users),
        instant = BigInt(now.getTime()) * 1000n;
      if (records.some((u) => BigInt(u.updated_at) > instant + 30000000n))
        throw Error('Auth inventory observation clock differs');
      return Object.freeze({
        verifiedAt: now.toISOString(),
        users: Object.freeze(records.map((user) => Object.freeze(user))),
        digest: hash(records),
        pages,
      });
    }
    if (response.data.nextPage !== page + 1 || response.data.users.length === 0)
      throw Error('Sequential complete Auth pagination required');
  }
  throw Error('Auth inventory exceeds bounded pagination');
}
export function assertRecoveryAuthMatchesDatabase(
  inventory: RecoveryAuthInventory,
  rows: unknown[],
) {
  const database = ordered(z.array(userSchema).max(100000).parse(rows));
  if (
    hash(database) !== inventory.digest ||
    hash(ordered(inventory.users)) !== inventory.digest
  )
    throw Error(
      'Auth state differs from the independent read-only DB snapshot',
    );
}
export function assertRecoveryAuthStable(
  before: RecoveryAuthInventory,
  after: RecoveryAuthInventory,
) {
  if (
    before.digest !== after.digest ||
    hash(ordered(before.users)) !== before.digest ||
    hash(ordered(after.users)) !== after.digest
  )
    throw Error('Auth state changed during recovery observation');
}

const verifiedBrand = Symbol('verified-recovery-auth');
const verifiedInventories = new WeakSet<object>();
export type VerifiedRecoveryAuth = {
  readonly [verifiedBrand]: true;
  verifiedAt: string;
  digest: string;
  eligibleUserIds: readonly string[];
  bannedUsers: number;
  clocksAgree: true;
};
export function assertVerifiedRecoveryAuth(
  value: unknown,
): asserts value is VerifiedRecoveryAuth {
  if (
    typeof value !== 'object' ||
    value === null ||
    !verifiedInventories.has(value)
  )
    throw Error('Original verified Auth observation required');
}
export function verifyRecoveryAuthInventory(
  before: RecoveryAuthInventory,
  databaseRows: unknown[],
  after: RecoveryAuthInventory,
  rawClock: {
    localStartedAt: string;
    localFinishedAt: string;
    databaseAt: string;
  },
  now = new Date(),
): VerifiedRecoveryAuth {
  if (!Number.isFinite(now.getTime()))
    throw Error('Valid Auth verification time required');
  assertRecoveryAuthMatchesDatabase(before, databaseRows);
  assertRecoveryAuthStable(before, after);
  const clock = z
    .object({ localStartedAt: time, localFinishedAt: time, databaseAt: time })
    .strict()
    .parse(rawClock);
  const start = BigInt(clock.localStartedAt),
    end = BigInt(clock.localFinishedAt),
    peer = BigInt(clock.databaseAt);
  const completed = BigInt(now.getTime()) * 1000n;
  if (
    end < start ||
    end - start > 10000000n ||
    peer < start - 5000000n ||
    peer > end + 5000000n ||
    completed < end ||
    completed - start > 15n * 60n * 1000000n ||
    [before.verifiedAt, after.verifiedAt].some((at) => {
      const age = now.getTime() - Date.parse(at);
      return !Number.isFinite(age) || age < 0 || age > 15 * 60 * 1000;
    })
  )
    throw Error('Fresh two-sided local/database clock agreement required');
  // Evaluate at the earlier clock: network delay or a small allowed clock skew
  // can retain a ban longer, never make it expire earlier than the DB clock.
  const instant = start < peer ? start : peer;
  const users = before.users;
  const result: VerifiedRecoveryAuth = Object.freeze({
    [verifiedBrand]: true as const,
    verifiedAt: new Date(Number(peer / 1000n)).toISOString(),
    digest: before.digest,
    eligibleUserIds: Object.freeze(
      users
        .filter(
          (u) =>
            u.role === 'authenticated' &&
            u.is_anonymous === false &&
            u.deleted_at === null &&
            u.email_confirmed_at !== null &&
            (u.banned_until === null || BigInt(u.banned_until) <= instant),
        )
        .map((u) => u.id),
    ),
    bannedUsers: users.filter(
      (u) => u.banned_until !== null && BigInt(u.banned_until) > instant,
    ).length,
    clocksAgree: true,
  });
  verifiedInventories.add(result);
  return result;
}

// SQL JSON preserves PostgreSQL's microsecond timestamps; node-postgres Date
// conversion would discard sub-millisecond revocation/version changes.
export const recoveryAuthProjectionSql = `SELECT jsonb_build_object(
  'id',id,'updated_at',updated_at,'banned_until',banned_until,
  'deleted_at',deleted_at,'email_confirmed_at',email_confirmed_at,'role',role,
  'is_anonymous',is_anonymous
) AS record FROM auth.users ORDER BY id`;
