import {
  publicContentReviewJobViewSchema,
  publicContentReviewInputSchema,
  type PublicContentView,
} from '@future-flow/contracts';
import { canonicalPublicContent, publicContentHash } from './public-content';

export async function contentReviewForBundle(
  raw: unknown,
  bundle: PublicContentView,
) {
  const view = publicContentReviewJobViewSchema.parse(raw),
    fields: { key: string; path: string }[] = [];
  function visit(value: unknown, path: string) {
    if (value !== null && typeof value === 'object')
      for (const [key, child] of Object.entries(value))
        visit(child, path ? `${path}.${key}` : key);
    else fields.push({ key: `field-${fields.length + 1}`, path });
  }
  visit(bundle.content, '');
  publicContentReviewInputSchema.shape.fields.parse(fields);
  if (
    view.bundleId !== bundle.bundleId ||
    view.draftId !== bundle.draftId ||
    view.contentHash !== bundle.contentHash ||
    view.snapshotHash !== bundle.snapshotHash ||
    view.sourceRevision !== bundle.sourceRevision ||
    (await publicContentHash(bundle.content)) !== bundle.contentHash ||
    canonicalPublicContent(fields) !== canonicalPublicContent(view.fields)
  )
    throw new Error('Full review binding changed');
  const report = view.report,
    keys = new Set(fields.map((f) => f.key));
  if (
    Boolean(report) !== (view.job?.status === 'completed') ||
    (report &&
      (report.contentHash !== bundle.contentHash ||
        report.findings.some((f) => !keys.has(f.fieldKey)) ||
        new Set(report.findings.map((f) => `${f.fieldKey}:${f.category}`))
          .size !== report.findings.length ||
        (report.verdict === 'no_findings' && report.findings.length > 0) ||
        (report.verdict === 'review_required' && report.findings.length === 0)))
  )
    throw new Error('Full review result is invalid');
  return view;
}

export function contentReviewFieldLabel(path: string) {
  return path
    .split('.')
    .map((part) => {
      if (/^\d+$/.test(part)) return String(Number(part) + 1);
      if (part === 'snapshot') return 'Story';
      if (part === 'checkpoints') return 'Starting point';
      if (part === 'periods') return 'Chapter';
      if (part === 'startingState') return 'Starting situation';
      return part
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .replace(/^./, (c) => c.toUpperCase());
    })
    .join(' · ');
}
