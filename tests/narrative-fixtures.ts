import { createHash } from 'node:crypto';
import {
  lifeSetupV2Schema,
  type LifeSetupV2,
  type LifePeriodInput,
  type PeriodCandidateV2,
  type PeriodChapterV2,
} from '@future-flow/contracts';
import { addMonths, validateLifeInputV2 } from '@future-flow/core';
import { buildLifeInput } from '@future-flow/database';
import type { PeriodStoryInput, AiReceipt } from '@future-flow/ai';
import { setupFixture } from './life-fixtures';

// Fictional, offline evaluation inputs. Never use real account or operator data.
export const narrativeProfiles = [
  {
    id: 'bounded-career',
    category: 'career',
    goal: 'Explore project coordination through a small internal trial without leaving the current job.',
    hours: 6,
    energy: 65,
    tradeoff: 'Working on protected weekends or leaving current employment.',
  },
  {
    id: 'career-transition',
    category: 'career',
    goal: 'Test a move from administration into a different professional field.',
    hours: 12,
    energy: 80,
    tradeoff: 'Treating a reversible experiment as a guaranteed new job.',
  },
  {
    id: 'creative-portfolio',
    category: 'personal_growth',
    goal: 'Complete a small illustration portfolio and obtain concrete outside feedback.',
    hours: 8,
    energy: 70,
    tradeoff: 'Accepting commitments that eliminate time for original work.',
  },
  {
    id: 'learning-exam',
    category: 'education',
    goal: 'Prepare for a professional assessment and test knowledge in practical work.',
    hours: 5,
    energy: 60,
    tradeoff: 'Committing unknown funds or removing recovery time.',
  },
  {
    id: 'moving',
    category: 'lifestyle',
    goal: 'Explore a change of housing through reversible practical steps.',
    hours: 4,
    energy: 55,
    tradeoff: 'Assuming available funds or a signed housing agreement.',
  },
  {
    id: 'community-project',
    category: 'other',
    goal: 'Try a small neighbourhood creative project and learn from participant feedback.',
    hours: 7,
    energy: 75,
    tradeoff: 'Committing to permanent organisation before a bounded trial.',
  },
  {
    id: 'fictional-friend',
    category: 'relationships',
    goal: 'Find a sustainable rhythm for a friendship with a wholly fictional companion.',
    hours: 3,
    energy: 70,
    tradeoff:
      'Ignoring different availability or assuming another person agreed.',
  },
  {
    id: 'limited-energy',
    category: 'personal_growth',
    goal: 'Try one modest personal project with limited energy and unknown finances.',
    hours: 2,
    energy: 30,
    tradeoff: 'Inventing financial facts or demanding a large outcome.',
  },
] as const;
export type NarrativeProfile = (typeof narrativeProfiles)[number];
export const narrativeStartDate = '2026-01-15';

export function narrativeFixtureId(seed: string): string {
  const hex = createHash('sha256')
    .update(`narrative-fixture:${seed}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function narrativeSetup(profile: NarrativeProfile): LifeSetupV2 {
  return lifeSetupV2Schema.parse({
    ...setupFixture('en', 1),
    identity: {
      mode: 'alternate',
      label: 'Fictional protagonist',
      ageBand: '25_34',
    },
    location: { country: 'IE', region: null, housing: 'renting' },
    employment: {
      status: 'employed',
      employerLabel: null,
      workDomain: 'administration',
    },
    finance: { currency: 'EUR', monthlyIncome: null, liquidFunds: null },
    relationships:
      profile.id === 'fictional-friend'
        ? [{ label: 'Fictional companion', relationship: 'friend' }]
        : [],
    resources: { energy: profile.energy, availableHoursPerWeek: profile.hours },
    goal: {
      category: profile.category,
      description: profile.goal,
      horizonMonths: 6,
      motivation: 'Explore a possible fictional path.',
      acceptableTradeoffs: ['A bounded experiment with an uncertain result.'],
      unacceptableTradeoffs: [profile.tradeoff],
    },
    stayInCountry: true,
    context:
      'Entirely synthetic offline fixture, not a real person or forecast.',
  });
}

export function narrativeInput(profile: NarrativeProfile): LifePeriodInput {
  const original = buildLifeInput(narrativeSetup(profile), narrativeStartDate);
  const ids = new Map<string, string>();
  const stable = JSON.parse(
    JSON.stringify(original),
    (_key, value: unknown) => {
      if (
        typeof value !== 'string' ||
        !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
          value,
        )
      )
        return value;
      if (!ids.has(value))
        ids.set(value, narrativeFixtureId(`${profile.id}:input:${ids.size}`));
      return ids.get(value);
    },
  );
  const input = validateLifeInputV2(stable);
  return {
    input,
    state: input.initialState,
    revision: 0,
    periodId: narrativeFixtureId(`${profile.id}:period:0`),
    startDate: narrativeStartDate,
    endDate: addMonths(narrativeStartDate, 6),
    durationMonths: 6,
    acceptedDecisionIds: [],
    memory: { recentEvents: [], choices: [] },
  };
}

export function narrativePeriod(input: LifePeriodInput): PeriodCandidateV2 {
  const seed = `${input.input.lifeId}:${input.revision}`;
  const note = [
    'A bounded trial produces a first concrete observation.',
    'The chosen trial receives mixed practical feedback.',
    'A revised attempt exposes a meaningful limit and a new direction.',
  ][Math.min(Math.floor(input.revision / 2), 2)]!;
  return {
    schemaVersion: '2.0.0',
    periodId: input.periodId,
    branchId: input.input.branchId,
    baseRevision: input.revision,
    startDate: input.startDate,
    endDate: input.endDate,
    durationMonths: 6,
    title: 'An experiment with consequences',
    events: [
      {
        id: narrativeFixtureId(`${seed}:event:0`),
        title: 'A concrete attempt',
        summary: note,
        effectiveAt: addMonths(input.startDate, 3),
        actorIds: [],
        preconditions: [],
        changes: [
          {
            type: 'goal_progress_set',
            value: { goalId: input.input.goals[0]!.id, status: 'active', note },
          },
        ],
        decision: null,
      },
      {
        id: narrativeFixtureId(`${seed}:event:1`),
        title: 'The next tradeoff',
        summary:
          'The result leaves an unresolved choice between a smaller follow-up and a different experiment.',
        effectiveAt: input.endDate,
        actorIds: [],
        preconditions: [],
        changes: [],
        decision: {
          id: narrativeFixtureId(`${seed}:decision`),
          prompt: 'Which bounded experiment will you try next?',
          options: [
            {
              id: narrativeFixtureId(`${seed}:option:0`),
              label: 'Refine the smaller trial',
              description:
                'Use one fewer weekly hour to examine the remaining obstacle.',
              preconditions: [],
              changes: [
                {
                  type: 'resources_set',
                  value: {
                    ...input.state.resources,
                    availableHoursPerWeek: Math.max(
                      1,
                      (input.state.resources.availableHoursPerWeek ?? 2) - 1,
                    ),
                  },
                },
              ],
            },
            {
              id: narrativeFixtureId(`${seed}:option:1`),
              label: 'Explore a different method',
              description:
                'Keep the time boundary and practise a transferable technique.',
              preconditions: [],
              changes: [
                {
                  type: 'skill_add',
                  value: `Experimental method ${input.revision + 1}`,
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

export function narrativeChapter(story: PeriodStoryInput): PeriodChapterV2 {
  return {
    title: 'The limit of a small experiment',
    body: `You reach the end of a small attempt rather than a final answer. ${story.events[0]!.summary} The observation matters because your goal is specific: ${story.goals[0]!.description} It does not prove that the whole path will work. It gives you something concrete to examine instead of another promise about the future.\n\nA limited observation is useful precisely because it has edges. You can distinguish what you tried from what you only imagined trying. The active goal is still active; there is no sudden achievement, new income, signed agreement or promise that a different future has already arrived. You take the small result seriously without treating it as evidence for everything you hoped might follow.\n\nThe next step also has edges. A smaller follow-up would leave less weekly time committed to the experiment. A different method would keep the present time boundary and give you a transferable technique to practise. Neither of those possible changes has happened yet. The comparison belongs to the unresolved decision, and the earlier observation remains the same whichever direction you eventually choose.\n\nThe limited result changes the question. You can carry the remaining obstacle into a smaller follow-up, or try a different method while keeping your time boundary. Neither route erases what the attempt has shown. You pause before choosing; the next action is still yours. The period ends with that question open, rather than with a decision made on your behalf. You can return to the same observation later without losing its place in the story. The question is not whether an entire life has been solved. It is which limited action deserves the next period of attention, with the uncertainty still visible.`,
    eventIds: story.events.map((event) => event.id),
    decisionId: story.events.at(-1)!.decision!.id,
  };
}

export function narrativeReceipt(
  task: string,
  inputHash = 'offline',
): AiReceipt {
  return {
    task,
    promptVersion: 'offline-narrative-baseline-1',
    locale: 'en',
    model: 'offline-fixture',
    requestId: null,
    inputHash,
    outputHash: 'offline',
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
  };
}
