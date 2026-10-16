import { randomUUID } from 'node:crypto';
import {
  fictionPolicy,
  fictionContextSchema,
  type NarrativePeriodInput,
  type FictionAuthorResult,
  type NarrativePlanReview,
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
  const sourceContext =
    source?.narrativeContext?.policy.mode === 'narrative-fiction-v2'
      ? fictionContextSchema.parse(source.narrativeContext)
      : null;
  const input: NarrativePeriodInput = {
    ...f.input,
    narrativeContext: {
      policy: fictionPolicy(),
      memory: f.memory,
      ...(sourceContext?.sequenceHistory
        ? { sequenceHistory: sourceContext.sequenceHistory }
        : {}),
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
    review: narrativePlanReadinessFixture() as Extract<
      NarrativePlanReview,
      { version: '1.1.0' }
    >,
    fidelity: { valid: true, issues: [] },
    editor: {
      ...narrativeEditorialFixture(),
      version: '1.1.0' as const,
      sequenceReview: {
        comparedPeriodIds: (sourceContext?.sequenceHistory ?? []).map(
          (p) => p.periodId,
        ),
        distinctDramaticStructure: true,
        distinctEnding: true,
        independentProgression: true,
        characterAgency: true,
        evidence:
          'A concrete misunderstanding leads to a changed response with independent protagonist action.',
      },
    },
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

// All individual fields fit their contracts; combined persisted metadata is
// deliberately oversized to exercise package compaction rather than prose repair.
export function bulkyFictionFixture(f = fictionFixture()) {
  const b = structuredClone(f),
    p = b.authored.plan,
    e = b.authored.candidate.events[0]!.id;
  p.premise = 'A'.repeat(400);
  p.centralTension = 'B'.repeat(400);
  for (const scene of p.scenes) {
    scene.visibleAction = 'A'.repeat(300);
    scene.obstacle = 'B'.repeat(300);
    scene.shift = 'C'.repeat(300);
    scene.locationRef = 'L'.repeat(200);
    scene.dialogueIntent = 'D'.repeat(200);
  }
  for (const stake of p.decisionStakes) {
    stake.cost = 'C'.repeat(200);
    stake.possibleGain = 'G'.repeat(200);
    stake.uncertainty = 'U'.repeat(200);
  }
  p.memoryDelta.periodSummary = 'S'.repeat(500);
  p.memoryDelta.threadUpdates = Array.from({ length: 6 }, () => ({
    id: randomUUID(),
    originPeriodId: b.authored.candidate.periodId,
    originEventId: e,
    kind: 'goal' as const,
    summary: 'T'.repeat(300),
    status: 'open' as const,
    dueByPeriodOffset: 2 as const,
    lastTouchedPeriodId: b.authored.candidate.periodId,
    eventRefs: [e],
  }));
  b.authored.storyFacts = Array.from({ length: 12 }, () => ({
    ...b.authored.storyFacts[0]!,
    id: randomUUID(),
    assertion: 'F'.repeat(300),
  }));
  b.review.issues = Array.from({ length: 6 }, () => ({
    dimension: 'causality' as const,
    severity: 'minor' as const,
    eventIds: [e],
    explanation: 'E'.repeat(350),
    suggestedFix: 'R'.repeat(350),
  }));
  b.editor.issues = Array.from({ length: 8 }, () => ({
    dimension: 'prose' as const,
    severity: 'minor' as const,
    repairScope: 'prose' as const,
    eventIds: [e],
    paragraphIndex: null,
    explanation: 'E'.repeat(350),
    suggestedFix: 'R'.repeat(350),
  }));
  return b;
}
