import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  fictionPolicy,
  fictionV1Policy,
  fictionV2Policy,
  fictionV3Policy,
  fictionV4Policy,
  fictionV5Policy,
  fictionPolicySchema,
  fictionHumanEditorialSchema,
} from '@future-flow/contracts';
import {
  fictionPlannerRequest,
  fictionAuthorRequest,
  fictionCanon,
  validateFictionAuthor,
  evaluateFictionEditorialGate,
  validateFictionEditorialReport,
  fictionProseRepairAllowed,
  applyFactChangesV2,
} from '@future-flow/core';
import { fictionFixture } from './fiction-fixtures';

function fixture() {
  const input = fictionFixture().input;
  if (input.narrativeContext?.policy.mode !== 'narrative-fiction-v2')
    throw Error();
  input.narrativeContext.policy = fictionPolicy();
  const f = fictionFixture(input);
  return { ...f, editor: fictionHumanEditorialSchema.parse(f.editor) };
}

describe('v6 owned references, typed evolution and frozen policy compatibility', () => {
  it('accepts all six policies, preserving v5 and rejecting cross-generation pairs', () => {
    const policies = [
      fictionV1Policy(),
      fictionV2Policy(),
      fictionV3Policy(),
      fictionV4Policy(),
      fictionV5Policy(),
      fictionPolicy(),
    ];
    for (const policy of policies) {
      expect(fictionPolicySchema.parse(policy)).toEqual(policy);
      for (const other of policies.filter(
        (p) => p.promptVersions.writer !== policy.promptVersions.writer,
      ))
        expect(
          fictionPolicySchema.safeParse({
            ...policy,
            promptVersions: {
              ...policy.promptVersions,
              writer: other.promptVersions.writer,
            },
          }).success,
        ).toBe(false);
    }
    expect(fictionV5Policy()).toMatchObject({
      qualityPolicyVersion: '2.3.0',
      promptVersions: {
        planner: 'life_fiction_plan.v5',
        writer: 'life_fiction_author.v5',
        planReviewer: 'life_fiction_plan_review.v5',
        editor: 'life_fiction_editor.v4',
      },
    });
    expect(fictionPolicy()).toMatchObject({
      qualityPolicyVersion: '2.4.0',
      maxPhysicalRequests: 9,
      maxContentRepairs: 1,
      promptVersions: { fidelity: 'life_fiction_fidelity.v1' },
    });
  });
  it('adds bounded owned ID advice only to v6, without exposing server inventories or a billing/chapter schedule', () => {
    const f = fixture(),
      request = fictionPlannerRequest(f.input);
    expect(request.referenceProjection?.goalIds).toEqual(
      f.input.state.goals.map((g) => g.goalId),
    );
    expect(request.referenceProjection?.existingActorIds).toEqual(
      f.input.state.actors.map((a) => a.id),
    );
    expect(request.referenceProjection?.sceneActorRule).toContain(
      'FIRST referenced event',
    );
    expect(request.referenceProjection?.sceneActorRule).toContain(
      'including in decision options',
    );
    expect(
      Buffer.byteLength(JSON.stringify(request.referenceProjection), 'utf8'),
    ).toBeLessThanOrEqual(2048);
    expect(fictionAuthorRequest(f.input, f.draft).referenceProjection).toEqual(
      request.referenceProjection,
    );
    for (const key of [
      'fictionReferences',
      'narrativeReferences',
      'periodIndex',
      'remainingQuota',
      'billingTier',
      'allowancePosition',
    ])
      expect(request).not.toHaveProperty(key);
    if (f.input.narrativeContext?.policy.mode !== 'narrative-fiction-v2')
      throw Error();
    f.input.narrativeContext.policy = fictionV5Policy();
    expect(fictionPlannerRequest(f.input)).not.toHaveProperty(
      'referenceProjection',
    );
  });
  it('fits maximum valid state references without clipping or raising historical memory bounds', () => {
    const f = fixture();
    f.input.state.actors = Array.from({ length: 30 }, (_, i) => ({
      id: randomUUID(),
      label: `Fictional colleague ${i}`,
      relationship: 'colleague' as const,
    }));
    f.input.state.goals = Array.from({ length: 5 }, () => ({
      goalId: randomUUID(),
      status: 'active' as const,
      note: null,
    }));
    const projection = fictionPlannerRequest(f.input).referenceProjection!;
    expect(projection.existingActorIds).toHaveLength(30);
    expect(projection.goalIds).toHaveLength(5);
    expect(
      Buffer.byteLength(JSON.stringify(projection), 'utf8'),
    ).toBeLessThanOrEqual(2048);
  });
  it('rejects the real v5 nonexistent-goal shape in future option effects, without inventing or substituting a goal', () => {
    const f = fixture(),
      option = f.draft.candidate.events.at(-1)!.decision!.options[0]!;
    const invented = randomUUID();
    option.changes = [
      {
        type: 'goal_progress_set',
        value: {
          goalId: invented,
          status: 'active',
          note: 'A new artistic direction has become interesting.',
        },
      },
    ];
    expect(
      fictionPlannerRequest(f.input).referenceProjection!.goalIds,
    ).not.toContain(invented);
    expect(() => fictionCanon(f.input, f.draft)).toThrow('Nem létező cél');
    option.changes = [
      {
        type: 'goal_progress_set',
        value: {
          goalId: f.input.state.goals[0]!.goalId,
          status: 'active',
          note: 'The existing goal is pursued through a different activity.',
        },
      },
    ];
    expect(() => fictionCanon(f.input, f.draft)).not.toThrow();
  });
  it('rejects the real v5 scene that begins before its new actor exists; accepts an explicit chronological introduction', () => {
    const f = fixture(),
      actor = {
        id: randomUUID(),
        label: 'Fictional practice partner',
        relationship: 'other' as const,
      };
    const first = f.draft.candidate.events[0]!;
    const second = structuredClone(first);
    second.id = randomUUID();
    f.draft.candidate.events.splice(1, 0, second);
    second.changes.push({ type: 'actor_add', value: actor });
    second!.actorIds = [actor.id];
    f.draft.plan.scenes[0]!.eventIds = [first!.id, second!.id];
    f.draft.plan.scenes[0]!.actorIds = [actor.id];
    expect(() => fictionCanon(f.input, f.draft)).toThrow('Unknown scene actor');
    second!.changes = second!.changes.filter((c) => c.type !== 'actor_add');
    first!.changes.push({ type: 'actor_add', value: actor });
    first!.actorIds = [actor.id];
    expect(() => fictionCanon(f.input, f.draft)).not.toThrow();
  });
  it('allows an early major opportunity and typed job choice without silently applying the unresolved commitment', () => {
    const f = fixture(),
      option = f.authored.candidate.events.at(-1)!.decision!.options[0]!;
    option.changes = [
      {
        type: 'employment_set',
        value: {
          status: 'employed',
          employerLabel: 'Fictional local studio',
          workDomain: 'Software testing',
        },
      },
    ];
    option.description =
      'Accept the offered testing role after the already demonstrated trial, keeping the practical tradeoffs explicit.';
    const run = validateFictionAuthor(f.input, f.authored);
    expect(run.canon.endState.employment).toEqual(f.input.state.employment);
    const chosen = applyFactChangesV2(
      run.canon.endState,
      option.changes,
      run.canon.endState.effectiveAt,
      option.preconditions,
      f.input.input.constraints,
      {
        lifeId: f.input.input.lifeId,
        branchId: f.input.input.branchId,
        acceptedDecisionIds: [
          ...f.input.acceptedDecisionIds,
          f.authored.candidate.events.at(-1)!.decision!.id,
        ],
      },
    );
    expect(chosen.state.employment.workDomain).toBe('Software testing');
    // This proves typed/choice mechanics; causal credibility still needs real reviewer/human evidence.
  });
  it('allows new recurring fiction and a community/relationship detail absent from the initial profile', () => {
    const f = fixture(),
      actor = {
        id: randomUUID(),
        label: 'Fictional community organizer',
        relationship: 'friend' as const,
      },
      event = f.authored.candidate.events[0]!;
    event.changes.push({ type: 'actor_add', value: actor });
    event.actorIds.push(actor.id);
    f.authored.storyFacts[0]!.aboutActorIds = [actor.id];
    f.authored.storyFacts[0]!.kind = 'relationship_detail';
    f.authored.storyFacts[0]!.assertion =
      'The organizer and protagonist now meet at a different community workshop after the accepted experiment.';
    expect(
      validateFictionAuthor(f.input, f.authored).canon.endState.actors,
    ).toContainEqual(actor);
    expect(f.input.state.actors).not.toContainEqual(actor);
  });
  it('permits concentrated afternoon prose and a long montage without altering the six-month canon', () => {
    for (const beginning of [
      'During one afternoon, the conversation finally changes.',
      'After several quiet months, the work meets an unexpected obstacle.',
    ]) {
      const f = fixture();
      f.authored.chapter.body =
        beginning + ' ' + Array.from({ length: 260 }, () => 'scene').join(' ');
      expect(
        validateFictionAuthor(f.input, f.authored).canon.period.durationMonths,
      ).toBe(6);
    }
  });
  it('keeps withheld history empty and projects only current state IDs, not an invented historical reference inventory', () => {
    const f = fixture();
    if (f.input.narrativeContext?.policy.mode !== 'narrative-fiction-v2')
      throw Error();
    f.input.narrativeContext.memory.withheld = true;
    f.input.narrativeContext.storyFacts = [];
    const r = fictionPlannerRequest(f.input);
    expect(r.memory.recentEvents).toEqual([]);
    expect(r.memory.choices).toEqual([]);
    expect(r).not.toHaveProperty('fictionReferences');
    expect(r.referenceProjection!.existingActorIds).toEqual(
      f.input.state.actors.map((a) => a.id),
    );
  });
});

// Labelled model reports test server gating and repair routing only. They do
// not demonstrate semantic recognition, life evolution or retention by a model.
describe('v6 labelled quality controls — no mock literary PASS', () => {
  it.each([
    ['scope lock', 'independentProgression', 'canon'],
    ['arbitrary escalation', 'distinctDramaticStructure', 'canon'],
    ['repeated answer-waiting handoff', 'distinctEnding', 'prose'],
    ['decision-interface handoff', 'systemMechanicsInvisible', 'prose'],
  ] as const)(
    'blocks %s despite otherwise perfect scores',
    (_name, flag, scope) => {
      const f = fixture();
      for (const k of Object.keys(
        f.editor.scores,
      ) as (keyof typeof f.editor.scores)[])
        f.editor.scores[k] = 5;
      f.editor.sequenceReview[flag] = false;
      f.editor.issues = [
        {
          dimension: 'novelty',
          severity: 'major',
          repairScope: scope,
          paragraphIndex: 1,
          eventIds: [],
          explanation:
            'The supplied comparison evidence identifies the labelled causal or rhetorical defect.',
          suggestedFix:
            'Use an earned changed consequence without a timetable, arbitrary escalation or decision-interface briefing.',
        },
      ];
      expect(evaluateFictionEditorialGate(f.input, f.editor).passed).toBe(
        false,
      );
      expect(fictionProseRepairAllowed(f.editor)).toBe(scope === 'prose');
    },
  );
  it('blocks an obvious-solution contrivance graded below strong, even with a pass verdict', () => {
    const f = fixture();
    f.editor.scores.causality = 3;
    expect(evaluateFictionEditorialGate(f.input, f.editor).passed).toBe(false);
  });
  it.each([
    'stable place with a changed relationship',
    'earned external opportunity',
    'credible human avoidance',
    'natural dialogue question',
    'temporally concentrated scene',
    'earned montage',
  ])(
    'accepts a strong coherent report for %s without graph or timing quotas',
    (label) => {
      const f = fixture();
      f.editor.sequenceReview.evidence = `Labelled positive control: ${label}. This is not a real model assessment.`;
      expect(() =>
        validateFictionEditorialReport(f.input, f.authored, f.editor),
      ).not.toThrow();
      expect(evaluateFictionEditorialGate(f.input, f.editor).passed).toBe(true);
    },
  );
});
