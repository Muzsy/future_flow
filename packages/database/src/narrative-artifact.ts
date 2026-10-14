import {
  narrativeV1ContextSchema,
  NARRATIVE_MEMORY_BYTES,
  type NarrativeArtifact,
  type NarrativePeriodInput,
  type PeriodChapterV2,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  validateNarrativeArtifact,
  validateNarrativePlan,
  validateNarrativeEditorialReport,
  validateNarrativeChapterV1,
  narrativeReferenceSnapshot,
  type NarrativeReferences,
  type simulatePeriodV2,
} from '@future-flow/core';
import type { Database } from './index';
import { personalPrivacyEventIds } from './shared-privacy';

export type NarrativeCommit = {
  artifact: NarrativeArtifact;
  expectedBindings: NarrativeArtifact['bindings'];
};
type Canon = ReturnType<typeof simulatePeriodV2>;
export async function ownedNarrativeReferences(
  tx: Database,
  userId: string,
  branchId: string,
): Promise<NarrativeReferences> {
  // Reference authority is metadata only: no historical prose, summaries,
  // actor biographies or raw narrative artifacts are loaded here.
  const history = await tx.query<{
    id: string;
    position: number;
    events: {
      id: string;
      decisionId: string | null;
      optionIds: string[];
      introducedActorIds: string[];
    }[];
    thread_ids: string[];
  }>(
    `SELECT p.id,h.position,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',e->>'id','decisionId',e->'decision'->>'id',
        'optionIds',COALESCE((SELECT jsonb_agg(o->>'id') FROM jsonb_array_elements(COALESCE(NULLIF(e->'decision'->'options','null'::jsonb),'[]'::jsonb)) o),'[]'::jsonb),
        'introducedActorIds',COALESCE((SELECT jsonb_agg(c->'value'->>'id') FROM jsonb_array_elements(e->'changes') c WHERE c->>'type'='actor_add'),'[]'::jsonb))) FROM jsonb_array_elements(p.events) e),'[]'::jsonb) AS events,
      COALESCE((SELECT jsonb_agg(t->>'id') FROM jsonb_array_elements(COALESCE(p.narrative_artifact->'validatedMemoryDelta'->'threadUpdates','[]'::jsonb)) t),'[]'::jsonb) AS thread_ids
      FROM aw_history h JOIN aw_periods p ON p.id=h.period_id AND p.user_id=h.user_id WHERE h.branch_id=$1 AND h.user_id=$2 ORDER BY h.position`,
    [branchId, userId],
  );
  const supplied = await tx.query<{
    actors: { id: string; label: string }[];
    current_actors: { id: string; label: string }[];
  }>(
    "SELECT l.input->'initialState'->'actors' AS actors,b.state->'actors' AS current_actors FROM aw_branches b JOIN aw_lives l ON l.id=b.life_id AND l.user_id=b.user_id WHERE b.id=$1 AND b.user_id=$2",
    [branchId, userId],
  );
  const forbiddenActorIds = new Set(
    supplied.flatMap((row) => row.actors.map((actor) => actor.id)),
  );
  const forbiddenActorLabels = new Set(
    supplied.flatMap((row) =>
      row.actors.map((actor) => actor.label.trim().toLocaleLowerCase('en')),
    ),
  );
  const [shared] = await tx.query(
    "SELECT to_regclass('public.aw_shared_members') IS NOT NULL AS present",
  );
  if (shared?.present === true) {
    const participants = await tx.query<{
      id: string;
      user_id: string | null;
      display_name: string | null;
    }>(
      `SELECT DISTINCT m.id,m.user_id,m.interaction_profile->>'displayName' AS display_name FROM aw_shared_members m
        WHERE m.context_id IN (SELECT context_id FROM aw_shared_members WHERE user_id=$1 AND branch_id=$2
        UNION SELECT e.context_id FROM aw_shared_personal_memories pm JOIN aw_shared_events e ON e.id=pm.event_id WHERE pm.user_id=$1 AND pm.branch_id=$2)`,
      [userId, branchId],
    );
    for (const member of participants) {
      forbiddenActorIds.add(member.id);
      if (member.user_id) forbiddenActorIds.add(member.user_id);
      if (member.display_name)
        forbiddenActorLabels.add(
          member.display_name.trim().toLocaleLowerCase('en'),
        );
    }
  }
  for (const row of supplied)
    for (const actor of row.current_actors)
      if (forbiddenActorLabels.has(actor.label.trim().toLocaleLowerCase('en')))
        forbiddenActorIds.add(actor.id);
  return {
    periodPositions: new Map(history.map((p) => [p.id, p.position])),
    historyEventIds: new Set(history.flatMap((p) => p.events.map((e) => e.id))),
    usedCanonicalIds: new Set(
      history.flatMap((p) =>
        p.events.flatMap((e) => [
          e.id,
          ...(e.decisionId ? [e.decisionId, ...e.optionIds] : []),
        ]),
      ),
    ),
    usedThreadIds: new Set(history.flatMap((p) => p.thread_ids)),
    forbiddenActorIds,
    forbiddenActorLabels,
    fictionalActorOrigins: new Map(
      history.flatMap((p) =>
        p.events.flatMap((e) =>
          e.introducedActorIds
            .filter((id) => !forbiddenActorIds.has(id))
            .map((id) => [id, e.id] as const),
        ),
      ),
    ),
  };
}
export async function validateNarrativeCommit(
  tx: Database,
  userId: string,
  branchId: string,
  input: NarrativePeriodInput,
  canon: Canon,
  chapter: PeriodChapterV2,
  receipts: unknown[],
  commit: NarrativeCommit | undefined,
): Promise<NarrativeArtifact | null> {
  if (input.narrativeContext?.policy.mode !== 'narrative-v1') {
    if (commit)
      throw new DomainError(
        'NARRATIVE_CONTEXT_INVALID',
        'Legacy periods cannot contain narrative artifacts.',
      );
    return null;
  }
  if (!commit)
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Narrative periods require a validated artifact.',
    );
  const context = narrativeV1ContextSchema.parse(input.narrativeContext);
  if (
    context.memory.branchId !== branchId ||
    context.memory.baseRevision !== input.revision ||
    context.memory.history.some((period) => period.endDate > input.startDate) ||
    context.memory.recentChoices.some(
      (choice) => !input.acceptedDecisionIds.includes(choice.decisionId),
    ) ||
    Buffer.byteLength(JSON.stringify(context.memory), 'utf8') >
      NARRATIVE_MEMORY_BYTES ||
    (!context.memory.withheld &&
      (await personalPrivacyEventIds(tx, userId, branchId, input.startDate))
        .length > 0)
  )
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Narrative memory belongs to another revision.',
    );
  const expected = {
    ...commit.expectedBindings,
    policyHash: hash(context.policy),
    memoryHash: hash(context.memory),
    referenceHash: hash(
      narrativeReferenceSnapshot(
        await ownedNarrativeReferences(tx, userId, branchId),
      ),
    ),
    candidateHash: hash(canon.period),
    canonHash: hash(canon.events),
    planHash: hash(commit.artifact.validatedPlan),
    planningOutputHash: hash({
      version: '1.0.0',
      candidate: canon.period,
      plan: commit.artifact.validatedPlan,
    }),
    chapterHash: hash(chapter),
    fidelityOutputHash: hash({ valid: true, issues: [] }),
  };
  const artifact = validateNarrativeArtifact(commit.artifact, expected);
  validateNarrativeChapterV1(chapter, canon.events);
  validateNarrativePlan(
    { version: '1.0.0', candidate: canon.period, plan: artifact.validatedPlan },
    canon,
    context.memory,
    await ownedNarrativeReferences(tx, userId, branchId),
  );
  validateNarrativeEditorialReport(artifact.editorialReport, chapter, canon);
  for (const reference of artifact.provenance.receiptRefs) {
    const receipt = receipts[reference.ordinal] as
      Record<string, unknown> | undefined;
    if (
      !receipt ||
      receipt.task !== reference.task ||
      receipt.inputHash !== reference.inputHash ||
      receipt.outputHash !== reference.outputHash ||
      receipt.model !== reference.model ||
      receipt.promptVersion !==
        `${artifact.policy.promptVersions[reference.task === 'life_narrative_plan' ? 'planner' : reference.task === 'life_narrative_chapter' ? 'writer' : reference.task === 'life_fidelity' ? 'fidelity' : 'editor']}.${input.input.locale}`
    )
      throw new DomainError(
        'NARRATIVE_CONTEXT_INVALID',
        'Narrative provenance differs from persisted receipts.',
      );
  }
  if (receipts.length !== artifact.provenance.receiptRefs.length)
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Narrative receipts are incomplete.',
    );
  return artifact;
}
