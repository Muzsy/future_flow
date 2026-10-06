import { z } from 'zod';
import { publicLifeSlugSchema } from './saved-lives';
export const PUBLIC_SAFETY_VERSION = 'public-safety-1';
export const publicReportReasons = [
  'personal_data',
  'harassment',
  'hate',
  'explicit_sexual_content',
  'violence',
  'illegal_content',
  'scam',
  'impersonation',
  'spam',
] as const;
export const publicReportReasonSchema = z.enum(publicReportReasons);
export const publicReportRequestSchema = z
  .object({
    reason: publicReportReasonSchema,
    details: z.string().trim().max(1000).default(''),
  })
  .strict();
export const publicReportReceiptSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_SAFETY_VERSION),
    reportId: z.uuid(),
    slug: publicLifeSlugSchema,
    reason: publicReportReasonSchema,
    createdAt: z.iso.datetime(),
    status: z.enum(['queued', 'resolved']),
    received: z.literal(true),
    duplicate: z.boolean(),
  })
  .strict();
const action = z.enum(['dismiss', 'warn', 'hide', 'remove']);
export const publicReportModerationSchema = z
  .object({
    reportId: z.uuid(),
    reportRevision: z.number().int().positive(),
    publicationRevision: z.number().int().positive(),
    snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    action,
    reasonCode: publicReportReasonSchema,
    actorLabel: z.string().trim().min(3).max(80),
    restrictPublishing: z.boolean().default(false),
    acknowledged: z.literal(true),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.action === 'dismiss' && v.restrictPublishing)
      ctx.addIssue({
        code: 'custom',
        path: ['restrictPublishing'],
        message: 'Dismissal cannot restrict publishing.',
      });
  });
export const publicRestrictionRequestSchema = z
  .object({
    userId: z.uuid(),
    revision: z.number().int().min(0),
    active: z.boolean(),
    reasonCode: publicReportReasonSchema,
    actorLabel: z.string().trim().min(3).max(80),
    acknowledged: z.literal(true),
  })
  .strict();
export const publicSafetyViewSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_SAFETY_VERSION),
    publishingRestricted: z.boolean(),
    restrictionRevision: z.number().int().min(0),
    warnings: z
      .array(
        z
          .object({
            id: z.uuid(),
            slug: publicLifeSlugSchema,
            reason: publicReportReasonSchema,
            action: z.enum(['warn', 'hide', 'remove']),
            createdAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export type PublicReportRequest = z.infer<typeof publicReportRequestSchema>;
export type PublicSafetyView = z.infer<typeof publicSafetyViewSchema>;
