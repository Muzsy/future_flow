import {
  SHARED_CONTEXT_CONTRACT_VERSION,
  sharedEventCandidateSchema,
  sharedDecisionRulesSchema,
  sharedDecisionEnvelopeSchema,
  sharedIntentSchema,
  sharedMemoryImpactSchema,
  sharedResolutionResultSchema,
  sharedStateSchema,
  type SharedState,
  type SharedPolicy,
  type SharedEventCandidate,
  type SharedDecisionRules,
  type SharedDecisionEnvelope,
  type SharedIntent,
  type SharedResolutionResult,
} from '@future-flow/contracts';
import { DomainError } from './errors';
import { hash } from './index';
import { requireSharedTime } from './shared-context';

export type SharedEngineMember = { id: string; status: string };
export type SharedEngineContext = {
  id: string;
  revision: number;
  simulationAt: string;
  state: SharedState;
  governance: SharedPolicy;
};
function invalid(code: string = 'SHARED_CANDIDATE_INVALID'): never {
  throw new DomainError(code, 'Invalid shared event or decision.', 422);
}
function unique(ids: string[]) {
  if (new Set(ids).size !== ids.length) invalid();
}

export function applySharedChanges(
  state: SharedState,
  changes: SharedEventCandidate['sharedChanges'],
): SharedState {
  const next = structuredClone(sharedStateSchema.parse(state));
  unique(changes.map((c) => c.type));
  for (const change of changes) {
    if (change.type === 'summary_set') next.summary = change.value;
    else if (next.type !== 'friend_group') invalid();
    else if (change.type === 'friend_group_cohesion_set')
      next.cohesion = change.value;
    else if (change.type === 'friend_group_focus_set')
      next.currentFocus = change.value;
    else invalid();
  }
  return sharedStateSchema.parse(next);
}

export function validateSharedEventCandidate(
  raw: unknown,
  context: SharedEngineContext,
  members: SharedEngineMember[],
  rules?: SharedDecisionRules,
): SharedEventCandidate {
  const candidate = sharedEventCandidateSchema.parse(raw);
  if (context.state.type !== 'friend_group')
    invalid('SHARED_CONTEXT_TYPE_NOT_ALLOWED');
  if (
    candidate.contextId !== context.id ||
    candidate.baseRevision !== context.revision
  )
    invalid('SHARED_REVISION_CONFLICT');
  requireSharedTime(context.simulationAt, candidate.effectiveAt);
  unique(members.map((m) => m.id));
  const active = new Set(
    members.filter((m) => m.status === 'active').map((m) => m.id),
  );
  if (active.size < 2 || active.size > 10) invalid('SHARED_MEMBER_INACTIVE');
  unique(candidate.participantMemberIds);
  if (candidate.participantMemberIds.some((id) => !active.has(id)))
    invalid('SHARED_INTENT_NOT_ELIGIBLE');
  applySharedChanges(context.state, candidate.sharedChanges);
  const decision = candidate.decision;
  if (!decision) {
    if (rules) invalid();
    return candidate;
  }
  const settings = sharedDecisionRulesSchema.parse(rules);
  if (hash(decision.policy) !== hash(context.governance))
    invalid('SHARED_PERMISSION_DENIED');
  // Other policies have pure resolvers, but formation/governance remain S4–S6.
  if (decision.policy.type !== 'individual_opt_in')
    invalid('SHARED_CONTEXT_TYPE_NOT_ALLOWED');
  unique(decision.eligibleMemberIds);
  if (
    decision.eligibleMemberIds.some(
      (id) => !candidate.participantMemberIds.includes(id),
    )
  )
    invalid('SHARED_INTENT_NOT_ELIGIBLE');
  unique(decision.options.map((o) => o.id));
  unique(settings.participatingOptionIds);
  if (
    settings.deadlineSeconds !== decision.deadlineSeconds ||
    settings.quorum !== null ||
    settings.participatingOptionIds.length < 1 ||
    settings.participatingOptionIds.length >= decision.options.length ||
    settings.participatingOptionIds.some(
      (id) => !decision.options.some((o) => o.id === id),
    )
  )
    invalid();
  for (const option of decision.options) {
    // Different opt-in choices cannot overwrite the group's shared state.
    if (option.sharedChanges.length) invalid();
    unique(option.impactProposals.map((p) => p.memberId));
    for (const proposal of option.impactProposals) {
      if (proposal.type !== 'memory_only') invalid('SHARED_IMPACT_INVALID');
      if (!decision.eligibleMemberIds.includes(proposal.memberId))
        invalid('SHARED_INTENT_NOT_ELIGIBLE');
      if (!settings.participatingOptionIds.includes(option.id))
        invalid('SHARED_IMPACT_INVALID');
    }
  }
  return candidate;
}

export function openSharedDecision(
  candidate: SharedEventCandidate,
  rules: SharedDecisionRules,
  now: Date,
): SharedDecisionEnvelope {
  if (!candidate.decision || !Number.isFinite(now.getTime())) invalid();
  const settings = sharedDecisionRulesSchema.parse(rules);
  if (settings.deadlineSeconds !== candidate.decision.deadlineSeconds)
    invalid();
  return sharedDecisionEnvelopeSchema.parse({
    schemaVersion: SHARED_CONTEXT_CONTRACT_VERSION,
    decision: candidate.decision,
    rules: settings,
    openedAt: now.toISOString(),
    closesAt:
      settings.deadlineSeconds === null
        ? null
        : new Date(
            now.getTime() + settings.deadlineSeconds * 1000,
          ).toISOString(),
  });
}

export function resolveSharedDecision(
  raw: SharedDecisionEnvelope,
  rawIntents: SharedIntent[],
  members: SharedEngineMember[],
  now: Date,
): SharedResolutionResult {
  const envelope = sharedDecisionEnvelopeSchema.parse(raw),
    { decision, rules } = envelope;
  unique(decision.eligibleMemberIds);
  unique(decision.options.map((o) => o.id));
  unique(members.map((m) => m.id));
  if (
    !Number.isFinite(now.getTime()) ||
    now.getTime() < Date.parse(envelope.openedAt)
  )
    invalid();
  const expectedClose =
    rules.deadlineSeconds === null
      ? null
      : new Date(
          Date.parse(envelope.openedAt) + rules.deadlineSeconds * 1000,
        ).toISOString();
  if (
    envelope.closesAt !== expectedClose ||
    decision.deadlineSeconds !== rules.deadlineSeconds
  )
    invalid();
  const intents = rawIntents.map((i) => sharedIntentSchema.parse(i));
  unique(intents.map((i) => i.memberId));
  for (const intent of intents) {
    const submitted = Date.parse(intent.submittedAt);
    if (
      !decision.eligibleMemberIds.includes(intent.memberId) ||
      !decision.options.some((o) => o.id === intent.optionId) ||
      submitted < Date.parse(envelope.openedAt) ||
      submitted > now.getTime() ||
      (envelope.closesAt !== null && submitted >= Date.parse(envelope.closesAt))
    )
      invalid('SHARED_INTENT_NOT_ELIGIBLE');
  }
  const responses = intents
    .map(({ memberId, optionId }) => ({ memberId, optionId }))
    .sort((a, b) => a.memberId.localeCompare(b.memberId));
  const result = (
    status: SharedResolutionResult['status'],
    reason: SharedResolutionResult['reason'],
    selectedOptionId: string | null = null,
    participatingMemberIds: string[] = [],
  ) =>
    sharedResolutionResultSchema.parse({
      schemaVersion: SHARED_CONTEXT_CONTRACT_VERSION,
      status,
      reason,
      selectedOptionId,
      participatingMemberIds: [...participatingMemberIds].sort(),
      responses,
    });
  if (
    decision.eligibleMemberIds.some(
      (id) => !members.some((m) => m.id === id && m.status === 'active'),
    )
  )
    return result('cancelled', 'participant_unavailable');
  const all = intents.length === decision.eligibleMemberIds.length,
    closed =
      envelope.closesAt !== null &&
      now.getTime() >= Date.parse(envelope.closesAt);
  if (decision.policy.type === 'individual_opt_in') {
    unique(rules.participatingOptionIds);
    if (
      rules.quorum !== null ||
      rules.participatingOptionIds.length < 1 ||
      rules.participatingOptionIds.length >= decision.options.length ||
      rules.participatingOptionIds.some(
        (id) => !decision.options.some((o) => o.id === id),
      )
    )
      invalid();
    if (!all && !closed) return result('waiting', 'missing_responses');
    return result(
      'resolved',
      null,
      null,
      intents
        .filter((i) => rules.participatingOptionIds.includes(i.optionId))
        .map((i) => i.memberId),
    );
  }
  if (rules.participatingOptionIds.length) invalid();
  if (decision.policy.type === 'unanimous') {
    if (rules.quorum !== null) invalid();
    if (!all)
      return result(closed ? 'unresolved' : 'waiting', 'missing_responses');
    if (new Set(intents.map((i) => i.optionId)).size !== 1)
      return result('unresolved', 'disagreement');
    return result(
      'resolved',
      null,
      intents[0]!.optionId,
      decision.eligibleMemberIds,
    );
  }
  if (decision.policy.type === 'majority') {
    const quorum = rules.quorum ?? decision.eligibleMemberIds.length;
    if (quorum > decision.eligibleMemberIds.length) invalid();
    if (intents.length < quorum)
      return result(closed ? 'unresolved' : 'waiting', 'quorum_not_met');
    const counts = decision.options
      .map((o) => ({
        id: o.id,
        count: intents.filter((i) => i.optionId === o.id).length,
      }))
      .sort((a, b) => b.count - a.count);
    if (counts[0]!.count === counts[1]!.count)
      return result('unresolved', 'tie');
    if (counts[0]!.count <= intents.length / 2)
      return result('unresolved', 'no_majority');
    return result(
      'resolved',
      null,
      counts[0]!.id,
      intents
        .filter((i) => i.optionId === counts[0]!.id)
        .map((i) => i.memberId),
    );
  }
  invalid('SHARED_CONTEXT_TYPE_NOT_ALLOWED');
}

export function sharedMemoryImpact(
  candidate: SharedEventCandidate,
  memberId: string,
  resolutionId: string | null,
  ownOptionId: string | null,
  role: string | null,
) {
  if (!candidate.participantMemberIds.includes(memberId))
    invalid('SHARED_IMPACT_INVALID');
  const option =
    ownOptionId === null
      ? null
      : candidate.decision?.options.find((o) => o.id === ownOptionId);
  if (ownOptionId !== null && !option) invalid('SHARED_IMPACT_INVALID');
  // Proposal prose is never promoted to an accepted personal action or feeling.
  const suffix = option ? '\nYour recorded response: ' + option.label : '';
  return sharedMemoryImpactSchema.parse({
    schemaVersion: SHARED_CONTEXT_CONTRACT_VERSION,
    eventId: candidate.eventId,
    resolutionId,
    memberId,
    ownOptionId,
    memory: {
      contextId: candidate.contextId,
      contextType: 'friend_group',
      effectiveAt: candidate.effectiveAt,
      title: candidate.title,
      summary: candidate.summary.slice(0, 1200 - suffix.length) + suffix,
      role,
    },
  });
}
