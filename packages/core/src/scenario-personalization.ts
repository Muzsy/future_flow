import {
  SCENARIO_PERSONALIZATION_VERSION,
  scenarioPersonalProfileSchema,
  scenarioPersonalizationFactsSchema,
  scenarioPersonalizationPreviewSchema,
  scenarioPersonalizationApprovalSchema,
  type ScenarioPersonalizationPreview,
  type LifeInputV2,
} from '@future-flow/contracts';
import { DomainError } from './errors';
import { hash } from './index';
import {
  validateScenarioTemplate,
  validateScenarioReferences,
} from './public-scenarios';
import { materializeScenarioFacts } from './scenario-materialization';

// Pure private preparation: no account lookup, public write, queue or AI call.
export function prepareScenarioPersonalization(
  rawTemplate: unknown,
  rawProfile: unknown,
): ScenarioPersonalizationPreview {
  const template = validateScenarioTemplate(rawTemplate),
    profile = scenarioPersonalProfileSchema.parse(rawProfile);
  if (Buffer.byteLength(JSON.stringify(profile), 'utf8') > 40000)
    throw new DomainError(
      'SCENARIO_PERSONALIZATION_LIMIT',
      'Shorten the personal starting context.',
    );
  validateScenarioReferences(profile);

  const keys = new Set(profile.goals.map((goal) => goal.key));
  let retainedKey = 'goal-1';
  for (let n = 1; keys.has(retainedKey); n++) retainedKey = `goal-${n + 1}`;
  const scenarioGoal = template.goals.find(
      (goal) => goal.priority === 'primary',
    )!,
    description =
      template.environment.description +
      (profile.context === null
        ? ''
        : '\nUser-approved personal context: ' + profile.context);
  if (description.length > 1000)
    throw new DomainError(
      'SCENARIO_PERSONALIZATION_LIMIT',
      'Shorten the personal context to fit the complete scenario context.',
    );

  const facts = scenarioPersonalizationFactsSchema.parse({
    identity: profile.identity,
    environment: { version: 'hu-neutral-v2', description },
    goals: [
      ...profile.goals,
      {
        ...scenarioGoal,
        key: retainedKey,
        priority: 'secondary',
        status: 'active',
        note: null,
      },
    ],
    startingState: profile.startingState,
    constraints: profile.constraints,
  });
  // Uses the same canon/hard-constraint checks as ordinary private lives.
  // A private name is allowed here, while the source retains public preflight.
  materializeScenarioFacts({ contentLocale: 'en', ...facts });
  const body = {
    schemaVersion: SCENARIO_PERSONALIZATION_VERSION,
    templateHash: hash(template),
    profileHash: hash(profile),
    scenario: { title: template.title, summary: template.summary },
    facts,
    changes: {
      startingFacts: 'replaced_with_approved_profile',
      constraints: 'replaced_with_approved_profile',
      primaryGoal: 'approved_personal_goal',
      scenarioGoal: 'retained_as_secondary',
      retainedScenarioGoalKey: retainedKey,
      omittedScenarioGoals: template.goals.length - 1,
      omittedScenarioConstraints: template.constraints.length,
      omittedScenarioAssets: template.startingState.ownedAssets.length,
      omittedScenarioActors: template.startingState.actors.length,
      omittedScenarioOpportunities: template.startingState.opportunities.length,
    },
    visibility: 'private',
    publicationApproved: false,
    officialLifeApproved: false,
  };
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 40000)
    throw new DomainError(
      'SCENARIO_PERSONALIZATION_LIMIT',
      'Shorten the complete personalized starting context.',
    );
  return scenarioPersonalizationPreviewSchema.parse({
    ...body,
    previewHash: hash(body),
  });
}

// Recompute from the trusted source and current explicit profile; never trust
// a client-supplied preview/facts graph. Authorization belongs to the repository.
export function instantiateScenarioPersonalization(
  rawTemplate: unknown,
  rawProfile: unknown,
  rawApproval: unknown,
): LifeInputV2 {
  const approval = scenarioPersonalizationApprovalSchema.parse(rawApproval),
    preview = prepareScenarioPersonalization(rawTemplate, rawProfile);
  if (approval.previewHash !== preview.previewHash)
    throw new DomainError(
      'SCENARIO_PERSONALIZATION_CHANGED',
      'Review the changed starting context before creating a life.',
      409,
    );
  return materializeScenarioFacts({ contentLocale: 'en', ...preview.facts });
}
