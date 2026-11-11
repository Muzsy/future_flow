import {
  SCENARIO_CONTRACT_VERSION,
  type ScenarioTemplate,
} from '@future-flow/contracts';

// Technical synthetic template, not an Official life or an AI-generated story.
export function scenarioFixture(): ScenarioTemplate {
  return {
    schemaVersion: SCENARIO_CONTRACT_VERSION,
    contentLocale: 'en',
    title: 'A small studio and a new direction',
    summary:
      'An adult balancing a small independent studio with time for further study.',
    identity: { mode: 'alternate', label: null, ageBand: '35_44' },
    environment: {
      version: 'fictional-neutral-1',
      description: 'A fictional neutral setting, without economic forecasts.',
    },
    goals: [
      {
        key: 'goal-1',
        category: 'business',
        description: 'Build a sustainable independent studio.',
        priority: 'primary',
        horizonMonths: 24,
        motivation: 'Make space for meaningful work.',
        acceptableTradeoffs: ['Slower growth'],
        unacceptableTradeoffs: ['Unmanageable debt'],
        status: 'active',
        note: null,
      },
      {
        key: 'goal-2',
        category: 'education',
        description: 'Complete a practical part-time course.',
        priority: 'secondary',
        horizonMonths: 12,
        motivation: null,
        acceptableTradeoffs: [],
        unacceptableTradeoffs: [],
        status: 'active',
        note: null,
      },
    ],
    startingState: {
      effectiveAt: '2026-10-05',
      employment: {
        status: 'self_employed',
        employerLabel: null,
        workDomain: 'Design',
      },
      location: { country: 'GB', region: null, housing: null },
      finance: { currency: 'USD', monthlyIncome: 2000, liquidFunds: 5000 },
      ownedAssets: [
        {
          key: 'asset-1',
          kind: 'business',
          label: 'The studio',
          sharePercent: 100,
        },
      ],
      actors: [
        { key: 'actor-1', label: 'A close friend', relationship: 'friend' },
      ],
      skills: ['Design'],
      opportunities: [
        {
          key: 'opportunity-1',
          title: 'A part-time course',
          status: 'open',
          expiresAt: '2027-04-05',
        },
      ],
      resources: { energy: 60, availableHoursPerWeek: 10 },
    },
    constraints: [
      {
        key: 'constraint-1',
        description: 'Keep ownership of the studio for the first six months.',
        strength: 'hard',
        scope: 'branch',
        validFrom: '2026-10-05',
        validUntil: '2027-04-05',
        predicate: { type: 'asset_is_owned', assetKey: 'asset-1', owned: true },
      },
      {
        key: 'constraint-2',
        description: 'Prefer a small financial buffer.',
        strength: 'soft',
        scope: 'life',
        validFrom: '2026-10-05',
        validUntil: null,
        predicate: {
          type: 'liquid_funds_at_least',
          currency: 'USD',
          amount: 2000,
        },
      },
    ],
  };
}
