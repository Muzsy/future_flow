import { createHash, randomUUID } from 'node:crypto';
import {
  CONTRACT_VERSION,
  profileSchema,
  stateSchema,
  simulationOutputSchema,
  chapterOutputSchema,
  traitKeys,
  questionnaire,
  type Profile,
  type LifeState,
  type SimulationOutput,
  type ChapterOutput,
  type CandidateEvent,
  type WorldState,
} from '@future-flow/contracts';

import { DomainError } from './errors';
import { addMonths } from './dates';
export { DomainError } from './errors';
export { addMonths } from './dates';
export * from './life-v2';
export function hash(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, val]) => [key, normalize(val)]),
      );
    return item;
  };
  return createHash('sha256')
    .update(JSON.stringify(normalize(value)))
    .digest('hex');
}
export function buildProfile(
  answers: Record<string, unknown>,
  relationships: Profile['relationships'],
): Profile {
  const missing = questionnaire.questions
    .filter((q) => answers[q.key] === undefined || answers[q.key] === '')
    .map((q) => q.key);
  if (missing.length)
    throw new DomainError(
      'PROFILE_INCOMPLETE',
      `Hiányzó válaszok: ${missing.join(', ')}`,
    );
  for (const key of Object.keys(answers))
    if (!questionnaire.questions.some((q) => q.key === key))
      throw new DomainError(
        'PROFILE_UNKNOWN_QUESTION',
        'Ismeretlen kérdésazonosító.',
      );
  return profileSchema.parse({
    schemaVersion: CONTRACT_VERSION,
    facts: Object.fromEntries(
      [
        'ageBand',
        'region',
        'regionType',
        'relationshipStatus',
        'children',
        'employmentStatus',
        'workDomain',
        'workSatisfaction',
        'financialStability',
        'housingStability',
      ]
        .map((key) => [key, answers[key]])
        .concat([['country', 'HU']]),
    ),
    preferences: {
      relocationWillingness: answers.relocationWillingness,
      careerChangeWillingness: answers.careerChangeWillingness,
    },
    traits: Object.fromEntries(traitKeys.map((key) => [key, answers[key]])),
    values: answers.values,
    goals: [
      {
        id: randomUUID(),
        category: answers.goalCategory,
        title: answers.goalTitle,
        importance: 80,
      },
    ],
    relationships,
    noCloseRelationships: answers.noCloseRelationships,
  });
}
export function initialState(profile: Profile, effectiveAt: string): LifeState {
  return stateSchema.parse({
    effectiveAt,
    career: {
      employmentStatus: profile.facts.employmentStatus,
      satisfaction: profile.facts.workSatisfaction,
      stability: 50,
      growthOpportunity: 50,
    },
    finance: {
      stability: profile.facts.financialStability,
      stress: 100 - profile.facts.financialStability,
    },
    social: {
      connectedness: profile.relationships.length
        ? Math.round(
            profile.relationships.reduce((sum, rel) => sum + rel.closeness, 0) /
              profile.relationships.length,
          )
        : 20,
    },
    internal: {
      changeDesire: profile.traits.changeSeeking,
      perceivedAgency: 50,
      energy: 50,
    },
  });
}
export function applyEffects(
  state: LifeState,
  effects: CandidateEvent['effects'],
  effectiveAt: string,
): LifeState {
  const next = structuredClone(state);
  const paths = new Set<string>();
  for (const effect of effects) {
    if (paths.has(effect.path))
      throw new DomainError(
        'SIMULATION_DUPLICATE_EFFECT',
        'Egy esemény ugyanazt a mezőt többször módosítja.',
      );
    paths.add(effect.path);
    const [group, key] = effect.path.split('.') as [
      Exclude<keyof LifeState, 'effectiveAt'>,
      string,
    ];
    const scores = next[group] as unknown as Record<string, number>;
    const current = scores[key];
    if (current === undefined)
      throw new DomainError(
        'SIMULATION_UNKNOWN_PATH',
        'Ismeretlen állapotmező.',
      );
    scores[key] = Math.max(0, Math.min(100, current + effect.delta));
  }
  next.effectiveAt = effectiveAt;
  return stateSchema.parse(next);
}
export function validateSimulation(
  raw: unknown,
  profile: Profile,
  horizonMonths: number,
): SimulationOutput {
  const output = simulationOutputSchema.parse(raw);
  const actors = new Set(['user', ...profile.relationships.map((r) => r.id)]);
  const keys = new Set<string>();
  let lastOffset = 0;
  for (const event of output.events) {
    if (keys.has(event.key))
      throw new DomainError(
        'SIMULATION_DUPLICATE_EVENT',
        'Ismétlődő eseményazonosító.',
      );
    keys.add(event.key);
    if (event.offsetMonths <= lastOffset || event.offsetMonths > horizonMonths)
      throw new DomainError(
        'SIMULATION_INVALID_TIMELINE',
        'Hibás eseményidőrend vagy időtáv.',
      );
    lastOffset = event.offsetMonths;
    if (event.actorIds.some((actor) => !actors.has(actor)))
      throw new DomainError(
        'SIMULATION_UNKNOWN_ACTOR',
        'Az esemény nem létező szereplőt használ.',
      );
    if (
      event.decision &&
      new Set(event.decision.options.map((o) => o.key)).size !==
        event.decision.options.length
    )
      throw new DomainError(
        'SIMULATION_DUPLICATE_OPTION',
        'Ismétlődő döntési opció.',
      );
  }
  if (output.events.filter((event) => event.decision !== null).length !== 1)
    throw new DomainError(
      'SIMULATION_DECISION_COUNT',
      'Az első verzió pontosan egy döntési pontot kér.',
    );
  return output;
}
export type CanonEvent = CandidateEvent & {
  effectiveAt: string;
  stateBefore: LifeState;
  stateAfter: LifeState;
};
export function simulate(
  output: SimulationOutput,
  startState: LifeState,
): CanonEvent[] {
  let current = startState;
  return output.events.map((event) => {
    const effectiveAt = addMonths(startState.effectiveAt, event.offsetMonths);
    const stateBefore = current;
    const stateAfter = applyEffects(current, event.effects, effectiveAt);
    current = stateAfter;
    return { ...event, effectiveAt, stateBefore, stateAfter };
  });
}
export function validateChapters(
  raw: unknown,
  events: CanonEvent[],
): ChapterOutput {
  const output = chapterOutputSchema.parse(raw);
  const eventMap = new Map(events.map((e) => [e.key, e]));
  output.chapters.forEach((chapter, index) => {
    if (chapter.chapterNo !== index + 1)
      throw new DomainError('STORY_INVALID_SEQUENCE', 'Hibás fejezetsorrend.');
    if (chapter.eventKeys.some((key) => !eventMap.has(key)))
      throw new DomainError(
        'STORY_UNKNOWN_EVENT',
        'A fejezet ismeretlen eseményre hivatkozik.',
      );
    if (
      chapter.decisionEventKey !== null &&
      (!chapter.eventKeys.includes(chapter.decisionEventKey) ||
        !eventMap.get(chapter.decisionEventKey)?.decision)
    )
      throw new DomainError(
        'STORY_INVALID_DECISION',
        'Hibás döntési hivatkozás.',
      );
  });
  const decision = events.find((event) => event.decision);
  if (
    decision &&
    !output.chapters.some(
      (chapter) => chapter.decisionEventKey === decision.key,
    )
  )
    throw new DomainError(
      'STORY_MISSING_DECISION',
      'A döntési pontnak szerepelnie kell a történetben.',
    );
  return output;
}
export function worldState(profile: Profile): WorldState {
  return {
    version: 'hu-neutral-v1',
    region: profile.facts.region,
    economy: 'neutral_scenario',
    description:
      'Fiktív, semleges magyarországi környezet. Nem valós gazdasági előrejelzés.',
  };
}
export * from './public-draft';
export * from './public-review';
export * from './public-preview-editor';
export * from './public-scenarios';
export * from './public-fork';
export * from './shared-context';
export * from './shared-engine';
export * from './shared-ai';
export * from './shared-personal';
