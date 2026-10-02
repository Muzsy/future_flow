import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  LIFE_CONTRACT_VERSION,
  lifeInputV2Schema,
  type ConstraintV2,
  type FactChangeV2,
  type LifeInputV2,
  type LifeStateV2,
  type PeriodCandidateV2,
} from '@future-flow/contracts';
import {
  applyFactChangesV2,
  checkConstraintsV2,
  hash,
  simulatePeriodV2,
  validateLifeInputV2,
  validateLifeStateV2,
} from '@future-flow/core';

const lifeId = randomUUID(),
  branchId = randomUUID(),
  goalId = randomUUID(),
  assetId = randomUUID(),
  decisionId = randomUUID();
const scope = {
  lifeId,
  branchId,
  revision: 3,
  acceptedDecisionIds: [] as string[],
};
function state(): LifeStateV2 {
  return {
    schemaVersion: LIFE_CONTRACT_VERSION,
    effectiveAt: '2026-10-03',
    employment: {
      status: 'employed',
      employerLabel: 'Korábbi munkahely',
      workDomain: 'design',
    },
    location: { country: 'HU', region: null, housing: null },
    finance: { currency: 'HUF', monthlyIncome: null, liquidFunds: null },
    ownedAssets: [
      {
        id: assetId,
        kind: 'business',
        label: 'Saját műhely',
        sharePercent: 100,
      },
    ],
    actors: [],
    skills: [],
    goals: [{ goalId, status: 'active', note: null }],
    opportunities: [],
    resources: { energy: null, availableHoursPerWeek: null },
  };
}
function input(): LifeInputV2 {
  return {
    schemaVersion: LIFE_CONTRACT_VERSION,
    lifeId,
    branchId,
    identity: {
      mode: 'alternate',
      label: null,
      ageBand: '35_44',
      baseProfileVersionId: null,
    },
    environment: {
      version: 'hu-neutral-v2',
      description: 'Semleges, mai magyar szcenárió.',
    },
    goals: [
      {
        id: goalId,
        category: 'career',
        description: 'Önálló alkotói munka',
        priority: 'primary',
        horizonMonths: 24,
        motivation: null,
        acceptableTradeoffs: [],
        unacceptableTradeoffs: [],
      },
    ],
    initialState: state(),
    constraints: [],
    visibility: 'private',
  };
}
function constraint(): ConstraintV2 {
  return {
    id: randomUUID(),
    description: 'Egyelőre ne költözzön külföldre.',
    strength: 'hard',
    lifeId,
    branchId,
    validFrom: '2026-10-03',
    validUntil: null,
    endsOnDecisionId: null,
    predicate: { type: 'country_is', value: 'HU' },
  };
}
function period(): PeriodCandidateV2 {
  return {
    schemaVersion: LIFE_CONTRACT_VERSION,
    periodId: randomUUID(),
    branchId,
    baseRevision: 3,
    startDate: '2026-10-03',
    endDate: '2027-04-03',
    durationMonths: 6,
    title: 'Első lépések',
    events: [
      {
        id: randomUUID(),
        title: 'Műhely eladása',
        summary: 'Eladod a korábban birtokolt műhelyedet.',
        effectiveAt: '2027-01-03',
        actorIds: [],
        preconditions: [{ type: 'asset_is_owned', assetId, owned: true }],
        changes: [{ type: 'asset_remove', assetId }],
        decision: null,
      },
      {
        id: randomUUID(),
        title: 'Új munka lehetősége',
        summary: 'Új munkalehetőség érkezik, de még nem választottál.',
        effectiveAt: '2027-04-03',
        actorIds: [],
        preconditions: [],
        changes: [],
        decision: {
          id: decisionId,
          prompt: 'Elfogadod az új állást?',
          options: [
            {
              id: randomUUID(),
              label: 'Elfogadom',
              description: 'Állást váltok az új ajánlatra.',
              preconditions: [],
              changes: [
                {
                  type: 'employment_set',
                  value: {
                    status: 'employed',
                    employerLabel: 'Új munkahely',
                    workDomain: 'design',
                  },
                },
              ],
            },
            {
              id: randomUUID(),
              label: 'Maradok',
              description: 'Folytatom a jelenlegi munkámat.',
              preconditions: [],
              changes: [],
            },
          ],
        },
      },
    ],
  };
}

describe('v2 period and persistent facts', () => {
  it('allows a private alternate identity with no relationships and unknown optional facts', () => {
    expect(
      validateLifeInputV2(input()).initialState.resources.energy,
    ).toBeNull();
    expect(validateLifeInputV2(input()).initialState.actors).toEqual([]);
    expect(
      lifeInputV2Schema.safeParse({ ...input(), visibility: 'public' }).success,
    ).toBe(false);
  });
  it('rejects goal state not tied to its goal definition', () => {
    const value = input();
    value.initialState.goals[0]!.goalId = randomUUID();
    expect(() => validateLifeInputV2(value)).toThrow('célállapot');
  });
  it('changes employment facts and removes sold assets without changing the source', () => {
    const before = state(),
      beforeHash = hash(before);
    const changes: FactChangeV2[] = [
      {
        type: 'employment_set',
        value: {
          status: 'seeking_work',
          employerLabel: null,
          workDomain: null,
        },
      },
      { type: 'asset_remove', assetId },
    ];
    const next = applyFactChangesV2(
      before,
      changes,
      '2026-11-03',
      [],
      [],
      scope,
    ).state;
    expect(next.employment).toEqual({
      status: 'seeking_work',
      employerLabel: null,
      workDomain: null,
    });
    expect(next.ownedAssets).toEqual([]);
    expect(hash(before)).toBe(beforeHash);
    const later = applyFactChangesV2(
      next,
      [],
      '2027-01-03',
      [],
      [],
      scope,
    ).state;
    expect(later.employment.status).toBe('seeking_work');
    expect(later.ownedAssets).toEqual([]);
  });
  it('does not apply a pending choice or write past it', () => {
    const before = state(),
      result = simulatePeriodV2(period(), before, [], scope);
    expect(result.endState.employment.employerLabel).toBe('Korábbi munkahely');
    expect(result.endState.ownedAssets).toEqual([]);
    expect(result.events[1]!.stateBefore.ownedAssets).toEqual([]);
    expect(before.ownedAssets).toHaveLength(1);
    expect(result.endState.effectiveAt).toBe('2027-04-03');
  });
  it('rejects events after a decision, so an unchosen future never becomes canon', () => {
    const value = period();
    value.events.reverse();
    expect(() => simulatePeriodV2(value, state(), [], scope)).toThrow(
      'lezáratlan döntés',
    );
  });
  it('rejects an out-of-period event', () => {
    const value = period();
    value.events[0]!.effectiveAt = '2027-05-03';
    expect(() => simulatePeriodV2(value, state(), [], scope)).toThrow(
      'időrend',
    );
  });
  it('reports stale state revisions as a conflict', () => {
    const value = period();
    value.baseRevision = 2;
    expect(() => simulatePeriodV2(value, state(), [], scope)).toThrow(
      expect.objectContaining({ code: 'LIFE_REVISION_CONFLICT', status: 409 }),
    );
  });
  it('rejects cross-branch periods and incompatible period dates', () => {
    expect(() =>
      simulatePeriodV2(
        { ...period(), branchId: randomUUID() },
        state(),
        [],
        scope,
      ),
    ).toThrow('Másik ág');
    expect(() =>
      simulatePeriodV2(
        { ...period(), endDate: '2027-04-04' },
        state(),
        [],
        scope,
      ),
    ).toThrow('időszak');
  });
  it('rejects invented actors and duplicate option identifiers', () => {
    const value = period();
    value.events[0]!.actorIds = [randomUUID()];
    expect(() => simulatePeriodV2(value, state(), [], scope)).toThrow(
      'szereplő',
    );
    const duplicate = period(),
      options = duplicate.events[1]!.decision!.options;
    options[1]!.id = options[0]!.id;
    expect(() => simulatePeriodV2(duplicate, state(), [], scope)).toThrow(
      'ismétlődő',
    );
  });
  it('rejects a second sale and impossible preconditions', () => {
    const afterSale = { ...state(), ownedAssets: [] };
    expect(() =>
      applyFactChangesV2(
        afterSale,
        [{ type: 'asset_remove', assetId }],
        '2026-11-03',
        [],
        [],
        scope,
      ),
    ).toThrow('nem birtokolt');
    expect(() =>
      applyFactChangesV2(
        afterSale,
        [],
        '2026-11-03',
        [{ type: 'asset_is_owned', assetId, owned: true }],
        [],
        scope,
      ),
    ).toThrow('előfeltétele');
  });
  it('rejects duplicate mutations, duplicate actors and backdating', () => {
    expect(() =>
      applyFactChangesV2(
        state(),
        [
          { type: 'asset_remove', assetId },
          { type: 'asset_remove', assetId },
        ],
        '2026-11-03',
        [],
        [],
        scope,
      ),
    ).toThrow('többször');
    const actor = {
      id: randomUUID(),
      label: 'Egy barát',
      relationship: 'friend' as const,
    };
    expect(() =>
      validateLifeStateV2({ ...state(), actors: [actor, actor] }),
    ).toThrow('ismétlődő');
    expect(() =>
      applyFactChangesV2(state(), [], '2026-10-02', [], [], scope),
    ).toThrow('múlt');
  });
  it('blocks an active hard constraint and returns a soft preference warning', () => {
    const abroad = {
      ...state(),
      location: { country: 'DE', region: null, housing: null },
    };
    const rule = constraint();
    expect(() => checkConstraintsV2(abroad, [rule], scope)).toThrow(
      'kemény korlát',
    );
    expect(
      checkConstraintsV2(abroad, [{ ...rule, strength: 'soft' }], scope),
    ).toEqual([rule.id]);
  });
  it.each([
    'expired',
    'future',
    'other_branch',
    'other_life',
    'resolved',
  ] as const)('does not turn a %s constraint into a permanent ban', (kind) => {
    const rule = constraint();
    const current = {
      ...state(),
      location: { country: 'DE', region: null, housing: null },
      effectiveAt: '2027-04-03',
    };
    const context = { ...scope };
    if (kind === 'expired') rule.validUntil = '2027-04-03';
    if (kind === 'future') rule.validFrom = '2027-05-03';
    if (kind === 'other_branch') rule.branchId = randomUUID();
    if (kind === 'other_life') rule.lifeId = randomUUID();
    if (kind === 'resolved') {
      rule.endsOnDecisionId = decisionId;
      context.acceptedDecisionIds = [decisionId];
    }
    expect(checkConstraintsV2(current, [rule], context)).toEqual([]);
  });
  it('does not infer funds from unknown values or mix currencies', () => {
    const rule = {
      ...constraint(),
      predicate: {
        type: 'liquid_funds_at_least' as const,
        currency: 'HUF' as const,
        amount: 100,
      },
    };
    expect(() => checkConstraintsV2(state(), [rule], scope)).toThrow(
      'kemény korlát',
    );
    expect(() =>
      checkConstraintsV2(
        {
          ...state(),
          finance: { currency: 'EUR', monthlyIncome: null, liquidFunds: 200 },
        },
        [rule],
        scope,
      ),
    ).toThrow('kemény korlát');
  });
  it('checks a restriction that starts and expires between two events', () => {
    const before = {
      ...state(),
      location: { country: 'DE', region: null, housing: null },
    };
    const rule = {
      ...constraint(),
      validFrom: '2026-11-03',
      validUntil: '2026-12-03',
    };
    expect(() =>
      applyFactChangesV2(
        before,
        [
          {
            type: 'location_set',
            value: { country: 'HU', region: null, housing: null },
          },
        ],
        '2027-01-03',
        [],
        [rule],
        scope,
      ),
    ).toThrow('kemény korlát');
  });
  it('rejects malformed restriction intervals', () => {
    expect(() =>
      checkConstraintsV2(
        state(),
        [{ ...constraint(), validUntil: '2026-10-02' }],
        scope,
      ),
    ).toThrow('érvényességi');
  });
});
