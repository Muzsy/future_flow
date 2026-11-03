import { z } from 'zod';
export const privacyConsentStatusSchema = z
  .object({
    schemaVersion: z.literal('privacy-consent-status-1'),
    acknowledged: z.boolean(),
    policyVersion: z.literal('alpha-privacy-v1'),
  })
  .strict();

// Acceptance of the terms of service and the privacy notice is recorded against
// an explicit text version. The identifier is the one the final ÁSZF /
// adatkezelési tájékoztató text sets before the service opens (owner decision
// D4); a client that saw another text cannot accept this one.
export const TERMS_ACCEPTANCE_VERSION = 'terms-pending-final-text';
export const TERMS_ACCEPTANCE_CONSENT_TYPE = 'terms_and_privacy_acceptance';
export const privacyConsentRequestSchema = z
  .object({
    adult: z.literal(true),
    acknowledged: z.literal(true),
    termsVersion: z.literal(TERMS_ACCEPTANCE_VERSION),
  })
  .strict();
