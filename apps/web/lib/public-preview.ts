import {
  publicPreviewCopySchema,
  publicPreviewTextFields,
  publicReviewViewSchema,
  publicReviewJobViewSchema,
  type PublicPreviewCopy,
  type PublicSnapshotDraft,
  type PublicPreviewRecord,
} from '@future-flow/contracts';
import { publicPreviewMessages } from './public-preview-messages';

export function copyFromSnapshot(
  snapshot: PublicSnapshotDraft,
): PublicPreviewCopy {
  return publicPreviewCopySchema.parse({
    title: snapshot.title,
    summary: snapshot.summary,
    category: snapshot.category,
    goalDescription: snapshot.goal.description,
    periods: snapshot.periods.map((p) => ({
      chapter: { title: p.chapter.title, body: p.chapter.body },
      events: p.events.map((e) => ({ title: e.title, summary: e.summary })),
      decision: {
        prompt: p.decision.prompt,
        options: p.decision.options.map((o) => ({
          label: o.label,
          description: o.description,
        })),
      },
    })),
  });
}
export function copyFields(copy: PublicPreviewCopy) {
  const m = publicPreviewMessages.en;
  return publicPreviewTextFields(copy).map((field) => {
    const [root, period, group, index, property] = field.sourcePath;
    let label: string,
      max: number,
      multiline = true;
    if (root !== 'periods') {
      label =
        root === 'title' ? m.title : root === 'summary' ? m.summary : m.goal;
      max = root === 'title' ? 160 : root === 'summary' ? 800 : 500;
      multiline = root !== 'title';
    } else if (group === 'chapter') {
      label = index === 'title' ? m.chapterTitle : m.body;
      max = index === 'title' ? 160 : 10000;
      multiline = index !== 'title';
    } else if (group === 'events') {
      label = `Event ${Number(index) + 1} · ${property === 'title' ? m.eventTitle : m.eventSummary}`;
      max = property === 'title' ? 160 : 800;
      multiline = property !== 'title';
    } else {
      const optionProperty = field.sourcePath.at(-1);
      label =
        index === 'prompt'
          ? m.prompt
          : `Option ${Number(property) + 1} · ${optionProperty === 'label' ? m.optionLabel : m.optionDescription}`;
      max = index === 'prompt' ? 400 : optionProperty === 'label' ? 160 : 500;
      multiline = optionProperty !== 'label';
    }
    return {
      ...field,
      label,
      fullLabel:
        root === 'periods' ? `Chapter ${Number(period) + 1} · ${label}` : label,
      max,
      multiline,
      id: 'copy-' + field.path.replaceAll('.', '-'),
    };
  });
}
export function editCopyField(
  copy: PublicPreviewCopy,
  path: string,
  text: string,
) {
  const field = publicPreviewTextFields(copy).find((f) => f.path === path);
  if (!field) throw new Error('Unknown copy field');
  const updated = structuredClone(copy);
  let target = updated as unknown as Record<string, unknown>;
  for (const part of field.sourcePath.slice(0, -1))
    target = target[String(part)] as Record<string, unknown>;
  target[String(field.sourcePath.at(-1))] = text;
  return updated;
}
export function reviewForPreview(raw: unknown, preview: PublicPreviewRecord) {
  const review = publicReviewViewSchema.parse(raw);
  if (review.status === 'not_started') return review;
  if (
    review.snapshotHash !== preview.snapshotHash ||
    review.sourceRevision !== preview.sourceRevision
  )
    throw new Error('Review does not match this preview');
  const paths = publicPreviewTextFields(copyFromSnapshot(preview.snapshot)).map(
    (f) => f.path,
  );
  if (
    paths.length !== review.fields.length ||
    review.fields.some(
      (f, i) => f.path !== paths[i] || f.key !== `field-${i + 1}`,
    )
  )
    throw new Error('Review fields do not match this preview');
  if (review.status === 'completed') {
    const keys = new Set(review.fields.map((f) => f.key));
    if (review.report.findings.some((f) => !keys.has(f.fieldKey)))
      throw new Error('Unknown review field');
  }
  return review;
}
export function reviewJobForPreview(
  raw: unknown,
  preview: PublicPreviewRecord,
) {
  const job = publicReviewJobViewSchema.parse(raw);
  if (
    job.snapshotHash !== preview.snapshotHash ||
    job.sourceRevision !== preview.sourceRevision
  )
    throw new Error('Review job does not match this preview');
  return job;
}
