import { z } from 'zod';
import { localeSchema } from './locales';
import { lifeInputV2Schema } from './life-v2';

// Public projections have their own closed contract. They never extend private DTOs.
export const PUBLIC_DRAFT_VERSION = '1.0.0';
const title = z.string().trim().min(3).max(160);
const summary = z.string().trim().min(10).max(800);
const key = z.string().regex(/^(period|event|decision|option)-[1-9][0-9]*$/);
export const publicCategorySchema = z.enum([
  'career',
  'business',
  'money',
  'relationships',
  'family',
  'education',
  'lifestyle',
  'moving_abroad',
  'starting_over',
  'personal_growth',
  'adventure',
  'historical',
  'fictional',
]);
const decision = z
  .object({
    key,
    prompt: z.string().trim().min(5).max(400),
    options: z
      .array(
        z
          .object({
            key,
            label: title,
            description: z.string().trim().min(3).max(500),
          })
          .strict(),
      )
      .min(2)
      .max(4),
    selectedOptionKey: key.nullable(),
  })
  .strict();
const periodText = z
  .object({
    chapter: z
      .object({ title, body: z.string().trim().min(500).max(10000) })
      .strict(),
    events: z.array(z.object({ title, summary }).strict()).min(2).max(5),
    decision: decision.omit({ key: true, selectedOptionKey: true }).extend({
      options: z
        .array(
          z
            .object({
              label: title,
              description: z.string().trim().min(3).max(500),
            })
            .strict(),
        )
        .min(2)
        .max(4),
    }),
  })
  .strict();
// Owner-reviewed copy only; internal IDs, badges and permission flags cannot be submitted.
export const publicPreviewCopySchema = z
  .object({
    title,
    summary,
    category: publicCategorySchema,
    goalDescription: z.string().trim().min(3).max(500),
    periods: z.array(periodText).min(1).max(12),
  })
  .strict();
export type PublicPreviewCopy = z.infer<typeof publicPreviewCopySchema>;
export const publicPreviewRequestSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    copy: publicPreviewCopySchema,
  })
  .strict();
export const publicSnapshotDraftSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_DRAFT_VERSION),
    snapshotKey: z.uuid(),
    locale: localeSchema,
    title,
    summary,
    category: publicCategorySchema,
    origin: z
      .object({
        aiGenerated: z.literal(true),
        userEdited: z.boolean(),
        classification: z.literal('unreviewed'),
      })
      .strict(),
    profile: z
      .object({
        ageBand: lifeInputV2Schema.shape.identity.shape.ageBand,
        country: z
          .string()
          .regex(/^[A-Z]{2}$/)
          .nullable(),
        employmentStatus:
          lifeInputV2Schema.shape.initialState.shape.employment.shape.status,
      })
      .strict(),
    goal: z
      .object({
        category: lifeInputV2Schema.shape.goals.element.shape.category,
        description: z.string().trim().min(3).max(500),
      })
      .strict(),
    periods: z
      .array(
        z
          .object({
            key,
            startDate: z.iso.date(),
            endDate: z.iso.date(),
            chapter: periodText.shape.chapter,
            events: z
              .array(
                z
                  .object({ key, effectiveAt: z.iso.date(), title, summary })
                  .strict(),
              )
              .min(2)
              .max(5),
            decision,
          })
          .strict(),
      )
      .min(1)
      .max(12),
    // This deliberately coarse starting point is not an executable decision checkpoint.
    // P12 requires a separate validated fork contract, explicit permissions and ID remapping.
    startingPoint: z
      .object({
        effectiveAt: z.iso.date(),
        country: z
          .string()
          .regex(/^[A-Z]{2}$/)
          .nullable(),
        employmentStatus:
          lifeInputV2Schema.shape.initialState.shape.employment.shape.status,
        goalCategory: lifeInputV2Schema.shape.goals.element.shape.category,
        readyForFork: z.literal(false),
      })
      .strict(),
  })
  .strict();
export type PublicSnapshotDraft = z.infer<typeof publicSnapshotDraftSchema>;
