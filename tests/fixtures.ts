import { randomUUID } from 'node:crypto';
import {
  questionnaire,
  traitKeys,
  type Profile,
  type SimulationOutput,
  type ChapterOutput,
} from '@future-flow/contracts';
import { buildProfile, initialState, simulate } from '@future-flow/core';
import type { AiProvider, AiReceipt } from '@future-flow/ai';

export const answers = {
  ageBand: '35_44',
  region: 'Pest',
  regionType: 'small_town',
  relationshipStatus: 'partnered',
  children: 1,
  employmentStatus: 'employed',
  workDomain: 'Műszaki terület',
  workSatisfaction: 38,
  financialStability: 67,
  housingStability: 81,
  relocationWillingness: 28,
  careerChangeWillingness: 61,
  ...Object.fromEntries(traitKeys.map((key) => [key, 50])),
  changeSeeking: 68,
  securityNeed: 79,
  values: ['family', 'security', 'autonomy'],
  goalCategory: 'career',
  goalTitle: 'Érdekesebb munka',
  noCloseRelationships: true,
};
export function profile(): Profile {
  return buildProfile(answers, []);
}
export function simulation(): SimulationOutput {
  return {
    title: 'Egy új szakmai irány',
    events: [10, 20, 36, 60, 100].map((month, index) => ({
      key: `event_${index}`,
      type: 'career',
      title: `Szakmai esemény ${index + 1}`,
      summary: 'Egy visszafogott szakmai változás a fiktív életágban.',
      offsetMonths: month,
      actorIds: ['user'],
      causes: [
        {
          source: 'profile',
          key: 'traits.changeSeeking',
          explanation: 'A változás iránti igény megjelenik a szcenárióban.',
        },
      ],
      uncertainty: 'medium',
      effects: [{ path: 'career.satisfaction', delta: 5 }],
      decision:
        index === 0
          ? {
              prompt: 'Hogyan reagálsz az új lehetőségre?',
              options: [
                {
                  key: 'explore',
                  label: 'Utánajárok a lehetőségnek',
                  description: 'Információt gyűjtök a váltás előtt.',
                  effects: [{ path: 'internal.perceivedAgency', delta: 10 }],
                  constraints: [],
                },
                {
                  key: 'stay',
                  label: 'A jelenlegi munkában maradok',
                  description: 'A jelenlegi helyzetben keresek fejlődést.',
                  effects: [{ path: 'career.stability', delta: 10 }],
                  constraints: [],
                },
              ],
            }
          : null,
    })),
  };
}
export function chapters(): ChapterOutput {
  return {
    chapters: [1, 2].map((number) => ({
      chapterNo: number,
      title: `A ${number}. fejezet`,
      lead: 'Ebben az életágban új lehetőségeket veszel észre.',
      body: 'A változás fokozatosan válik egy elképzelt életút részévé. '.repeat(
        8,
      ),
      summary: 'Megjelenik egy fiktív szakmai lehetőség.',
      eventKeys: number === 1 ? ['event_0'] : ['event_1', 'event_2'],
      decisionEventKey: number === 1 ? 'event_0' : null,
    })),
  };
}
const receipt: AiReceipt = {
  task: 'test',
  promptVersion: 'test.v1',
  model: 'test-only',
  requestId: null,
  inputHash: 'test',
  outputHash: 'test',
  inputTokens: 1,
  outputTokens: 1,
  latencyMs: 1,
};
// Test double only. The application has a single real OpenAI provider and no mock switch.
export function testAi(): AiProvider {
  return {
    events: async () => ({ output: simulation(), receipt }),
    chapters: async () => ({ output: chapters(), receipt }),
    checkStory: async () => ({ output: { valid: true, issues: [] }, receipt }),
  };
}
export function canon() {
  return simulate(simulation(), initialState(profile(), '2026-10-02'));
}
