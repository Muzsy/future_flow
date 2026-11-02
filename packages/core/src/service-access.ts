// Service admission is independent of billing, chapter balances and USD spend.
// This is a pure decision layer, not authentication: callers must first verify
// the account with the auth provider, and still enforce ownership/reauth/billing.
// No runtime uses this policy until the durable store and its guards are wired.

export type ServiceAccessPolicy = Readonly<{
  version: 1;
  revision: number;
  mode: 'invitation' | 'open';
  generationEnabled: boolean;
  checkoutEnabled: boolean;
}>;

export type ServiceAdmission = Readonly<{
  userId: string;
  revision: number;
  state: 'active' | 'revoked';
}>;

// A missing invitation and a failed database read are different. Open mode may
// admit an unlisted verified account, but must never turn a failed lookup into
// permission: that could ignore a revocation.
export type ServiceAdmissionLookup =
  | Readonly<{ status: 'found'; admission: ServiceAdmission }>
  | Readonly<{ status: 'not-found' }>
  | Readonly<{ status: 'unavailable' }>;

export type ServiceAction =
  'read' | 'generate' | 'checkout' | 'account-control';
export type ServiceAccessDecision =
  | Readonly<{ allowed: true }>
  | Readonly<{
      allowed: false;
      code:
        | 'AUTH_REQUIRED'
        | 'SERVICE_ACCESS_UNAVAILABLE'
        | 'SERVICE_INVITATION_REQUIRED'
        | 'SERVICE_GENERATION_PAUSED'
        | 'SERVICE_CHECKOUT_PAUSED';
      status: 401 | 403 | 503;
    }>;

const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const validUserId = (value: unknown): value is string =>
  typeof value === 'string' && value.length === 36 && uuid.test(value);
const positiveRevision = (n: unknown): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

export function parseServiceAccessPolicy(
  value: unknown,
): ServiceAccessPolicy | null {
  if (
    !record(value) ||
    !exact(value, [
      'version',
      'revision',
      'mode',
      'generationEnabled',
      'checkoutEnabled',
    ]) ||
    value.version !== 1 ||
    !positiveRevision(value.revision) ||
    (value.mode !== 'invitation' && value.mode !== 'open') ||
    typeof value.generationEnabled !== 'boolean' ||
    typeof value.checkoutEnabled !== 'boolean'
  )
    return null;
  return Object.freeze({
    version: 1,
    revision: value.revision,
    mode: value.mode as ServiceAccessPolicy['mode'],
    generationEnabled: value.generationEnabled,
    checkoutEnabled: value.checkoutEnabled,
  });
}

export function parseServiceAdmissionLookup(
  value: unknown,
): ServiceAdmissionLookup | null {
  if (!record(value)) return null;
  if (value.status === 'not-found' || value.status === 'unavailable')
    return exact(value, ['status']) ? { status: value.status } : null;
  if (value.status !== 'found' || !exact(value, ['status', 'admission']))
    return null;
  const a = value.admission;
  if (
    !record(a) ||
    !exact(a, ['userId', 'revision', 'state']) ||
    !validUserId(a.userId) ||
    !positiveRevision(a.revision) ||
    (a.state !== 'active' && a.state !== 'revoked')
  )
    return null;
  return {
    status: 'found',
    admission: {
      userId: a.userId.toLowerCase(),
      revision: a.revision,
      state: a.state as ServiceAdmission['state'],
    },
  };
}

export function evaluateServiceAccess(
  policySnapshot: unknown,
  verifiedUserId: unknown,
  admissionSnapshot: unknown,
  action: ServiceAction,
): ServiceAccessDecision {
  if (!validUserId(verifiedUserId))
    return { allowed: false, code: 'AUTH_REQUIRED', status: 401 };
  if (!['read', 'generate', 'checkout', 'account-control'].includes(action))
    return { allowed: false, code: 'SERVICE_ACCESS_UNAVAILABLE', status: 503 };
  // The existing authenticated data-rights route must remain available during
  // an admission/policy outage. It still performs ownership and recent auth.
  if (action === 'account-control') return { allowed: true };
  const policy = parseServiceAccessPolicy(policySnapshot);
  const lookup = parseServiceAdmissionLookup(admissionSnapshot);
  if (
    !policy ||
    !lookup ||
    lookup.status === 'unavailable' ||
    (lookup.status === 'found' &&
      lookup.admission.userId !== verifiedUserId.toLowerCase())
  )
    return { allowed: false, code: 'SERVICE_ACCESS_UNAVAILABLE', status: 503 };
  if (
    (lookup.status === 'found' && lookup.admission.state === 'revoked') ||
    (lookup.status === 'not-found' && policy.mode === 'invitation')
  )
    return { allowed: false, code: 'SERVICE_INVITATION_REQUIRED', status: 403 };
  if (action === 'generate' && !policy.generationEnabled)
    return { allowed: false, code: 'SERVICE_GENERATION_PAUSED', status: 503 };
  if (action === 'checkout' && !policy.checkoutEnabled)
    return { allowed: false, code: 'SERVICE_CHECKOUT_PAUSED', status: 503 };
  return { allowed: true };
}
