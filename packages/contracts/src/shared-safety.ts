import { z } from 'zod';
import { sharedInviteTokenSchema } from './shared-context';

export const sharedBlockRequestSchema = z
  .object({
    contextRevision: z.number().int().nonnegative(),
    memberId: z.uuid(),
  })
  .strict();
export const sharedReportReasonSchema = z.enum([
  'harassment',
  'privacy',
  'unsafe_content',
  'spam',
  'other',
]);
const report = {
  reason: sharedReportReasonSchema,
  details: z.string().trim().min(1).max(2000),
};
export const sharedReportRequestSchema = z.discriminatedUnion('targetType', [
  z.object({ targetType: z.literal('context'), ...report }).strict(),
  z
    .object({ targetType: z.literal('member'), targetId: z.uuid(), ...report })
    .strict(),
  z
    .object({ targetType: z.literal('event'), targetId: z.uuid(), ...report })
    .strict(),
]);
export const sharedInviteReportRequestSchema = z
  .object({ token: sharedInviteTokenSchema, ...report })
  .strict();
export type SharedReportRequest = z.infer<typeof sharedReportRequestSchema>;
