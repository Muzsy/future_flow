import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  narrativePlanningResultSchema,
  narrativeContextSchema,
  narrativeMemorySchema,
  narrativeV1Policy,
  narrativeEditorialReportSchema,
  contextNarrativePolicy,
} from '@future-flow/contracts';
import {
  simulatePeriodV2,
  validateNarrativePlan,
  narrativeReferencesFromMemory,
  validateNarrativeChapterV1,
  validatePeriodChapterV2,
} from '@future-flow/core';
import {
  narrativePlanFixture,
  longNarrativeChapterFixture,
} from './narrative-plan-fixtures';

describe('strict narrative plan contracts', () => {
  it('never grants supplied or Shared identities fictional provenance', () => {
    const f = narrativePlanFixture(),
      actorId = randomUUID();
    f.input.state.actors.push({
      id: actorId,
      label: 'Supplied person placeholder',
      relationship: 'friend',
    });
    f.candidate.events[0]!.actorIds = [actorId];
    const canon = simulatePeriodV2(
      f.candidate,
      f.input.state,
      f.input.input.constraints,
      {
        lifeId: f.input.input.lifeId,
        branchId: f.input.input.branchId,
        revision: 0,
        acceptedDecisionIds: [],
      },
    );
    f.result.plan.memoryDelta.actorUpdates = [
      {
        actorId,
        introducedByEventId: f.candidate.events[0]!.id,
        role: 'A fabricated fictional role for a supplied person',
        desire: 'A fabricated private desire that must not be inferred.',
        resistance: 'A fabricated secret that the user did not provide.',
        voiceCue: 'A fabricated private voice that must not be invented.',
        lastSeenPeriodId: f.candidate.periodId,
      },
    ];
    expect(() => validateNarrativePlan(f.result, canon, f.memory)).toThrow(
      'fictional provenance',
    );
    const fresh = narrativePlanFixture();
    const sharedId = randomUUID();
    fresh.candidate.events[0]!.changes.push({
      type: 'actor_add',
      value: {
        id: sharedId,
        label: 'Synthetic Shared identity',
        relationship: 'friend',
      },
    });
    const sharedCanon = simulatePeriodV2(
      fresh.candidate,
      fresh.input.state,
      fresh.input.input.constraints,
      {
        lifeId: fresh.input.input.lifeId,
        branchId: fresh.input.input.branchId,
        revision: 0,
        acceptedDecisionIds: [],
      },
    );
    const refs = {
      ...narrativeReferencesFromMemory(fresh.memory),
      forbiddenActorIds: new Set([sharedId]),
    };
    expect(() =>
      validateNarrativePlan(fresh.result, sharedCanon, fresh.memory, refs),
    ).toThrow('Shared identity');
  });
  it('accepts a plan bound to the existing simulated V2 candidate', () => {
    const f = narrativePlanFixture();
    expect(validateNarrativePlan(f.result, f.canon, f.memory)).toEqual(
      f.result,
    );
    expect(narrativeV1Policy().maxPhysicalRequests).toBe(7);
  });
  it('rejects extra fields instead of treating them as state patches', () => {
    const f = narrativePlanFixture();
    expect(
      narrativePlanningResultSchema.safeParse({ ...f.result, worldPatch: {} })
        .success,
    ).toBe(false);
    expect(
      narrativePlanningResultSchema.safeParse({
        ...f.result,
        plan: { ...f.result.plan, arbitraryPath: 'finance.liquidFunds' },
      }).success,
    ).toBe(false);
  });
  it.each([
    'event',
    'stakes',
    'chronology',
    'candidate',
    'branch',
    'pattern',
  ] as const)('rejects a mismatched %s binding', (kind) => {
    const f = narrativePlanFixture();
    if (kind === 'event') f.result.plan.scenes[0]!.eventIds = [randomUUID()];
    if (kind === 'stakes')
      f.result.plan.decisionStakes[1]!.optionId =
        f.result.plan.decisionStakes[0]!.optionId;
    if (kind === 'chronology') f.result.plan.scenes.reverse();
    if (kind === 'candidate')
      f.result = {
        ...f.result,
        candidate: { ...f.result.candidate, title: 'Different candidate' },
      };
    if (kind === 'branch') f.memory.branchId = randomUUID();
    if (kind === 'pattern')
      f.result.plan.memoryDelta.decisionPattern = 'different_pattern';
    expect(() => validateNarrativePlan(f.result, f.canon, f.memory)).toThrow();
  });
  it('requires the latest accepted option consequence and refuses another option', () => {
    const f = narrativePlanFixture();
    const decisionId = randomUUID(),
      optionId = randomUUID();
    f.memory.recentChoices = [
      {
        decisionId,
        optionId,
        acceptedAt: '2025-12-01T00:00:00Z',
        label: 'A recorded prior option',
        changesSummary: 'A bounded typed change.',
      },
    ];
    expect(() => validateNarrativePlan(f.result, f.canon, f.memory)).toThrow(
      'latest accepted choice',
    );
    f.result.plan.choiceConsequences = [
      {
        decisionId,
        optionId,
        eventIds: [f.canon.events[0]!.id],
        disposition: 'paid_off',
        explanation:
          'The new attempt visibly advances this recorded prior choice.',
        threadId: null,
      },
    ];
    expect(validateNarrativePlan(f.result, f.canon, f.memory)).toEqual(
      f.result,
    );
    f.result.plan.choiceConsequences[0]!.optionId = randomUUID();
    expect(() => validateNarrativePlan(f.result, f.canon, f.memory)).toThrow(
      'accepted branch choice',
    );
  });
  it('does not permit a delay without a bounded open thread', () => {
    const f = narrativePlanFixture();
    const decisionId = randomUUID(),
      optionId = randomUUID();
    f.memory.recentChoices = [
      {
        decisionId,
        optionId,
        acceptedAt: '2025-12-01T00:00:00Z',
        label: 'A recorded prior option',
        changesSummary: '',
      },
    ];
    f.result.plan.choiceConsequences = [
      {
        decisionId,
        optionId,
        eventIds: [f.canon.events[0]!.id],
        disposition: 'delayed',
        explanation:
          'This delay must be backed by a thread with a fixed deadline.',
        threadId: null,
      },
    ];
    expect(() => validateNarrativePlan(f.result, f.canon, f.memory)).toThrow(
      'bounded thread',
    );
  });
  it('requires explicit owned reference evidence for a continuation', () => {
    const f = narrativePlanFixture();
    f.memory.history = [
      {
        periodId: randomUUID(),
        startDate: '2025-01-15',
        endDate: '2025-07-15',
        position: 1,
        summary:
          'A past bounded attempt formed the starting point of this later fictional continuation without resolving the final choice.',
        salientEventIds: [randomUUID()],
        excerpt: null,
      },
    ];
    expect(() => validateNarrativePlan(f.result, f.canon, f.memory)).toThrow(
      'explicit owned history',
    );
    expect(
      validateNarrativePlan(
        f.result,
        f.canon,
        f.memory,
        narrativeReferencesFromMemory(f.memory),
      ),
    ).toEqual(f.result);
  });
  it('does not let a thread extend its original deadline or reuse a closed ID', () => {
    const f = narrativePlanFixture(),
      originPeriodId = randomUUID(),
      originEventId = randomUUID(),
      threadId = randomUUID();
    f.memory.history = [
      {
        periodId: originPeriodId,
        startDate: '2025-01-15',
        endDate: '2025-07-15',
        position: 1,
        summary:
          'A past bounded attempt formed the starting point of this later fictional continuation without resolving the final choice.',
        salientEventIds: [originEventId],
        excerpt: null,
      },
    ];
    const thread = {
      id: threadId,
      originPeriodId,
      originEventId,
      kind: 'goal' as const,
      summary:
        'The remaining obstacle needs a concrete result in the next period.',
      status: 'open' as const,
      dueByPeriodOffset: 1 as const,
      lastTouchedPeriodId: originPeriodId,
      eventRefs: [originEventId],
    };
    f.memory.openThreads = [thread];
    const refs = narrativeReferencesFromMemory(f.memory);
    expect(() =>
      validateNarrativePlan(f.result, f.canon, f.memory, refs),
    ).toThrow('deadline');
    f.result.plan.memoryDelta.threadUpdates = [
      {
        ...thread,
        lastTouchedPeriodId: f.candidate.periodId,
        status: 'resolved',
        eventRefs: [f.canon.events[0]!.id],
      },
    ];
    expect(validateNarrativePlan(f.result, f.canon, f.memory, refs)).toEqual(
      f.result,
    );
    f.result.plan.memoryDelta.threadUpdates[0]!.dueByPeriodOffset = 2;
    expect(() =>
      validateNarrativePlan(f.result, f.canon, f.memory, refs),
    ).toThrow('deadline changed');
    f.memory.openThreads = [];
    f.result.plan.memoryDelta.threadUpdates = [
      {
        ...thread,
        originPeriodId: f.candidate.periodId,
        originEventId: f.canon.events[0]!.id,
        lastTouchedPeriodId: f.candidate.periodId,
        eventRefs: [f.canon.events[0]!.id],
      },
    ];
    expect(() =>
      validateNarrativePlan(f.result, f.canon, f.memory, refs),
    ).toThrow('thread ID reused');
  });
  it('permits a fictional actor only after the canonical introduction and rejects supplied-person provenance', () => {
    const f = narrativePlanFixture(),
      actorId = randomUUID();
    f.candidate.events[1]!.changes.push({
      type: 'actor_add',
      value: {
        id: actorId,
        label: 'A fictional colleague',
        relationship: 'colleague',
      },
    });
    f.candidate.events[1]!.actorIds = [actorId];
    const canon = simulatePeriodV2(
      f.candidate,
      f.input.state,
      f.input.input.constraints,
      {
        lifeId: f.input.input.lifeId,
        branchId: f.input.input.branchId,
        revision: 0,
        acceptedDecisionIds: [],
      },
    );
    f.result.plan.scenes[0]!.actorIds = [actorId];
    expect(() => validateNarrativePlan(f.result, canon, f.memory)).toThrow(
      'scene actor',
    );
    f.result.plan.scenes[0]!.actorIds = [];
    f.result.plan.scenes[1]!.actorIds = [actorId];
    f.result.plan.memoryDelta.actorUpdates = [
      {
        actorId,
        introducedByEventId: f.candidate.events[1]!.id,
        role: 'A newly introduced fictional colleague',
        desire: 'Obtain a limited and concrete practical observation.',
        resistance:
          'Avoid turning a small experiment into a permanent commitment.',
        voiceCue: 'Use direct, concrete questions about the attempted work.',
        lastSeenPeriodId: f.candidate.periodId,
      },
    ];
    expect(validateNarrativePlan(f.result, canon, f.memory)).toEqual(f.result);
    f.result.plan.memoryDelta.actorUpdates[0]!.introducedByEventId =
      randomUUID();
    expect(() => validateNarrativePlan(f.result, canon, f.memory)).toThrow(
      'fictional provenance',
    );
  });
  it('keeps context jobs unable to acquire narrative thread or actor metadata', () => {
    const f = narrativePlanFixture();
    const memory = {
      ...f.memory,
      openThreads: [
        {
          id: randomUUID(),
          originPeriodId: f.candidate.periodId,
          originEventId: f.canon.events[0]!.id,
          kind: 'goal',
          summary:
            'A concrete open thread with a bounded next-period deadline.',
          status: 'open',
          dueByPeriodOffset: 1,
          lastTouchedPeriodId: f.candidate.periodId,
          eventRefs: [f.canon.events[0]!.id],
        },
      ],
    };
    expect(narrativeMemorySchema.safeParse(memory).success).toBe(true);
    expect(
      narrativeContextSchema.safeParse({
        policy: contextNarrativePolicy(),
        memory,
      }).success,
    ).toBe(false);
  });
  it('preserves the old word gate and exposes only a fixed longer narrative gate', () => {
    const f = narrativePlanFixture();
    const chapter = longNarrativeChapterFixture(f);
    expect(() => validatePeriodChapterV2(chapter, f.canon.events)).toThrow();
    expect(validateNarrativeChapterV1(chapter, f.canon.events)).toEqual(
      chapter,
    );
    expect(() =>
      validateNarrativeChapterV1(
        longNarrativeChapterFixture(f, 249),
        f.canon.events,
      ),
    ).toThrow();
    expect(
      validateNarrativeChapterV1(
        longNarrativeChapterFixture(f, 550),
        f.canon.events,
      ).body.split(' '),
    ).toHaveLength(550);
    expect(() =>
      validateNarrativeChapterV1(
        longNarrativeChapterFixture(f, 951),
        f.canon.events,
      ),
    ).toThrow();
    expect(
      narrativeEditorialReportSchema.safeParse({
        version: '1.0.0',
        scores: {},
        issues: [],
        verdict: 'pass',
      }).success,
    ).toBe(false);
  });
  it('does not use historical fictional provenance to reconstruct traits while history is withheld', () => {
    const f = narrativePlanFixture(),
      actorId = randomUUID(),
      originEventId = randomUUID(),
      originPeriodId = randomUUID();
    f.input.state = structuredClone(f.input.state);
    f.input.state.actors.push({
      id: actorId,
      label: 'A previously introduced fictional colleague',
      relationship: 'colleague',
    });
    f.memory.withheld = true;
    f.result.plan.memoryDelta.actorUpdates = [
      {
        actorId,
        introducedByEventId: originEventId,
        role: 'A reconstructed fictional role from unavailable history.',
        desire: 'An invented historical desire that the context has withheld.',
        resistance:
          'An invented historical resistance that must not be recovered.',
        voiceCue: 'A recovered manner of speaking from an unavailable profile.',
        lastSeenPeriodId: f.candidate.periodId,
      },
    ];
    const canon = simulatePeriodV2(
      f.candidate,
      f.input.state,
      f.input.input.constraints,
      {
        lifeId: f.input.input.lifeId,
        branchId: f.input.input.branchId,
        revision: 0,
        acceptedDecisionIds: [],
      },
    );
    const refs = {
      ...narrativeReferencesFromMemory(f.memory),
      periodPositions: new Map([[originPeriodId, 1]]),
      historyEventIds: new Set([originEventId]),
      fictionalActorOrigins: new Map([[actorId, originEventId]]),
    };
    expect(() =>
      validateNarrativePlan(f.result, canon, f.memory, refs),
    ).toThrow('Withheld');
    const fresh = narrativePlanFixture(),
      freshId = randomUUID();
    fresh.memory.withheld = true;
    fresh.candidate.events[0]!.changes.push({
      type: 'actor_add',
      value: {
        id: freshId,
        label: 'A newly introduced fictional colleague',
        relationship: 'colleague',
      },
    });
    fresh.result.plan.memoryDelta.actorUpdates = [
      {
        ...f.result.plan.memoryDelta.actorUpdates[0]!,
        actorId: freshId,
        introducedByEventId: fresh.candidate.events[0]!.id,
        lastSeenPeriodId: fresh.candidate.periodId,
        role: 'A fictional colleague introduced in the present event.',
        desire: 'Wants a usable observation from the current bounded trial.',
        resistance:
          'Resists treating this current observation as a final answer.',
        voiceCue:
          'Uses brief questions about the newly recorded current result.',
      },
    ];
    const freshCanon = simulatePeriodV2(
      fresh.candidate,
      fresh.input.state,
      fresh.input.input.constraints,
      {
        lifeId: fresh.input.input.lifeId,
        branchId: fresh.input.input.branchId,
        revision: 0,
        acceptedDecisionIds: [],
      },
    );
    expect(() =>
      validateNarrativePlan(fresh.result, freshCanon, fresh.memory),
    ).not.toThrow();
  });
});
