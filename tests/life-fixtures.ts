import { randomUUID } from 'node:crypto';
import type {
  LifeSetupV2,
  LifePeriodInput,
  PeriodCandidateV2,
  PeriodChapterV2,
  Locale,
} from '@future-flow/contracts';
import { addMonths } from '@future-flow/core';
import type {
  LifeAiProvider,
  PeriodStoryInput,
  AiReceipt,
} from '@future-flow/ai';

// Deterministic test double only. Never published or used by the application.
export function setupFixture(locale: Locale = 'en', caseNo = 0): LifeSetupV2 {
  return {
    locale,
    identity: {
      mode: caseNo % 2 ? 'alternate' : 'self',
      label: null,
      ageBand: (
        ['18_24', '25_34', '35_44', '45_54', '55_64', '65_plus'] as const
      )[caseNo % 6]!,
    },
    location: {
      country: caseNo % 3 ? 'HU' : 'GB',
      region: null,
      housing: null,
    },
    employment: {
      status: caseNo % 2 ? 'employed' : null,
      employerLabel: null,
      workDomain: null,
    },
    finance: {
      currency: caseNo % 2 ? 'EUR' : null,
      monthlyIncome: caseNo % 2 ? 2000 : null,
      liquidFunds: caseNo % 2 ? 5000 : null,
    },
    skills: caseNo % 2 ? ['planning'] : [],
    relationships:
      caseNo % 3 ? [] : [{ label: 'Friend', relationship: 'friend' }],
    resources: { energy: null, availableHoursPerWeek: caseNo % 2 ? 8 : null },
    goal: {
      category: (
        [
          'career',
          'business',
          'finance',
          'relationships',
          'family',
          'education',
          'lifestyle',
          'personal_growth',
          'other',
        ] as const
      )[caseNo % 9]!,
      description: 'A synthetic personal goal',
      horizonMonths: 24,
      motivation: null,
      acceptableTradeoffs: [],
      unacceptableTradeoffs: [],
    },
    stayInCountry: caseNo % 2 === 0,
    context: null,
  };
}
export function periodFixture(input: LifePeriodInput): PeriodCandidateV2 {
  const existing = input.state.ownedAssets[0]?.id;
  const added = input.revision === 0 ? randomUUID() : null;
  const assetId = existing ?? added;
  return {
    schemaVersion: '2.0.0',
    periodId: input.periodId,
    branchId: input.input.branchId,
    baseRevision: input.revision,
    startDate: input.startDate,
    endDate: input.endDate,
    durationMonths: 6,
    title: 'Synthetic period',
    events: [
      {
        id: randomUUID(),
        title: 'A recorded development',
        summary: 'A canonical test event during the period.',
        effectiveAt: addMonths(input.startDate, 3),
        actorIds: [],
        preconditions: [],
        changes: added
          ? [
              {
                type: 'asset_add',
                value: {
                  id: added,
                  kind: 'business',
                  label: 'Synthetic workshop',
                  sharePercent: 100,
                },
              },
            ]
          : [],
        decision: null,
      },
      {
        id: randomUUID(),
        title: 'A pending test choice',
        summary: 'A canonical unresolved choice at the end of this period.',
        effectiveAt: input.endDate,
        actorIds: [],
        preconditions: [],
        changes: [],
        decision: {
          id: randomUUID(),
          prompt: 'Which path will you choose?',
          options: [
            {
              id: randomUUID(),
              label: 'Sell or simplify',
              description: 'Use fewer commitments for the next period.',
              preconditions: [],
              changes: [
                ...(assetId
                  ? [{ type: 'asset_remove' as const, assetId }]
                  : []),
                {
                  type: 'resources_set',
                  value: { energy: 60, availableHoursPerWeek: 10 },
                },
              ],
            },
            {
              id: randomUUID(),
              label: 'Keep the current direction',
              description: 'Continue with your existing commitments.',
              preconditions: [],
              changes: [
                {
                  type: 'resources_set',
                  value: { energy: 40, availableHoursPerWeek: 5 },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}
export function chapterFixture(story: PeriodStoryInput): PeriodChapterV2 {
  return {
    title: 'Test-only synthetic chapter',
    body: Array.from({ length: 300 }, (_, i) => `fixture${i}`).join(' '),
    eventIds: story.events.map((event) => event.id),
    decisionId: story.events.at(-1)!.decision!.id,
  };
}
function receipt(task: string): AiReceipt {
  return {
    task,
    promptVersion: 'test-only',
    locale: 'en',
    model: 'test-only',
    requestId: null,
    inputHash: 'test',
    outputHash: 'test',
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
  };
}
export const lifeTestAi: LifeAiProvider = {
  period: async (input) => ({
    output: periodFixture(input),
    receipt: receipt('life_period'),
  }),
  periodChapter: async (input) => ({
    output: chapterFixture(input),
    receipt: receipt('life_chapter'),
  }),
  checkPeriodChapter: async () => ({
    output: { valid: true, issues: [] },
    receipt: receipt('life_fidelity'),
  }),
};
