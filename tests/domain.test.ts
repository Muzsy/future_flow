import { describe, it, expect } from 'vitest';
import { profileSchema } from '@future-flow/contracts';
import {
  addMonths,
  applyEffects,
  buildProfile,
  hash,
  initialState,
  validateSimulation,
  validateChapters,
} from '@future-flow/core';
import { answers, profile, simulation, chapters, canon } from './fixtures';

describe('canonical domain', () => {
  it('builds a minimum profile and keeps zero/false answers', () => {
    const p = buildProfile({ ...answers, children: 0, riskTolerance: 0 }, []);
    expect(p.facts.children).toBe(0);
    expect(p.traits.riskTolerance).toBe(0);
  });
  it('rejects missing trait answers', () => {
    const input: Record<string, unknown> = { ...answers };
    delete input.riskTolerance;
    expect(() => buildProfile(input, [])).toThrow('Hiányzó');
  });
  it('rejects unknown questionnaire fields', () =>
    expect(() =>
      buildProfile({ ...answers, hiddenField: 'secret' }, []),
    ).toThrow('Ismeretlen'));
  it('requires either two relationships or an explicit absence', () =>
    expect(() =>
      buildProfile({ ...answers, noCloseRelationships: false }, []),
    ).toThrow());
  it('rejects duplicate values', () =>
    expect(() =>
      profileSchema.parse({
        ...profile(),
        values: ['family', 'family', 'security'],
      }),
    ).toThrow());
  it('hashes objects independent of property order', () =>
    expect(hash({ b: 2, a: 1 })).toBe(hash({ a: 1, b: 2 })));
  it('clamps scores and never mutates the source state', () => {
    const before = initialState(profile(), '2026-10-02');
    const next = applyEffects(
      before,
      [{ path: 'career.satisfaction', delta: -25 }],
      '2027-01-01',
    );
    expect(next.career.satisfaction).toBe(13);
    expect(before.career.satisfaction).toBe(38);
  });
  it('rejects duplicate effects', () =>
    expect(() =>
      applyEffects(
        initialState(profile(), '2026-10-02'),
        [
          { path: 'finance.stress', delta: 3 },
          { path: 'finance.stress', delta: 3 },
        ],
        '2027-01-01',
      ),
    ).toThrow('többször'));
  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2026-12-31', 2, '2027-02-28'],
  ])('adds calendar months without overflow', (start, count, result) =>
    expect(addMonths(String(start), Number(count))).toBe(result),
  );
  it('rejects invented actors', () => {
    const output = simulation();
    output.events[0]!.actorIds = ['invented'];
    expect(() => validateSimulation(output, profile(), 120)).toThrow(
      'szereplő',
    );
  });
  it('rejects reversed dates', () => {
    const output = simulation();
    output.events[1]!.offsetMonths = 1;
    expect(() => validateSimulation(output, profile(), 120)).toThrow('időrend');
  });
  it('rejects out-of-horizon events', () =>
    expect(() => validateSimulation(simulation(), profile(), 24)).toThrow(
      'időrend',
    ));
  it('requires a decision point', () => {
    const output = simulation();
    output.events.forEach((event) => {
      event.decision = null;
    });
    expect(() => validateSimulation(output, profile(), 120)).toThrow('döntési');
  });
  it('rejects prose referencing noncanonical events', () => {
    const output = chapters();
    output.chapters[0]!.eventKeys = ['invented'];
    expect(() => validateChapters(output, canon())).toThrow('ismeretlen');
  });
  it('requires the story to include the decision', () => {
    const output = chapters();
    output.chapters[0]!.decisionEventKey = null;
    expect(() => validateChapters(output, canon())).toThrow('döntési');
  });
});
