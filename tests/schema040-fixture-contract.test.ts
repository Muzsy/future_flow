import { it, expect } from 'vitest';
import { schema040FixtureNetworkNames } from '../scripts/lib/schema040-fixture-contract.mjs';
it('keeps the exact two-network compose fixture separate from the single-network standalone fixture', () => {
  expect(schema040FixtureNetworkNames('ci', 'alterward-ci-123-proxy')).toEqual([
    'alterward-ci-123-proxy',
    'alterward-ci-123_worker',
  ]);
  expect(
    schema040FixtureNetworkNames(
      'image-rehearsal',
      'alterward-image-rehearsal-' + 'a'.repeat(24),
    ),
  ).toEqual(['alterward-image-rehearsal-' + 'a'.repeat(24)]);
  for (const [scope, name] of [
    ['ci', 'alterward-ci-123-worker'],
    ['ci', 'alterward-image-rehearsal-' + 'a'.repeat(24)],
    ['image-rehearsal', 'alterward-ci-123-proxy'],
    ['ci', 'foreign-proxy'],
    ['unknown', 'alterward-ci-123-proxy'],
  ])
    expect(() => schema040FixtureNetworkNames(scope, name)).toThrow(
      'Exact owned',
    );
});
