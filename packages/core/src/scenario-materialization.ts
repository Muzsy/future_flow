import { randomUUID } from 'node:crypto';
import {
  LIFE_CONTRACT_VERSION,
  type ScenarioTemplate,
  type LifeInputV2,
} from '@future-flow/contracts';
import { validateLifeInputV2 } from './life-v2';

// Internal mapper: callers validate their distinct public/private input contracts.
export type ScenarioMaterializationFacts = Pick<
  ScenarioTemplate,
  'contentLocale' | 'goals' | 'startingState' | 'constraints'
> & {
  environment: { description: string };
  identity: Omit<LifeInputV2['identity'], 'baseProfileVersionId'>;
};

export function materializeScenarioFacts(
  template: ScenarioMaterializationFacts,
): LifeInputV2 {
  const lifeId = randomUUID(),
    branchId = randomUUID(),
    assets = new Map(
      template.startingState.ownedAssets.map((asset) => [
        asset.key,
        randomUUID(),
      ]),
    ),
    goals = new Map(template.goals.map((goal) => [goal.key, randomUUID()]));
  return validateLifeInputV2({
    schemaVersion: LIFE_CONTRACT_VERSION,
    locale: template.contentLocale,
    lifeId,
    branchId,
    identity: { ...template.identity, baseProfileVersionId: null },
    environment: {
      // Stored v2 engine identifier retained for existing canon compatibility.
      version: 'hu-neutral-v2',
      description: template.environment.description,
    },
    goals: template.goals.map(
      ({ key, status: _status, note: _note, ...goal }) => ({
        ...goal,
        id: goals.get(key)!,
      }),
    ),
    initialState: {
      ...template.startingState,
      schemaVersion: LIFE_CONTRACT_VERSION,
      ownedAssets: template.startingState.ownedAssets.map(
        ({ key, ...asset }) => ({
          ...asset,
          id: assets.get(key)!,
        }),
      ),
      actors: template.startingState.actors.map(({ key: _key, ...actor }) => ({
        ...actor,
        id: randomUUID(),
      })),
      opportunities: template.startingState.opportunities.map(
        ({ key: _key, ...opportunity }) => ({
          ...opportunity,
          id: randomUUID(),
        }),
      ),
      goals: template.goals.map((goal) => ({
        goalId: goals.get(goal.key)!,
        status: goal.status,
        note: goal.note,
      })),
    },
    constraints: template.constraints.map((constraint) => ({
      id: randomUUID(),
      lifeId,
      branchId: constraint.scope === 'branch' ? branchId : null,
      description: constraint.description,
      strength: constraint.strength,
      validFrom: constraint.validFrom,
      validUntil: constraint.validUntil,
      endsOnDecisionId: null,
      predicate:
        constraint.predicate.type === 'asset_is_owned'
          ? {
              type: 'asset_is_owned',
              assetId: assets.get(constraint.predicate.assetKey)!,
              owned: constraint.predicate.owned,
            }
          : constraint.predicate,
    })),
    visibility: 'private',
  });
}
