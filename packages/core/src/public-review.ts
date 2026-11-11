import {
  PUBLIC_REVIEW_VERSION,
  publicReviewInputSchema,
  publicReviewReportSchema,
  publicSnapshotDraftSchema,
  type PublicReviewInput,
  type PublicReviewReport,
} from '@future-flow/contracts';
import { DomainError } from './errors';
import { publicDraftIssues } from './public-draft';

export function preparePublicReviewInput(raw: unknown): PublicReviewInput {
  const snapshot = publicSnapshotDraftSchema.parse(raw);
  if (snapshot.locale !== 'en')
    throw new DomainError(
      'CONTENT_LANGUAGE_UNAVAILABLE',
      'Only English is enabled.',
      409,
    );
  const fields: PublicReviewInput['fields'] = [];
  const add = (path: string, text: string) =>
    fields.push({ key: `field-${fields.length + 1}`, path, text });
  add('title', snapshot.title);
  add('summary', snapshot.summary);
  add('goal.description', snapshot.goal.description);
  for (const p of snapshot.periods) {
    add(`${p.key}.chapter.title`, p.chapter.title);
    add(`${p.key}.chapter.body`, p.chapter.body);
    for (const e of p.events) {
      add(`${p.key}.${e.key}.title`, e.title);
      add(`${p.key}.${e.key}.summary`, e.summary);
    }
    add(`${p.key}.decision.prompt`, p.decision.prompt);
    for (const o of p.decision.options) {
      add(`${p.key}.${o.key}.label`, o.label);
      add(`${p.key}.${o.key}.description`, o.description);
    }
  }
  return validatePublicReviewInput({
    policyVersion: PUBLIC_REVIEW_VERSION,
    locale: 'en',
    fields,
  });
}

export function validatePublicReviewInput(raw: unknown): PublicReviewInput {
  const input = publicReviewInputSchema.parse(raw);
  // Bound the whole request as well as each individual field. Do not truncate a privacy scan.
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > 70000)
    throw new DomainError(
      'PUBLIC_REVIEW_TOO_LARGE',
      'Prepare a shorter preview.',
      422,
    );
  if (publicDraftIssues(input).length)
    throw new DomainError(
      'PUBLIC_PRIVACY_REVIEW_REQUIRED',
      'Copy failed privacy preflight.',
      422,
    );
  if (new Set(input.fields.map((f) => f.key)).size !== input.fields.length)
    throw new DomainError(
      'PUBLIC_REVIEW_INVALID',
      'Review fields must be unique.',
      422,
    );
  return input;
}

export function validatePublicReview(
  input: PublicReviewInput,
  raw: unknown,
): PublicReviewReport {
  const parsed = validatePublicReviewInput(input);
  const report = publicReviewReportSchema.parse(raw);
  const keys = new Set(parsed.fields.map((f) => f.key));
  const findings = new Set<string>();
  for (const f of report.findings) {
    const key = `${f.fieldKey}:${f.category}`;
    if (!keys.has(f.fieldKey) || findings.has(key))
      throw new DomainError(
        'PUBLIC_REVIEW_INVALID',
        'Invalid review references.',
        422,
      );
    findings.add(key);
  }
  if (
    (report.verdict === 'no_findings' && report.findings.length !== 0) ||
    (report.verdict === 'review_required' && report.findings.length === 0)
  )
    throw new DomainError(
      'PUBLIC_REVIEW_INVALID',
      'Review verdict conflicts with findings.',
      422,
    );
  return report;
}
