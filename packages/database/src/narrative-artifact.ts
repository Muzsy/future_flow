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
  const history = await tx.query<{
    id: string;
    position: number;
    events: {
      id: string;
      decision?: { id: string; options: { id: string }[] } | null;
      changes: { type: string; value: { id?: string } }[];
    }[];
    narrative_artifact: NarrativeArtifact | null;
  }>(
    'SELECT p.id,h.position,p.events,p.narrative_artifact FROM aw_history h JOIN aw_periods p ON p.id=h.period_id AND p.user_id=h.user_id WHERE h.branch_id=$1 AND h.user_id=$2 ORDER BY h.position',
    [branchId, userId],
  );
  return {
    periodPositions: new Map(history.map((p) => [p.id, p.position])),
    historyEventIds: new Set(
      history.flatMap((p) => p.events.map((event) => event.id)),
    ),
    usedCanonicalIds: new Set(
      history.flatMap((p) =>
        p.events.flatMap((event) => [
          event.id,
          ...(event.decision
            ? [
                event.decision.id,
                ...event.decision.options.map((option) => option.id),
              ]
            : []),
        ]),
      ),
    ),
    usedThreadIds: new Set(
      history.flatMap(
        (p) =>
          p.narrative_artifact?.validatedMemoryDelta.threadUpdates.map(
            (thread) => thread.id,
          ) ?? [],
      ),
    ),
    forbiddenActorIds: new Set(),
    fictionalActorOrigins: new Map(
      history.flatMap((p) =>
        p.events.flatMap((event) =>
          event.changes
            .filter(
              (change) =>
                change.type === 'actor_add' &&
                typeof change.value.id === 'string',
            )
            .map((change) => [change.value.id!, event.id] as const),
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
