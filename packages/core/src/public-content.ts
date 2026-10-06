import {
  PUBLIC_CONTENT_VERSION,
  PUBLIC_CONTENT_REVIEW_VERSION,
  publicSnapshotDraftSchema,
  publicContentSchema,
  publicContentReviewInputSchema,
  publicContentReviewReportSchema,
  type PublicSnapshotDraft,
  type ForkCheckpoint,
} from '@future-flow/contracts';
import { DomainError } from './errors';
import { hash } from './index';
import { validateForkCheckpoint } from './public-fork';
import { publicDraftIssues } from './public-draft';

export const PUBLIC_CONTENT_MAX_BYTES = 256000;
const invalid = (message: string) =>
  new DomainError('PUBLIC_CONTENT_INVALID', message, 409);
export function validatePublicContent(raw: unknown) {
  const content = publicContentSchema.parse(raw);
  if (Buffer.byteLength(JSON.stringify(content)) > PUBLIC_CONTENT_MAX_BYTES)
    throw new DomainError(
      'PUBLIC_CONTENT_LIMIT',
      'Content bundle is too large.',
      422,
    );
  if (publicDraftIssues(content).length)
    throw new DomainError(
      'PUBLIC_CONTENT_PRIVACY',
      'Content preflight failed.',
      422,
    );
  const periods = content.snapshot.periods;
  const allKeys = periods.flatMap((p) => [
    p.key,
    ...p.events.map((e) => e.key),
    p.decision.key,
    ...p.decision.options.map((o) => o.key),
  ]);
  if (new Set(allKeys).size !== allKeys.length)
    throw invalid('Duplicate snapshot key.');
  let previous = -1;
  for (const period of periods) {
    if (
      period.startDate > period.endDate ||
      period.events.some(
        (e) =>
          e.effectiveAt < period.startDate || e.effectiveAt > period.endDate,
      ) ||
      (period.decision.selectedOptionKey !== null &&
        !period.decision.options.some(
          (o) => o.key === period.decision.selectedOptionKey,
        ))
    )
      throw invalid('Invalid snapshot dates or choice.');
  }
  for (const rawCheckpoint of content.checkpoints) {
    const checkpoint = validateForkCheckpoint(rawCheckpoint);
    const position = periods.findIndex(
      (p) => p.decision.key === checkpoint.decision.key,
    );
    const period = periods[position];
    if (
      !period ||
      position <= previous ||
      checkpoint.startingState.effectiveAt !== period.endDate ||
      hash(checkpoint.decision) !==
        hash({
          key: period.decision.key,
          prompt: period.decision.prompt,
          options: checkpoint.decision.options.map((option, i) => ({
            ...option,
            ...period.decision.options[i],
          })),
        }) ||
      checkpoint.decision.options.length !== period.decision.options.length
    )
      throw invalid('Checkpoint is not bound to its displayed decision.');
    previous = position;
  }
  return content;
}
export function assemblePublicContent(
  snapshotRaw: PublicSnapshotDraft,
  checkpoints: ForkCheckpoint[],
) {
  const snapshot = publicSnapshotDraftSchema.parse(snapshotRaw);
  const { snapshotKey: _privateSnapshotId, ...publicSnapshot } = snapshot;
  return validatePublicContent({
    schemaVersion: PUBLIC_CONTENT_VERSION,
    contentLocale: 'en',
    snapshot: publicSnapshot,
    checkpoints: [...checkpoints].sort(
      (a, b) =>
        snapshot.periods.findIndex((p) => p.decision.key === a.decision.key) -
        snapshot.periods.findIndex((p) => p.decision.key === b.decision.key),
    ),
    publicationApproved: false,
  });
}
export function preparePublicContentReviewInput(raw: unknown) {
  const content = validatePublicContent(raw);
  const fields: { key: string; path: string }[] = [];
  function visit(value: unknown, path: string) {
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value))
        visit(child, path ? `${path}.${key}` : key);
    } else fields.push({ key: `field-${fields.length + 1}`, path });
  }
  visit(content, '');
  return publicContentReviewInputSchema.parse({
    policyVersion: PUBLIC_CONTENT_REVIEW_VERSION,
    content,
    fields,
  });
}
export function validatePublicContentReviewReport(
  raw: unknown,
  contentRaw: unknown,
) {
  const input = preparePublicContentReviewInput(contentRaw),
    report = publicContentReviewReportSchema.parse(raw);
  const keys = new Set(input.fields.map((f) => f.key));
  if (
    report.contentHash !== hash(input.content) ||
    report.findings.some((f) => !keys.has(f.fieldKey)) ||
    new Set(
      report.findings.map((f) => `${f.fieldKey}:${f.category}:${f.action}`),
    ).size !== report.findings.length ||
    (report.verdict === 'no_findings' && report.findings.length) ||
    (report.verdict === 'review_required' && !report.findings.length)
  )
    throw invalid('Review does not cover this content bundle.');
  return report;
}
