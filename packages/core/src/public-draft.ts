import { randomUUID } from 'node:crypto';
import {
  publicPreviewCopySchema,
  publicSnapshotDraftSchema,
  type PublicSnapshotDraft,
  type LifeInputV2,
  type PeriodCandidateV2,
  type PeriodChapterV2,
} from '@future-flow/contracts';
import { DomainError } from './errors';

export type SnapshotSourcePeriod = {
  candidate: PeriodCandidateV2;
  chapter: PeriodChapterV2;
};
export const PUBLIC_SCAN_VERSION = 'deterministic-preview-v1';
// This is a preflight, never an approval or a claim of anonymity.
export function publicDraftIssues(
  value: unknown,
  privateLabels: string[] = [],
) {
  const text = JSON.stringify(value).normalize('NFKC');
  const issues = new Set<string>();
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text))
    issues.add('email');
  if (/(?:https?:\/\/|www\.)/i.test(text)) issues.add('link');
  if (/(?<!\d)(?:\+\d[\d ()-]{7,}\d|\d{9,})(?!\d)/.test(text))
    issues.add('phone_or_identifier');
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(
      text,
    )
  )
    issues.add('internal_reference');
  const lower = text.toLocaleLowerCase('en');
  for (const raw of privateLabels) {
    const label = raw.normalize('NFKC').trim().toLocaleLowerCase('en');
    if (label.length >= 3 && lower.includes(label)) issues.add('private_label');
  }
  return [...issues].sort();
}
export function preparePublicSnapshotDraft(
  input: LifeInputV2,
  periods: SnapshotSourcePeriod[],
  choices: { decision_id: string; option_id: string }[],
  rawCopy: unknown,
): PublicSnapshotDraft {
  const copy = publicPreviewCopySchema.parse(rawCopy);
  if (periods.length !== copy.periods.length || periods.length < 1)
    throw new DomainError(
      'PUBLIC_PREVIEW_INVALID',
      'Period count does not match.',
    );
  const labels = [
    input.identity.label,
    input.initialState.employment.employerLabel,
    input.initialState.location.region,
    input.initialState.location.housing,
    ...input.initialState.actors.map((a) => a.label),
    ...input.initialState.ownedAssets.map((a) => a.label),
  ];
  // New actors/employers may appear after onboarding; scan their canon changes as well.
  for (const p of periods)
    for (const e of p.candidate.events) {
      for (const c of [
        ...e.changes,
        ...(e.decision?.options.flatMap((o) => o.changes) ?? []),
      ]) {
        if (c.type === 'actor_add' || c.type === 'asset_add')
          labels.push(c.value.label);
        if (c.type === 'employment_set') labels.push(c.value.employerLabel);
        if (c.type === 'location_set')
          labels.push(c.value.region, c.value.housing);
      }
    }
  const issues = publicDraftIssues(
    copy,
    labels.filter((s): s is string => !!s),
  );
  if (issues.length)
    throw new DomainError(
      'PUBLIC_PRIVACY_REVIEW_REQUIRED',
      'Copy failed the privacy preflight.',
      422,
    );
  let eventNo = 0,
    optionNo = 0;
  const projected = periods.map((p, i) => {
    const text = copy.periods[i]!;
    const source = p.candidate.events.at(-1)?.decision;
    if (
      !source ||
      source.options.length !== text.decision.options.length ||
      p.candidate.events.length !== text.events.length
    )
      throw new DomainError(
        'PUBLIC_PREVIEW_INVALID',
        'Event or option count does not match.',
      );
    const choice = choices.find((c) => c.decision_id === source.id);
    if (choice && !source.options.some((o) => o.id === choice.option_id))
      throw new DomainError(
        'PUBLIC_PREVIEW_INVALID',
        'Choice is not from this decision.',
      );
    const options = source.options.map((o, n) => ({
      key: `option-${++optionNo}`,
      ...text.decision.options[n]!,
    }));
    return {
      key: `period-${i + 1}`,
      startDate: p.candidate.startDate,
      endDate: p.candidate.endDate,
      chapter: text.chapter,
      events: p.candidate.events.map((e, n) => ({
        key: `event-${++eventNo}`,
        effectiveAt: e.effectiveAt,
        ...text.events[n]!,
      })),
      decision: {
        key: `decision-${i + 1}`,
        prompt: text.decision.prompt,
        options,
        selectedOptionKey: choice
          ? options[source.options.findIndex((o) => o.id === choice.option_id)]!
              .key
          : null,
      },
    };
  });
  const userEdited = copy.periods.some((p, i) => {
    const original = periods[i]!,
      d = original.candidate.events.at(-1)!.decision!;
    return (
      p.chapter.title !== original.chapter.title ||
      p.chapter.body !== original.chapter.body ||
      p.events.some(
        (e, n) =>
          e.title !== original.candidate.events[n]!.title ||
          e.summary !== original.candidate.events[n]!.summary,
      ) ||
      p.decision.prompt !== d.prompt ||
      p.decision.options.some(
        (o, n) =>
          o.label !== d.options[n]!.label ||
          o.description !== d.options[n]!.description,
      )
    );
  });
  return publicSnapshotDraftSchema.parse({
    schemaVersion: '1.0.0',
    snapshotKey: randomUUID(),
    locale: input.locale,
    title: copy.title,
    summary: copy.summary,
    category: copy.category,
    origin: { aiGenerated: true, userEdited, classification: 'unreviewed' },
    profile: {
      ageBand: input.identity.ageBand,
      country: input.initialState.location.country,
      employmentStatus: input.initialState.employment.status,
    },
    goal: {
      category: input.goals.find((g) => g.priority === 'primary')!.category,
      description: copy.goalDescription,
    },
    periods: projected,
    startingPoint: {
      effectiveAt: input.initialState.effectiveAt,
      country: input.initialState.location.country,
      employmentStatus: input.initialState.employment.status,
      goalCategory: input.goals.find((g) => g.priority === 'primary')!.category,
      readyForFork: false,
    },
  });
}
