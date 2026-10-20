import {
  fictionCharacterEnvelopeSchema,
  fictionCharacterQualityVersions,
  fictionContextSchema,
  FICTION_CHARACTER_VERSION,
  type FictionCharacterEnvelope,
  type FictionalActorMemory,
  type FictionSeriesLedger,
  type NarrativeMemory,
  type NarrativePeriodInput,
} from '@future-flow/contracts';
import {
  characterStateFromHistory,
  DomainError,
  fictionCharacterSeedFromLegacy,
  hash,
  type FictionCharacterHistoryEntry,
} from '@future-flow/core';
import type { Database } from './index';
import { ownedNarrativeReferences } from './narrative-artifact';

// A private-life person unseen for this many chapters is a relevance signal.
// Provisional (plan appendix C); evidence, never a quota.
export const FICTION_CHARACTER_OVERDUE_CHAPTERS = 3;
const SIGNAL_ACTORS = 60;

type CharacterRow = {
  period_id: string;
  delta: unknown;
  introduced: string[];
  events: { id: string; actorIds: string[] }[];
};

// The deterministic part of the character envelope: it depends only on the
// owned prefix (periods and their stored deltas) and the legacy seed, so the
// worker commit can recompute and compare it.
export async function ownedFictionCharacterFold(
  tx: Database,
  userId: string,
  branchId: string,
  legacyActors: readonly FictionalActorMemory[],
  stateActorIds: readonly string[],
) {
  const rows = await tx.query<CharacterRow>(
    `SELECT p.id AS period_id, p.narrative_artifact->'characterDelta' AS delta,
      COALESCE((SELECT jsonb_agg(c->'value'->>'id') FROM jsonb_array_elements(p.events) e, jsonb_array_elements(e->'changes') c WHERE c->>'type'='actor_add'),'[]'::jsonb) AS introduced,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e->>'id','actorIds',COALESCE(e->'actorIds','[]'::jsonb))) FROM jsonb_array_elements(p.events) e),'[]'::jsonb) AS events
      FROM aw_history h JOIN aw_periods p ON p.id=h.period_id AND p.user_id=h.user_id
      WHERE h.branch_id=$1 AND h.user_id=$2 ORDER BY h.position`,
    [branchId, userId],
  );
  const references = await ownedNarrativeReferences(tx, userId, branchId);
  const origins = new Map(references.fictionalActorOrigins ?? []);
  // Only actors introduced before the living-world generation are seeded from
  // their recorded legacy fields; nothing is inferred from older prose.
  const preDelta = new Set(
    rows.filter((r) => r.delta == null).flatMap((r) => r.introduced),
  );
  const seed = fictionCharacterSeedFromLegacy(
    legacyActors.filter((actor) => preDelta.has(actor.actorId)),
  );
  const history: FictionCharacterHistoryEntry[] = rows.map((row) => ({
    periodId: row.period_id,
    delta: row.delta ?? null,
  }));
  const suppliedActorIds = stateActorIds
    .filter((id) => !origins.has(id))
    .sort();
  const state = characterStateFromHistory(
    history,
    { fictionalOrigins: origins, suppliedActorIds: new Set(suppliedActorIds) },
    // The seed carries no owned periods; every period then counts itself.
    seed,
  );
  return {
    state,
    fictionalOrigins: [...origins]
      .map(([actorId, introducedByEventId]) => ({
        actorId,
        introducedByEventId,
      }))
      .sort((a, b) => a.actorId.localeCompare(b.actorId)),
    suppliedActorIds,
    eventActors: new Map(
      rows.flatMap((r) => r.events.map((e) => [e.id, e.actorIds] as const)),
    ),
  };
}

// What the commit re-derives: equal to the persisted envelope's fold part or
// the proof no longer describes the owned prefix.
export const fictionCharacterFoldHash = (
  fold: Pick<
    FictionCharacterEnvelope,
    'state' | 'fictionalOrigins' | 'suppliedActorIds'
  >,
) =>
  hash({
    state: fold.state,
    fictionalOrigins: fold.fictionalOrigins,
    suppliedActorIds: fold.suppliedActorIds,
  });

// Server-computed relevance signals that exist before the planner runs. They
// name people only; the projection decides what is shown (plan 15.3).
export function fictionCharacterSignals(
  memory: NarrativeMemory,
  ledger: FictionSeriesLedger | undefined,
  fold: Awaited<ReturnType<typeof ownedFictionCharacterFold>>,
) {
  const live = new Set(
    fold.state.actors.filter((a) => !a.removedAtPeriodId).map((a) => a.actorId),
  );
  const actorsOf = (threads: NarrativeMemory['openThreads']) =>
    [
      ...new Set(
        threads.flatMap((thread) =>
          thread.eventRefs.flatMap((ref) => fold.eventActors.get(ref) ?? []),
        ),
      ),
    ]
      .filter((id) => live.has(id))
      .sort()
      .slice(0, SIGNAL_ACTORS);
  const open = memory.openThreads.filter(
    (thread) => thread.status === 'open' || thread.status === 'progressed',
  );
  return {
    openThreadActors: actorsOf(open),
    goalOrOpportunityActors: actorsOf(
      open.filter(
        (thread) => thread.kind === 'goal' || thread.kind === 'opportunity',
      ),
    ),
    overduePrivateLifeActors: (ledger?.privateLife ?? [])
      .filter(
        (p) =>
          p.chaptersSinceLast !== null &&
          p.chaptersSinceLast >= FICTION_CHARACTER_OVERDUE_CHAPTERS &&
          live.has(p.actorId),
      )
      .map((p) => p.actorId)
      .sort()
      .slice(0, SIGNAL_ACTORS),
  };
}

export function fictionCharacterEnvelopeFrom(
  fold: Awaited<ReturnType<typeof ownedFictionCharacterFold>>,
  signals: ReturnType<typeof fictionCharacterSignals>,
): FictionCharacterEnvelope {
  return fictionCharacterEnvelopeSchema.parse({
    version: FICTION_CHARACTER_VERSION,
    state: fold.state,
    fictionalOrigins: fold.fictionalOrigins,
    suppliedActorIds: fold.suppliedActorIds,
    signals,
  });
}

// The folded character state must still be the one the request was built
// from: same owned prefix, same fold. A no-op for every older generation.
export async function assertFictionCharacterFold(
  tx: Database,
  userId: string,
  branchId: string,
  input: NarrativePeriodInput,
) {
  const context = fictionContextSchema.parse(input.narrativeContext);
  if (
    !fictionCharacterQualityVersions.includes(
      context.policy.qualityPolicyVersion,
    )
  )
    return;
  const envelope = fictionCharacterEnvelopeSchema.parse(
    input.fictionCharacters,
  );
  const fold = await ownedFictionCharacterFold(
    tx,
    userId,
    branchId,
    context.memory.fictionalActors,
    input.state.actors.map((actor) => actor.id),
  );
  if (fictionCharacterFoldHash(fold) !== fictionCharacterFoldHash(envelope))
    throw new DomainError(
      'NARRATIVE_CONTEXT_INVALID',
      'Character state differs from the owned prefix it was built from.',
    );
}
