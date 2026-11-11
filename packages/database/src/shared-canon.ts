import { randomUUID } from 'node:crypto';
import {
  sharedEventCandidateSchema,
  sharedDecisionEnvelopeSchema,
  sharedResolutionResultSchema,
  SHARED_CONTEXT_CONTRACT_VERSION,
  type SharedEventCandidate,
  type SharedResolutionResult,
} from '@future-flow/contracts';
import { hash } from '@future-flow/core';
import type { Database } from './index';
import {
  sharedPrivacyForEvents,
  hiddenSharedTitle,
  hiddenSharedSummary,
  projectMemoryImpact,
} from './shared-privacy';

export type SharedCanonRow = Record<string, unknown> & {
  id: string;
  context_id: string;
  sequence: number;
  effective_at: string;
  candidate: SharedEventCandidate;
  decision: unknown;
  canon_hash: string;
};
export async function projectSharedEvent(
  tx: Database,
  row: SharedCanonRow,
  ownMemberId: string,
) {
  const candidate = sharedEventCandidateSchema.parse(row.candidate);
  const envelope =
    row.decision === null
      ? null
      : sharedDecisionEnvelopeSchema.parse(row.decision);
  const [own] = await tx.query(
    'SELECT option_id,created_at FROM aw_shared_intents WHERE event_id=$1 AND member_id=$2',
    [row.id, ownMemberId],
  );
  const [count] = await tx.query(
    'SELECT count(*)::int AS count FROM aw_shared_intents WHERE event_id=$1',
    [row.id],
  );
  const [resolution] = await tx.query(
    'SELECT id,result,canon_hash,resolved_at FROM aw_shared_resolutions WHERE event_id=$1',
    [row.id],
  );
  const result = resolution
    ? sharedResolutionResultSchema.parse(resolution.result)
    : null;
  const privacy = (await sharedPrivacyForEvents(tx, [row.id])).get(row.id);
  const ids = (values: string[]) =>
    privacy
      ? values.filter((id) => !privacy.unavailableMemberIds.includes(id))
      : values;
  return {
    id: row.id,
    contextId: row.context_id,
    sequence: row.sequence,
    effectiveAt: row.effective_at,
    title: privacy ? hiddenSharedTitle : candidate.title,
    summary: privacy ? hiddenSharedSummary : candidate.summary,
    privacyRedacted: Boolean(privacy),
    participantMemberIds: ids(candidate.participantMemberIds),
    canonHash: row.canon_hash,
    decision: envelope
      ? {
          id: envelope.decision.id,
          prompt: privacy
            ? 'Recorded shared decision'
            : envelope.decision.prompt,
          policy: envelope.decision.policy,
          eligibleMemberIds: ids(envelope.decision.eligibleMemberIds),
          openedAt: envelope.openedAt,
          closesAt: envelope.closesAt,
          options: envelope.decision.options.map((o) => ({
            id: o.id,
            label: privacy
              ? privacy.participatingOptionIds.includes(o.id)
                ? 'Express interest'
                : 'Decline or postpone'
              : o.label,
            description: privacy
              ? 'Original details are withheld. The recorded response is unchanged.'
              : o.description,
          })),
        }
      : null,
    responseCount: Number(count?.count ?? 0),
    ownResponse: own
      ? { optionId: own.option_id, submittedAt: own.created_at }
      : null,
    resolution: result
      ? {
          id: resolution!.id,
          status: result.status,
          reason: result.reason,
          selectedOptionId: result.selectedOptionId,
          participatingMemberIds: ids(result.participatingMemberIds),
          participatingCount: result.participatingMemberIds.length,
          canonHash: resolution!.canon_hash,
          resolvedAt: resolution!.resolved_at,
        }
      : null,
  };
}

// Caller already holds the affected user rows and this context in global order.
// A lifecycle mutation incorporates the cancellation in its single revision bump.
export async function cancelPendingSharedDecision(
  tx: Database,
  contextId: string,
  reason: 'participant_unavailable' | 'context_ended',
  memberId: string | null = null,
  bumpRevision = false,
) {
  const [row] = await tx.query(
    'SELECT c.state,c.pending_event_id,e.decision FROM aw_shared_contexts c JOIN aw_shared_events e ON e.id=c.pending_event_id WHERE c.id=$1 FOR UPDATE OF c,e',
    [contextId],
  );
  if (!row) return false;
  if (
    memberId &&
    !(
      await tx.query(
        'SELECT member_id FROM aw_shared_event_participants WHERE event_id=$1 AND member_id=$2',
        [row.pending_event_id, memberId],
      )
    ).length
  )
    return false;
  const envelope = sharedDecisionEnvelopeSchema.parse(row.decision);
  const intents = await tx.query(
    'SELECT member_id,option_id FROM aw_shared_intents WHERE event_id=$1 ORDER BY member_id',
    [row.pending_event_id],
  );
  const result: SharedResolutionResult = {
    schemaVersion: SHARED_CONTEXT_CONTRACT_VERSION,
    status: 'cancelled',
    reason,
    selectedOptionId: null,
    participatingMemberIds: [],
    responses: intents.map((i) => ({
      memberId: String(i.member_id),
      optionId: String(i.option_id),
    })),
  };
  const id = randomUUID();
  await tx.query(
    'INSERT INTO aw_shared_resolutions(id,event_id,context_id,policy,result,state_before,state_after,canon_hash) VALUES($1,$2,$3,$4,$5,$6,$6,$7)',
    [
      id,
      row.pending_event_id,
      contextId,
      JSON.stringify(envelope.decision.policy),
      JSON.stringify(result),
      JSON.stringify(row.state),
      hash({
        eventId: row.pending_event_id,
        result,
        stateBefore: row.state,
        stateAfter: row.state,
      }),
    ],
  );
  await tx.query(
    'UPDATE aw_shared_contexts SET pending_event_id=NULL,revision=revision+$2,updated_at=now() WHERE id=$1',
    [contextId, bumpRevision ? 1 : 0],
  );
  return true;
}

export async function exportSharedCanon(tx: Database, userId: string) {
  const rows = await tx.query<SharedCanonRow & { own_member_id: string }>(
    'SELECT e.*,e.effective_at::text,m.id AS own_member_id FROM aw_shared_events e JOIN aw_shared_event_participants p ON p.event_id=e.id JOIN aw_shared_members m ON m.id=p.member_id WHERE m.user_id=$1 ORDER BY e.context_id,e.sequence',
    [userId],
  );
  const events = [];
  for (const row of rows)
    events.push(await projectSharedEvent(tx, row, row.own_member_id));
  const impacts = await tx.query(
    'SELECT i.id,i.context_id,i.event_id,i.resolution_id,i.member_id,i.target_branch_id,i.effective_at::text,i.kind,i.payload,i.payload_hash,i.status,i.applied_revision,i.applied_at FROM aw_shared_impacts i JOIN aw_shared_members m ON m.id=i.member_id WHERE m.user_id=$1 ORDER BY i.effective_at,i.created_at,i.id',
    [userId],
  );
  const privacy = await sharedPrivacyForEvents(
    tx,
    impacts.map((i) => String(i.event_id)),
  );
  return {
    events,
    impacts: impacts.map((i) =>
      privacy.has(String(i.event_id))
        ? {
            ...i,
            payload: projectMemoryImpact(
              i.payload,
              privacy.get(String(i.event_id)),
            ),
            privacyRedacted: true,
            projectionHash: hash(
              projectMemoryImpact(i.payload, privacy.get(String(i.event_id))),
            ),
          }
        : i,
    ),
  };
}
