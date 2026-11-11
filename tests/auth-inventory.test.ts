import { describe, expect, it } from 'vitest';
import { assertCompleteAuthInventory } from '../scripts/lib/auth-inventory';
describe('independent Auth inventory completeness', () => {
  it('accepts the same complete identity set in different order, including empty projects', () => {
    expect(() =>
      assertCompleteAuthInventory(new Set(['a', 'b']), ['b', 'a']),
    ).not.toThrow();
    expect(() => assertCompleteAuthInventory(new Set(), [])).not.toThrow();
  });
  it('refuses a prematurely short API page, changed equal-sized lists and duplicate DB identities', () => {
    for (const [apiIds, databaseIds] of [
      [['a'], ['a', 'b']],
      [
        ['a', 'c'],
        ['a', 'b'],
      ],
      [['a'], ['a', 'a']],
      [['a', 'b'], ['a']],
    ])
      expect(() =>
        assertCompleteAuthInventory(new Set(apiIds), databaseIds),
      ).toThrow('incomplete');
  });
});
