import {
  sharedAiInputSchema,
  type SharedAiInput,
} from '@future-flow/contracts';
import { DomainError } from './errors';
import { validateSharedEventCandidate } from './shared-engine';

export function validateSharedAiInput(raw: unknown): SharedAiInput {
  const input = sharedAiInputSchema.parse(raw),
    ids = input.members.map((m) => m.memberId),
    d = input.decision;
  if (
    input.context.state.type !== 'friend_group' ||
    new Set(ids).size !== ids.length ||
    d.id === input.eventId ||
    new Set([input.eventId, d.id, d.participationOptionId, d.optOutOptionId])
      .size !== 4 ||
    d.participationOptionId === d.optOutOptionId ||
    d.rules.quorum !== null ||
    d.rules.participatingOptionIds.length !== 1 ||
    d.rules.participatingOptionIds[0] !== d.participationOptionId ||
    input.history.some((e) => e.effectiveAt > input.context.simulationAt)
  )
    throw new DomainError(
      'SHARED_CANDIDATE_INVALID',
      'Invalid shared generation request.',
      422,
    );
  return input;
}
export function validateSharedAiCandidate(
  raw: unknown,
  request: SharedAiInput,
) {
  const input = validateSharedAiInput(request),
    c = input.context;
  const output = validateSharedEventCandidate(
    raw,
    {
      id: c.id,
      revision: c.revision,
      simulationAt: c.simulationAt,
      state: c.state,
      governance: c.governance,
    },
    input.members.map((m) => ({ id: m.memberId, status: 'active' })),
    input.decision.rules,
  );
  const ids = input.members.map((m) => m.memberId).sort();
  if (
    output.eventId !== input.eventId ||
    output.sharedChanges.some(
      (change) => change.type === 'friend_group_cohesion_set',
    ) ||
    !output.decision ||
    output.decision.id !== input.decision.id ||
    JSON.stringify([...output.participantMemberIds].sort()) !==
      JSON.stringify(ids) ||
    JSON.stringify([...output.decision.eligibleMemberIds].sort()) !==
      JSON.stringify(ids) ||
    output.decision.options.length !== 2 ||
    !output.decision.options.some(
      (o) => o.id === input.decision.participationOptionId,
    ) ||
    !output.decision.options.some((o) => o.id === input.decision.optOutOptionId)
  )
    throw new DomainError(
      'SHARED_CANDIDATE_INVALID',
      'The shared proposal changed server identifiers or eligibility.',
      422,
    );
  return output;
}
