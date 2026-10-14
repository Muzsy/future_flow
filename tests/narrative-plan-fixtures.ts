import { randomUUID } from 'node:crypto';
import {
  narrativeV1Policy,
  type NarrativePlanningResult,
  type NarrativeMemory,
  type NarrativeEditorialReport,
  type NarrativeArtifact,
  type PeriodChapterV2,
  type LifePeriodInput,
} from '@future-flow/contracts';
import { hash, simulatePeriodV2 } from '@future-flow/core';
import {
  narrativeInput,
  narrativePeriod,
  narrativeProfiles,
} from './narrative-fixtures';

export function narrativePlanFixture(source?: LifePeriodInput) {
  const input = source ?? narrativeInput(narrativeProfiles[0]),
    candidate = narrativePeriod(input);
  const canon = simulatePeriodV2(
    candidate,
    input.state,
    input.input.constraints,
    {
      lifeId: input.input.lifeId,
      branchId: input.input.branchId,
      revision: input.revision,
      acceptedDecisionIds: input.acceptedDecisionIds,
    },
  );
  const memory: NarrativeMemory = {
    version: '1.0.0',
    branchId: input.input.branchId,
    baseRevision: input.revision,
    history: [],
    recentChoices: [],
    openThreads: [],
    fictionalActors: [],
    recentDecisionPatterns: [],
    withheld: false,
  };
  const result: NarrativePlanningResult = {
    version: '1.0.0',
    candidate,
    plan: {
      premise:
        'A bounded trial makes the career goal more concrete while leaving the outcome uncertain and the next action open.',
      centralTension:
        'The protagonist must choose between examining a remaining obstacle with less time and practising a different method.',
      scenes: canon.events.map((event, index) => ({
        sceneId: randomUUID(),
        eventIds: [event.id],
        purpose: index === 0 ? 'pressure' : 'turning_point',
        locationRef: null,
        actorIds: [],
        visibleAction:
          'The protagonist examines the concrete observation from the bounded attempt.',
        obstacle:
          'The observation is limited and does not answer the whole career question.',
        shift:
          'The question becomes a specific tradeoff between two bounded follow-ups.',
        dialogueIntent: null,
      })),
      turningPointEventId: canon.events[1]!.id,
      choiceConsequences: [],
      decisionStakes: candidate.events[1]!.decision!.options.map((option) => ({
        optionId: option.id,
        eventIds: [canon.events[1]!.id],
        cost: 'The experiment still consumes limited time and attention.',
        possibleGain:
          'It could reveal a practical obstacle or a transferable method.',
        uncertainty:
          'The next result remains uncertain until a new period records it.',
      })),
      decisionPattern: 'refine_trial_or_change_method',
      memoryDelta: {
        periodSummary:
          'A bounded trial produces an observation and leaves a smaller follow-up or different method as the unresolved next choice.',
        salientEventIds: [canon.events[0]!.id],
        threadUpdates: [],
        actorUpdates: [],
        decisionPattern: 'refine_trial_or_change_method',
      },
    },
  };
  return { input, candidate, canon, memory, result };
}
export function narrativeEditorialFixture(): NarrativeEditorialReport {
  return {
    version: '1.0.0',
    scores: {
      causality: 4,
      momentum: 4,
      sceneCraft: 4,
      character: 4,
      personalization: 4,
      choiceStakes: 4,
      novelty: 4,
      prose: 4,
    },
    issues: [],
    verdict: 'pass',
  };
}
export function longNarrativeChapterFixture(
  fixture: ReturnType<typeof narrativePlanFixture>,
  words = 700,
): PeriodChapterV2 {
  return {
    title: 'Word-range test fixture',
    body: Array.from({ length: words }, () => 'scene').join(' '),
    eventIds: fixture.canon.events.map((event) => event.id),
    decisionId: fixture.canon.events.at(-1)!.decision!.id,
  };
}
export function narrativeArtifactFixture(
  fixture = narrativePlanFixture(),
): NarrativeArtifact {
  const policy = narrativeV1Policy(),
    report = narrativeEditorialFixture(),
    chapter = longNarrativeChapterFixture(fixture);
  const bindings = {
    policyHash: hash(policy),
    memoryHash: hash(fixture.memory),
    candidateHash: hash(fixture.candidate),
    canonHash: hash(fixture.canon.events),
    planHash: hash(fixture.result.plan),
    planningOutputHash: hash(fixture.result),
    storyInputHash: hash('synthetic story input'),
    chapterHash: hash(chapter),
    fidelityInputHash: hash('synthetic fidelity input'),
    fidelityOutputHash: hash({ valid: true, issues: [] }),
    editorialInputHash: hash('synthetic editor input'),
  };
  return {
    version: '1.0.0',
    pipelineVersion: 'narrative-v1',
    policy,
    validatedPlan: fixture.result.plan,
    validatedMemoryDelta: structuredClone(fixture.result.plan.memoryDelta),
    editorialReport: report,
    bindings,
    provenance: {
      promptVersions: policy.promptVersions,
      receiptRefs: [
        {
          task: 'life_narrative_plan',
          ordinal: 0,
          inputHash: hash(fixture.input),
          outputHash: bindings.planningOutputHash,
          model: 'offline-fixture',
        },
        {
          task: 'life_narrative_chapter',
          ordinal: 1,
          inputHash: bindings.storyInputHash,
          outputHash: bindings.chapterHash,
          model: 'offline-fixture',
        },
        {
          task: 'life_fidelity',
          ordinal: 2,
          inputHash: bindings.fidelityInputHash,
          outputHash: bindings.fidelityOutputHash,
          model: 'offline-fixture',
        },
        {
          task: 'life_narrative_editor',
          ordinal: 3,
          inputHash: bindings.editorialInputHash,
          outputHash: hash(report),
          model: 'offline-fixture',
        },
      ],
    },
  };
}
