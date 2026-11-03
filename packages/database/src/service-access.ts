import { randomUUID } from 'node:crypto';
import {
  DomainError,
  evaluateServiceAccess,
  serviceAccessEnforcementFromEnv,
  parseServiceAccessPolicy,
  parseServiceAdmissionLookup,
  type ServiceAccessPolicy,
  type ServiceAdmission,
  type ServiceAdmissionLookup,
  type ServiceAction,
} from '@future-flow/core';
import type { Database } from './index';

export type ServiceAccessSnapshot = Readonly<{
  policy: ServiceAccessPolicy | null;
  admission: ServiceAdmissionLookup;
}>;
export type ServiceAdmissionCapacity = Readonly<{
  mode: ServiceAccessPolicy['mode'];
  revision: number;
  capacity: number;
  used: number;
  remaining: number;
}>;
export type OpenAdmissionOutcome =
  | Readonly<{ status: 'admitted'; position: number; closedAfter: boolean }>
  | Readonly<{ status: 'already-admitted' }>
  | Readonly<{ status: 'revoked' }>
  | Readonly<{ status: 'closed' }>
  | Readonly<{ status: 'unavailable' }>;
// What a verified account without an admission may currently do. This never
// creates a root or a slot: it only classifies, for the pre-admission routes.
export type AdmissionStatus =
  | Readonly<{ status: 'admitted' | 'revoked' | 'open' | 'closed' }>
  | Readonly<{ status: 'unavailable' }>;
const MAX_ADMISSION_CAPACITY = 100000;
const unavailable = (): ServiceAccessSnapshot => ({
  policy: null,
  admission: { status: 'unavailable' },
});
function inputError(): never {
  throw new DomainError(
    'SERVICE_ACCESS_INPUT_INVALID',
    'Invalid service access change.',
    400,
  );
}
function conflict(): never {
  throw new DomainError(
    'SERVICE_ACCESS_CONFLICT',
    'Service access revision changed.',
    409,
  );
}
function nextRevision(expected: number) {
  if (
    !Number.isSafeInteger(expected) ||
    expected < 0 ||
    expected >= Number.MAX_SAFE_INTEGER
  )
    return inputError();
  return expected + 1;
}
function accountId(value: unknown) {
  const parsed = parseServiceAdmissionLookup({
    status: 'found',
    admission: { userId: value, revision: 1, state: 'active' },
  });
  return parsed?.status === 'found' ? parsed.admission.userId : null;
}
type PolicyRow = Record<string, unknown> & {
  version: number;
  revision: string | number;
  mode: string;
  generation_enabled: boolean;
  checkout_enabled: boolean;
  reconcile_required: boolean;
};
function policyFromRow(row: PolicyRow): ServiceAccessPolicy | null {
  return parseServiceAccessPolicy({
    version: row.version,
    revision: Number(row.revision),
    mode: row.mode,
    generationEnabled: row.generation_enabled,
    checkoutEnabled: row.checkout_enabled,
  });
}

// Server-only persistence primitive. It does not verify an auth token, send an
// invitation or authorize an operator. Callers retain those separate guards.
export class ServiceAccessRepository {
  constructor(private readonly db: Database) {}

  async snapshot(verifiedUserId: unknown): Promise<ServiceAccessSnapshot> {
    const userId = accountId(verifiedUserId);
    if (!userId) return unavailable();
    try {
      // One statement gives one coherent policy/admission/account snapshot.
      const [row] = await this.db.query<
        PolicyRow & {
          account_status: string | null;
          admission_revision: string | number | null;
          admission_state: string | null;
        }
      >(
        `SELECT p.version,p.revision,p.mode,p.generation_enabled,p.checkout_enabled,p.reconcile_required,
           u.status AS account_status,a.revision AS admission_revision,a.state AS admission_state
         FROM aw_service_policy p
         LEFT JOIN ff_users u ON u.id=$1
         LEFT JOIN aw_service_admissions a ON a.user_id=u.id
         WHERE p.id=1`,
        [userId],
      );
      // An account that has no root yet is a legitimate "not admitted" case
      // (bounded open admission creates the root atomically with the slot).
      // A root that is deleting/unknown, a missing policy or a restore
      // quarantine still fail closed.
      if (
        !row ||
        (row.account_status !== null && row.account_status !== 'active') ||
        row.reconcile_required !== false
      )
        return unavailable();
      const policy = policyFromRow(row);
      const admission = parseServiceAdmissionLookup(
        row.admission_revision === null
          ? { status: 'not-found' }
          : {
              status: 'found',
              admission: {
                userId,
                revision: Number(row.admission_revision),
                state: row.admission_state,
              },
            },
      );
      return policy && admission ? { policy, admission } : unavailable();
    } catch {
      // Missing storage, a connection failure or a malformed restored schema
      // must not become an absent invitation (including in future open mode).
      return unavailable();
    }
  }

  async replacePolicy(
    expectedRevision: number,
    configuration: unknown,
  ): Promise<ServiceAccessPolicy> {
    const revision = nextRevision(expectedRevision);
    if (
      !configuration ||
      typeof configuration !== 'object' ||
      Array.isArray(configuration)
    )
      return inputError();
    const keys = ['mode', 'generationEnabled', 'checkoutEnabled'];
    if (
      Object.keys(configuration).length !== keys.length ||
      !keys.every((k) => Object.hasOwn(configuration, k))
    )
      return inputError();
    const policy = parseServiceAccessPolicy({
      ...configuration,
      version: 1,
      revision,
    });
    if (!policy) return inputError();
    const values = [
      policy.mode,
      policy.generationEnabled,
      policy.checkoutEnabled,
    ];
    let rows: PolicyRow[];
    try {
      rows =
        expectedRevision === 0
          ? await this.db.query<PolicyRow>(
              `INSERT INTO aw_service_policy(id,version,revision,mode,generation_enabled,checkout_enabled,reconcile_required)
         VALUES(1,1,1,$1,$2,$3,false) ON CONFLICT(id) DO NOTHING RETURNING *`,
              values,
            )
          : await this.db.query<PolicyRow>(
              `UPDATE aw_service_policy SET revision=revision+1,mode=$1,generation_enabled=$2,checkout_enabled=$3,updated_at=now()
         WHERE id=1 AND revision=$4 RETURNING *`,
              [...values, expectedRevision],
            );
    } catch (error) {
      // Open mode needs a remaining slot (table CHECK). Use
      // configureAdmission to open a bounded wave; never a raw DB error.
      if ((error as { code?: string }).code === '23514') return inputError();
      throw error;
    }
    if (!rows.length) return conflict();
    const result = policyFromRow(rows[0]!);
    if (!result)
      throw new DomainError(
        'SERVICE_ACCESS_UNAVAILABLE',
        'Invalid stored service policy.',
        503,
      );
    // An ordinary policy change deliberately never clears restore quarantine.
    return result;
  }

  // Classification for the pre-admission routes. It writes nothing.
  async admissionStatus(verifiedUserId: unknown): Promise<AdmissionStatus> {
    const userId = accountId(verifiedUserId);
    if (!userId) return { status: 'unavailable' };
    try {
      const [row] = await this.db.query<
        PolicyRow & {
          admission_capacity: string | number;
          admission_used: string | number;
          admission_state: string | null;
        }
      >(
        `SELECT p.mode,p.reconcile_required,p.admission_capacity,p.admission_used,a.state AS admission_state
         FROM aw_service_policy p LEFT JOIN aw_service_admissions a ON a.user_id=$1 WHERE p.id=1`,
        [userId],
      );
      if (!row || row.reconcile_required !== false)
        return { status: 'unavailable' };
      if (row.admission_state === 'active') return { status: 'admitted' };
      if (row.admission_state === 'revoked') return { status: 'revoked' };
      if (row.admission_state !== null) return { status: 'unavailable' };
      return row.mode === 'open' &&
        Number(row.admission_used) < Number(row.admission_capacity)
        ? { status: 'open' }
        : { status: 'closed' };
    } catch {
      return { status: 'unavailable' };
    }
  }

  async admissionCapacity(): Promise<ServiceAdmissionCapacity | null> {
    try {
      const [row] = await this.db.query<
        PolicyRow & {
          admission_capacity: string | number;
          admission_used: string | number;
        }
      >(
        'SELECT revision,mode,reconcile_required,admission_capacity,admission_used FROM aw_service_policy WHERE id=1',
      );
      if (!row || row.reconcile_required !== false) return null;
      const capacity = Number(row.admission_capacity),
        used = Number(row.admission_used);
      if (
        !Number.isSafeInteger(capacity) ||
        !Number.isSafeInteger(used) ||
        used > capacity ||
        (row.mode !== 'open' && row.mode !== 'invitation')
      )
        return null;
      return {
        mode: row.mode,
        revision: Number(row.revision),
        capacity,
        used,
        remaining: capacity - used,
      };
    } catch {
      return null;
    }
  }

  // The one place a public account obtains an admission. The policy row is
  // locked first (the same order the operator batch uses), so the capacity
  // check, the slot, the account root, the 18+/AI consent record, the
  // admission and the automatic close either all happen or none does. A full,
  // closed, quarantined or failing store writes nothing: no root, no consent,
  // no personal data for an account that was not admitted. Callers must have
  // verified the Auth user, confirmed email and the 18+/AI acknowledgement
  // before calling this. Operator-created admissions never touch the counter.
  async admitOpenAccount(
    verifiedUserId: unknown,
  ): Promise<OpenAdmissionOutcome> {
    const userId = accountId(verifiedUserId);
    if (!userId) return { status: 'unavailable' };
    return this.db.transaction(async (tx) => {
      const [policy] = await tx.query<
        PolicyRow & {
          admission_capacity: string | number;
          admission_used: string | number;
        }
      >(
        'SELECT mode,reconcile_required,admission_capacity,admission_used FROM aw_service_policy WHERE id=1 FOR UPDATE',
      );
      if (!policy || policy.reconcile_required !== false)
        return { status: 'unavailable' } as const;
      const [existing] = await tx.query<{ state: string }>(
        'SELECT state FROM aw_service_admissions WHERE user_id=$1',
        [userId],
      );
      if (existing)
        return existing.state === 'active'
          ? ({ status: 'already-admitted' } as const)
          : existing.state === 'revoked'
            ? ({ status: 'revoked' } as const)
            : ({ status: 'unavailable' } as const);
      const capacity = Number(policy.admission_capacity),
        used = Number(policy.admission_used);
      if (!Number.isSafeInteger(capacity) || !Number.isSafeInteger(used))
        return { status: 'unavailable' } as const;
      if (policy.mode !== 'open' || used >= capacity)
        return { status: 'closed' } as const;
      await tx.query(
        'INSERT INTO ff_users(id) VALUES($1) ON CONFLICT DO NOTHING',
        [userId],
      );
      const [owner] = await tx.query<{ status: string }>(
        'SELECT status FROM ff_users WHERE id=$1 FOR UPDATE',
        [userId],
      );
      if (owner?.status !== 'active')
        throw new DomainError(
          'SERVICE_ACCESS_ACCOUNT_INACTIVE',
          'Service admission requires an active account.',
          409,
        );
      await tx.query(
        "INSERT INTO ff_consents(id,user_id,policy_version,consent_type) VALUES($1,$2,'alpha-privacy-v1','adult_and_ai_acknowledgement') ON CONFLICT DO NOTHING",
        [randomUUID(), userId],
      );
      await tx.query(
        "INSERT INTO aw_service_admissions(user_id,revision,state) VALUES($1,1,'active')",
        [userId],
      );
      const [after] = await tx.query<{
        admission_used: string | number;
        mode: string;
      }>(
        `UPDATE aw_service_policy SET admission_used=admission_used+1,
           mode=CASE WHEN admission_used+1>=admission_capacity THEN 'invitation' ELSE mode END,
           revision=CASE WHEN admission_used+1>=admission_capacity THEN revision+1 ELSE revision END,
           updated_at=now()
         WHERE id=1 RETURNING admission_used,mode`,
      );
      return {
        status: 'admitted',
        position: Number(after!.admission_used),
        closedAfter: after!.mode !== 'open',
      } as const;
    });
  }

  // Operator wave control: set the absolute capacity and open or close the
  // open path in one revision-checked step. Capacity can never drop below
  // the slots already used, and opening needs at least one remaining slot.
  async configureAdmission(
    expectedRevision: number,
    configuration: unknown,
  ): Promise<ServiceAdmissionCapacity> {
    nextRevision(expectedRevision);
    if (expectedRevision === 0) return inputError();
    if (
      !configuration ||
      typeof configuration !== 'object' ||
      Array.isArray(configuration) ||
      Object.keys(configuration).length !== 2 ||
      !Object.hasOwn(configuration, 'capacity') ||
      !Object.hasOwn(configuration, 'open')
    )
      return inputError();
    const { capacity, open } = configuration as {
      capacity: unknown;
      open: unknown;
    };
    if (
      typeof capacity !== 'number' ||
      !Number.isSafeInteger(capacity) ||
      capacity < 0 ||
      capacity > MAX_ADMISSION_CAPACITY ||
      typeof open !== 'boolean'
    )
      return inputError();
    return this.db.transaction(async (tx) => {
      const [row] = await tx.query<
        PolicyRow & {
          admission_capacity: string | number;
          admission_used: string | number;
        }
      >(
        'SELECT revision,admission_used FROM aw_service_policy WHERE id=1 FOR UPDATE',
      );
      if (!row || Number(row.revision) !== expectedRevision) return conflict();
      const used = Number(row.admission_used);
      if (capacity < used || (open && capacity <= used)) return inputError();
      await tx.query(
        `UPDATE aw_service_policy SET revision=revision+1,admission_capacity=$1,mode=$2,updated_at=now() WHERE id=1`,
        [capacity, open ? 'open' : 'invitation'],
      );
      return {
        mode: open ? ('open' as const) : ('invitation' as const),
        revision: expectedRevision + 1,
        capacity,
        used,
        remaining: capacity - used,
      };
    });
  }

  async replaceAdmission(
    userIdInput: unknown,
    expectedRevision: number,
    state: unknown,
  ): Promise<ServiceAdmission> {
    const revision = nextRevision(expectedRevision);
    const parsed = parseServiceAdmissionLookup({
      status: 'found',
      admission: { userId: userIdInput, revision, state },
    });
    if (parsed?.status !== 'found') return inputError();
    const value = parsed.admission;
    return this.db.transaction(async (tx) => {
      // Account deletion locks the same root first. Never resurrect a deleted
      // account or create an ff_users row as a side effect of admission.
      const [owner] = await tx.query<{ status: string }>(
        'SELECT status FROM ff_users WHERE id=$1 FOR UPDATE',
        [value.userId],
      );
      if (owner?.status !== 'active')
        throw new DomainError(
          'SERVICE_ACCESS_ACCOUNT_INACTIVE',
          'Service admission requires an active account.',
          409,
        );
      const rows =
        expectedRevision === 0
          ? await tx.query(
              `INSERT INTO aw_service_admissions(user_id,revision,state) VALUES($1,1,$2)
           ON CONFLICT(user_id) DO NOTHING RETURNING user_id`,
              [value.userId, value.state],
            )
          : await tx.query(
              `UPDATE aw_service_admissions SET revision=revision+1,state=$2,updated_at=now()
           WHERE user_id=$1 AND revision=$3 RETURNING user_id`,
              [value.userId, value.state, expectedRevision],
            );
      if (!rows.length) return conflict();
      return value;
    });
  }
}

// Shared API/queue/worker boundary. This never creates a root or admission.
export async function assertStoredServiceAccess(
  db: Database,
  userId: string,
  action: ServiceAction,
  enabled = serviceAccessEnforcementFromEnv(),
) {
  if (!enabled) return;
  const { policy, admission } =
    action === 'account-control'
      ? { policy: null, admission: null }
      : await new ServiceAccessRepository(db).snapshot(userId);
  const decision = evaluateServiceAccess(policy, userId, admission, action);
  if (!decision.allowed)
    throw new DomainError(
      decision.code,
      'Service access is not currently available.',
      decision.status,
    );
}
export async function assertServiceGeneration(
  db: Database,
  userId: string,
  enabled = serviceAccessEnforcementFromEnv(),
) {
  await assertStoredServiceAccess(db, userId, 'generate', enabled);
}
