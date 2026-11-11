import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  sharedIntentRequestSchema,
  type SharedIntent,
  type SharedPolicy,
} from '@future-flow/contracts';
import {
  applySharedChanges,
  validateSharedEventCandidate,
  openSharedDecision,
  resolveSharedDecision,
  sharedMemoryImpact,
  hash,
  type SharedEngineContext,
} from '@future-flow/core';
import { sharedEventFixture } from './shared-engine-fixtures';

const ids = Array.from({ length: 4 }, () => randomUUID()),
  members = ids.map((id) => ({ id, status: 'active' }));
const context: SharedEngineContext = {
  id: randomUUID(),
  revision: 2,
  simulationAt: '2026-10-04',
  state: {
    type: 'friend_group',
    summary: null,
    cohesion: null,
    currentFocus: null,
  },
  governance: { type: 'individual_opt_in' },
};
const now = new Date('2026-10-04T10:00:00.000Z');
const fixture = () =>
  sharedEventFixture(
    context.id,
    context.revision,
    context.simulationAt,
    ids.slice(0, 3),
  );
function intent(memberId: string, optionId: string): SharedIntent {
  return { memberId, optionId, submittedAt: now.toISOString() };
}
describe('Shared S1 canon and explicit decision policy', () => {
  it('validates a friend subset and applies closed shared changes without mutating the input', () => {
    const f = fixture(),
      before = hash(context.state);
    expect(
      validateSharedEventCandidate(f.candidate, context, members, f.rules),
    ).toEqual(f.candidate);
    expect(
      applySharedChanges(context.state, f.candidate.sharedChanges),
    ).toMatchObject({ currentFocus: 'Planning a weekend walk' });
    expect(hash(context.state)).toBe(before);
    expect(() =>
      applySharedChanges(context.state, [
        { type: 'summary_set', value: 'A' },
        { type: 'summary_set', value: 'B' },
      ]),
    ).toThrow();
  });
  it.each([
    'unknown_member',
    'duplicate_participant',
    'outside_eligible',
    'duplicate_option',
    'wrong_context',
    'stale_revision',
    'backdated',
  ])('rejects %s before any canon is produced', (kind) => {
    const f = fixture(),
      d = f.candidate.decision!;
    if (kind === 'unknown_member')
      f.candidate.participantMemberIds.push(randomUUID());
    if (kind === 'duplicate_participant')
      f.candidate.participantMemberIds.push(ids[0]!);
    if (kind === 'outside_eligible') d.eligibleMemberIds.push(ids[3]!);
    if (kind === 'duplicate_option') d.options[1]!.id = d.options[0]!.id;
    if (kind === 'wrong_context') f.candidate.contextId = randomUUID();
    if (kind === 'stale_revision') f.candidate.baseRevision--;
    if (kind === 'backdated') f.candidate.effectiveAt = '2026-10-03';
    expect(() =>
      validateSharedEventCandidate(f.candidate, context, members, f.rules),
    ).toThrow();
  });
  it('rejects injected private state, fake actor intent and client authority', () => {
    const f = fixture();
    for (const field of ['finance', 'privateGoals', 'actorIntent', 'userId'])
      expect(() =>
        validateSharedEventCandidate(
          { ...f.candidate, [field]: {} },
          context,
          members,
          f.rules,
        ),
      ).toThrow();
    expect(
      sharedIntentRequestSchema.safeParse({
        contextRevision: 1,
        optionId: f.yes,
        memberId: ids[1],
      }).success,
    ).toBe(false);
  });
  it('keeps participation and deadline under server authority and cannot merge conflicting opt-in state', () => {
    const f = fixture();
    expect(() =>
      validateSharedEventCandidate(f.candidate, context, members, {
        ...f.rules,
        participatingOptionIds: [f.yes, f.no],
      }),
    ).toThrow();
    expect(() =>
      validateSharedEventCandidate(f.candidate, context, members, {
        ...f.rules,
        deadlineSeconds: 60,
      }),
    ).toThrow();
    f.candidate.decision!.options[0]!.sharedChanges = [
      { type: 'friend_group_cohesion_set', value: 'high' },
    ];
    expect(() =>
      validateSharedEventCandidate(f.candidate, context, members, f.rules),
    ).toThrow();
  });
  it('rejects relationship/financial effects, outside targets and effects attached to opting out', () => {
    for (const type of [
      'relationship_projection',
      'finance_delta',
      'outside',
      'decline',
    ]) {
      const f = fixture(),
        options = f.candidate.decision!.options;
      if (type === 'relationship_projection')
        options[0]!.impactProposals = [
          {
            type: 'relationship_projection',
            memberId: ids[0]!,
            relationship: 'partner',
            authoritySource: 'shared_canon',
          },
        ];
      if (type === 'finance_delta')
        (options[0]!.impactProposals as unknown[]) = [
          { type: 'finance_delta', memberId: ids[0], amount: 100 },
        ];
      if (type === 'outside')
        options[0]!.impactProposals[0]!.memberId = ids[3]!;
      if (type === 'decline')
        options[1]!.impactProposals = options[0]!.impactProposals;
      expect(() =>
        validateSharedEventCandidate(f.candidate, context, members, f.rules),
      ).toThrow();
    }
  });
  it('waits for actual opt-in responses, resolves their subset and never votes for a silent member', () => {
    const f = fixture(),
      e = openSharedDecision(f.candidate, f.rules, now),
      first = [intent(ids[0]!, f.yes), intent(ids[1]!, f.no)];
    expect(resolveSharedDecision(e, first, members, now).status).toBe(
      'waiting',
    );
    const closed = resolveSharedDecision(
      e,
      first,
      members,
      new Date(e.closesAt!),
    );
    expect(closed).toMatchObject({
      status: 'resolved',
      selectedOptionId: null,
      participatingMemberIds: [ids[0]],
    });
    expect(closed.responses).toHaveLength(2);
    expect(closed.responses.some((r) => r.memberId === ids[2])).toBe(false);
  });
  it('resolves early only when all have responded, including explicit opt-outs', () => {
    const f = fixture(),
      e = openSharedDecision(f.candidate, f.rules, now);
    expect(
      resolveSharedDecision(
        e,
        ids.slice(0, 3).map((id) => intent(id, f.yes)),
        members,
        now,
      ),
    ).toMatchObject({
      status: 'resolved',
      participatingMemberIds: [...ids.slice(0, 3)].sort(),
    });
    expect(() =>
      openSharedDecision(
        f.candidate,
        { ...f.rules, deadlineSeconds: null },
        now,
      ),
    ).toThrow();
  });
  it('supports no deadline and an empty opted-in subset without guessing participation', () => {
    const f = sharedEventFixture(
        context.id,
        2,
        context.simulationAt,
        ids.slice(0, 2),
        null,
      ),
      e = openSharedDecision(f.candidate, f.rules, now);
    expect(e.closesAt).toBeNull();
    expect(
      resolveSharedDecision(
        e,
        [intent(ids[0]!, f.no)],
        members,
        new Date('2028-01-01T00:00:00.000Z'),
      ).status,
    ).toBe('waiting');
    expect(
      resolveSharedDecision(
        e,
        [intent(ids[0]!, f.no), intent(ids[1]!, f.no)],
        members,
        now,
      ),
    ).toMatchObject({ status: 'resolved', participatingMemberIds: [] });
  });
  it('rejects duplicate, forged, unknown-option and late intents and forged wall-clock envelopes', () => {
    const f = fixture(),
      e = openSharedDecision(f.candidate, f.rules, now),
      valid = intent(ids[0]!, f.yes);
    for (const inputs of [
      [valid, valid],
      [intent(randomUUID(), f.yes)],
      [intent(ids[0]!, randomUUID())],
      [{ ...valid, submittedAt: e.closesAt! }],
    ])
      expect(() =>
        resolveSharedDecision(e, inputs, members, new Date(e.closesAt!)),
      ).toThrow();
    expect(() =>
      resolveSharedDecision({ ...e, closesAt: null }, [], members, now),
    ).toThrow();
  });
  it('cancels when a required participant has left or been deleted, without generating impacts', () => {
    const f = fixture(),
      e = openSharedDecision(f.candidate, f.rules, now);
    expect(
      resolveSharedDecision(
        e,
        [intent(ids[0]!, f.yes)],
        members.map((m) => (m.id === ids[1] ? { ...m, status: 'deleted' } : m)),
        now,
      ),
    ).toMatchObject({
      status: 'cancelled',
      reason: 'participant_unavailable',
      participatingMemberIds: [],
    });
  });
  it('derives a personal memory from canon and the own response, never from proposal prose', () => {
    const f = fixture(),
      p = sharedMemoryImpact(f.candidate, ids[0]!, randomUUID(), f.yes, null);
    expect(p.memory.summary).toContain('Your recorded response: Join the walk');
    expect(p.memory.summary).not.toContain('everybody agreed');
    expect(() =>
      sharedMemoryImpact(f.candidate, ids[3]!, null, null, null),
    ).toThrow();
  });
  it('handles strict-majority quorum, ties and missing votes as explicit outcomes', () => {
    const f = fixture();
    f.candidate.decision!.policy = { type: 'majority' };
    const e = openSharedDecision(
      f.candidate,
      { ...f.rules, participatingOptionIds: [], quorum: 2 },
      now,
    );
    expect(
      resolveSharedDecision(e, [intent(ids[0]!, f.yes)], members, now),
    ).toMatchObject({ status: 'waiting', reason: 'quorum_not_met' });
    expect(
      resolveSharedDecision(
        e,
        [intent(ids[0]!, f.yes)],
        members,
        new Date(e.closesAt!),
      ),
    ).toMatchObject({ status: 'unresolved', reason: 'quorum_not_met' });
    expect(
      resolveSharedDecision(
        e,
        [intent(ids[0]!, f.yes), intent(ids[1]!, f.no)],
        members,
        now,
      ),
    ).toMatchObject({ status: 'unresolved', reason: 'tie' });
    expect(
      resolveSharedDecision(
        e,
        [intent(ids[0]!, f.yes), intent(ids[1]!, f.yes)],
        members,
        now,
      ),
    ).toMatchObject({ status: 'resolved', selectedOptionId: f.yes });
  });
  it('requires unanimous real responses and refuses unsupported role/weighted policy', () => {
    const f = fixture();
    f.candidate.decision!.policy = { type: 'unanimous' };
    const e = openSharedDecision(
      f.candidate,
      { ...f.rules, participatingOptionIds: [] },
      now,
    );
    expect(
      resolveSharedDecision(
        e,
        [intent(ids[0]!, f.yes)],
        members,
        new Date(e.closesAt!),
      ),
    ).toMatchObject({ status: 'unresolved', reason: 'missing_responses' });
    expect(
      resolveSharedDecision(
        e,
        ids.slice(0, 3).map((id) => intent(id, f.yes)),
        members,
        now,
      ).status,
    ).toBe('resolved');
    expect(
      resolveSharedDecision(
        e,
        [intent(ids[0]!, f.no), intent(ids[1]!, f.yes), intent(ids[2]!, f.yes)],
        members,
        now,
      ),
    ).toMatchObject({ status: 'unresolved', reason: 'disagreement' });
    for (const policy of [
      { type: 'role_authority', role: 'coach' },
      { type: 'weighted_vote', weights: { [ids[0]!]: 1 } },
    ] as SharedPolicy[])
      expect(() =>
        resolveSharedDecision(
          { ...e, decision: { ...e.decision, policy } },
          [],
          members,
          now,
        ),
      ).toThrow();
  });
});
