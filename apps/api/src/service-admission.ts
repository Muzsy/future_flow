import type { Request, Response } from 'express';
import { privacyConsentRequestSchema } from '@future-flow/contracts';
import {
  DomainError,
  verifyReferralInvite,
  type EntitlementConfig,
} from '@future-flow/core';
import {
  ServiceAccessRepository,
  admitReferredAccount,
  referralInviteState,
  type Database,
} from '@future-flow/database';

// Bounded open admission, pre-admission routes only.
//
// A verified account with no stored admission can do exactly one thing: read
// its (empty) consent status and submit the 18+/AI acknowledgement. The
// acknowledgement and the versioned terms acceptance are the admission request: it atomically takes one of the
// remaining slots, creates the account root and the consent record, and closes
// the open path when the last slot is taken. Everything else for such an
// account is rejected by the regular admission check. A full or closed service
// writes nothing for the account (no root, no consent, no waitlist entry).
export const CONSENT_PATH = '/api/v1/me/consent';

export function preAdmissionRoute(
  method: string,
  path: string,
): 'status' | 'accept' | null {
  if (path !== CONSENT_PATH) return null;
  if (method === 'GET') return 'status';
  if (method === 'POST') return 'accept';
  return null;
}

// Subscriber referral (invite) support for the pre-admission routes. A null key
// disables it: every token is then simply absent.
export type ReferralAdmissionOptions = Readonly<{
  key: Buffer | null;
  entitlement?: EntitlementConfig;
  now?: () => Date;
}>;

const invalidInvite = () =>
  new DomainError(
    'SERVICE_INVITE_INVALID',
    'This invitation is no longer valid.',
    403,
  );
const unavailable = () =>
  new DomainError(
    'SERVICE_ACCESS_UNAVAILABLE',
    'Service access is not currently available.',
    503,
  );
const closed = () =>
  new DomainError(
    'SERVICE_ADMISSION_CLOSED',
    'Admission is currently full.',
    403,
  );

// Returns true when the response was written here. Identity (Access
// assertion + confirmed Supabase email) must already be verified by the caller.
export async function handlePreAdmission(
  db: Database,
  userId: string,
  request: Pick<Request, 'method' | 'path' | 'body'> &
    Partial<Pick<Request, 'query'>>,
  response: Pick<Response, 'status' | 'json'>,
  referral: ReferralAdmissionOptions = { key: null },
): Promise<boolean> {
  const route = preAdmissionRoute(request.method, request.path);
  if (!route) return false;
  const store = new ServiceAccessRepository(db);
  const state = await store.admissionStatus(userId);
  // Admitted and revoked accounts use the regular routes; the regular
  // admission check rejects a revoked one.
  if (state.status === 'admitted' || state.status === 'revoked') return false;
  if (state.status === 'unavailable') throw unavailable();
  const now = (referral.now ?? (() => new Date()))();
  const options = { now, entitlement: referral.entitlement };
  // A token only counts when its signature and expiry verify. Whether the
  // inviter can still be credited is checked against the database.
  const rawToken =
    route === 'status'
      ? (request.query as Record<string, unknown> | undefined)?.invite
      : (request.body as Record<string, unknown> | undefined)?.inviteToken;
  const invite =
    rawToken === undefined
      ? null
      : verifyReferralInvite(referral.key, rawToken, now);
  if (state.status === 'closed') {
    // Closed public wave: only a valid, still redeemable invitation passes.
    if (rawToken !== undefined && !invite) throw invalidInvite();
    if (
      !invite ||
      (await referralInviteState(db, invite.inviterUserId, options)) !==
        'available'
    )
      throw rawToken === undefined ? closed() : invalidInvite();
  }
  if (route === 'status') {
    response.status(200).json({
      schemaVersion: 'privacy-consent-status-1',
      acknowledged: false,
      policyVersion: 'alpha-privacy-v1',
    });
    return true;
  }
  // The request must name the exact terms text version it accepts; a stale or
  // missing version is rejected before anything is written.
  const accepted = privacyConsentRequestSchema.safeParse(request.body);
  if (!accepted.success)
    throw new DomainError('VALIDATION_FAILED', 'Invalid request.', 422);
  if (invite) {
    const referred = await admitReferredAccount(
      db,
      userId,
      accepted.data.termsVersion,
      invite.inviterUserId,
      options,
    );
    if (referred.status === 'admitted') {
      response
        .status(201)
        .json({ accepted: true, policyVersion: 'alpha-privacy-v1' });
      return true;
    }
    if (referred.status === 'unavailable') throw unavailable();
    if (referred.status === 'revoked')
      throw new DomainError(
        'SERVICE_INVITATION_REQUIRED',
        'Your access is not active.',
        403,
      );
    // Not redeemable any more. While the public wave is open the account
    // simply continues as an ordinary open admission; while closed it is told
    // the invitation is no longer valid.
    if (state.status !== 'open') throw invalidInvite();
  }
  const outcome = await store.admitOpenAccount(
    userId,
    accepted.data.termsVersion,
  );
  if (outcome.status === 'closed') throw closed();
  if (outcome.status === 'unavailable') throw unavailable();
  if (outcome.status === 'revoked')
    throw new DomainError(
      'SERVICE_INVITATION_REQUIRED',
      'Your access is not active.',
      403,
    );
  // 201, like the regular consent route that answers for admitted accounts.
  response
    .status(201)
    .json({ accepted: true, policyVersion: 'alpha-privacy-v1' });
  return true;
}
