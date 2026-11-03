import { DomainError, type ServiceAction } from '@future-flow/core';
import {
  assertStoredServiceAccess,
  type Database,
} from '@future-flow/database';
import { handlePreAdmission, preAdmissionRoute } from './service-admission';
import type { Request, Response } from 'express';
import {
  createServiceSiteGate,
  serviceAccountControlException,
  type VerifiedAccessIdentity,
} from '@future-flow/access';
export const REQUEST_SERVICE_IDENTITY = Symbol('verified-service-identity');
export const REQUEST_SERVICE_USER = Symbol('verified-service-user');
export type ServiceVerifiedUser = {
  id: string;
  email?: string | null;
  emailConfirmed?: boolean;
};
export type ServiceAccessRuntime = Readonly<{
  enabled: boolean;
  identity: (
    assertion: string | undefined,
  ) => Promise<VerifiedAccessIdentity | null>;
  assert: (
    user: ServiceVerifiedUser,
    identity: VerifiedAccessIdentity | undefined,
    action: ServiceAction,
  ) => Promise<void>;
  // Bounded open admission (see service-admission.ts). Returns true when the
  // request was answered here; false means continue with the regular checks.
  preAdmission: (
    user: ServiceVerifiedUser,
    identity: VerifiedAccessIdentity | undefined,
    request: Pick<Request, 'method' | 'path' | 'body'>,
    response: Pick<Response, 'status' | 'json'>,
  ) => Promise<boolean>;
}>;
function assertVerifiedIdentity(
  user: ServiceVerifiedUser,
  identity: VerifiedAccessIdentity | undefined,
) {
  if (
    !identity ||
    user.emailConfirmed !== true ||
    !user.email ||
    user.email.toLowerCase() !== identity.email ||
    identity.expiresAt <= Date.now() / 1000
  )
    throw new DomainError(
      'SERVICE_IDENTITY_MISMATCH',
      'Sign in with the same confirmed email in both login steps.',
      403,
    );
}
export function serviceAction(
  method: string,
  path: string,
  generation: boolean,
): ServiceAction {
  if (serviceAccountControlException(method, path)) return 'account-control';
  if (method === 'POST' && path === '/api/v1/billing/checkout')
    return 'checkout';
  return generation ? 'generate' : 'read';
}
export function createServiceAccessRuntime(
  db: Database,
  billingEnforced: boolean,
  env: NodeJS.ProcessEnv = process.env,
  transport?: typeof fetch,
): ServiceAccessRuntime {
  const site = createServiceSiteGate(env, transport);
  if (site.enabled && !billingEnforced)
    throw Error('Service admission requires chapter billing enforcement');

  return {
    enabled: site.enabled,
    identity: site.identity,
    async assert(user, identity, action) {
      if (!site.enabled) return;
      if (action !== 'account-control') assertVerifiedIdentity(user, identity);
      await assertStoredServiceAccess(db, user.id, action, true);
    },
    async preAdmission(user, identity, request, response) {
      if (!site.enabled) return false;
      // Only the pre-admission routes need the extra work; keep every other
      // request off this path before touching the database.
      if (!preAdmissionRoute(request.method, request.path)) return false;
      assertVerifiedIdentity(user, identity);
      return handlePreAdmission(db, user.id, request, response);
    },
  };
}

export async function verifiedServiceBearer(
  auth: { verify: (token: string) => Promise<ServiceVerifiedUser> },
  header: string | undefined,
) {
  const match = /^Bearer ([A-Za-z0-9_.-]{20,6000})$/.exec(header ?? '');
  if (!match?.[1])
    throw new DomainError('AUTH_REQUIRED', 'Sign in is required.', 401);
  return { token: match[1], user: await auth.verify(match[1]) };
}
