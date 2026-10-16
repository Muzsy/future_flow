import { randomUUID } from 'node:crypto';
import {
  fictionPolicy,
  fictionContextSchema,
  type NarrativePeriodInput,
  type FictionAuthorResult,
} from '@future-flow/contracts';
import {
  narrativeReferenceSnapshot,
  narrativeReferencesFromMemory,
  hash,
  fictionPlannerRequest,
  fictionAuthorRequest,
  fictionReviewRequest,
  fictionFidelityRequest,
  fictionEditorialRequest,
  type FictionRepair,
} from '@future-flow/core';
import {
  narrativePlanFixture,
  longNarrativeChapterFixture,
  narrativePlanReadinessFixture,
  narrativeEditorialFixture,
} from './narrative-plan-fixtures';

export function fictionFixture(source?: NarrativePeriodInput) {
  const f = narrativePlanFixture(source);
  const input: NarrativePeriodInput = {
    ...f.input,
    narrativeContext: {
      policy: fictionPolicy(),
      memory: f.memory,
      storyFacts:
        source?.narrativeContext?.policy.mode === 'narrative-fiction-v2'
          ? fictionContextSchema.parse(source.narrativeContext).storyFacts
          : [],
    },
    narrativeReferences:
      source?.narrativeReferences ??
      narrativeReferenceSnapshot(narrativeReferencesFromMemory(f.memory)),
    fictionReferences: source?.fictionReferences ?? { facts: [] },
  };
  const authored: FictionAuthorResult = {
    version: '2.0.0',
    candidate: structuredClone(f.result.candidate),
    plan: structuredClone(f.result.plan),
    storyFacts: [
      {
        id: randomUUID(),
        introducedByEventId: f.candidate.events[0]!.id,
        aboutActorIds: [],
        kind: 'artifact',
        assertion:
          'The drawing depicts a misplaced blue glove beside an unclaimed parcel.',
        supersedesFactId: null,
        relevance: 'continuity',
      },
    ],
    chapter: longNarrativeChapterFixture(f),
  };
  // New author fiction need not occur in the draft.
  authored.candidate.events[0]!.summary =
    'A blue glove beside a parcel makes the drawing look like an unclaimed delivery; a visitor misunderstands the intended direction.';
  authored.plan.memoryDelta.periodSummary =
    'A visitor mistakes the glove drawing for a parcel collection. The misunderstood direction becomes a concrete choice about making the next image clearer.';
  return {
    ...f,
    input,
    draft: f.result,
    authored,
    review: narrativePlanReadinessFixture(),
    fidelity: { valid: true, issues: [] },
    editor: narrativeEditorialFixture(),
  };
}
export function fictionReceipt(
  task: string,
  key: keyof ReturnType<typeof fictionPolicy>['promptVersions'],
  input: unknown,
  output: unknown,
) {
  return {
    task,
    promptVersion: `${fictionPolicy().promptVersions[key]}.en`,
    model: 'gpt-6.1-sol',
    inputHash: hash(input),
    outputHash: hash(output),
    locale: 'en' as const,
    requestId: null,
    inputTokens: 1,
    outputTokens: 1,
    latencyMs: 0,
  };
}
export function fictionProof(f = fictionFixture(), repair?: FictionRepair) {
  return [
    fictionReceipt(
      'life_narrative_plan',
      'planner',
      fictionPlannerRequest(f.input),
      f.draft,
    ),
    fictionReceipt(
      'life_narrative_chapter',
      'writer',
      fictionAuthorRequest(f.input, f.draft, repair),
      f.authored,
    ),
    fictionReceipt(
      'life_narrative_plan_review',
      'planReviewer',
      fictionReviewRequest(f.input, f.authored),
      f.review,
    ),
    fictionReceipt(
      'life_fidelity',
      'fidelity',
      fictionFidelityRequest(f.input, f.authored),
      f.fidelity,
    ),
    fictionReceipt(
      'life_narrative_editor',
      'editor',
      fictionEditorialRequest(f.input, f.authored),
      f.editor,
    ),
  ];
}
