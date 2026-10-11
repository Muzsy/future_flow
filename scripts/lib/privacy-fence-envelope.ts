import { z } from 'zod';
import { hash } from '@future-flow/core';
import {
  validatePrivacyRestoreAuthority,
  type PrivacyRestoreAuthority,
} from './privacy-restore';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const bindingSchema = z
  .object({
    mode: z.enum(['drill', 'recovery']),
    nonce: z.string().regex(/^[a-f0-9]{24}$/),
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    sourceFilesDigest: digest,
    ownerManifestDigest: digest,
    projectBinding: digest,
    writerFenceDigest: digest,
    expiresAt: z.string().datetime(),
  })
  .strict();
export type PrivacyFenceBinding = z.infer<typeof bindingSchema>;
const envelopeSchema = z
  .object({
    schemaVersion: z.literal('privacy-fence-envelope-2'),
    binding: bindingSchema,
    authStateDigest: digest,
    stateDigest: digest,
    authority: z.unknown(),
    serviceActivationAllowed: z.literal(false),
  })
  .strict();

function freshness(binding: PrivacyFenceBinding, now: Date) {
  const remaining = Date.parse(binding.expiresAt) - now.getTime();
  if (
    !Number.isFinite(remaining) ||
    remaining <= 0 ||
    remaining > 15 * 60 * 1000
  )
    throw Error('Current bounded physical fence required');
}
export function privacyFenceStateDigest(
  authority: PrivacyRestoreAuthority,
  authStateDigest: string,
) {
  const {
    capturedAt: _capturedAt,
    authVerifiedAt: _authVerifiedAt,
    ...state
  } = authority;
  return hash({ state, authStateDigest: digest.parse(authStateDigest) });
}
export function createPrivacyFenceEnvelope(
  authority: PrivacyRestoreAuthority,
  authStateDigest: string,
  binding: PrivacyFenceBinding,
  now = new Date(),
) {
  const parsed = bindingSchema.parse(binding);
  freshness(parsed, now);
  const observed = validatePrivacyRestoreAuthority(authority, now);
  if (
    observed.writerFenceDigest !== parsed.writerFenceDigest ||
    observed.projectBinding !== parsed.projectBinding
  )
    throw Error('Matching root-held authority required');
  return {
    schemaVersion: 'privacy-fence-envelope-2' as const,
    binding: parsed,
    authStateDigest: digest.parse(authStateDigest),
    stateDigest: privacyFenceStateDigest(observed, authStateDigest),
    authority: observed,
    serviceActivationAllowed: false as const,
  };
}
// The root recovery transport must supply a fresh, independently re-observed
// held binding and state. Supplying a hash is not itself physical fence proof.
// There is intentionally no serving/activation or replay CLI in this module.
export function validateRecoveryFenceEnvelope(
  raw: unknown,
  held: PrivacyFenceBinding & { stateDigest: string },
  now = new Date(),
) {
  const value = envelopeSchema.parse(raw),
    { stateDigest, ...heldBinding } = held,
    binding = bindingSchema.parse(heldBinding);
  freshness(binding, now);
  if (
    value.binding.mode !== 'recovery' ||
    binding.mode !== 'recovery' ||
    hash(value.binding) !== hash(binding) ||
    value.stateDigest !== digest.parse(stateDigest)
  )
    throw Error('Same currently held recovery fence required');
  const authority = validatePrivacyRestoreAuthority(value.authority, now);
  if (
    authority.writerFenceDigest !== binding.writerFenceDigest ||
    authority.projectBinding !== binding.projectBinding ||
    privacyFenceStateDigest(authority, value.authStateDigest) !==
      value.stateDigest
  )
    throw Error('Independent Auth/application state binding differs');
  return { ...value, authority };
}
