import { randomUUID } from 'node:crypto';
import {
  LIFE_CONTRACT_VERSION,
  scenarioTemplateSchema,
  type ScenarioTemplate,
  type LifeInputV2,
} from '@future-flow/contracts';
import { DomainError } from './errors';
import { validateLifeInputV2 } from './life-v2';
import { publicDraftIssues } from './public-draft';

function materialize(template: ScenarioTemplate): LifeInputV2 {
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

export function validateScenarioTemplate(raw: unknown): ScenarioTemplate {
  const template = scenarioTemplateSchema.parse(raw);
  if (Buffer.byteLength(JSON.stringify(template), 'utf8') > 40000)
    throw new DomainError('SCENARIO_TOO_LARGE', 'Scenario is too large.');
  if (publicDraftIssues(template).length)
    throw new DomainError(
      'SCENARIO_PRIVACY_PREFLIGHT',
      'Generalize this template.',
    );
  for (const entries of [
    template.goals,
    template.startingState.ownedAssets,
    template.startingState.actors,
    template.startingState.opportunities,
    template.constraints,
  ])
    if (new Set(entries.map((item) => item.key)).size !== entries.length)
      throw new DomainError(
        'SCENARIO_REFERENCE',
        'Placeholder keys must be unique.',
      );
  const primary = template.goals.filter((goal) => goal.priority === 'primary');
  if (primary.length !== 1 || primary[0]!.status !== 'active')
    throw new DomainError(
      'SCENARIO_REFERENCE',
      'An active primary goal is required.',
    );
  for (const constraint of template.constraints) {
    const predicate = constraint.predicate;
    if (
      predicate.type === 'asset_is_owned' &&
      !template.startingState.ownedAssets.some(
        (asset) => asset.key === predicate.assetKey,
      )
    )
      throw new DomainError('SCENARIO_REFERENCE', 'Unknown asset placeholder.');
  }
  for (const opportunity of template.startingState.opportunities)
    if (
      opportunity.status === 'open' &&
      opportunity.expiresAt !== null &&
      opportunity.expiresAt <= template.startingState.effectiveAt
    )
      throw new DomainError(
        'SCENARIO_INTERVAL',
        'An open opportunity has expired.',
      );
  materialize(template); // Existing domain checks also validate dates, facts and hard constraints.
  return template;
}

export function instantiateScenarioTemplate(raw: unknown): LifeInputV2 {
  return materialize(validateScenarioTemplate(raw));
}
