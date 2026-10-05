import { z } from 'zod';

export const PUBLIC_REVIEW_VERSION = 'public-review-1';
const fieldKey = z.string().regex(/^field-[1-9][0-9]*$/);
// This input contains only the prepared public copy. No source identity, memory or UUID.
export const publicReviewInputSchema = z
  .object({
    policyVersion: z.literal(PUBLIC_REVIEW_VERSION),
    locale: z.literal('en'),
    fields: z
      .array(
        z
          .object({
            key: fieldKey,
            path: z.string().min(1).max(120),
            text: z.string().min(1).max(10000),
          })
          .strict(),
      )
      .min(3)
      .max(300),
  })
  .strict();
export type PublicReviewInput = z.infer<typeof publicReviewInputSchema>;
// Findings point at fields; they never echo a private name, quote or suggested new biography.
export const publicReviewReportSchema = z
  .object({
    verdict: z.enum(['no_findings', 'review_required', 'unable_to_assess']),
    findings: z
      .array(
        z
          .object({
            fieldKey,
            category: z.enum([
              'person_name',
              'precise_location',
              'organization',
              'contact_details',
              'identifying_combination',
              'private_financial',
              'sensitive_personal',
              'third_party_sensitive',
              'harassment',
              'hate',
              'sexual',
              'violence',
              'self_harm',
              'illegal',
              'scam',
              'impersonation',
              'spam',
              'embedded_instructions',
              'language',
            ]),
            action: z.enum(['remove', 'generalize', 'manual_review']),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();
export type PublicReviewReport = z.infer<typeof publicReviewReportSchema>;
