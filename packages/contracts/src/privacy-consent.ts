import { z } from 'zod';
export const privacyConsentStatusSchema = z
  .object({
    schemaVersion: z.literal('privacy-consent-status-1'),
    acknowledged: z.boolean(),
    policyVersion: z.literal('alpha-privacy-v1'),
  })
  .strict();
