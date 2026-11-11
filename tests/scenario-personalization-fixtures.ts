import type { ScenarioPersonalProfile } from '@future-flow/contracts';
import { scenarioFixture } from './scenario-fixtures';

export function personalScenarioFixture(): ScenarioPersonalProfile {
  const t = scenarioFixture();
  return {
    identity: {
      mode: 'self',
      label: 'My private starting point',
      ageBand: '25_34',
    },
    goals: [
      {
        ...t.goals[1]!,
        key: 'goal-1',
        priority: 'primary',
        description: 'Build skills while protecting time with my family.',
      },
    ],
    startingState: {
      ...t.startingState,
      effectiveAt: '2026-11-01',
      employment: {
        status: 'employed',
        employerLabel: null,
        workDomain: 'Support',
      },
      location: { country: 'DE', region: null, housing: null },
      finance: { currency: 'EUR', monthlyIncome: 1800, liquidFunds: 600 },
      ownedAssets: [],
      actors: [
        { key: 'actor-1', label: 'My partner', relationship: 'partner' },
      ],
      skills: ['Writing'],
      opportunities: [],
      resources: { energy: 45, availableHoursPerWeek: 4 },
    },
    constraints: [
      {
        key: 'constraint-1',
        description: 'Stay in my starting country.',
        strength: 'hard',
        scope: 'life',
        validFrom: '2026-11-01',
        validUntil: null,
        predicate: { type: 'country_is', value: 'DE' },
      },
    ],
    context: 'Keep the weekly schedule manageable.',
  };
}
