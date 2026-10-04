import { randomUUID } from 'node:crypto';
import {
  type SharedEventCandidate,
  type SharedDecisionRules,
} from '@future-flow/contracts';

// Synthetic server input only; never a fallback story or a user-facing event source.
export function sharedEventFixture(
  contextId: string,
  baseRevision: number,
  effectiveAt: string,
  memberIds: string[],
  deadlineSeconds: number | null = 172800,
) {
  const yes = randomUUID(),
    no = randomUUID();
  const candidate: SharedEventCandidate = {
    schemaVersion: '1.0.0',
    eventId: randomUUID(),
    contextId,
    baseRevision,
    effectiveAt,
    title: 'A weekend walk',
    summary:
      'The friends consider a weekend walk. Each person can choose whether to join.',
    participantMemberIds: [...memberIds],
    sharedChanges: [
      { type: 'friend_group_focus_set', value: 'Planning a weekend walk' },
    ],
    decision: {
      id: randomUUID(),
      prompt: 'Would you like to join?',
      policy: { type: 'individual_opt_in' },
      eligibleMemberIds: [...memberIds],
      deadlineSeconds,
      options: [
        {
          id: yes,
          label: 'Join the walk',
          description: 'Take part if it works for you.',
          sharedChanges: [],
          impactProposals: memberIds.map((memberId) => ({
            type: 'memory_only',
            memberId,
            summary: 'UNTRUSTED proposal: everybody agreed to join.',
          })),
        },
        {
          id: no,
          label: 'Sit this one out',
          description: 'Keep your own plans.',
          sharedChanges: [],
          impactProposals: [],
        },
      ],
    },
  };
  const rules: SharedDecisionRules = {
    deadlineSeconds,
    participatingOptionIds: [yes],
    quorum: null,
  };
  return { candidate, rules, yes, no };
}
