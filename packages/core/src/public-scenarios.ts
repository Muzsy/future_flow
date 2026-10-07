import {
  scenarioTemplateSchema,
  type ScenarioTemplate,
  type LifeInputV2,
} from '@future-flow/contracts';
import { DomainError } from './errors';
import { publicDraftIssues } from './public-draft';
import { materializeScenarioFacts } from './scenario-materialization';

export function validateScenarioTemplate(raw: unknown): ScenarioTemplate {
  const template = scenarioTemplateSchema.parse(raw);
  if (Buffer.byteLength(JSON.stringify(template), 'utf8') > 40000)
    throw new DomainError('SCENARIO_TOO_LARGE', 'Scenario is too large.');
  if (publicDraftIssues(template).length)
    throw new DomainError(
      'SCENARIO_PRIVACY_PREFLIGHT',
      'Generalize this template.',
    );
  validateScenarioReferences(template);
  materializeScenarioFacts(template); // Existing domain checks also validate dates, facts and hard constraints.
  return template;
}

export function validateScenarioReferences(
  template: Pick<ScenarioTemplate, 'goals' | 'startingState' | 'constraints'>,
) {
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
}

export function instantiateScenarioTemplate(raw: unknown): LifeInputV2 {
  return materializeScenarioFacts(validateScenarioTemplate(raw));
}
