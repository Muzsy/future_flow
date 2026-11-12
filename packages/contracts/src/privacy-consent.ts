import { z } from 'zod';
export const privacyConsentStatusSchema = z
  .object({
    schemaVersion: z.literal('privacy-consent-status-1'),
    acknowledged: z.boolean(),
    policyVersion: z.literal('alpha-privacy-v1'),
  })
  .strict();

// Acceptance of the terms of service and the privacy notice is recorded against
// an explicit text version. The identifier names the ÁSZF / adatkezelési
// tájékoztató text of the paid, open-registration launch (owner-approved draft
// of 2026-11-03, wording of the free first chapter revised 2026-11-10,
// apps/web messages terms.* / privacy.*); change it together with
// any change of that text, so a client that saw another text cannot accept this
// one.
export const TERMS_ACCEPTANCE_VERSION = 'terms-2026-11-10';
export const TERMS_ACCEPTANCE_CONSENT_TYPE = 'terms_and_privacy_acceptance';
export const privacyConsentRequestSchema = z
  .object({
    adult: z.literal(true),
    acknowledged: z.literal(true),
    termsVersion: z.literal(TERMS_ACCEPTANCE_VERSION),
    // A subscriber's signed invite link token (see core billing-referral). Only
    // the pre-admission request uses it; the server verifies it, never trusts it.
    inviteToken: z.string().min(1).max(64).optional(),
  })
  .strict();
