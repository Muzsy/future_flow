import {
  SCENARIO_REVIEW_VERSION,
  scenarioReviewInputSchema,
  scenarioReviewReportSchema,
} from '@future-flow/contracts';
import { validateScenarioTemplate } from './public-scenarios';
import { DomainError } from './errors';
import { hash } from './index';

export function prepareScenarioReviewInput(raw: unknown) {
  const template = validateScenarioTemplate(raw);
  const fields: { key: string; path: string }[] = [];
  function visit(value: unknown, path: string) {
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value))
        visit(child, path ? `${path}.${key}` : key);
    } else fields.push({ key: `field-${fields.length + 1}`, path });
  }
  visit(template, '');
  const input = scenarioReviewInputSchema.parse({
    policyVersion: SCENARIO_REVIEW_VERSION,
    template,
    fields,
  });
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > 60000)
    throw new DomainError(
      'SCENARIO_REVIEW_LIMIT',
      'The complete template is too large for review.',
      422,
    );
  return input;
}
export function validateScenarioReviewReport(raw: unknown, template: unknown) {
  const input = prepareScenarioReviewInput(template),
    report = scenarioReviewReportSchema.parse(raw);
  const keys = new Set(input.fields.map((f) => f.key));
  if (
    report.templateHash !== hash(input.template) ||
    report.findings.some((f) => !keys.has(f.fieldKey)) ||
    new Set(report.findings.map((f) => `${f.fieldKey}:${f.category}`)).size !==
      report.findings.length ||
    (report.verdict === 'no_findings' && report.findings.length !== 0) ||
    (report.verdict === 'review_required' && report.findings.length === 0)
  )
    throw new DomainError(
      'SCENARIO_REVIEW_INVALID',
      'Review does not cover this exact complete template.',
      409,
    );
  return report;
}
