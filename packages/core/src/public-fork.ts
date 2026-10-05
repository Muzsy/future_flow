import { randomUUID } from 'node:crypto';
import {
  LIFE_CONTRACT_VERSION,
  FORK_CHECKPOINT_VERSION,
  forkCheckpointSchema,
  publicSnapshotDraftSchema,
  periodCandidateV2Schema,
  type ForkCheckpoint,
  type ForkFactChange,
  type FactChangeV2,
  type FactPredicateV2,
  type LifeInputV2,
  type LifeStateV2,
  type PeriodCandidateV2,
  type PublicSnapshotDraft,
} from '@future-flow/contracts';
import { DomainError } from './errors';
import {
  validateLifeInputV2,
  validateLifeStateV2,
  applyFactChangesV2,
  checkConstraintsV2,
  type ConstraintScopeV2,
} from './life-v2';
import { publicDraftIssues } from './public-draft';
import { hash } from './index';

type Decision = NonNullable<PeriodCandidateV2['events'][number]['decision']>;
export type ForkCheckpointSource = {
  input: LifeInputV2;
  state: LifeStateV2; // Canonical stateAfter of the decision event, before any option.
  decision: Decision;
  scope: ConstraintScopeV2;
  publicDecision: PublicSnapshotDraft['periods'][number]['decision'];
};
type Keys = {
  assets: Map<string, string>;
  actors: Map<string, string>;
  opportunities: Map<string, string>;
  goals: Map<string, string>;
};
function required(map: Map<string, string>, key: string) {
  const value = map.get(key);
  if (!value)
    throw new DomainError(
      'PUBLIC_FORK_REFERENCE',
      'Unknown placeholder reference.',
    );
  return value;
}
function predicate(
  raw: ForkCheckpoint['constraints'][number]['predicate'],
  keys: Keys,
): FactPredicateV2 {
  return raw.type === 'asset_is_owned'
    ? {
        type: raw.type,
        assetId: required(keys.assets, raw.assetKey),
        owned: raw.owned,
      }
    : raw;
}
function change(raw: ForkFactChange, keys: Keys): FactChangeV2 {
  switch (raw.type) {
    case 'asset_remove':
      return { type: raw.type, assetId: required(keys.assets, raw.assetKey) };
    case 'asset_add': {
      const { key, ...value } = raw.value;
      return {
        type: raw.type,
        value: { ...value, id: required(keys.assets, key) },
      };
    }
    case 'actor_add': {
      const { key, ...value } = raw.value;
      return {
        type: raw.type,
        value: { ...value, id: required(keys.actors, key) },
      };
    }
    case 'opportunity_set': {
      const { key, ...value } = raw.value;
      return {
        type: raw.type,
        value: { ...value, id: required(keys.opportunities, key) },
      };
    }
    case 'goal_progress_set': {
      const { goalKey, ...value } = raw.value;
      return {
        type: raw.type,
        value: { ...value, goalId: required(keys.goals, goalKey) },
      };
    }
    default:
      return raw;
  }
}
function materialize(checkpoint: ForkCheckpoint) {
  const keys: Keys = {
      assets: new Map(
        checkpoint.referenceCatalog.assetKeys.map((key) => [key, randomUUID()]),
      ),
      actors: new Map(
        checkpoint.referenceCatalog.actorKeys.map((key) => [key, randomUUID()]),
      ),
      opportunities: new Map(
        checkpoint.referenceCatalog.opportunityKeys.map((key) => [
          key,
          randomUUID(),
        ]),
      ),
      goals: new Map(checkpoint.goals.map((goal) => [goal.key, randomUUID()])),
    },
    lifeId = randomUUID(),
    branchId = randomUUID(),
    decisionId = randomUUID();
  const input = validateLifeInputV2({
    schemaVersion: LIFE_CONTRACT_VERSION,
    locale: 'en',
    lifeId,
    branchId,
    identity: { ...checkpoint.identity, baseProfileVersionId: null },
    environment: {
      version: 'hu-neutral-v2',
      description: checkpoint.environment.description,
    },
    goals: checkpoint.goals.map(
      ({ key, status: _status, note: _note, ...goal }) => ({
        ...goal,
        id: required(keys.goals, key),
      }),
    ),
    initialState: {
      ...checkpoint.startingState,
      schemaVersion: LIFE_CONTRACT_VERSION,
      ownedAssets: checkpoint.startingState.ownedAssets.map(
        ({ key, ...asset }) => ({ ...asset, id: required(keys.assets, key) }),
      ),
      actors: checkpoint.startingState.actors.map(({ key, ...actor }) => ({
        ...actor,
        id: required(keys.actors, key),
      })),
      opportunities: checkpoint.startingState.opportunities.map(
        ({ key, ...opportunity }) => ({
          ...opportunity,
          id: required(keys.opportunities, key),
        }),
      ),
      goals: checkpoint.goals.map((goal) => ({
        goalId: required(keys.goals, goal.key),
        status: goal.status,
        note: goal.note,
      })),
    },
    constraints: checkpoint.constraints.map((constraint) => ({
      id: randomUUID(),
      lifeId,
      branchId: constraint.scope === 'branch' ? branchId : null,
      description: constraint.description,
      strength: constraint.strength,
      validFrom: constraint.validFrom,
      validUntil: constraint.validUntil,
      endsOnDecisionId: constraint.endsOnDecisionKey ? decisionId : null,
      predicate: predicate(constraint.predicate, keys),
    })),
    visibility: 'private',
  });
  const decision: Decision = {
    id: decisionId,
    prompt: checkpoint.decision.prompt,
    options: checkpoint.decision.options.map((option) => ({
      id: randomUUID(),
      label: option.label,
      description: option.description,
      preconditions: option.preconditions.map((p) => predicate(p, keys)),
      changes: option.changes.map((c) => change(c, keys)),
    })),
  };
  return { input, decision };
}

export function validateForkCheckpoint(raw: unknown): ForkCheckpoint {
  const checkpoint = forkCheckpointSchema.parse(raw);
  if (Buffer.byteLength(JSON.stringify(checkpoint), 'utf8') > 50000)
    throw new DomainError('PUBLIC_FORK_INVALID', 'Checkpoint is too large.');
  if (publicDraftIssues(checkpoint).length)
    throw new DomainError(
      'PUBLIC_FORK_PRIVACY',
      'Generalize checkpoint details.',
    );
  for (const keys of [
    checkpoint.referenceCatalog.assetKeys,
    checkpoint.referenceCatalog.actorKeys,
    checkpoint.referenceCatalog.opportunityKeys,
    checkpoint.goals.map((x) => x.key),
    checkpoint.constraints.map((x) => x.key),
    checkpoint.decision.options.map((x) => x.key),
  ])
    if (new Set(keys).size !== keys.length)
      throw new DomainError(
        'PUBLIC_FORK_REFERENCE',
        'Duplicate placeholder key.',
      );
  if (
    checkpoint.constraints.some(
      (c) =>
        c.endsOnDecisionKey !== null &&
        c.endsOnDecisionKey !== checkpoint.decision.key,
    )
  )
    throw new DomainError(
      'PUBLIC_FORK_REFERENCE',
      'Constraint references another decision.',
    );
  const { input, decision } = materialize(checkpoint);
  for (const option of decision.options)
    applyFactChangesV2(
      input.initialState,
      option.changes,
      input.initialState.effectiveAt,
      option.preconditions,
      input.constraints,
      {
        lifeId: input.lifeId,
        branchId: input.branchId,
        acceptedDecisionIds: [decision.id],
      },
    );
  return checkpoint;
}

// Produces an in-memory candidate only. Persistence/idempotency/permission are P09/P12 gates.
export function instantiateForkCheckpoint(raw: unknown, optionKey: string) {
  const checkpoint = validateForkCheckpoint(raw),
    position = checkpoint.decision.options.findIndex(
      (option) => option.key === optionKey,
    );
  if (position < 0)
    throw new DomainError('PUBLIC_FORK_REFERENCE', 'Unknown selected option.');
  const { input, decision } = materialize(checkpoint),
    option = decision.options[position]!,
    stateBefore = input.initialState;
  const chosen = applyFactChangesV2(
    stateBefore,
    option.changes,
    stateBefore.effectiveAt,
    option.preconditions,
    input.constraints,
    {
      lifeId: input.lifeId,
      branchId: input.branchId,
      acceptedDecisionIds: [decision.id],
    },
  );
  const prepared = validateLifeInputV2({
    ...input,
    initialState: chosen.state,
    constraints: input.constraints.filter(
      (c) => c.endsOnDecisionId !== decision.id,
    ),
  });
  return {
    input: prepared,
    stateBefore,
    decision,
    choice: { decisionId: decision.id, optionId: option.id },
  };
}

// Only the fields explicitly editable for privacy are excluded from the machine comparison.
// Work domain, skills, tradeoffs and all typed facts/effects remain exact.
const editableProse = new Set([
  'label',
  'description',
  'prompt',
  'motivation',
  'note',
  'employerLabel',
  'region',
  'housing',
  'title',
]);
function semantics(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semantics);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !editableProse.has(key))
        .map(([key, item]) => [key, semantics(item)]),
    );
  return value;
}

function projectSource(source: ForkCheckpointSource): ForkCheckpoint {
  source = {
    ...source,
    decision: periodCandidateV2Schema.shape.events.element.shape.decision
      .unwrap()
      .parse(source.decision),
  };
  const input = validateLifeInputV2(source.input),
    state = validateLifeStateV2(source.state),
    publicDecision =
      publicSnapshotDraftSchema.shape.periods.element.shape.decision.parse(
        source.publicDecision,
      );
  if (
    input.locale !== 'en' ||
    source.scope.lifeId !== input.lifeId ||
    source.scope.branchId !== input.branchId ||
    source.scope.acceptedDecisionIds.includes(source.decision.id) ||
    source.decision.options.length !== publicDecision.options.length
  )
    throw new DomainError(
      'PUBLIC_FORK_SOURCE',
      'Source is not a matching pre-choice checkpoint.',
    );
  checkConstraintsV2(state, input.constraints, source.scope);
  const constraints = input.constraints.filter(
    (c) =>
      c.lifeId === source.scope.lifeId &&
      (c.branchId === null || c.branchId === source.scope.branchId) &&
      (c.validUntil === null || c.validUntil > state.effectiveAt) &&
      (c.endsOnDecisionId === null ||
        !source.scope.acceptedDecisionIds.includes(c.endsOnDecisionId)),
  );
  if (
    constraints.some(
      (c) =>
        c.endsOnDecisionId !== null &&
        c.endsOnDecisionId !== source.decision.id,
    )
  )
    throw new DomainError(
      'PUBLIC_FORK_REFERENCE',
      'Future decision reference cannot be transferred.',
    );
  const keys: Keys = {
    assets: new Map(),
    actors: new Map(),
    opportunities: new Map(),
    goals: new Map(),
  };
  function register(map: Map<string, string>, id: string, kind: string) {
    if (!map.has(id)) map.set(id, `${kind}-${map.size + 1}`);
    return required(map, id);
  }
  const asset = (a: LifeStateV2['ownedAssets'][number]) => {
    const { id, ...value } = a;
    return { ...value, key: register(keys.assets, id, 'asset') };
  };
  const actor = (a: LifeStateV2['actors'][number]) => {
    const { id, ...value } = a;
    return { ...value, key: register(keys.actors, id, 'actor') };
  };
  const opportunity = (a: LifeStateV2['opportunities'][number]) => {
    const { id, ...value } = a;
    return { ...value, key: register(keys.opportunities, id, 'opportunity') };
  };
  const projectPredicate = (p: FactPredicateV2) =>
    p.type === 'asset_is_owned'
      ? {
          type: p.type,
          assetKey: register(keys.assets, p.assetId, 'asset'),
          owned: p.owned,
        }
      : p;
  const ownedAssets = state.ownedAssets.map(asset),
    actors = state.actors.map(actor),
    opportunities = state.opportunities.map(opportunity);
  const goals = input.goals.map(({ id, ...goal }) => {
    const progress = state.goals.find((g) => g.goalId === id);
    if (!progress)
      throw new DomainError('PUBLIC_FORK_REFERENCE', 'Missing goal progress.');
    return {
      ...goal,
      key: register(keys.goals, id, 'goal'),
      status: progress.status,
      note: progress.note,
    };
  });
  if (state.goals.length !== goals.length)
    throw new DomainError('PUBLIC_FORK_REFERENCE', 'Unexpected goal progress.');
  const projectChange = (c: FactChangeV2): ForkFactChange => {
    switch (c.type) {
      case 'asset_add':
        return { type: c.type, value: asset(c.value) };
      case 'asset_remove':
        return {
          type: c.type,
          assetKey: register(keys.assets, c.assetId, 'asset'),
        };
      case 'actor_add':
        return { type: c.type, value: actor(c.value) };
      case 'opportunity_set':
        return { type: c.type, value: opportunity(c.value) };
      case 'goal_progress_set':
        return {
          type: c.type,
          value: {
            goalKey: required(keys.goals, c.value.goalId),
            status: c.value.status,
            note: c.value.note,
          },
        };
      default:
        return c;
    }
  };
  const projectedConstraints = constraints.map((c, i) => ({
    key: `constraint-${i + 1}`,
    description: c.description,
    strength: c.strength,
    scope: c.branchId === null ? ('life' as const) : ('branch' as const),
    validFrom: c.validFrom,
    validUntil: c.validUntil,
    endsOnDecisionKey: c.endsOnDecisionId ? publicDecision.key : null,
    predicate: projectPredicate(c.predicate),
  }));
  const options = source.decision.options.map((option, i) => {
    applyFactChangesV2(
      state,
      option.changes,
      state.effectiveAt,
      option.preconditions,
      input.constraints,
      {
        ...source.scope,
        acceptedDecisionIds: [
          ...source.scope.acceptedDecisionIds,
          source.decision.id,
        ],
      },
    );
    return {
      key: publicDecision.options[i]!.key,
      label: publicDecision.options[i]!.label,
      description: publicDecision.options[i]!.description,
      preconditions: option.preconditions.map(projectPredicate),
      changes: option.changes.map(projectChange),
    };
  });
  return forkCheckpointSchema.parse({
    schemaVersion: FORK_CHECKPOINT_VERSION,
    contentLocale: 'en',
    requiresFullReview: true,
    readyForPublicFork: false,
    identity: {
      mode: 'alternate',
      label: input.identity.label,
      ageBand: input.identity.ageBand,
    },
    environment: {
      version: 'fictional-neutral-1',
      description: input.environment.description,
    },
    goals,
    startingState: {
      effectiveAt: state.effectiveAt,
      employment: state.employment,
      location: state.location,
      finance: state.finance,
      ownedAssets,
      actors,
      skills: state.skills,
      opportunities,
      resources: state.resources,
    },
    referenceCatalog: {
      assetKeys: [...keys.assets.values()],
      actorKeys: [...keys.actors.values()],
      opportunityKeys: [...keys.opportunities.values()],
    },
    constraints: projectedConstraints,
    decision: {
      key: publicDecision.key,
      prompt: publicDecision.prompt,
      options,
    },
  });
}

export function prepareSanitizedForkCheckpoint(
  source: ForkCheckpointSource,
  raw: unknown,
) {
  const expected = projectSource(source),
    checkpoint = validateForkCheckpoint(raw);
  if (hash(semantics(checkpoint)) !== hash(semantics(expected)))
    throw new DomainError(
      'PUBLIC_FORK_SEMANTICS',
      'Generalization changed executable facts or effects.',
    );
  if (
    hash({
      key: checkpoint.decision.key,
      prompt: checkpoint.decision.prompt,
      options: checkpoint.decision.options.map(
        ({ key, label, description }) => ({ key, label, description }),
      ),
    }) !==
    hash({
      key: expected.decision.key,
      prompt: expected.decision.prompt,
      options: expected.decision.options.map(({ key, label, description }) => ({
        key,
        label,
        description,
      })),
    })
  )
    throw new DomainError(
      'PUBLIC_FORK_SEMANTICS',
      'Displayed decision copy does not match.',
    );
  const labels = [
    source.input.identity.label,
    source.state.employment.employerLabel,
    source.state.location.region,
    source.state.location.housing,
    ...source.state.actors.map((a) => a.label),
    ...source.state.ownedAssets.map((a) => a.label),
    ...source.state.opportunities.map((a) => a.title),
    source.input.initialState.employment.employerLabel,
    source.input.initialState.location.region,
    source.input.initialState.location.housing,
    ...source.input.initialState.actors.map((a) => a.label),
    ...source.input.initialState.ownedAssets.map((a) => a.label),
    ...source.input.initialState.opportunities.map((a) => a.title),
  ];
  for (const option of source.decision.options)
    for (const c of option.changes) {
      if (c.type === 'asset_add' || c.type === 'actor_add')
        labels.push(c.value.label);
      if (c.type === 'opportunity_set') labels.push(c.value.title);
      if (c.type === 'employment_set') labels.push(c.value.employerLabel);
      if (c.type === 'location_set')
        labels.push(c.value.region, c.value.housing);
    }
  if (
    publicDraftIssues(
      checkpoint,
      labels.filter((x): x is string => !!x),
    ).length
  )
    throw new DomainError(
      'PUBLIC_FORK_PRIVACY',
      'Original private labels remain.',
    );
  return checkpoint;
}

// Owner preview suggestion only. Keeps goals/context/skills verbatim; identifying
// or non-executable details fail closed until an explicit edited candidate is supplied.
export function prepareForkCheckpointCandidate(source: ForkCheckpointSource) {
  const checkpoint = projectSource(source);
  checkpoint.identity.label = null;
  const generalizeEmployment = (
    value: ForkCheckpoint['startingState']['employment'],
  ) => ({ ...value, employerLabel: null });
  const generalizeLocation = (
    value: ForkCheckpoint['startingState']['location'],
  ) => ({ ...value, region: null, housing: null });
  const assetLabel = (kind: string) => `A ${kind} asset`;
  const actorLabel = (relationship: string) => `A ${relationship}`;
  checkpoint.startingState.employment = generalizeEmployment(
    checkpoint.startingState.employment,
  );
  checkpoint.startingState.location = generalizeLocation(
    checkpoint.startingState.location,
  );
  for (const asset of checkpoint.startingState.ownedAssets)
    asset.label = assetLabel(asset.kind);
  for (const actor of checkpoint.startingState.actors)
    actor.label = actorLabel(actor.relationship);
  for (const opportunity of checkpoint.startingState.opportunities)
    opportunity.title = 'An available opportunity';
  for (const constraint of checkpoint.constraints)
    constraint.description = `A ${constraint.strength} condition: ${constraint.predicate.type.replaceAll('_', ' ')}.`;
  for (const option of checkpoint.decision.options)
    for (const change of option.changes) {
      if (change.type === 'employment_set')
        change.value = generalizeEmployment(change.value);
      if (change.type === 'location_set')
        change.value = generalizeLocation(change.value);
      if (change.type === 'asset_add')
        change.value.label = assetLabel(change.value.kind);
      if (change.type === 'actor_add')
        change.value.label = actorLabel(change.value.relationship);
      if (change.type === 'opportunity_set')
        change.value.title = 'An available opportunity';
    }
  return prepareSanitizedForkCheckpoint(source, checkpoint);
}
