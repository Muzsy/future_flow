import {
  localeSchema,
  narrativeV1ContextSchema,
  narrativePlanSchema,
  narrativePlanningResultSchema,
  NARRATIVE_MEMORY_BYTES,
  type NarrativeV1Context,
  type NarrativePlan,
  type NarrativeEditorialReport,
  type NarrativePlanningResult,
  type LifePeriodInput,
  type PeriodChapterV2,
  type Locale,
} from '@future-flow/contracts';
import { DomainError } from './errors';
import { validatePersonalSharedMemories } from './shared-personal';
import type { CanonEventV2 } from './life-v2';

export type NarrativePlanningInput = LifePeriodInput & {
  narrativeContext: NarrativeV1Context;
};
export type NarrativeStoryInput = {
  locale: Locale;
  identity: LifePeriodInput['input']['identity'];
  goals: LifePeriodInput['input']['goals'];
  events: CanonEventV2[];
  sharedEvents?: LifePeriodInput['memory']['sharedEvents'];
  narrativeContext: NarrativeV1Context;
  plan: NarrativePlan;
};
export type NarrativeRepairFeedback = {
  kind: 'chapter' | 'fidelity' | 'editorial';
  message: string;
  issues?: NarrativeEditorialReport['issues'];
};
function context(raw: unknown) {
  const parsed = narrativeV1ContextSchema.safeParse(raw);
  if (
    !parsed.success ||
    Buffer.byteLength(JSON.stringify(parsed.data.memory), 'utf8') >
      NARRATIVE_MEMORY_BYTES
  )
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Narrative context is invalid or too large.',
    );
  return parsed.data;
}
export function narrativePlannerRequest(
  input: NarrativePlanningInput,
  repair?: string,
) {
  const narrativeContext = context(input.narrativeContext);
  if (
    narrativeContext.memory.branchId !== input.input.branchId ||
    narrativeContext.memory.baseRevision !== input.revision ||
    narrativeContext.memory.history.some(
      (period) => period.endDate > input.startDate,
    ) ||
    narrativeContext.memory.recentChoices.some(
      (choice) => !input.acceptedDecisionIds.includes(choice.decisionId),
    )
  )
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Narrative planning scope differs.',
    );
  validatePersonalSharedMemories(input.memory.sharedEvents, input.startDate);
  // Explicit projection: server reference inventories and accidental extra fields
  // must never turn into additional model context.
  return {
    input: input.input,
    state: input.state,
    revision: input.revision,
    periodId: input.periodId,
    startDate: input.startDate,
    endDate: input.endDate,
    durationMonths: input.durationMonths,
    acceptedDecisionIds: input.acceptedDecisionIds,
    memory: {
      recentEvents: narrativeContext.memory.withheld
        ? []
        : input.memory.recentEvents,
      choices: narrativeContext.memory.withheld ? [] : input.memory.choices,
      ...(input.memory.sharedEvents
        ? { sharedEvents: input.memory.sharedEvents }
        : {}),
    },
    narrativeContext,
    repair: repair ?? null,
  };
}
export function narrativePlanReviewRequest(
  input: NarrativePlanningInput,
  result: NarrativePlanningResult,
) {
  const { repair: _repair, ...projected } = narrativePlannerRequest(input);
  return {
    ...projected,
    proposed: narrativePlanningResultSchema.parse(result),
  };
}
function story(input: NarrativeStoryInput) {
  const narrativeContext = context(input.narrativeContext);
  validatePersonalSharedMemories(
    input.sharedEvents,
    input.events[0]?.effectiveAt ?? '',
  );
  return {
    locale: localeSchema.parse(input.locale),
    identity: input.identity,
    goals: input.goals,
    events: input.events,
    ...(input.sharedEvents ? { sharedEvents: input.sharedEvents } : {}),
    narrativeContext,
    plan: narrativePlanSchema.parse(input.plan),
  };
}
export function narrativeWriterRequest(
  input: NarrativeStoryInput,
  repair?: NarrativeRepairFeedback,
) {
  return { ...story(input), repair: repair ?? null };
}
export function narrativeFidelityRequest(
  input: NarrativeStoryInput,
  chapter: PeriodChapterV2,
) {
  return { ...story(input), chapter };
}
export function narrativeEditorialRequest(
  input: NarrativeStoryInput,
  chapter: PeriodChapterV2,
) {
  return {
    ...story(input),
    chapter,
    qualityPolicyVersion: input.narrativeContext.policy.qualityPolicyVersion,
    paragraphs: chapter.body
      .split(/\n\s*\n/)
      .filter((part) => part.trim())
      .map((text, index) => ({ index: index + 1, text })),
  };
}
