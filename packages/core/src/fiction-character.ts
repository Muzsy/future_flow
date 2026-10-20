import {
  FICTION_CHARACTER_PROJECTION_ACTORS,
  FICTION_CHARACTER_STATE_ACTORS,
  FICTION_CHARACTER_TOMBSTONES,
  FICTION_CHARACTER_VERSION,
  fictionCharacterDeltaSchema,
  fictionCharacterProjectionSchema,
  type FictionCharacterEntry,
  type FictionCharacterEnvelope,
  type FictionCharacterState,
  type FictionCharacterDelta,
  type FictionCharacterProjection,
  type FictionCharacterProjectionActor,
  type FictionCharacterRelevance,
  type FictionalActorMemory,
} from '@future-flow/contracts';
import { DomainError } from './errors';
import { hash } from './index';

// Deterministic, provider-free character state for the living-world generation
// (ADR-009). The chapter artifacts are the source of truth: each period carries
// a compact delta, and this fold rebuilds the current state from the owned
// prefix. Nothing here reads or writes storage, so the same prefix always gives
// the same state, a fork shares only its prefix, and a period that does not
// commit leaves no state behind.

// Server-owned actor classification of the owned prefix. An actor with a
// recorded origin event is wholly fictional; supplied (real) people are named
// by the caller. Anything else is unknown and rejected.
export type FictionCharacterActors = {
  fictionalOrigins: ReadonlyMap<string, string>;
  suppliedActorIds: ReadonlySet<string>;
};
export type FictionCharacterHistoryEntry = {
  periodId: string;
  // null for a committed period without a character delta (older policy).
  delta: unknown;
};
export type FictionCharacterSignals = {
  inCandidate?: Iterable<string>;
  openThreadActors?: Iterable<string>;
  goalOrOpportunityActors?: Iterable<string>;
  overduePrivateLifeActors?: Iterable<string>;
};

const invalid = (message: string): never => {
  throw new DomainError('FICTION_CHARACTER_INVALID', message);
};
const privacy = (message: string): never => {
  throw new DomainError('FICTION_CHARACTER_PRIVACY', message);
};

export function emptyFictionCharacterState(): FictionCharacterState {
  return { version: FICTION_CHARACTER_VERSION, ownedPeriods: 0, actors: [] };
}

// A job that moves from an older policy starts from the legacy actor records
// with unknown new fields. Nothing is mined from old prose (plan 50, point 8).
export function fictionCharacterSeedFromLegacy(
  actors: readonly FictionalActorMemory[],
  ownedPeriods = 0,
): FictionCharacterState {
  const entries = actors.map((legacy): FictionCharacterEntry => ({
    actorId: legacy.actorId,
    kind: 'fictional',
    legacy: structuredClone(legacy),
    profile: null,
    dynamic: null,
    relationship: null,
    touchedAtIndex: null,
    removedAtPeriodId: null,
  }));
  if (new Set(entries.map((e) => e.actorId)).size !== entries.length)
    invalid('Legacy actor seed lists an actor twice.');
  return {
    version: FICTION_CHARACTER_VERSION,
    ownedPeriods,
    actors: entries.sort(byActor),
  };
}

const byActor = (a: { actorId: string }, b: { actorId: string }) =>
  a.actorId < b.actorId ? -1 : a.actorId > b.actorId ? 1 : 0;

export function fictionCharacterStateHash(state: FictionCharacterState) {
  return hash(state);
}
export function fictionCharacterProjectionHash(
  projection: FictionCharacterProjection,
) {
  return hash(projection);
}

// Validates one committed period's delta against the running state and returns
// the next state. Pure: a rejected delta leaves the input untouched, so the
// caller can run this before the atomic commit and commit nothing on failure.
export function applyFictionCharacterDelta(
  state: FictionCharacterState,
  periodId: string,
  rawDelta: unknown,
  actors: FictionCharacterActors,
): FictionCharacterState {
  const parsed = fictionCharacterDeltaSchema.safeParse(rawDelta);
  if (!parsed.success)
    return invalid(parsed.error.issues[0]?.message ?? 'Invalid delta.');
  const delta = parsed.data;
  const next = structuredClone(state);
  const index = state.ownedPeriods;
  const byId = new Map(next.actors.map((e) => [e.actorId, e]));
  const kindOf = (actorId: string) => {
    if (actors.fictionalOrigins.has(actorId)) return 'fictional' as const;
    if (actors.suppliedActorIds.has(actorId)) return 'supplied' as const;
    return invalid('Character delta names an unknown actor.');
  };
  const live = (actorId: string) => {
    const entry = byId.get(actorId);
    if (!entry) return invalid('Character delta names a missing actor.');
    if (entry.removedAtPeriodId)
      return invalid('Character delta updates a removed actor.');
    return entry;
  };

  // A removed actor is archived this period and not updated in the same one.
  // The one exception is an actor who both joins and leaves in this period: its
  // profile is established and the actor is archived, never left live.
  const removed = new Set(delta.removedActorIds);
  for (const actorId of [
    ...delta.profileUpdates.map((p) => p.actorId),
    ...delta.dynamicUpdates.map((p) => p.actorId),
    ...delta.relationshipUpdates.map((p) => p.actorId),
  ])
    if (removed.has(actorId))
      invalid('An actor cannot be updated and removed in one period.');

  for (const profile of delta.addedProfiles) {
    if (kindOf(profile.actorId) !== 'fictional')
      privacy('A supplied person never receives a character profile.');
    if (profile.originEventId !== actors.fictionalOrigins.get(profile.actorId))
      invalid('Profile origin does not match the recorded actor origin.');
    if (profile.establishedAtPeriodId !== periodId)
      invalid('A new profile is established in the period that adds it.');
    const existing = byId.get(profile.actorId);
    if (existing && (existing.profile || existing.removedAtPeriodId))
      invalid('Character delta adds an actor twice.');
    const entry: FictionCharacterEntry = existing ?? {
      actorId: profile.actorId,
      kind: 'fictional',
      legacy: null,
      profile: null,
      dynamic: null,
      relationship: null,
      touchedAtIndex: null,
      removedAtPeriodId: null,
    };
    entry.profile = profile;
    entry.touchedAtIndex = index;
    byId.set(entry.actorId, entry);
  }
  for (const profile of delta.profileUpdates) {
    if (kindOf(profile.actorId) !== 'fictional')
      privacy('A supplied person never receives a character profile.');
    const entry = live(profile.actorId);
    if (!entry.profile) invalid('A profile update needs an existing profile.');
    else if (
      profile.originEventId !== entry.profile.originEventId ||
      profile.establishedAtPeriodId !== entry.profile.establishedAtPeriodId
    )
      invalid('A profile update keeps its origin and establishment period.');
    entry.profile = profile;
    entry.touchedAtIndex = index;
  }
  for (const dynamic of delta.dynamicUpdates) {
    if (kindOf(dynamic.actorId) !== 'fictional')
      privacy('A supplied person has no invented dynamic state.');
    const entry = live(dynamic.actorId);
    if (!entry.profile && !entry.legacy)
      invalid('Dynamic state needs an established profile first.');
    if (dynamic.provenance === 'user_supplied')
      privacy('Authored character state is never user supplied.');
    if (dynamic.lastMeaningfulChangePeriodId !== periodId)
      invalid('Dynamic state records the period that changes it.');
    entry.dynamic = dynamic;
    entry.touchedAtIndex = index;
  }
  for (const relationship of delta.relationshipUpdates) {
    const kind = kindOf(relationship.actorId);
    // Only the server could know a user-supplied fact; authored text is at
    // most derived from the interaction or invented for the branch.
    if (relationship.provenance === 'user_supplied')
      privacy('Authored character state is never user supplied.');
    if (kind === 'fictional') {
      const base = live(relationship.actorId);
      if (!base.profile && !base.legacy)
        invalid('Relationship state needs an established profile first.');
    } else if (!byId.has(relationship.actorId)) {
      // Supplied people carry only a relationship entry, created on demand.
      byId.set(relationship.actorId, {
        actorId: relationship.actorId,
        kind: 'supplied',
        legacy: null,
        profile: null,
        dynamic: null,
        relationship: null,
        touchedAtIndex: null,
        removedAtPeriodId: null,
      });
    }
    const entry = live(relationship.actorId);
    entry.relationship = relationship;
    entry.touchedAtIndex = index;
  }
  for (const actorId of delta.removedActorIds) {
    kindOf(actorId);
    const entry = live(actorId);
    entry.removedAtPeriodId = periodId;
    entry.touchedAtIndex = index;
  }

  // An archived actor keeps a stripped tombstone (it still blocks adding or
  // updating the same actor again) and only the most recent ones are kept.
  for (const entry of byId.values())
    if (entry.removedAtPeriodId) {
      entry.legacy = null;
      entry.profile = null;
      entry.dynamic = null;
      entry.relationship = null;
    }
  const tombstones = [...byId.values()]
    .filter((e) => e.removedAtPeriodId)
    .sort(
      (a, b) =>
        (b.touchedAtIndex ?? -1) - (a.touchedAtIndex ?? -1) || byActor(a, b),
    );
  for (const old of tombstones.slice(FICTION_CHARACTER_TOMBSTONES))
    byId.delete(old.actorId);

  next.ownedPeriods = index + 1;
  next.actors = [...byId.values()].sort(byActor);
  if (next.actors.length > FICTION_CHARACTER_STATE_ACTORS)
    throw new DomainError(
      'FICTION_CHARACTER_STATE_TOO_LARGE',
      'The character state exceeds its actor bound.',
    );
  return next;
}

// Folds the owned history prefix, oldest first, into the current state.
export function characterStateFromHistory(
  history: readonly FictionCharacterHistoryEntry[],
  actors: FictionCharacterActors,
  seed: FictionCharacterState = emptyFictionCharacterState(),
): FictionCharacterState {
  let state = seed;
  for (const entry of history)
    state =
      entry.delta === null || entry.delta === undefined
        ? { ...structuredClone(state), ownedPeriods: state.ownedPeriods + 1 }
        : applyFictionCharacterDelta(
            state,
            entry.periodId,
            entry.delta,
            actors,
          );
  return state;
}

const rankOrder: readonly FictionCharacterRelevance[] = [
  'in_candidate',
  'open_thread',
  'goal_or_opportunity',
  'unresolved_matter',
  'overdue_private_life',
  'recent_change',
];

// The bounded view of the state for one request: the relevant actors only
// (plan 15.3), in a deterministic order, under the projection byte bound.
// Candidate actors are mandatory: if they cannot fit, the request is refused
// instead of silently dropping a person who is on the page. Optional actors
// are dropped lowest-priority first and counted in `omittedActors`.
export function fictionCharacterProjection(
  state: FictionCharacterState,
  signals: FictionCharacterSignals = {},
  options: { withheld?: boolean; recentWindow?: number } = {},
): FictionCharacterProjection {
  const empty = { version: FICTION_CHARACTER_VERSION, actors: [] } as const;
  if (options.withheld)
    return fictionCharacterProjectionSchema.parse({
      ...empty,
      omittedActors: 0,
    });
  const recentWindow = options.recentWindow ?? 2;
  const sets = {
    in_candidate: new Set(signals.inCandidate ?? []),
    open_thread: new Set(signals.openThreadActors ?? []),
    goal_or_opportunity: new Set(signals.goalOrOpportunityActors ?? []),
    overdue_private_life: new Set(signals.overduePrivateLifeActors ?? []),
  };
  const ranked = state.actors.flatMap((entry) => {
    if (entry.removedAtPeriodId) return [];
    if (
      !entry.profile &&
      !entry.dynamic &&
      !entry.relationship &&
      !entry.legacy
    )
      return [];
    const reasons = rankOrder.filter((reason) => {
      if (reason === 'unresolved_matter')
        return Boolean(
          entry.dynamic?.unresolvedMatter ||
          entry.relationship?.unresolvedInteraction,
        );
      if (reason === 'recent_change')
        return (
          entry.touchedAtIndex !== null &&
          state.ownedPeriods - entry.touchedAtIndex <= recentWindow
        );
      return sets[reason].has(entry.actorId);
    });
    return reasons.length ? [{ entry, reasons }] : [];
  });
  ranked.sort(
    (a, b) =>
      rankOrder.indexOf(a.reasons[0]!) - rankOrder.indexOf(b.reasons[0]!) ||
      b.reasons.length - a.reasons.length ||
      (b.entry.touchedAtIndex ?? -1) - (a.entry.touchedAtIndex ?? -1) ||
      byActor(a.entry, b.entry),
  );

  const without = <T extends object, K extends keyof T>(
    value: T,
    ...keys: K[]
  ) =>
    Object.fromEntries(
      Object.entries(value).filter(([key]) => !keys.includes(key as K)),
    ) as Omit<T, K>;
  const view = ({
    entry,
    reasons,
  }: (typeof ranked)[number]): FictionCharacterProjectionActor => ({
    actorId: entry.actorId,
    kind: entry.kind,
    reasons,
    profile: entry.profile
      ? without(
          entry.profile,
          'actorId',
          'originEventId',
          'establishedAtPeriodId',
        )
      : null,
    dynamic: entry.dynamic
      ? without(entry.dynamic, 'actorId', 'lastMeaningfulChangePeriodId')
      : null,
    relationship: entry.relationship
      ? without(entry.relationship, 'actorId')
      : null,
    // A person from an older generation without a profile is shown through
    // the fields recorded for them then, and nothing else.
    ...(entry.legacy && !entry.profile
      ? {
          legacy: {
            role: entry.legacy.role,
            desire: entry.legacy.desire,
            resistance: entry.legacy.resistance,
            voiceCue: entry.legacy.voiceCue,
          },
        }
      : {}),
  });
  const fits = (actors: FictionCharacterProjectionActor[]) =>
    actors.length <= FICTION_CHARACTER_PROJECTION_ACTORS &&
    fictionCharacterProjectionSchema.safeParse({
      ...empty,
      actors,
      omittedActors: 0,
    }).success;

  const chosen: FictionCharacterProjectionActor[] = [];
  let omitted = 0;
  let stopped = false;
  for (const item of ranked) {
    // NOT REACHABLE FROM THE SERVER PATH: the candidate does not exist before
    // the planner runs and the request is hash-bound, so the server never sets
    // `inCandidate` and this stays a no-op there (appendix D.8, review F6).
    // Kept for callers that already hold a candidate (tests, offline tools).
    const mandatory = item.reasons[0] === 'in_candidate';
    const attempt = [...chosen, view(item)];
    if (!stopped && fits(attempt)) {
      chosen.push(attempt.at(-1)!);
      continue;
    }
    if (mandatory)
      throw new DomainError(
        'FICTION_CHARACTER_PROJECTION_TOO_LARGE',
        'Candidate characters do not fit the projection bound.',
      );
    stopped = true;
    omitted += 1;
  }
  return fictionCharacterProjectionSchema.parse({
    ...empty,
    actors: chosen,
    omittedActors: omitted,
  });
}

export function fictionCharacterActorsFromEnvelope(
  envelope: FictionCharacterEnvelope,
): FictionCharacterActors {
  return {
    fictionalOrigins: new Map(
      envelope.fictionalOrigins.map((o) => [o.actorId, o.introducedByEventId]),
    ),
    suppliedActorIds: new Set(envelope.suppliedActorIds),
  };
}

// The projection the planner request must carry, recomputed from the server's
// envelope; the request is valid only if it matches (plan section 25).
export function fictionCharacterProjectionFromEnvelope(
  envelope: FictionCharacterEnvelope,
  withheld: boolean,
) {
  return fictionCharacterProjection(envelope.state, envelope.signals, {
    withheld,
  });
}

type CandidateEvent = {
  id: string;
  changes: { type: string; value?: unknown; actorId?: string }[];
};

// Checks one authored character delta against the owned state and the final
// candidate. Everything is fail-closed and nothing is committed here; the
// repairable code lets the author retry, and a rejected package never reaches
// the canon history.
export function validateFictionCharacterDelta(args: {
  periodId: string;
  envelope: FictionCharacterEnvelope;
  delta: FictionCharacterDelta;
  events: readonly CandidateEvent[];
}): FictionCharacterState {
  const fail = (message: string): never => {
    throw new DomainError('NARRATIVE_PLAN_INVALID', message);
  };
  const { envelope, delta } = args;
  const added = new Map<string, string>();
  const removed = new Set<string>();
  for (const event of args.events)
    for (const change of event.changes) {
      if (change.type === 'actor_add') {
        const id = (change.value as { id?: unknown } | undefined)?.id;
        if (typeof id === 'string') added.set(id, event.id);
      } else if (change.type === 'actor_remove' && change.actorId)
        removed.add(change.actorId);
    }
  const base = fictionCharacterActorsFromEnvelope(envelope);
  const actors: FictionCharacterActors = {
    // A new recurring actor is wholly fictional and starts at its own event.
    fictionalOrigins: new Map([...base.fictionalOrigins, ...added]),
    suppliedActorIds: base.suppliedActorIds,
  };
  let next: FictionCharacterState;
  try {
    next = applyFictionCharacterDelta(
      envelope.state,
      args.periodId,
      delta,
      actors,
    );
  } catch (error) {
    // A state past its bound is not something a repair can fix: fail closed.
    if (
      error instanceof DomainError &&
      error.code === 'FICTION_CHARACTER_STATE_TOO_LARGE'
    )
      throw new DomainError('NARRATIVE_CONTEXT_INVALID', error.message);
    if (
      error instanceof DomainError &&
      error.code.startsWith('FICTION_CHARACTER_')
    )
      return fail(error.message);
    throw error;
  }
  // A profile is added only for an actor this period's candidate introduces;
  // otherwise a pruned tombstone could be revived (review N1). A carried-over
  // person needs no profile and the prompt forbids one.
  for (const profile of delta.addedProfiles)
    if (!added.has(profile.actorId))
      fail('A profile is added only for an actor introduced in this period.');
  const profiled = new Set(delta.addedProfiles.map((p) => p.actorId));
  for (const id of added.keys())
    if (!profiled.has(id))
      fail('A new recurring actor needs a character profile in its period.');
  // Only a fictional actor with a live state entry is archived by the delta.
  const live = new Set(
    envelope.state.actors
      .filter((a) => a.kind === 'fictional' && !a.removedAtPeriodId)
      .map((a) => a.actorId),
  );
  const archived = new Set(delta.removedActorIds);
  for (const id of removed)
    if ((live.has(id) || added.has(id)) && !archived.has(id))
      fail('A removed actor with character state must be archived.');
  for (const id of archived)
    if (!removed.has(id))
      fail('A character is archived only by an actor_remove in this period.');
  return next;
}
