import { randomUUID } from 'node:crypto';
import {
  fictionV3Policy,
  fictionSequenceSignatureSchema,
  fictionSequenceSignatureV11Schema,
  fictionHumanEditorialSchema,
  fictionHumanEditorialV13Schema,
  fictionSequenceEditorialSchema,
  fictionEditorialVersionFor,
  fictionContextSchema,
  fictionCharacterQualityVersions,
  FICTION_CHARACTER_VERSION,
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
      policy: sourceContext?.policy ?? fictionV3Policy(),
      memory: f.memory,
      ...(sourceContext?.sequenceHistory
        ? { sequenceHistory: sourceContext.sequenceHistory }
        : {}),
      ...(sourceContext?.sequenceSignatureHistory
        ? { sequenceSignatureHistory: sourceContext.sequenceSignatureHistory }
        : {}),
      ...(sourceContext?.seriesLedger
        ? { seriesLedger: sourceContext.seriesLedger }
        : {}),
      ...(sourceContext?.characterProjection
        ? { characterProjection: sourceContext.characterProjection }
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
    ...(source?.fictionCharacters
      ? { fictionCharacters: source.fictionCharacters }
      : {}),
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
  const editorialVersion = fictionEditorialVersionFor(
    sourceContext?.policy.qualityPolicyVersion ?? '',
  ) as '1.0.0' | '1.1.0' | '1.2.0' | '1.3.0';
  const human = editorialVersion === '1.2.0' || editorialVersion === '1.3.0';
  // New author fiction need not occur in the draft.
  authored.candidate.events[0]!.summary =
    'A blue glove beside a parcel makes the drawing look like an unclaimed delivery; a visitor misunderstands the intended direction.';
  authored.plan.memoryDelta.periodSummary =
    'A visitor mistakes the glove drawing for a parcel collection. The misunderstood direction becomes a concrete choice about making the next image clearer.';
  // Living-world generation: the draft carries an (empty) intent and the final
  // package a delta that adds one profile per new recurring actor.
  const living = fictionCharacterQualityVersions.includes(
    sourceContext?.policy.qualityPolicyVersion ?? '',
  );
  const draft = living
    ? { ...f.result, characterIntent: [] as never[] }
    : f.result;
  if (living)
    (
      authored as FictionAuthorResult & { characterDelta: unknown }
    ).characterDelta = fictionFixtureCharacterDelta(input.periodId, authored);
  return {
    ...f,
    input,
    draft,
    authored,
    review: narrativePlanReadinessFixture() as Extract<
      NarrativePlanReview,
      { version: '1.1.0' }
    >,
    fidelity: { valid: true, issues: [] },
    editor: fictionFixtureEditorial({
      ...narrativeEditorialFixture(),
      version: human ? editorialVersion : ('1.1.0' as const),
      ...(human
        ? {
            sequenceSignature: fictionSignatureFixture(
              input.periodId,
              editorialVersion === '1.3.0' ? '1.1.0' : '1.0.0',
            ),
          }
        : {}),
      sequenceReview: {
        comparedPeriodIds: [
          ...new Set([
            ...(sourceContext?.sequenceHistory ?? []).map((p) => p.periodId),
            ...(sourceContext?.sequenceSignatureHistory ?? []).map(
              (p) => p.periodId,
            ),
          ]),
        ],
        ...(human
          ? {
              distinctRhetoricalShape: true,
              systemMechanicsInvisible: true,
              behavioralVariety: true,
            }
          : {}),
        distinctDramaticStructure: true,
        distinctEnding: true,
        independentProgression: true,
        characterAgency: true,
        evidence:
          'A concrete misunderstanding leads to a changed response with independent protagonist action.',
      },
    }),
  };
}
function fictionFixtureEditorial(raw: unknown) {
  const version = (raw as { version: string }).version;
  return version === '1.3.0'
    ? fictionHumanEditorialV13Schema.parse(raw)
    : version === '1.2.0'
      ? fictionHumanEditorialSchema.parse(raw)
      : fictionSequenceEditorialSchema.parse(raw);
}
export function fictionReceipt(
  task: string,
  key: keyof ReturnType<typeof fictionV3Policy>['promptVersions'],
  input: unknown,
  output: unknown,
  policy = fictionV3Policy(),
) {
  return {
    task,
    promptVersion: `${policy.promptVersions[key]}.en`,
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
      f.input.narrativeContext!.policy as ReturnType<typeof fictionV3Policy>,
    ),
    fictionReceipt(
      'life_narrative_chapter',
      'writer',
      fictionAuthorRequest(f.input, f.draft, repair),
      f.authored,
      f.input.narrativeContext!.policy as ReturnType<typeof fictionV3Policy>,
    ),
    fictionReceipt(
      'life_narrative_plan_review',
      'planReviewer',
      fictionReviewRequest(f.input, f.authored),
      f.review,
      f.input.narrativeContext!.policy as ReturnType<typeof fictionV3Policy>,
    ),
    fictionReceipt(
      'life_fidelity',
      'fidelity',
      fictionFidelityRequest(f.input, f.authored),
      f.fidelity,
      f.input.narrativeContext!.policy as ReturnType<typeof fictionV3Policy>,
    ),
    fictionReceipt(
      'life_narrative_editor',
      'editor',
      fictionEditorialRequest(f.input, f.authored),
      f.editor,
      f.input.narrativeContext!.policy as ReturnType<typeof fictionV3Policy>,
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

export function fictionSignatureFixture(
  periodId: string,
  version: '1.0.0' | '1.1.0' = '1.0.0',
) {
  return (
    version === '1.1.0'
      ? fictionSequenceSignatureV11Schema
      : fictionSequenceSignatureSchema
  ).parse({
    version,
    periodId,
    dramaticEngine: 'discovery',
    turningPointDriver: 'protagonist',
    resolutionMode: 'consequence',
    endingMode: 'action_in_progress',
    protagonistResponse: 'no_correction_arc',
    rhetoricalFlags: ['none'],
    systemLeakageFlags: ['none'],
  });
}

// A valid v9 delta for a fixture package: one profile per introduced actor.
export function fictionFixtureCharacterDelta(
  periodId: string,
  authored: FictionAuthorResult,
) {
  const introduced = authored.candidate.events.flatMap((event) =>
    event.changes.flatMap((change) =>
      change.type === 'actor_add'
        ? [{ actorId: change.value.id, eventId: event.id }]
        : [],
    ),
  );
  return {
    version: FICTION_CHARACTER_VERSION,
    addedProfiles: introduced.map(({ actorId, eventId }) => ({
      actorId,
      originEventId: eventId,
      socialRole: 'Neighbour who keeps their own hours',
      coreWant: 'Wants a quiet routine that is not disturbed.',
      independentConcern: 'Keeping an ageing relative comfortable at home.',
      conflictStyle: 'Says little, then states one firm condition.',
      attentionStyle: 'Notices practical details before intentions.',
      valueCue: ['reliability'],
      voiceCue: 'Short, plain sentences.',
      establishedAtPeriodId: periodId,
    })),
    profileUpdates: [],
    dynamicUpdates: [],
    relationshipUpdates: [],
    removedActorIds: [],
  };
}
