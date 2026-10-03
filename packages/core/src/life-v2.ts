import {
  constraintV2Schema,
  factChangeV2Schema,
  factPredicateV2Schema,
  lifeInputV2Schema,
  lifeStateV2Schema,
  periodCandidateV2Schema,
  type ConstraintV2,
  type FactChangeV2,
  type FactPredicateV2,
  type LifeInputV2,
  type LifeStateV2,
  type PeriodCandidateV2,
  periodChapterV2Schema,
  type PeriodChapterV2,
} from '@future-flow/contracts';
import { addMonths } from './dates';
import { DomainError } from './errors';

export type ConstraintScopeV2 = {
  lifeId: string;
  branchId: string;
  // Only IDs of decisions actually accepted in this branch's history.
  acceptedDecisionIds: readonly string[];
};
function unique(values: readonly string[], description: string): void {
  if (new Set(values).size !== values.length)
    throw new DomainError(
      'LIFE_DUPLICATE_ID',
      `${description}: ismétlődő azonosító.`,
    );
}
export function validateLifeStateV2(raw: unknown): LifeStateV2 {
  const state = lifeStateV2Schema.parse(raw);
  unique(
    state.ownedAssets.map((asset) => asset.id),
    'Tulajdon',
  );
  unique(
    state.actors.map((actor) => actor.id),
    'Szereplő',
  );
  unique(
    state.goals.map((goal) => goal.goalId),
    'Cél',
  );
  unique(
    state.opportunities.map((opportunity) => opportunity.id),
    'Lehetőség',
  );
  unique(state.skills, 'Készség');
  return state;
}
export function satisfiesFactV2(
  state: LifeStateV2,
  raw: FactPredicateV2,
): boolean {
  const predicate = factPredicateV2Schema.parse(raw);
  switch (predicate.type) {
    case 'employment_status_is':
      return state.employment.status === predicate.value;
    case 'country_is':
      return state.location.country === predicate.value;
    case 'asset_is_owned':
      return (
        state.ownedAssets.some((asset) => asset.id === predicate.assetId) ===
        predicate.owned
      );
    case 'liquid_funds_at_least':
      return (
        state.finance.currency === predicate.currency &&
        state.finance.liquidFunds !== null &&
        state.finance.liquidFunds >= predicate.amount
      );
  }
}
export function checkConstraintsV2(
  state: LifeStateV2,
  constraints: readonly ConstraintV2[],
  scope: ConstraintScopeV2,
): string[] {
  const warnings: string[] = [];
  unique(
    constraints.map((constraint) => constraint.id),
    'Korlát',
  );
  for (const raw of constraints) {
    const constraint = constraintV2Schema.parse(raw);
    if (
      constraint.validUntil !== null &&
      constraint.validUntil <= constraint.validFrom
    )
      throw new DomainError(
        'LIFE_CONSTRAINT_INTERVAL',
        'Hibás korlát-érvényességi idő.',
      );
    if (
      constraint.lifeId !== scope.lifeId ||
      (constraint.branchId !== null &&
        constraint.branchId !== scope.branchId) ||
      state.effectiveAt < constraint.validFrom ||
      (constraint.validUntil !== null &&
        state.effectiveAt >= constraint.validUntil) ||
      (constraint.endsOnDecisionId !== null &&
        scope.acceptedDecisionIds.includes(constraint.endsOnDecisionId))
    )
      continue;
    if (!satisfiesFactV2(state, constraint.predicate)) {
      if (constraint.strength === 'hard')
        throw new DomainError(
          'LIFE_HARD_CONSTRAINT',
          'Az állapot sérti az elfogadott kemény korlátot.',
        );
      warnings.push(constraint.id);
    }
  }
  return warnings;
}
export function validateLifeInputV2(raw: unknown): LifeInputV2 {
  const input = lifeInputV2Schema.parse(raw);
  const state = validateLifeStateV2(input.initialState);
  unique(
    input.goals.map((goal) => goal.id),
    'Célmeghatározás',
  );
  if (
    input.goals.filter((goal) => goal.priority === 'primary').length !== 1 ||
    input.goals.length !== state.goals.length ||
    state.goals.some(
      (goal) =>
        !input.goals.some((definition) => definition.id === goal.goalId),
    )
  )
    throw new DomainError(
      'LIFE_GOAL_REFERENCE',
      'Egy fő cél és hozzá illeszkedő célállapot szükséges.',
    );
  if (
    input.constraints.some((constraint) => constraint.lifeId !== input.lifeId)
  )
    throw new DomainError(
      'LIFE_CONSTRAINT_SCOPE',
      'Másik élet korlátja nem vehető át.',
    );
  checkConstraintsV2(state, input.constraints, {
    lifeId: input.lifeId,
    branchId: input.branchId,
    acceptedDecisionIds: [],
  });
  return input;
}

export function applyFactChangesV2(
  rawState: LifeStateV2,
  rawChanges: readonly FactChangeV2[],
  effectiveAt: string,
  preconditions: readonly FactPredicateV2[],
  constraints: readonly ConstraintV2[],
  scope: ConstraintScopeV2,
): { state: LifeStateV2; softConstraintIds: string[] } {
  const before = validateLifeStateV2(rawState);
  if (effectiveAt < before.effectiveAt)
    throw new DomainError(
      'LIFE_TIME_REVERSED',
      'A mentett múlt nem írható át.',
    );
  if (preconditions.some((predicate) => !satisfiesFactV2(before, predicate)))
    throw new DomainError(
      'LIFE_PRECONDITION',
      'Az esemény ténybeli előfeltétele nem teljesül.',
    );
  // Previous facts hold between events. A restriction must not be skipped
  // because it both starts and expires before the next event occurs.
  const intervalWarnings: string[] = [];
  for (const constraint of constraints) {
    if (
      constraint.validFrom > before.effectiveAt &&
      constraint.validFrom < effectiveAt
    )
      intervalWarnings.push(
        ...checkConstraintsV2(
          { ...before, effectiveAt: constraint.validFrom },
          [constraint],
          scope,
        ),
      );
  }
  const next = structuredClone(before);
  const targets = new Set<string>();
  for (const raw of rawChanges) {
    const change = factChangeV2Schema.parse(raw);
    const target =
      'assetId' in change
        ? `asset:${change.assetId}`
        : change.type === 'asset_add'
          ? `asset:${change.value.id}`
          : change.type === 'actor_add'
            ? `actor:${change.value.id}`
            : change.type === 'goal_progress_set'
              ? `goal:${change.value.goalId}`
              : change.type === 'opportunity_set'
                ? `opportunity:${change.value.id}`
                : change.type === 'skill_add'
                  ? `skill:${change.value}`
                  : change.type;
    if (targets.has(target))
      throw new DomainError(
        'LIFE_DUPLICATE_CHANGE',
        'Ugyanaz a tény egy eseményben többször változik.',
      );
    targets.add(target);
    switch (change.type) {
      case 'employment_set':
        next.employment = change.value;
        break;
      case 'location_set':
        next.location = change.value;
        break;
      case 'finance_set':
        next.finance = change.value;
        break;
      case 'resources_set':
        next.resources = change.value;
        break;
      case 'asset_add':
        if (next.ownedAssets.some((asset) => asset.id === change.value.id))
          throw new DomainError(
            'LIFE_ASSET_EXISTS',
            'Ez a tulajdon már szerepel.',
          );
        next.ownedAssets.push(change.value);
        break;
      case 'asset_remove':
        if (!next.ownedAssets.some((asset) => asset.id === change.assetId))
          throw new DomainError(
            'LIFE_ASSET_MISSING',
            'Nem adható el nem birtokolt tulajdon.',
          );
        next.ownedAssets = next.ownedAssets.filter(
          (asset) => asset.id !== change.assetId,
        );
        break;
      case 'actor_add':
        next.actors.push(change.value);
        break;
      case 'skill_add':
        next.skills.push(change.value);
        break;
      case 'goal_progress_set': {
        const index = next.goals.findIndex(
          (goal) => goal.goalId === change.value.goalId,
        );
        if (index < 0)
          throw new DomainError(
            'LIFE_GOAL_MISSING',
            'Nem létező cél nem teljesíthető.',
          );
        next.goals[index] = change.value;
        break;
      }
      case 'opportunity_set': {
        const index = next.opportunities.findIndex(
          (opportunity) => opportunity.id === change.value.id,
        );
        if (index < 0) next.opportunities.push(change.value);
        else next.opportunities[index] = change.value;
        break;
      }
    }
  }
  next.effectiveAt = effectiveAt;
  const state = validateLifeStateV2(next);
  return {
    state,
    softConstraintIds: [
      ...new Set([
        ...intervalWarnings,
        ...checkConstraintsV2(state, constraints, scope),
      ]),
    ],
  };
}

export type CanonEventV2 = PeriodCandidateV2['events'][number] & {
  stateBefore: LifeStateV2;
  stateAfter: LifeStateV2;
  softConstraintIds: string[];
};
export function simulatePeriodV2(
  raw: unknown,
  startState: LifeStateV2,
  constraints: readonly ConstraintV2[],
  scope: ConstraintScopeV2 & { revision: number },
): {
  period: PeriodCandidateV2;
  events: CanonEventV2[];
  endState: LifeStateV2;
} {
  const period = periodCandidateV2Schema.parse(raw);
  let current = validateLifeStateV2(startState);
  if (period.branchId !== scope.branchId)
    throw new DomainError('LIFE_BRANCH_MISMATCH', 'Másik ág időszaka.');
  if (period.baseRevision !== scope.revision)
    throw new DomainError(
      'LIFE_REVISION_CONFLICT',
      'Elavult induló állapot.',
      409,
    );
  checkConstraintsV2(current, constraints, scope);
  if (
    period.startDate !== current.effectiveAt ||
    period.endDate !== addMonths(period.startDate, period.durationMonths)
  )
    throw new DomainError(
      'LIFE_PERIOD_INTERVAL',
      'Az időszak nem illeszkedik az induló állapothoz.',
    );
  unique(
    period.events.map((event) => event.id),
    'Esemény',
  );
  const decisions = period.events.filter((event) => event.decision !== null);
  const last = period.events.at(-1)!;
  if (
    decisions.length !== 1 ||
    last.decision === null ||
    last.effectiveAt !== period.endDate
  )
    throw new DomainError(
      'LIFE_PENDING_DECISION',
      'Az időszak az egyetlen lezáratlan döntésnél álljon meg.',
    );
  unique(
    last.decision.options.map((option) => option.id),
    'Döntési opció',
  );
  const events: CanonEventV2[] = [];
  for (const event of period.events) {
    if (
      event.effectiveAt <= period.startDate ||
      event.effectiveAt < current.effectiveAt ||
      event.effectiveAt > period.endDate
    )
      throw new DomainError(
        'LIFE_INVALID_TIMELINE',
        'Az esemény kívül esik az időszakon vagy hibás az időrend.',
      );
    unique(event.actorIds, 'Eseményszereplő');
    const result = applyFactChangesV2(
      current,
      event.changes,
      event.effectiveAt,
      event.preconditions,
      constraints,
      scope,
    );
    if (
      event.actorIds.some(
        (actorId) => !result.state.actors.some((actor) => actor.id === actorId),
      )
    )
      throw new DomainError(
        'LIFE_UNKNOWN_ACTOR',
        'Az esemény nem létező szereplőre hivatkozik.',
      );
    // Option changes remain proposals. No choice is silently accepted here.
    events.push({
      ...event,
      stateBefore: current,
      stateAfter: result.state,
      softConstraintIds: result.softConstraintIds,
    });
    current = result.state;
  }
  // Every displayed option must be possible from the decision checkpoint.
  for (const option of last.decision.options) {
    applyFactChangesV2(
      current,
      option.changes,
      current.effectiveAt,
      option.preconditions,
      constraints,
      {
        ...scope,
        acceptedDecisionIds: [...scope.acceptedDecisionIds, last.decision.id],
      },
    );
  }
  return { period, events, endState: current };
}

export function validatePeriodChapterV2(
  raw: unknown,
  events: readonly CanonEventV2[],
): PeriodChapterV2 {
  const chapter = periodChapterV2Schema.parse(raw);
  const words = chapter.body.split(/\s+/u).filter(Boolean).length;
  const ids = events.map((event) => event.id);
  if (
    words < 250 ||
    words > 600 ||
    new Set(chapter.eventIds).size !== ids.length ||
    chapter.eventIds.length !== ids.length ||
    chapter.eventIds.some((id) => !ids.includes(id)) ||
    chapter.decisionId !== events.at(-1)?.decision?.id
  )
    throw new DomainError(
      'LIFE_CHAPTER_INVALID',
      'A fejezet hossza vagy canon-hivatkozása hibás.',
    );
  return chapter;
}
