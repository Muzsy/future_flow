import { describe, expect, it } from 'vitest';
import {
  FICTION_MECHANICS_FIGURES_BYTES,
  FICTION_MECHANICS_FIGURES_MAX,
  fictionMechanicsFigures,
  fictionMechanicsRecount,
} from '@future-flow/core';
import { fictionFixture } from './fiction-fixtures';

const base = () => structuredClone(fictionFixture().input.state);

describe('mechanics figures: the numbers the prose must not recount', () => {
  it('reads the exact numbers of the structured state, in a fixed order, and nothing else', () => {
    const state = base();
    state.resources = { energy: 55, availableHoursPerWeek: 6 };
    state.finance = { currency: 'EUR', monthlyIncome: 3200, liquidFunds: -150 };
    state.ownedAssets = [
      {
        id: crypto.randomUUID(),
        kind: 'business',
        label: 'A shop',
        sharePercent: 40,
      },
    ];
    expect(fictionMechanicsFigures(state)).toEqual([
      { path: 'resources.availableHoursPerWeek', value: 6 },
      { path: 'resources.energy', value: 55 },
      { path: 'finance.monthlyIncome', value: 3200 },
      { path: 'finance.liquidFunds', value: -150 },
      { path: 'ownedAssets.0.sharePercent', value: 40 },
    ]);
    // Deterministic, and it carries no text of the life (no label, no currency).
    expect(fictionMechanicsFigures(state)).toEqual(
      fictionMechanicsFigures(state),
    );
    expect(JSON.stringify(fictionMechanicsFigures(state))).not.toContain(
      'shop',
    );
  });

  it("skips unset figures and adds this draft's typed changes, once per distinct value", () => {
    const state = base();
    state.resources = { energy: null, availableHoursPerWeek: 4 };
    state.finance = { currency: null, monthlyIncome: null, liquidFunds: null };
    state.ownedAssets = [];
    const events = [
      {
        changes: [
          {
            type: 'resources_set',
            value: { energy: null, availableHoursPerWeek: 4 },
          },
          {
            type: 'resources_set',
            value: { energy: 70, availableHoursPerWeek: 2 },
          },
          {
            type: 'finance_set',
            value: { currency: 'EUR', monthlyIncome: 900, liquidFunds: null },
          },
          { type: 'skill_add', value: 'welding' },
        ],
      },
      { changes: 'not an array' },
    ];
    expect(fictionMechanicsFigures(state, events as never)).toEqual([
      { path: 'resources.availableHoursPerWeek', value: 4 },
      { path: 'resources.availableHoursPerWeek', value: 2 },
      { path: 'resources.energy', value: 70 },
      { path: 'finance.monthlyIncome', value: 900 },
    ]);
    expect(
      fictionMechanicsFigures({
        ...state,
        resources: { energy: null, availableHoursPerWeek: null },
      }),
    ).toEqual([]);
  });

  it('is bounded by count and by bytes', () => {
    const state = base();
    state.resources = { energy: null, availableHoursPerWeek: null };
    state.finance = { currency: null, monthlyIncome: null, liquidFunds: null };
    state.ownedAssets = Array.from({ length: 20 }, (_, i) => ({
      id: crypto.randomUUID(),
      kind: 'other' as const,
      label: `Asset ${i}`,
      sharePercent: i + 1,
    }));
    const figures = fictionMechanicsFigures(state);
    expect(figures.length).toBeLessThanOrEqual(FICTION_MECHANICS_FIGURES_MAX);
    expect(Buffer.byteLength(JSON.stringify(figures))).toBeLessThanOrEqual(
      FICTION_MECHANICS_FIGURES_BYTES,
    );
    expect(figures.length).toBeGreaterThan(5);
    // The shortest prefix is kept: the state's own figures come first.
    expect(figures[0]).toEqual({
      path: 'ownedAssets.0.sharePercent',
      value: 1,
    });
  });

  it('flags a numeral or a spelled-out figure in the prose, and ignores the same digits inside a longer number', () => {
    const figures = [
      { path: 'resources.availableHoursPerWeek', value: 4 },
      { path: 'finance.monthlyIncome', value: 900 },
      { path: 'resources.energy', value: 1 },
    ];
    const hit = (body: string, locale?: 'en' | 'hu') =>
      fictionMechanicsRecount(body, figures, locale).map((f) => f.value);
    expect(hit('You keep 4 hours a week for it.')).toEqual([4]);
    expect(hit('Four hours a week is all you have.')).toEqual([4]);
    expect(hit('Heti négy órád maradt.', 'hu')).toEqual([4]);
    expect(hit('You earn 900 now.')).toEqual([900]);
    // 2024, 4.5, a year, a word that merely contains the letters: no flag.
    expect(
      hit('In 2024 it cost 14 euros, then 4.5 more; fourteen came later.'),
    ).toEqual([]);
    // "one" is an article more often than a figure, so a figure of 1 is never read from words.
    expect(hit('One of them waved.')).toEqual([]);
    expect(hit('You feel it a little.')).toEqual([]);
  });
});
