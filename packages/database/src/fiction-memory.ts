import {
  fictionArtifactSchema,
  narrativeArtifactSchema,
  fictionContextSchema,
  fictionEditorialVersionFor,
  fictionPolicy,
  fictionV9Policy,
  fictionSeriesLedgerSchema,
  fictionSeriesLedgerV11Schema,
  fictionSeriesQualityVersions,
  NARRATIVE_MEMORY_BYTES,
  type FictionCharacterEnvelope,
  type FictionCharacterProjection,
  type FictionSeriesLedger,
  type FictionTurnType,
  type NarrativeMemory,
  type FictionSequenceEntry,
  type FictionSequenceSignature,
  type StoryFact,
  type FictionReferences,
  type FictionArtifact,
  type NarrativePeriodInput,
  type PeriodChapterV2,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  fictionCharacterProjectionFromEnvelope,
  fictionSeriesLedgerFrom,
  fictionRecurringCastCandidates,
  fictionSeriesLedgerV11From,
  narrativeReferenceSnapshot,
  type SeriesLedgerPeriod,
  type SeriesLedgerState,
  validatedFictionCheckpoint,
} from '@future-flow/core';
import type { Database } from './index';
import {
  assertFictionCharacterFold,
  fictionCharacterEnvelopeFrom,
  fictionCharacterSignals,
  ownedFictionCharacterFold,
} from './fiction-character';
import { ownedNarrativeReferences } from './narrative-artifact';

// Which policy generation a new period is generated with. v8 is the default
// and stays frozen; v9 is the explicit living-world selection.
export type FictionGeneration = 'v8' | 'v9';
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

// Living-world sequence evidence limits and summary protection (plan D.8, A1).
export const FICTION_LIVING_OPENING_CHARS = 160;
export const FICTION_LIVING_ENDING_CHARS = 300;
export const FICTION_LIVING_PROTECTED_SUMMARIES = 3;

export function boundFictionContext(
  rawMemory: NarrativeMemory,
  allFacts: StoryFact[],
  sequenceHistory?: FictionSequenceEntry[],
  signatureHistory?: FictionSequenceSignature[],
  seriesLedger?: FictionSeriesLedger,
  // Living-world generation only: the bounded character projection (its own
  // byte bound, outside the memory bound) selects the v9 policy.
  characterProjection?: FictionCharacterProjection,
) {
  // The ledger quotes owned prose, so withholding drops it like other history.
  seriesLedger = rawMemory.withheld ? undefined : seriesLedger;
  // Withholding clears both historical projections even for direct callers.
  allFacts = rawMemory.withheld ? [] : allFacts;
  sequenceHistory = rawMemory.withheld ? [] : sequenceHistory;
  const sequenceSignatureHistory = rawMemory.withheld
    ? []
    : structuredClone(signatureHistory ?? []).slice(-8);
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
  const selectedFacts = new Set(facts.map((f) => f.id));
  facts = allFacts.filter(
    (f) => mandatory.has(f.id) || selectedFacts.has(f.id),
  );
  // Living-world generation: the series ledger already carries repeated
  // openings and closings, so the raw sequence text is cut first; the chapter
  // summaries (the planner's causal memory) are what the bound protects.
  if (characterProjection && sequenceHistory)
    sequenceHistory = sequenceHistory.map((entry) => ({
      ...entry,
      opening: entry.opening.slice(0, FICTION_LIVING_OPENING_CHARS),
      ending: entry.ending.slice(-FICTION_LIVING_ENDING_CHARS),
    }));
  const size = () =>
    Buffer.byteLength(
      JSON.stringify({
        memory,
        storyFacts: facts,
        ...(sequenceHistory ? { sequenceHistory } : {}),
        ...(signatureHistory ? { sequenceSignatureHistory } : {}),
      }),
      'utf8',
    );
  for (const p of memory.history) {
    if (size() <= NARRATIVE_MEMORY_BYTES) break;
    p.excerpt = null;
  }
  // v8 protects the latest summary; the living-world generation the latest
  // FICTION_LIVING_PROTECTED_SUMMARIES, so the planner sees recent causality.
  const threadOrigins = memory.openThreads.map((t) => t.originPeriodId);
  const protectedPeriods = new Set([
    ...memory.history
      .slice(characterProjection ? -FICTION_LIVING_PROTECTED_SUMMARIES : -1)
      .map((p) => p.periodId),
    ...threadOrigins,
  ]);
  // Raw sequence text goes before any summary is deleted (living world only).
  while (
    characterProjection &&
    size() > NARRATIVE_MEMORY_BYTES &&
    sequenceHistory &&
    sequenceHistory.length > 1
  )
    sequenceHistory = sequenceHistory.slice(1);
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
  while (size() > NARRATIVE_MEMORY_BYTES && sequenceSignatureHistory.length)
    sequenceSignatureHistory.shift();
  // Raw sequence excerpts are repetition evidence, not continuity: drop the
  // oldest first and keep the nearest period. The series ledger travels
  // outside this bound, so repeated openings and closings stay visible.
  if (sequenceHistory) sequenceHistory = sequenceHistory.slice();
  while (
    size() > NARRATIVE_MEMORY_BYTES &&
    sequenceHistory &&
    sequenceHistory.length > 1
  )
    sequenceHistory.shift();
  // Last resort before failing the period: only the latest summary stays
  // protected, the older recent ones go oldest first.
  if (characterProjection) {
    const latest = new Set([memory.history.at(-1)?.periodId, ...threadOrigins]);
    while (
      size() > NARRATIVE_MEMORY_BYTES &&
      memory.history.some((p) => !latest.has(p.periodId))
    )
      memory.history.splice(
        memory.history.findIndex((p) => !latest.has(p.periodId)),
        1,
      );
  }
  if (size() > NARRATIVE_MEMORY_BYTES || facts.length > 24)
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Required fiction continuity cannot fit its context bound.',
    );
  return fictionContextSchema.parse({
    policy: characterProjection ? fictionV9Policy() : fictionPolicy(),
    memory,
    storyFacts: facts,
    ...(sequenceHistory ? { sequenceHistory } : {}),
    ...(signatureHistory ? { sequenceSignatureHistory } : {}),
    ...(seriesLedger ? { seriesLedger } : {}),
    ...(characterProjection ? { characterProjection } : {}),
  });
}
// v8 entry point, unchanged for existing callers.
export async function personalFictionContext(
  tx: Database,
  userId: string,
  branchId: string,
  memory: NarrativeMemory,
) {
  return (await personalFictionPeriod(tx, userId, branchId, memory)).context;
}
// The period's model context plus, for the living-world generation, the
// server-only character envelope that reproduces its projection.
export async function personalFictionPeriod(
  tx: Database,
  userId: string,
  branchId: string,
  memory: NarrativeMemory,
  options: {
    generation?: FictionGeneration;
    stateActorIds?: readonly string[];
  } = {},
): Promise<{
  context: ReturnType<typeof boundFictionContext>;
  fictionCharacters?: FictionCharacterEnvelope;
}> {
  const living = options.generation === 'v9';
  const policy = living ? fictionV9Policy() : fictionPolicy();
  // The fold depends on the owned prefix only, so it is derived before the
  // ledger: the ledger names the recurring cast, the cast comes from the fold.
  const fold = living
    ? await ownedFictionCharacterFold(
        tx,
        userId,
        branchId,
        memory.fictionalActors,
        options.stateActorIds ?? [],
      )
    : undefined;
  const withLiving = (
    context: (
      projection?: FictionCharacterProjection,
    ) => ReturnType<typeof boundFictionContext>,
    ledger?: FictionSeriesLedger,
  ) => {
    if (!fold) return { context: context() };
    const envelope = fictionCharacterEnvelopeFrom(
      fold,
      fictionCharacterSignals(memory, ledger, fold),
    );
    return {
      context: context(
        fictionCharacterProjectionFromEnvelope(envelope, memory.withheld),
      ),
      fictionCharacters: envelope,
    };
  };
  if (memory.withheld)
    return withLiving((projection) =>
      boundFictionContext(
        memory,
        [],
        undefined,
        undefined,
        undefined,
        projection,
      ),
    );
  const rows = await tx.query<{
    artifact: unknown;
    period_id: string;
    chapter: { body: string };
    events: (SeriesLedgerPeriod['events'][number] & {
      title: string;
      summary: string;
    })[];
    end_state: SeriesLedgerState | null;
  }>(
    `SELECT h.period_id, p.chapter, p.events, p.end_state, p.narrative_artifact AS artifact FROM aw_history h JOIN aw_periods p ON p.id=h.period_id AND p.user_id=h.user_id
      WHERE h.branch_id=$1 AND h.user_id=$2 ORDER BY h.position`,
    [branchId, userId],
  );
  const active = new Map<string, StoryFact>();
  const signatures: FictionSequenceSignature[] = [];
  // The planner's turn label of each owned period (null: unlabelled or older).
  const turns: (FictionTurnType | null)[] = [];
  for (const row of rows) {
    if ((row.artifact as { version?: unknown } | null)?.version !== '2.0.0') {
      turns.push(null);
      continue;
    }
    const artifact = fictionArtifactSchema.parse(row.artifact);
    turns.push(artifact.turnType ?? null);
    if (
      artifact.editorialReport.version === '1.2.0' ||
      artifact.editorialReport.version === '1.3.0'
    ) {
      if (
        fictionEditorialVersionFor(artifact.policy.qualityPolicyVersion) !==
          artifact.editorialReport.version ||
        artifact.editorialReport.sequenceSignature.periodId !== row.period_id ||
        hash(artifact.editorialReport) !== artifact.bindings.editorialOutputHash
      )
        throw new DomainError(
          'NARRATIVE_CONTEXT_INVALID',
          'Historical sequence signature differs from its owned artifact proof.',
        );
      signatures.push(artifact.editorialReport.sequenceSignature);
    }
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
  const last = rows.at(-1);
  const ledgerPeriods = rows.map((row) => ({
    periodId: row.period_id,
    body: row.chapter.body,
    events: row.events,
  }));
  // Legacy rows without a stored end state contribute no people.
  const ledgerState = last?.end_state ?? { actors: [], goals: [] };
  const seriesLedger =
    last && fictionSeriesQualityVersions.includes(policy.qualityPolicyVersion)
      ? fold
        ? fictionSeriesLedgerV11Schema.parse(
            fictionSeriesLedgerV11From(ledgerPeriods, ledgerState, {
              branchId,
              cast: fictionRecurringCastCandidates(fold.state.actors),
              turns,
            }),
          )
        : fictionSeriesLedgerSchema.parse(
            fictionSeriesLedgerFrom(ledgerPeriods, ledgerState),
          )
      : undefined;
  return withLiving(
    (projection) =>
      boundFictionContext(
        memory,
        [...active.values()],
        sequenceHistory,
        signatures.slice(-8),
        seriesLedger,
        projection,
      ),
    seriesLedger,
  );
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
  await assertFictionCharacterFold(tx, userId, branchId, input);
  return ready.artifact;
}
