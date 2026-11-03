// Privileged database transport, never an HTTP or authentication endpoint.
// The host must validate source/image/operator/authority, persist this intent
// before SQL, and serialize its journal. Hashes below bind those observations;
// caller-supplied digests alone are not attestations of host-side checks.
import { z } from 'zod';
import { hash } from '@future-flow/core';
import { ServiceAccessRepository, type Database } from '@future-flow/database';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const revision = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
const storedRevision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const member = z
  .object({
    userId: uuid,
    expectedRevision: revision,
    state: z.enum(['active', 'revoked']),
  })
  .strict();
const members = z
  .array(member)
  .max(10)
  .superRefine((values, context) => {
    if (new Set(values.map((value) => value.userId)).size !== values.length)
      context.addIssue({
        code: 'custom',
        message: 'Distinct account UUIDs required',
      });
  });
const requestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('bootstrap'), members }).strict(),
  z
    .object({
      kind: z.literal('admission'),
      expectedPolicyRevision: revision.min(1),
      members: members.refine((values) => values.length > 0),
    })
    .strict(),
  z
    .object({
      kind: z.literal('policy'),
      expectedPolicyRevision: revision.min(1),
      generationEnabled: z.boolean(),
      checkoutEnabled: z.boolean(),
    })
    .strict(),
  // Absolute capacity for the next bounded open wave (or a manual close).
  z
    .object({
      kind: z.literal('wave'),
      expectedPolicyRevision: revision.min(1),
      capacity: z.number().int().min(0).max(100000),
      open: z.boolean(),
    })
    .strict(),
  // The only operation that releases a restore quarantine; the service
  // returns closed and paused.
  z
    .object({
      kind: z.literal('restore-reconcile'),
      expectedPolicyRevision: revision.min(1),
    })
    .strict(),
]);
export const serviceOperationContextSchema = z
  .object({
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    authoritySha256: digest,
    parentOperationSha256: digest,
    operatorSha256: digest,
    operationId: uuid,
  })
  .strict();
const policySchema = z
  .object({
    version: z.literal(1),
    revision: storedRevision,
    mode: z.enum(['invitation', 'open']),
    generationEnabled: z.boolean(),
    checkoutEnabled: z.boolean(),
    reconcileRequired: z.boolean(),
    // Capacity only changes by operator operations. The moving `used`
    // counter is deliberately not part of the observed state: open
    // registrations must not look like drift. The automatic close moves the
    // revision, which does invalidate an older intent.
    admissionCapacity: z.number().int().min(0).max(100000),
  })
  .strict();
const accountSchema = z
  .object({
    userId: uuid,
    root: z.enum(['absent', 'active', 'deleting']),
    admission: z
      .object({
        revision: storedRevision,
        state: z.enum(['active', 'revoked']),
      })
      .strict()
      .nullable(),
  })
  .strict();
const stateSchema = z
  .object({
    policy: policySchema.nullable(),
    accounts: z.array(accountSchema).max(10),
    // Only observed for restore-reconcile (the service is quarantined then).
    admissionRows: z.number().int().min(0).nullable(),
  })
  .strict();
const intentSchema = z
  .object({
    version: z.literal('alterward-service-operation-intent-1'),
    context: serviceOperationContextSchema,
    request: requestSchema,
    observedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    before: stateSchema,
    after: stateSchema,
  })
  .strict();
type Request = z.infer<typeof requestSchema>;
type State = z.infer<typeof stateSchema>;
export type ServiceOperationIntent = z.infer<typeof intentSchema>;
// Mandatory trusted implementation: fresh server-side Auth lookup, not a JSON
// identity assertion from the operator request. Called while roots stay locked.
export type VerifyServiceAccount = (userId: string) => Promise<unknown>;

function targets(request: Request) {
  return request.kind === 'policy' ||
    request.kind === 'wave' ||
    request.kind === 'restore-reconcile'
    ? []
    : [...request.members].sort((a, b) => a.userId.localeCompare(b.userId));
}
async function clock(tx: Database) {
  const [row] = await tx.query('SELECT clock_timestamp() AS now');
  const now = new Date(row?.now as string | Date);
  if (!Number.isFinite(now.getTime()))
    throw Error('Service operation database clock required');
  return now;
}
async function readonly(tx: Database) {
  const [mode] = await tx.query('SHOW transaction_read_only');
  const [isolation] = await tx.query('SHOW transaction_isolation');
  if (
    mode?.transaction_read_only !== 'on' ||
    !['repeatable read', 'serializable'].includes(
      String(isolation?.transaction_isolation),
    )
  )
    throw Error('Consistent readonly service operation observation required');
}
async function capture(tx: Database, request: Request): Promise<State> {
  const rows = await tx.query(
    'SELECT version,revision,mode,generation_enabled,checkout_enabled,reconcile_required,admission_capacity FROM aw_service_policy WHERE id=1',
  );
  if (rows.length > 1) throw Error('Exact singleton service policy required');
  const row = rows[0];
  const policy = row
    ? policySchema.parse({
        version: row.version,
        revision: Number(row.revision),
        mode: row.mode,
        generationEnabled: row.generation_enabled,
        checkoutEnabled: row.checkout_enabled,
        reconcileRequired: row.reconcile_required,
        admissionCapacity: Number(row.admission_capacity),
      })
    : null;
  const accounts: State['accounts'] = [];
  for (const target of targets(request)) {
    const [owner] = await tx.query('SELECT status FROM ff_users WHERE id=$1', [
      target.userId,
    ]);
    const [admission] = await tx.query(
      'SELECT revision,state FROM aw_service_admissions WHERE user_id=$1',
      [target.userId],
    );
    const value = accountSchema.parse({
      userId: target.userId,
      root: owner?.status ?? 'absent',
      admission: admission
        ? { revision: Number(admission.revision), state: admission.state }
        : null,
    });
    if (value.root === 'absent' && value.admission !== null)
      throw Error('Orphan service admission refused');
    accounts.push(value);
  }
  const admissionRows =
    request.kind === 'restore-reconcile'
      ? Number(
          (await tx.query('SELECT count(*) AS n FROM aw_service_admissions'))[0]
            ?.n,
        )
      : null;
  return { policy, accounts, admissionRows };
}
async function initialRegistry(tx: Database, request: Request) {
  if (
    request.kind === 'bootstrap' &&
    (await tx.query('SELECT 1 FROM aw_service_admissions LIMIT 1')).length
  )
    throw Error('Initial bootstrap cannot adopt existing admissions');
}
function afterState(before: State, request: Request): State {
  if (
    hash(before.accounts.map((value) => value.userId)) !==
    hash(targets(request).map((value) => value.userId))
  )
    throw Error('Exact target account snapshot required');
  if (request.kind === 'bootstrap') {
    if (
      before.policy !== null ||
      request.members.some(
        (value) => value.expectedRevision !== 0 || value.state !== 'active',
      )
    )
      throw Error('Initial invitation bootstrap must remain paused');
  } else if (
    !before.policy ||
    before.policy.revision !== request.expectedPolicyRevision
  ) {
    throw Error('Service policy revision changed');
  }
  const policy =
    request.kind === 'bootstrap'
      ? {
          version: 1 as const,
          revision: 1,
          mode: 'invitation' as const,
          generationEnabled: false,
          checkoutEnabled: false,
          reconcileRequired: false,
          admissionCapacity: 0,
        }
      : before.policy!;
  if (request.kind === 'wave') {
    if (policy.reconcileRequired && request.open)
      throw Error('Wave operation cannot open under restore quarantine');
    return stateSchema.parse({
      policy: {
        ...policy,
        revision: policy.revision + 1,
        mode: request.open ? 'open' : 'invitation',
        admissionCapacity: request.capacity,
      },
      accounts: [],
      admissionRows: null,
    });
  }
  if (request.kind === 'restore-reconcile') {
    if (!policy.reconcileRequired || before.admissionRows === null)
      throw Error('Restore reconcile needs an active restore quarantine');
    return stateSchema.parse({
      policy: {
        ...policy,
        revision: policy.revision + 1,
        mode: 'invitation',
        generationEnabled: false,
        checkoutEnabled: false,
        reconcileRequired: false,
        admissionCapacity: Math.max(
          policy.admissionCapacity,
          before.admissionRows,
        ),
      },
      accounts: [],
      admissionRows: before.admissionRows,
    });
  }
  if (request.kind === 'policy') {
    if (
      policy.reconcileRequired &&
      (request.generationEnabled || request.checkoutEnabled)
    )
      throw Error(
        'Ordinary policy operation cannot release restore quarantine',
      );
    return stateSchema.parse({
      policy: {
        ...policy,
        revision: policy.revision + 1,
        generationEnabled: request.generationEnabled,
        checkoutEnabled: request.checkoutEnabled,
      },
      accounts: [],
      admissionRows: null,
    });
  }
  return stateSchema.parse({
    policy,
    admissionRows: null,
    accounts: targets(request).map((target, index) => {
      const account = before.accounts[index]!;
      if (
        (account.admission?.revision ?? 0) !== target.expectedRevision ||
        account.root === 'deleting' ||
        (account.root === 'absent' &&
          (target.state !== 'active' || target.expectedRevision !== 0)) ||
        (policy.reconcileRequired && target.state === 'active')
      )
        throw Error(
          'Service admission revision, account or quarantine changed',
        );
      return {
        userId: target.userId,
        root: 'active',
        admission: {
          revision: target.expectedRevision + 1,
          state: target.state,
        },
      };
    }),
  });
}
function validated(raw: unknown, rawContext: unknown) {
  const intent = intentSchema.parse(raw);
  if (
    hash(intent.context) !==
      hash(serviceOperationContextSchema.parse(rawContext)) ||
    Date.parse(intent.expiresAt) - Date.parse(intent.observedAt) !== 900000 ||
    hash(afterState(intent.before, intent.request)) !== hash(intent.after)
  )
    throw Error('Service operation intent binding mismatch');
  return intent;
}
function assertProviderAccount(raw: unknown, userId: string, now: Date) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw Error('Current provider account required');
  const user = raw as Record<string, unknown>;
  const confirmed =
    typeof user.email_confirmed_at === 'string'
      ? Date.parse(user.email_confirmed_at)
      : NaN;
  const banned =
    user.banned_until == null
      ? null
      : typeof user.banned_until === 'string'
        ? Date.parse(user.banned_until)
        : NaN;
  if (
    uuid.safeParse(user.id).data !== userId ||
    user.is_anonymous !== false ||
    typeof user.email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) ||
    !Number.isFinite(confirmed) ||
    confirmed > now.getTime() + 30000 ||
    (banned !== null && (!Number.isFinite(banned) || banned > now.getTime())) ||
    user.deleted_at != null ||
    (user.email_change !== undefined && user.email_change !== '')
  )
    throw Error('Verified active provider UUID and email required');
}
function receipt(
  intent: ServiceOperationIntent,
  state: State,
  observedAt: Date,
  outcome: 'committed' | 'uncommitted',
) {
  return {
    version: 'alterward-service-operation-readback-1' as const,
    context: intent.context,
    intentSha256: hash(intent),
    stateSha256: hash(state),
    state,
    outcome,
    observedAt: observedAt.toISOString(),
    authProviderWrites: false as const,
    paidAiCalls: 0 as const,
  };
}

export async function prepareServiceOperation(
  tx: Database,
  rawRequest: unknown,
  rawContext: unknown,
) {
  await readonly(tx);
  const request = requestSchema.parse(rawRequest),
    context = serviceOperationContextSchema.parse(rawContext);
  await initialRegistry(tx, request);
  const before = await capture(tx, request),
    now = await clock(tx);
  return validated(
    {
      version: 'alterward-service-operation-intent-1',
      context,
      request,
      observedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 900000).toISOString(),
      before,
      after: afterState(before, request),
    },
    context,
  );
}

export async function applyServiceOperation(
  db: Database,
  rawIntent: unknown,
  rawContext: unknown,
  persistedIntentSha256: string,
  verifyAccount: VerifyServiceAccount,
) {
  const intent = validated(rawIntent, rawContext);
  if (
    persistedIntentSha256 !== hash(intent) ||
    typeof verifyAccount !== 'function'
  )
    throw Error('Durable intent and trusted provider verifier required');
  return db.transaction(async (tx) => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await tx.query(
      "SELECT pg_advisory_xact_lock(hashtext('alterward-service-operations-v1'))",
    );
    await tx.query('SELECT id FROM aw_service_policy WHERE id=1 FOR UPDATE');
    for (const target of targets(intent.request))
      await tx.query('SELECT status FROM ff_users WHERE id=$1 FOR UPDATE', [
        target.userId,
      ]);
    const now = await clock(tx);
    if (!(
      Date.parse(intent.observedAt) <= now.getTime() &&
      now.getTime() < Date.parse(intent.expiresAt)
    ))
      throw Error('Original service operation intent expired');
    if (hash(await capture(tx, intent.request)) !== hash(intent.before))
      throw Error('Service operation state changed before SQL');
    await initialRegistry(tx, intent.request);
    for (const account of intent.before.accounts) {
      if (account.root !== 'absent') continue;
      const created = await tx.query(
        'INSERT INTO ff_users(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',
        [account.userId],
      );
      if (created.length !== 1)
        throw Error('Concurrent account provisioning refused');
      await tx.query('SELECT status FROM ff_users WHERE id=$1 FOR UPDATE', [
        account.userId,
      ]);
    }
    // New roots exist only inside this uncommitted transaction. Deletion must
    // acquire these same roots before deleting Auth, so check Auth AFTER locks.
    const grants = targets(intent.request).filter(
      (target) => target.state === 'active',
    );
    const identities = await Promise.all(
      grants.map((target) => verifyAccount(target.userId)),
    );
    const verifiedAt = await clock(tx);
    if (verifiedAt.getTime() >= Date.parse(intent.expiresAt))
      throw Error(
        'Service operation intent expired during provider verification',
      );
    identities.forEach((value, index) =>
      assertProviderAccount(value, grants[index]!.userId, verifiedAt),
    );
    const store = new ServiceAccessRepository(tx);
    if (intent.request.kind === 'bootstrap')
      await store.replacePolicy(0, {
        mode: 'invitation',
        generationEnabled: false,
        checkoutEnabled: false,
      });
    else if (intent.request.kind === 'wave')
      await store.configureAdmission(intent.request.expectedPolicyRevision, {
        capacity: intent.request.capacity,
        open: intent.request.open,
      });
    else if (intent.request.kind === 'restore-reconcile')
      await store.releaseRestoreQuarantine(
        intent.request.expectedPolicyRevision,
      );
    else if (intent.request.kind === 'policy')
      await store.replacePolicy(intent.request.expectedPolicyRevision, {
        mode: intent.before.policy!.mode,
        generationEnabled: intent.request.generationEnabled,
        checkoutEnabled: intent.request.checkoutEnabled,
      });
    for (const target of targets(intent.request))
      await store.replaceAdmission(
        target.userId,
        target.expectedRevision,
        target.state,
      );
    const state = await capture(tx, intent.request);
    if (hash(state) !== hash(intent.after))
      throw Error('Exact service operation postcondition required');
    return receipt(intent, state, await clock(tx), 'committed');
  });
}

// Never calls apply, provisions a missing root, clears quarantine, or retries SQL.
// Host must also prove the original helper/session is gone before interpreting
// an uncommitted observation; a snapshot alone cannot rule out an active writer.
export async function reconcileServiceOperation(
  tx: Database,
  rawIntent: unknown,
  rawContext: unknown,
  persistedIntentSha256: string,
) {
  await readonly(tx);
  const intent = validated(rawIntent, rawContext);
  if (persistedIntentSha256 !== hash(intent))
    throw Error('Original durable service intent required');
  const state = await capture(tx, intent.request);
  const outcome =
    hash(state) === hash(intent.after)
      ? 'committed'
      : hash(state) === hash(intent.before)
        ? 'uncommitted'
        : null;
  if (!outcome) throw Error('Service operation readback drift; no SQL retry');
  return receipt(intent, state, await clock(tx), outcome);
}
