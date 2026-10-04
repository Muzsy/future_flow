import { z } from 'zod';
export const feedbackCategories = [
  'experience',
  'language',
  'repetition',
  'consistency',
  'decision',
  'technical',
] as const;
export const betaFeedbackSchema = z
  .object({
    feedbackId: z.uuid(),
    branchId: z.uuid().nullable(),
    periodId: z.uuid().nullable(),
    category: z.enum(feedbackCategories),
    wouldContinue: z.enum(['yes', 'maybe', 'no']).nullable(),
    message: z.string().trim().min(3).max(1200).nullable(),
  })
  .strict()
  .refine((value) => value.periodId === null || value.branchId !== null, {
    message: 'A chapter needs a life branch.',
  })
  .refine((value) => value.message !== null || value.wouldContinue !== null, {
    message: 'Add a note or a continuation preference.',
  });
export type BetaFeedback = z.infer<typeof betaFeedbackSchema>;
export const lifeContinueRequestV2Schema = z
  .object({
    revision: z.number().int().nonnegative(),
    sessionId: z.uuid().optional(),
  })
  .strict();
