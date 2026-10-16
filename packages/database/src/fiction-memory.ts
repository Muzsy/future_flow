import {
  fictionArtifactSchema,
  narrativeArtifactSchema,
  fictionContextSchema,
  fictionPolicy,
  NARRATIVE_MEMORY_BYTES,
  type NarrativeMemory,
  type FictionSequenceEntry,
  type StoryFact,
  type FictionReferences,
  type FictionArtifact,
  type NarrativePeriodInput,
  type PeriodChapterV2,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  narrativeReferenceSnapshot,
  validatedFictionCheckpoint,
} from '@future-flow/core';
import type { Database } from './index';
import { ownedNarrativeReferences } from './narrative-artifact';
import { personalPrivacyEventIds } from './shared-privacy';

export async function ownedFictionReferences(
  tx: Database,
  userId: string,
  branchId: string,
): Promise<FictionReferences> {
  const rows = await tx.query<{ facts: { id: string; eventId: string }[] }>(
    `SELECT COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f->>'id','eventId',f->>'introducedByEventId'))
      FROM jsonb_array_elements(COALESCE(p.narrative_artifact->'storyFacts','[]'::jsonb)) f),'[]'::jsonb) AS facts
      FROM aw_history h JOIN aw_periods p ON p.id=h.period_id AND p.user_id=h.user_id
      WHERE h.branch_id=$1 AND h.user_id=$2 ORDER BY h.position`,
    [branchId, userId],
  );
  return {
    facts: rows
      .flatMap((r) => r.facts)
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function boundFictionContext(
  rawMemory: NarrativeMemory,
  allFacts: StoryFact[],
  sequenceHistory?: FictionSequenceEntry[],
) {
  const memory = structuredClone(rawMemory);
  let facts = memory.withheld
    ? []
    : allFacts.filter((f) => f.relevance === 'continuity').slice(-24);
  // An actor's presence must not pin every historical detail forever. The
  // durable archive keeps all facts; pin only their latest continuity fact.
  const latestActorFacts = new Set(
    memory.fictionalActors.flatMap((actor) => {
      const fact = [...allFacts]
        .reverse()
        .find(
          (f) =>
            f.relevance === 'continuity' &&
            f.aboutActorIds.includes(actor.actorId),
        );
      return fact ? [fact.id] : [];
    }),
  );
  const mandatory = new Set(
    allFacts
      .filter(
        (f) =>
          f.relevance === 'continuity' &&
          (memory.openThreads.some((t) =>
            t.eventRefs.includes(f.introducedByEventId),
          ) ||
            latestActorFacts.has(f.id)),
      )
      .map((f) => f.id),
  );
  // Pin unresolved thread evidence, not every historical fact labelled promise.
  // Completed allocations can also be recorded as promises; keeping all of them
  // forever would exhaust context despite their full durable archive.
  for (const f of allFacts)
    if (mandatory.has(f.id) && !facts.some((a) => a.id === f.id))
      facts.unshift(f);
  const size = () =>
    Buffer.byteLength(
      JSON.stringify({
        memory,
        storyFacts: facts,
        ...(sequenceHistory ? { sequenceHistory } : {}),
      }),
      'utf8',
    );
  for (const p of memory.history) {
    if (size() <= NARRATIVE_MEMORY_BYTES) break;
    p.excerpt = null;
  }
  const protectedPeriods = new Set([
    memory.history.at(-1)?.periodId,
    ...memory.openThreads.map((t) => t.originPeriodId),
  ]);
  while (
    size() > NARRATIVE_MEMORY_BYTES &&
    memory.history.some((p) => !protectedPeriods.has(p.periodId))
  )
    memory.history.splice(
      memory.history.findIndex((p) => !protectedPeriods.has(p.periodId)),
      1,
    );
  while (
    size() > NARRATIVE_MEMORY_BYTES &&
    memory.recentDecisionPatterns.length
  )
    memory.recentDecisionPatterns.shift();
  while (size() > NARRATIVE_MEMORY_BYTES && memory.recentChoices.length > 1)
    memory.recentChoices.shift();
  while (
    (size() > NARRATIVE_MEMORY_BYTES || facts.length > 24) &&
    facts.some((f) => !mandatory.has(f.id))
  )
    facts.splice(
      facts.findIndex((f) => !mandatory.has(f.id)),
      1,
    );
  if (size() > NARRATIVE_MEMORY_BYTES || facts.length > 24)
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Required fiction continuity cannot fit its context bound.',
    );
  return fictionContextSchema.parse({
    policy: fictionPolicy(),
    memory,
    storyFacts: facts,
    ...(sequenceHistory ? { sequenceHistory } : {}),
  });
}
export async function personalFictionContext(
  tx: Database,
  userId: string,
  branchId: string,
  memory: NarrativeMemory,
) {
  if (memory.withheld) return boundFictionContext(memory, []);
  const rows = await tx.query<{
    artifact: unknown;
    period_id: string;
    chapter: { body: string };
    events: { title: string; summary: string }[];
  }>(
    `SELECT h.period_id, p.chapter, p.events, p.narrative_artifact AS artifact FROM aw_history h JOIN aw_periods p ON p.id=h.period_id AND p.user_id=h.user_id
      WHERE h.branch_id=$1 AND h.user_id=$2 ORDER BY h.position`,
    [branchId, userId],
  );
  const active = new Map<string, StoryFact>();
  for (const row of rows) {
    if ((row.artifact as { version?: unknown } | null)?.version !== '2.0.0')
      continue;
    const artifact = fictionArtifactSchema.parse(row.artifact);
    for (const fact of artifact.storyFacts) {
      if (fact.supersedesFactId) active.delete(fact.supersedesFactId);
      active.set(fact.id, fact);
    }
  }
  const sequenceHistory = rows.slice(-3).map((row) => {
    const plan = row.artifact
      ? ((row.artifact as { version?: unknown }).version === '2.0.0'
          ? fictionArtifactSchema.parse(row.artifact)
          : narrativeArtifactSchema.parse(row.artifact)
        ).validatedPlan
      : null;
    return {
      periodId: row.period_id,
      scenes: plan
        ? plan.scenes.map(
            (scene) =>
              `${scene.visibleAction.slice(0, 90)} | ${scene.obstacle.slice(0, 90)} | ${scene.shift.slice(0, 90)}`,
          )
        : row.events
            .slice(0, 3)
            .map((event) => `${event.title}: ${event.summary}`.slice(0, 300)),
      opening: row.chapter.body.slice(0, 400),
      ending: row.chapter.body.slice(-500),
    };
  });
  return boundFictionContext(memory, [...active.values()], sequenceHistory);
}

export type FictionCommit = {
  artifact: FictionArtifact;
  expectedBindings: FictionArtifact['bindings'];
};
export async function validateFictionCommit(
  tx: Database,
  userId: string,
  branchId: string,
  input: NarrativePeriodInput,
  chapter: PeriodChapterV2,
  candidate: unknown,
  receipts: unknown[],
  cp: Record<string, unknown>,
  commit: FictionCommit,
) {
  if (!commit)
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Creative periods require a final artifact proof.',
    );
  const ready = validatedFictionCheckpoint(cp, input);
  if (
    hash(ready.artifact) !== hash(commit.artifact) ||
    hash(ready.expectedBindings) !== hash(commit.expectedBindings) ||
    hash(ready.chapter) !== hash(chapter) ||
    hash(ready.candidate) !== hash(candidate) ||
    hash(ready.receipts) !== hash(receipts) ||
    hash(input.narrativeReferences) !==
      hash(
        narrativeReferenceSnapshot(
          await ownedNarrativeReferences(tx, userId, branchId),
        ),
      ) ||
    hash(input.fictionReferences) !==
      hash(await ownedFictionReferences(tx, userId, branchId)) ||
    (!fictionContextSchema.parse(input.narrativeContext).memory.withheld &&
      (await personalPrivacyEventIds(tx, userId, branchId, input.startDate))
        .length)
  )
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Fiction commit differs from its persisted proof or current privacy/history.',
    );
  return ready.artifact;
}
