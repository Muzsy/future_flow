import { z } from 'zod';
import {
  publicPreviewCopySchema,
  publicSnapshotDraftSchema,
  type PublicPreviewCopy,
} from './public-draft';
import {
  PUBLIC_REVIEW_VERSION,
  publicReviewReportSchema,
} from './public-review';

// Private editor responses. Source prose is still unreviewed and owner-only.
export const publicEditorSourceSchema = z
  .object({
    schemaVersion: z.literal('public-editor-1'),
    sourceRevision: z.number().int().nonnegative(),
    copy: publicPreviewCopySchema,
    profile: publicSnapshotDraftSchema.shape.profile,
    goalCategory: publicSnapshotDraftSchema.shape.goal.shape.category,
    periods: z
      .array(
        z.object({ startDate: z.iso.date(), endDate: z.iso.date() }).strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();
export type PublicEditorSource = z.infer<typeof publicEditorSourceSchema>;
export const publicPreviewRecordSchema = z
  .object({
    draftId: z.uuid(),
    sourceRevision: z.number().int().nonnegative(),
    snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    scanVersion: z.string().min(1).max(120),
    expiresAt: z.iso.datetime(),
    status: z.literal('awaiting_review'),
    snapshot: publicSnapshotDraftSchema,
  })
  .strict();
export type PublicPreviewRecord = z.infer<typeof publicPreviewRecordSchema>;
export const publicPreviewWorkspaceSchema = z
  .object({
    source: publicEditorSourceSchema,
    preview: publicPreviewRecordSchema.nullable(),
  })
  .strict();
export type PublicPreviewWorkspace = z.infer<
  typeof publicPreviewWorkspaceSchema
>;
export const publicPreviewPreflightSchema = z
  .object({
    sourceRevision: z.number().int().nonnegative(),
    issues: z
      .array(
        z
          .object({
            path: z.string().min(1).max(120),
            codes: z
              .array(
                z.enum([
                  'email',
                  'link',
                  'phone_or_identifier',
                  'internal_reference',
                  'private_label',
                ]),
              )
              .min(1)
              .max(5),
          })
          .strict(),
      )
      .max(300),
  })
  .strict();
export type PublicPreviewPreflight = z.infer<
  typeof publicPreviewPreflightSchema
>;

// Stable paths shared by the private editor, deterministic check and AI review.
export function publicPreviewTextFields(copy: PublicPreviewCopy) {
  const fields: {
    path: string;
    text: string;
    sourcePath: (string | number)[];
  }[] = [];
  const add = (path: string, text: string, sourcePath: (string | number)[]) =>
    fields.push({ path, text, sourcePath });
  add('title', copy.title, ['title']);
  add('summary', copy.summary, ['summary']);
  add('goal.description', copy.goalDescription, ['goalDescription']);
  let event = 0,
    option = 0;
  copy.periods.forEach((p, i) => {
    const prefix = `period-${i + 1}`,
      source = ['periods', i];
    add(`${prefix}.chapter.title`, p.chapter.title, [
      ...source,
      'chapter',
      'title',
    ]);
    add(`${prefix}.chapter.body`, p.chapter.body, [
      ...source,
      'chapter',
      'body',
    ]);
    p.events.forEach((e, n) => {
      const key = `event-${++event}`;
      add(`${prefix}.${key}.title`, e.title, [...source, 'events', n, 'title']);
      add(`${prefix}.${key}.summary`, e.summary, [
        ...source,
        'events',
        n,
        'summary',
      ]);
    });
    add(`${prefix}.decision.prompt`, p.decision.prompt, [
      ...source,
      'decision',
      'prompt',
    ]);
    p.decision.options.forEach((o, n) => {
      const key = `option-${++option}`;
      add(`${prefix}.${key}.label`, o.label, [
        ...source,
        'decision',
        'options',
        n,
        'label',
      ]);
      add(`${prefix}.${key}.description`, o.description, [
        ...source,
        'decision',
        'options',
        n,
        'description',
      ]);
    });
  });
  return fields;
}
const reviewBinding = {
  publicationApproved: z.literal(false),
  policyVersion: z.literal(PUBLIC_REVIEW_VERSION),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceRevision: z.number().int().nonnegative(),
  fields: z
    .array(
      z
        .object({
          key: z.string().regex(/^field-[1-9][0-9]*$/),
          path: z.string().min(1).max(120),
        })
        .strict(),
    )
    .min(3)
    .max(300),
};
export const publicReviewViewSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('not_started'),
      publicationApproved: z.literal(false),
    })
    .strict(),
  z
    .object({
      ...reviewBinding,
      status: z.literal('running'),
      report: z.null(),
    })
    .strict(),
  z
    .object({ ...reviewBinding, status: z.literal('failed'), report: z.null() })
    .strict(),
  z
    .object({
      ...reviewBinding,
      status: z.literal('completed'),
      report: publicReviewReportSchema,
    })
    .strict(),
]);
export type PublicReviewView = z.infer<typeof publicReviewViewSchema>;
