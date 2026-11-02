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
      if (
        !row ||
        row.account_status !== 'active' ||
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
    const rows =
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
