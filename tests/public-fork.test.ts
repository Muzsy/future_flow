import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  FORK_CHECKPOINT_VERSION,
  forkCheckpointSchema,
  type ForkCheckpoint,
  type PeriodCandidateV2,
} from '@future-flow/contracts';
import {
  hash,
  instantiateScenarioTemplate,
  instantiateForkCheckpoint,
  prepareSanitizedForkCheckpoint,
  validateForkCheckpoint,
  applyFactChangesV2,
  type ForkCheckpointSource,
} from '@future-flow/core';
import { scenarioFixture } from './scenario-fixtures';

function fixture() {
  const template = scenarioFixture(),
    input = instantiateScenarioTemplate(template),
    state = structuredClone(input.initialState),
    decisionId = randomUUID();
  state.effectiveAt = '2026-12-05';
  input.constraints[0]!.endsOnDecisionId = decisionId;
  const assetId = state.ownedAssets[0]!.id,
    actorId = randomUUID(),
    homeId = randomUUID(),
    opportunityId = randomUUID();
  const decision: NonNullable<PeriodCandidateV2['events'][number]['decision']> =
    {
      id: decisionId,
      prompt: 'Choose a synthetic studio direction.',
      options: [
        {
          id: randomUUID(),
          label: 'Sell the studio',
          description: 'Sell the studio and take the financial buffer.',
          preconditions: [{ type: 'asset_is_owned', assetId, owned: true }],
          changes: [
            { type: 'asset_remove', assetId },
            {
              type: 'finance_set',
              value: {
                currency: 'USD',
                monthlyIncome: 2000,
                liquidFunds: 7000,
              },
            },
            {
              type: 'goal_progress_set',
              value: {
                goalId: input.goals[0]!.id,
                status: 'achieved',
                note: null,
              },
            },
          ],
        },
        {
          id: randomUUID(),
          label: 'Keep and expand',
          description: 'Keep the business and expand the available options.',
          preconditions: [{ type: 'asset_is_owned', assetId, owned: true }],
          changes: [
            {
              type: 'actor_add',
              value: {
                id: actorId,
                label: 'Private incoming colleague',
                relationship: 'colleague',
              },
            },
            {
              type: 'asset_add',
              value: {
                id: homeId,
                kind: 'home',
                label: 'Private home name',
                sharePercent: 100,
              },
            },
            {
              type: 'opportunity_set',
              value: {
                id: opportunityId,
                title: 'Private course name',
                status: 'open',
                expiresAt: '2027-12-05',
              },
            },
            { type: 'skill_add', value: 'Writing' },
          ],
        },
      ],
    };
  const publicDecision = {
    key: 'decision-3',
    prompt: 'Which direction would you take?',
    selectedOptionKey: null,
    options: [
      {
        key: 'option-5',
        label: 'Sell the business',
        description: 'Sell the business and take the financial buffer.',
      },
      {
        key: 'option-6',
        label: 'Keep and expand',
        description: 'Keep the business and expand the available options.',
      },
    ],
  };
  const source: ForkCheckpointSource = {
    input,
    state,
    decision,
    publicDecision,
    scope: {
      lifeId: input.lifeId,
      branchId: input.branchId,
      acceptedDecisionIds: [],
    },
  };
  const checkpoint: ForkCheckpoint = {
    schemaVersion: FORK_CHECKPOINT_VERSION,
    contentLocale: 'en',
    requiresFullReview: true,
    readyForPublicFork: false,
    identity: template.identity,
    environment: template.environment,
    goals: template.goals,
    startingState: {
      ...template.startingState,
      effectiveAt: state.effectiveAt,
      ownedAssets: [
        { ...template.startingState.ownedAssets[0]!, label: 'A business' },
      ],
      actors: [{ ...template.startingState.actors[0]!, label: 'A friend' }],
      opportunities: [
        {
          ...template.startingState.opportunities[0]!,
          title: 'An available course',
        },
      ],
    },
    referenceCatalog: {
      assetKeys: ['asset-1', 'asset-2'],
      actorKeys: ['actor-1', 'actor-2'],
      opportunityKeys: ['opportunity-1', 'opportunity-2'],
    },
    constraints: template.constraints.map((c, i) => ({
      ...c,
      description:
        i === 0 ? 'Keep ownership of the business initially.' : c.description,
      endsOnDecisionKey: i === 0 ? 'decision-3' : null,
    })),
    decision: {
      key: publicDecision.key,
      prompt: publicDecision.prompt,
      options: [
        {
          ...publicDecision.options[0]!,
          preconditions: [
            { type: 'asset_is_owned', assetKey: 'asset-1', owned: true },
          ],
          changes: [
            { type: 'asset_remove', assetKey: 'asset-1' },
            {
              type: 'finance_set',
              value: {
                currency: 'USD',
                monthlyIncome: 2000,
                liquidFunds: 7000,
              },
            },
            {
              type: 'goal_progress_set',
              value: { goalKey: 'goal-1', status: 'achieved', note: null },
            },
          ],
        },
        {
          ...publicDecision.options[1]!,
          preconditions: [
            { type: 'asset_is_owned', assetKey: 'asset-1', owned: true },
          ],
          changes: [
            {
              type: 'actor_add',
              value: {
                key: 'actor-2',
                label: 'A colleague',
                relationship: 'colleague',
              },
            },
            {
              type: 'asset_add',
              value: {
                key: 'asset-2',
                kind: 'home',
                label: 'A home',
                sharePercent: 100,
              },
            },
            {
              type: 'opportunity_set',
              value: {
                key: 'opportunity-2',
                title: 'A new course',
                status: 'open',
                expiresAt: '2027-12-05',
              },
            },
            { type: 'skill_add', value: 'Writing' },
          ],
        },
      ],
    },
  };
  return { source, checkpoint };
}
describe('separate sanitized executable decision checkpoints', () => {
  it('binds the whole checkpoint to source facts, ordered options and displayed copy', () => {
    const f = fixture(),
      sourceHash = hash(f.source);
    expect(prepareSanitizedForkCheckpoint(f.source, f.checkpoint)).toEqual(
      f.checkpoint,
    );
    expect(hash(f.source)).toBe(sourceHash);
    expect(f.checkpoint.readyForPublicFork).toBe(false);
    expect(f.checkpoint.requiresFullReview).toBe(true);
    const serialized = JSON.stringify(f.checkpoint);
    for (const value of [
      f.source.input.lifeId,
      f.source.input.branchId,
      f.source.decision.id,
      f.source.state.ownedAssets[0]!.id,
      f.source.input.goals[0]!.id,
    ])
      expect(serialized).not.toContain(value);
  });
  it('starts at the canonical decision date, applies only the chosen option and releases its ending constraint', () => {
    const f = fixture(),
      before = hash(f.checkpoint),
      result = instantiateForkCheckpoint(
        prepareSanitizedForkCheckpoint(f.source, f.checkpoint),
        'option-5',
      );
    expect(result.input.visibility).toBe('private');
    expect(result.input.identity.baseProfileVersionId).toBeNull();
    expect(result.input.locale).toBe('en');
    expect(result.input.initialState.effectiveAt).toBe('2026-12-05');
    expect(result.input.initialState.ownedAssets).toEqual([]);
    expect(result.input.initialState.finance.liquidFunds).toBe(7000);
    expect(result.input.initialState.goals[0]!.status).toBe('achieved');
    expect(result.input.initialState.actors).toHaveLength(1);
    expect(result.input.initialState.opportunities).toHaveLength(1);
    expect(result.input.constraints).toHaveLength(1);
    expect(result.input.constraints[0]!.strength).toBe('soft');
    expect(result.choice.decisionId).toBe(result.decision.id);
    expect(result.input.lifeId).not.toBe(f.source.input.lifeId);
    expect(hash(f.checkpoint)).toBe(before);
  });
  it('remaps new actors, assets and opportunities consistently with no inherited private IDs', () => {
    const f = fixture(),
      a = instantiateForkCheckpoint(f.checkpoint, 'option-6'),
      b = instantiateForkCheckpoint(f.checkpoint, 'option-6');
    const ids = (x: typeof a) => [
      x.input.lifeId,
      x.input.branchId,
      x.decision.id,
      ...x.decision.options.map((o) => o.id),
      ...x.input.initialState.ownedAssets.map((o) => o.id),
      ...x.input.initialState.actors.map((o) => o.id),
      ...x.input.initialState.opportunities.map((o) => o.id),
      ...x.input.goals.map((g) => g.id),
      ...x.input.constraints.map((c) => c.id),
    ];
    expect(ids(a).some((id) => ids(b).includes(id))).toBe(false);
    expect(ids(a).some((id) => JSON.stringify(f.source).includes(id))).toBe(
      false,
    );
    expect(a.input.initialState.actors).toHaveLength(2);
    expect(a.input.initialState.ownedAssets).toHaveLength(2);
    expect(a.input.initialState.opportunities).toHaveLength(2);
    expect(a.input.initialState.skills).toEqual(['Design', 'Writing']);
    expect(a.input.initialState.goals.map((g) => g.goalId)).toEqual(
      a.input.goals.map((g) => g.id),
    );
    const added = a.decision.options[1]!.changes.find(
      (c) => c.type === 'asset_add',
    )!;
    expect(
      added.type === 'asset_add' &&
        a.input.initialState.ownedAssets.some((x) => x.id === added.value.id),
    ).toBe(true);
  });
  it('rejects changed numerical outcomes, countries, skills or option predicates even when executable', () => {
    const f = fixture(),
      amount = structuredClone(f.checkpoint),
      country = structuredClone(f.checkpoint),
      skill = structuredClone(f.checkpoint),
      predicate = structuredClone(f.checkpoint);
    const finance = amount.decision.options[0]!.changes[1]!;
    if (finance.type === 'finance_set') finance.value.liquidFunds = 8000;
    country.startingState.location.country = 'US';
    skill.startingState.skills = ['Accounting'];
    predicate.decision.options[0]!.preconditions = [
      { type: 'country_is', value: 'GB' },
    ];
    for (const changed of [amount, country, skill, predicate])
      expect(() =>
        prepareSanitizedForkCheckpoint(f.source, changed),
      ).toThrowError(
        expect.objectContaining({ code: 'PUBLIC_FORK_SEMANTICS' }),
      );
  });
  it('rejects copy text that differs from the displayed decision and a reordered semantic option', () => {
    const f = fixture(),
      text = structuredClone(f.checkpoint);
    text.decision.options[0]!.description =
      'A different description not displayed in the copy.';
    expect(() => prepareSanitizedForkCheckpoint(f.source, text)).toThrowError(
      expect.objectContaining({ code: 'PUBLIC_FORK_SEMANTICS' }),
    );
    const swapped = structuredClone(f.checkpoint);
    swapped.decision.options.reverse();
    expect(() =>
      prepareSanitizedForkCheckpoint(f.source, swapped),
    ).toThrowError(expect.objectContaining({ code: 'PUBLIC_FORK_SEMANTICS' }));
  });
  it('rejects an impossible option, a missing reference or a duplicate key', () => {
    const impossible = fixture().checkpoint;
    impossible.decision.options[0]!.preconditions = [
      { type: 'country_is', value: 'US' },
    ];
    expect(() => validateForkCheckpoint(impossible)).toThrowError(
      expect.objectContaining({ code: 'LIFE_PRECONDITION' }),
    );
    const unknown = fixture().checkpoint;
    unknown.referenceCatalog.assetKeys = ['asset-2'];
    expect(() => validateForkCheckpoint(unknown)).toThrowError(
      expect.objectContaining({ code: 'PUBLIC_FORK_REFERENCE' }),
    );
    const duplicate = fixture().checkpoint;
    duplicate.referenceCatalog.assetKeys.push('asset-1');
    expect(() => validateForkCheckpoint(duplicate)).toThrowError(
      expect.objectContaining({ code: 'PUBLIC_FORK_REFERENCE' }),
    );
  });
  it('refuses source scope/history mismatches and unsupported future decision references', () => {
    const f = fixture();
    f.source.scope.acceptedDecisionIds.push(f.source.decision.id);
    expect(() =>
      prepareSanitizedForkCheckpoint(f.source, f.checkpoint),
    ).toThrowError(expect.objectContaining({ code: 'PUBLIC_FORK_SOURCE' }));
    const branch = fixture();
    branch.source.scope.branchId = randomUUID();
    expect(() =>
      prepareSanitizedForkCheckpoint(branch.source, branch.checkpoint),
    ).toThrowError(expect.objectContaining({ code: 'PUBLIC_FORK_SOURCE' }));
    const future = fixture();
    future.source.input.constraints[0]!.endsOnDecisionId = randomUUID();
    expect(() =>
      prepareSanitizedForkCheckpoint(future.source, future.checkpoint),
    ).toThrowError(expect.objectContaining({ code: 'PUBLIC_FORK_REFERENCE' }));
  });
  it('keeps already-ended constraints out of a new life without copying accepted history', () => {
    const f = fixture(),
      past = randomUUID();
    f.source.scope.acceptedDecisionIds = [past];
    f.source.input.constraints[1]!.endsOnDecisionId = past;
    f.checkpoint.constraints = f.checkpoint.constraints.slice(0, 1);
    const checked = prepareSanitizedForkCheckpoint(f.source, f.checkpoint),
      result = instantiateForkCheckpoint(checked, 'option-5');
    expect(result.input.constraints).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(past);
  });
  it('rejects original names, contacts and private IDs anywhere in the checkpoint', () => {
    const f = fixture(),
      name = structuredClone(f.checkpoint);
    name.startingState.actors[0]!.label = f.source.state.actors[0]!.label;
    expect(() => prepareSanitizedForkCheckpoint(f.source, name)).toThrowError(
      expect.objectContaining({ code: 'PUBLIC_FORK_PRIVACY' }),
    );
    for (const text of [
      'private@example.invalid',
      'https://example.invalid/private',
      randomUUID(),
    ]) {
      const c = structuredClone(f.checkpoint);
      c.goals[1]!.note = text;
      expect(() => validateForkCheckpoint(c)).toThrowError(
        expect.objectContaining({ code: 'PUBLIC_FORK_PRIVACY' }),
      );
    }
    expect(
      forkCheckpointSchema.safeParse({
        ...f.checkpoint,
        readyForPublicFork: true,
      }).success,
    ).toBe(false);
    expect(
      forkCheckpointSchema.safeParse({ ...f.checkpoint, privateMemory: {} })
        .success,
    ).toBe(false);
  });
  it('does not apply the selected mutation twice to an already created starting state', () => {
    const f = fixture(),
      result = instantiateForkCheckpoint(f.checkpoint, 'option-5'),
      option = result.decision.options[0]!;
    expect(() =>
      applyFactChangesV2(
        result.input.initialState,
        option.changes,
        result.input.initialState.effectiveAt,
        option.preconditions,
        result.input.constraints,
        {
          lifeId: result.input.lifeId,
          branchId: result.input.branchId,
          acceptedDecisionIds: [result.decision.id],
        },
      ),
    ).toThrow();
    expect(() =>
      instantiateForkCheckpoint(f.checkpoint, 'option-99'),
    ).toThrowError(expect.objectContaining({ code: 'PUBLIC_FORK_REFERENCE' }));
  });
});
