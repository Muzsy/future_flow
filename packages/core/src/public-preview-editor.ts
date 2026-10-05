import {
  publicEditorSourceSchema,
  type LifeInputV2,
  type PublicPreviewCopy,
} from '@future-flow/contracts';
import { DomainError } from './errors';
import type { SnapshotSourcePeriod } from './public-draft';

export function preparePublicEditorSource(
  input: LifeInputV2,
  periods: SnapshotSourcePeriod[],
  sourceRevision: number,
) {
  if (input.locale !== 'en')
    throw new DomainError(
      'CONTENT_LANGUAGE_UNAVAILABLE',
      'Only English is enabled.',
      404,
    );
  if (periods.length < 1 || periods.length > 12)
    throw new DomainError(
      'PUBLIC_PREVIEW_PERIOD_LIMIT',
      'Use a life with 1–12 completed periods.',
      409,
    );
  const goal = input.goals.find((g) => g.priority === 'primary')!;
  const category: PublicPreviewCopy['category'] =
    goal.category === 'finance'
      ? 'money'
      : goal.category === 'other'
        ? 'fictional'
        : goal.category;
  return publicEditorSourceSchema.parse({
    schemaVersion: 'public-editor-1',
    sourceRevision,
    copy: {
      title: periods[0]!.chapter.title,
      summary: periods[0]!.candidate.events[0]!.summary,
      category,
      goalDescription: goal.description,
      periods: periods.map((p) => {
        const decision = p.candidate.events.at(-1)?.decision;
        if (!decision)
          throw new DomainError(
            'PUBLIC_PREVIEW_INVALID',
            'Source decision is missing.',
            409,
          );
        return {
          chapter: { title: p.chapter.title, body: p.chapter.body },
          events: p.candidate.events.map((e) => ({
            title: e.title,
            summary: e.summary,
          })),
          decision: {
            prompt: decision.prompt,
            options: decision.options.map((o) => ({
              label: o.label,
              description: o.description,
            })),
          },
        };
      }),
    },
    profile: {
      ageBand: input.identity.ageBand,
      country: input.initialState.location.country,
      employmentStatus: input.initialState.employment.status,
    },
    goalCategory: goal.category,
    periods: periods.map((p) => ({
      startDate: p.candidate.startDate,
      endDate: p.candidate.endDate,
    })),
  });
}
