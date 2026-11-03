import type { Request, Response } from 'express';
import { z } from 'zod';
import { DomainError } from '@future-flow/core';
import { ServiceAccessRepository, type Database } from '@future-flow/database';

// Bounded open admission, pre-admission routes only.
//
// A verified account with no stored admission can do exactly one thing: read
// its (empty) consent status and submit the 18+/AI acknowledgement. The
// acknowledgement is the admission request: it atomically takes one of the
// remaining slots, creates the account root and the consent record, and closes
// the open path when the last slot is taken. Everything else for such an
// account is rejected by the regular admission check. A full or closed service
// writes nothing for the account (no root, no consent, no waitlist entry).
export const CONSENT_PATH = '/api/v1/me/consent';
const acknowledgement = z
  .object({ adult: z.literal(true), acknowledged: z.literal(true) })
  .strict();

export function preAdmissionRoute(
  method: string,
  path: string,
): 'status' | 'accept' | null {
  if (path !== CONSENT_PATH) return null;
  if (method === 'GET') return 'status';
  if (method === 'POST') return 'accept';
  return null;
}

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
  request: Pick<Request, 'method' | 'path' | 'body'>,
  response: Pick<Response, 'status' | 'json'>,
): Promise<boolean> {
  const route = preAdmissionRoute(request.method, request.path);
  if (!route) return false;
  const store = new ServiceAccessRepository(db);
  const state = await store.admissionStatus(userId);
  // Admitted and revoked accounts use the regular routes; the regular
  // admission check rejects a revoked one.
  if (state.status === 'admitted' || state.status === 'revoked') return false;
  if (state.status === 'unavailable') throw unavailable();
  if (state.status === 'closed') throw closed();
  if (route === 'status') {
    response.status(200).json({
      schemaVersion: 'privacy-consent-status-1',
      acknowledged: false,
      policyVersion: 'alpha-privacy-v1',
    });
    return true;
  }
  if (!acknowledgement.safeParse(request.body).success)
    throw new DomainError('VALIDATION_FAILED', 'Invalid request.', 422);
  const outcome = await store.admitOpenAccount(userId);
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
