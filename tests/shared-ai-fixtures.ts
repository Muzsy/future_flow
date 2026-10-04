import { randomUUID } from 'node:crypto';
import type {
  SharedAiInput,
  SharedEventCandidate,
} from '@future-flow/contracts';
import type { Database, SharedJobRepository } from '@future-flow/database';
import { sharedParticipant } from './shared-fixtures';
import { sharedEventFixture } from './shared-engine-fixtures';

export function sharedAiFixture() {
  const f = sharedEventFixture(randomUUID(), 3, '2030-01-01', [
    randomUUID(),
    randomUUID(),
  ]);
  const input: SharedAiInput = {
    schemaVersion: '1.0.0',
    locale: 'en',
    context: {
      id: f.candidate.contextId,
      title: 'Synthetic shared opportunity',
      revision: 3,
      simulationAt: f.candidate.effectiveAt,
      state: {
        type: 'friend_group',
        summary: null,
        cohesion: null,
        currentFocus: null,
      },
      governance: { type: 'individual_opt_in' },
    },
    eventId: f.candidate.eventId,
    members: f.candidate.participantMemberIds.map((memberId) => ({
      memberId,
      interactionProfile: {
        displayName: 'Synthetic alias',
        ageBand: null,
        country: null,
        occupationLabel: null,
        sharedRole: null,
      },
    })),
    decision: {
      id: f.candidate.decision!.id,
      participationOptionId: f.candidate.decision!.options[0]!.id,
      optOutOptionId: f.candidate.decision!.options[1]!.id,
      rules: f.rules,
    },
    history: [],
  };
  return { input, candidate: f.candidate };
}
export function candidateFor(input: SharedAiInput): SharedEventCandidate {
  const f = sharedEventFixture(
    input.context.id,
    input.context.revision,
    input.context.simulationAt,
    input.members.map((m) => m.memberId),
  );
  f.candidate.eventId = input.eventId;
  f.candidate.decision!.id = input.decision.id;
  f.candidate.decision!.deadlineSeconds = input.decision.rules.deadlineSeconds;
  f.candidate.decision!.options[0]!.id = input.decision.participationOptionId;
  f.candidate.decision!.options[1]!.id = input.decision.optOutOptionId;
  return f.candidate;
}
export async function sharedAiGroup(db: Database, jobs: SharedJobRepository) {
  const people = [
    await sharedParticipant(db, 'world', 'Test Rowan'),
    await sharedParticipant(db, 'world', 'Test Casey'),
  ];
  const a = people[0]!,
    b = people[1]!;
  const c = await jobs.create(
    a.id,
    {
      type: 'friend_group',
      title: 'Synthetic S2 group',
      branchId: a.branchId,
      revision: a.revision,
      sharingAcknowledged: true,
    },
    randomUUID(),
  );
  const invite = await jobs.createInvite(
    a.id,
    c.contextId,
    { contextRevision: c.revision, targetUserId: b.id },
    randomUUID(),
  );
  await jobs.acceptInvite(
    b.id,
    invite.inviteId,
    {
      token: invite.token,
      branchId: b.branchId,
      revision: b.revision,
      contextRevision: invite.revision,
      sharingAcknowledged: true,
    },
    randomUUID(),
  );
  return {
    people,
    contextId: c.contextId,
    detail: await jobs.detail(a.id, c.contextId),
  };
}
