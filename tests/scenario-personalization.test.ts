import { describe, it, expect } from 'vitest';
import {
  scenarioPersonalProfileSchema,
  scenarioPersonalizationPreviewSchema,
} from '@future-flow/contracts';
import {
  hash,
  prepareScenarioPersonalization,
  instantiateScenarioPersonalization,
  validateScenarioTemplate,
} from '@future-flow/core';
import { scenarioFixture } from './scenario-fixtures';

import { personalScenarioFixture } from './scenario-personalization-fixtures';

const approve = (
  preview: ReturnType<typeof prepareScenarioPersonalization>,
) => ({
  previewHash: preview.previewHash,
  acknowledged: true,
});
describe('explicit private Scenario personalization', () => {
  it('keeps the own primary goal, retains the Scenario theme as secondary, and replaces all fictional starting facts', () => {
    const t = scenarioFixture(),
      p = personalScenarioFixture(),
      before = [hash(t), hash(p)],
      preview = prepareScenarioPersonalization(t, p);
    expect([hash(t), hash(p)]).toEqual(before);
    expect(preview.facts.identity).toEqual(p.identity);
    expect(preview.facts.startingState).toEqual(p.startingState);
    expect(preview.facts.constraints).toEqual(p.constraints);
    expect(preview.facts.goals).toHaveLength(2);
    expect(preview.facts.goals[0]).toEqual(p.goals[0]);
    expect(preview.facts.goals[1]).toMatchObject({
      description: t.goals[0]!.description,
      key: 'goal-2',
      priority: 'secondary',
      status: 'active',
      note: null,
    });
    expect(preview.changes).toMatchObject({
      omittedScenarioGoals: 1,
      omittedScenarioConstraints: 2,
      omittedScenarioAssets: 1,
      omittedScenarioActors: 1,
      omittedScenarioOpportunities: 1,
    });
    expect(preview).toMatchObject({
      visibility: 'private',
      publicationApproved: false,
      officialLifeApproved: false,
    });
    expect(scenarioPersonalizationPreviewSchema.parse(preview)).toEqual(
      preview,
    );
  });
  it('makes a deterministic preview without retaining private UUIDs, history, profile versions or publication authority', () => {
    const t = scenarioFixture(),
      p = personalScenarioFixture(),
      a = prepareScenarioPersonalization(t, p);
    expect(prepareScenarioPersonalization(t, p)).toEqual(a);
    expect(JSON.stringify(a)).not.toMatch(
      /lifeId|branchId|baseProfileVersionId|sharedEvents|receipt|sourceGrantId/,
    );
    for (const extra of [
      { privateHistory: [] },
      { baseProfileVersionId: '00000000-0000-4000-8000-000000000000' },
      { visibility: 'public' },
    ])
      expect(() =>
        scenarioPersonalProfileSchema.parse({ ...p, ...extra }),
      ).toThrow();
    expect(() =>
      scenarioPersonalProfileSchema.parse({
        ...p,
        startingState: { ...p.startingState, userId: 'foreign' },
      }),
    ).toThrow();
    expect(() =>
      scenarioPersonalProfileSchema.parse({
        ...p,
        identity: { ...p.identity, baseProfileVersionId: null },
      }),
    ).toThrow();
  });
  it('creates independent fresh IDs and consistent references only after approval of the complete preview', () => {
    const t = scenarioFixture(),
      p = personalScenarioFixture();
    p.startingState.ownedAssets = [
      {
        key: 'asset-1',
        kind: 'home',
        label: 'My workshop',
        sharePercent: 50,
      },
    ];
    p.constraints.push({
      ...p.constraints[0]!,
      key: 'constraint-2',
      scope: 'branch',
      predicate: { type: 'asset_is_owned', assetKey: 'asset-1', owned: true },
    });
    const preview = prepareScenarioPersonalization(t, p),
      a = instantiateScenarioPersonalization(t, p, approve(preview)),
      b = instantiateScenarioPersonalization(t, p, approve(preview));
    const ids = (x: typeof a) => [
      x.lifeId,
      x.branchId,
      ...x.goals.map((g) => g.id),
      ...x.initialState.ownedAssets.map((v) => v.id),
      ...x.initialState.actors.map((v) => v.id),
      ...x.constraints.map((c) => c.id),
    ];
    expect(ids(a).some((id) => ids(b).includes(id))).toBe(false);
    expect(a.initialState.goals.map((g) => g.goalId)).toEqual(
      a.goals.map((g) => g.id),
    );
    expect(a.constraints[1]).toMatchObject({
      lifeId: a.lifeId,
      branchId: a.branchId,
      predicate: {
        type: 'asset_is_owned',
        assetId: a.initialState.ownedAssets[0]!.id,
        owned: true,
      },
    });
    expect(a.identity.baseProfileVersionId).toBeNull();
    expect(a.visibility).toBe('private');
    expect(a.locale).toBe('en');
    expect(a.initialState.finance).toEqual(p.startingState.finance);
  });
  it('requires explicit acknowledgement and detects changed personal facts, constraints and source content', () => {
    const t = scenarioFixture(),
      p = personalScenarioFixture(),
      preview = prepareScenarioPersonalization(t, p);
    expect(() =>
      instantiateScenarioPersonalization(t, p, {
        ...approve(preview),
        acknowledged: false,
      }),
    ).toThrow();
    expect(() =>
      instantiateScenarioPersonalization(t, p, {
        ...approve(preview),
        facts: preview.facts,
      }),
    ).toThrow();
    for (const changed of [
      {
        ...p,
        startingState: {
          ...p.startingState,
          finance: { ...p.startingState.finance, liquidFunds: 601 },
        },
      },
      { ...p, context: 'A changed private context' },
      { ...p, constraints: [] },
    ])
      expect(() =>
        instantiateScenarioPersonalization(t, changed, approve(preview)),
      ).toThrowError(
        expect.objectContaining({ code: 'SCENARIO_PERSONALIZATION_CHANGED' }),
      );
    expect(() =>
      instantiateScenarioPersonalization(
        { ...t, title: 'A revised source title' },
        p,
        approve(preview),
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'SCENARIO_PERSONALIZATION_CHANGED' }),
    );
  });
  it('allows personal identifying context privately while retaining the public-source privacy preflight', () => {
    const t = scenarioFixture(),
      p = personalScenarioFixture();
    p.context = 'My private contact is synthetic@example.test.';
    const preview = prepareScenarioPersonalization(t, p);
    expect(preview.facts.environment.description).toContain(p.context);
    expect(hash(t)).toBe(preview.templateHash);
    expect(() =>
      validateScenarioTemplate({ ...t, summary: p.context }),
    ).toThrowError(
      expect.objectContaining({ code: 'SCENARIO_PRIVACY_PREFLIGHT' }),
    );
    expect(() =>
      prepareScenarioPersonalization({ ...t, summary: p.context }, p),
    ).toThrowError(
      expect.objectContaining({ code: 'SCENARIO_PRIVACY_PREFLIGHT' }),
    );
  });
  it('refuses duplicate keys, missing assets, expired opportunities and conflicting own hard constraints', () => {
    const t = scenarioFixture(),
      p = personalScenarioFixture();
    expect(() =>
      prepareScenarioPersonalization(t, {
        ...p,
        goals: [p.goals[0], p.goals[0]],
      }),
    ).toThrowError(expect.objectContaining({ code: 'SCENARIO_REFERENCE' }));
    expect(() =>
      prepareScenarioPersonalization(t, {
        ...p,
        constraints: [t.constraints[0]],
      }),
    ).toThrowError(expect.objectContaining({ code: 'SCENARIO_REFERENCE' }));
    expect(() =>
      prepareScenarioPersonalization(t, {
        ...p,
        startingState: {
          ...p.startingState,
          opportunities: [
            {
              key: 'opportunity-1',
              title: 'An old offer',
              status: 'open',
              expiresAt: '2026-10-01',
            },
          ],
        },
      }),
    ).toThrowError(expect.objectContaining({ code: 'SCENARIO_INTERVAL' }));
    expect(() =>
      prepareScenarioPersonalization(t, {
        ...p,
        constraints: [
          {
            ...p.constraints[0]!,
            predicate: { type: 'country_is', value: 'GB' },
          },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: 'LIFE_HARD_CONSTRAINT' }));
    expect(() =>
      prepareScenarioPersonalization(t, {
        ...p,
        goals: [{ ...p.goals[0]!, priority: 'secondary' }],
      }),
    ).toThrowError(expect.objectContaining({ code: 'SCENARIO_REFERENCE' }));
  });
  it('preserves all own goals and chooses an unused placeholder for the source goal', () => {
    const t = scenarioFixture(),
      p = personalScenarioFixture();
    p.goals = [1, 2, 3, 4].map((n) => ({
      ...p.goals[0]!,
      key: `goal-${n}`,
      priority: n === 1 ? 'primary' : 'secondary',
    }));
    const preview = prepareScenarioPersonalization(t, p);
    expect(preview.facts.goals.slice(0, 4)).toEqual(p.goals);
    expect(preview.changes.retainedScenarioGoalKey).toBe('goal-5');
    expect(preview.facts.goals).toHaveLength(5);
    expect(() =>
      prepareScenarioPersonalization(t, {
        ...p,
        goals: [
          ...p.goals,
          { ...p.goals[0]!, key: 'goal-6', priority: 'secondary' },
        ],
      }),
    ).toThrow();
  });
  it('retains future own constraints and warnings without converting a soft condition into a hard condition', () => {
    const t = scenarioFixture(),
      p = personalScenarioFixture();
    p.constraints.push({
      ...t.constraints[1]!,
      key: 'constraint-2',
      validFrom: '2026-11-01',
      validUntil: null,
    });
    p.constraints.push({
      ...p.constraints[0]!,
      key: 'constraint-3',
      validFrom: '2027-01-01',
      predicate: { type: 'employment_status_is', value: 'self_employed' },
    });
    const preview = prepareScenarioPersonalization(t, p),
      life = instantiateScenarioPersonalization(t, p, approve(preview));
    expect(life.constraints[1]!.strength).toBe('soft');
    expect(life.constraints[2]!.validFrom).toBe('2027-01-01');
    expect(life.initialState.employment.status).toBe('employed');
  });
  it('refuses oversize composition instead of trimming approved source or personal text', () => {
    const t = scenarioFixture(),
      p = personalScenarioFixture();
    expect(() =>
      prepareScenarioPersonalization(t, { ...p, context: 'x'.repeat(1000) }),
    ).toThrowError(
      expect.objectContaining({ code: 'SCENARIO_PERSONALIZATION_LIMIT' }),
    );
    const without = prepareScenarioPersonalization(t, { ...p, context: null });
    expect(without.facts.environment.description).toBe(
      t.environment.description,
    );
    const large = {
      ...p,
      startingState: {
        ...p.startingState,
        actors: Array.from({ length: 30 }, (_, n) => ({
          key: `actor-${n + 1}`,
          label: 'x'.repeat(160),
          relationship: 'friend',
        })),
        ownedAssets: Array.from({ length: 30 }, (_, n) => ({
          key: `asset-${n + 1}`,
          label: 'x'.repeat(160),
          kind: 'other',
          sharePercent: 100,
        })),
        skills: Array.from({ length: 50 }, (_, n) => `${n} ` + 'x'.repeat(150)),
      },
      goals: Array.from({ length: 4 }, (_, n) => ({
        ...p.goals[0]!,
        key: `goal-${n + 1}`,
        priority: n === 0 ? 'primary' : 'secondary',
        acceptableTradeoffs: Array.from({ length: 10 }, () => 'a'.repeat(160)),
        unacceptableTradeoffs: Array.from({ length: 10 }, () =>
          'b'.repeat(160),
        ),
      })),
      constraints: Array.from({ length: 20 }, (_, n) => ({
        ...p.constraints[0]!,
        key: `constraint-${n + 1}`,
        description: 'x'.repeat(400),
      })),
    };
    expect(() => prepareScenarioPersonalization(t, large)).toThrowError(
      expect.objectContaining({ code: 'SCENARIO_PERSONALIZATION_LIMIT' }),
    );
  });
});
