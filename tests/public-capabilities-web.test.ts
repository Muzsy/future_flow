import { describe, expect, it } from 'vitest';
import {
  NO_PUBLIC_CAPABILITIES,
  publicCapabilitiesFrom,
} from '../apps/web/lib/public-capabilities';

describe('signed-in navigation capabilities', () => {
  it('shows an area only when the API says it is on', () => {
    expect(
      publicCapabilitiesFrom({
        discover: true,
        scenarios: false,
        saved: true,
        publications: false,
      }),
    ).toEqual({
      discover: true,
      scenarios: false,
      saved: true,
      publications: false,
    });
  });
  it('fails closed on anything it cannot read', () => {
    for (const body of [null, undefined, 'yes', 1, [], {}])
      expect(publicCapabilitiesFrom(body)).toEqual(NO_PUBLIC_CAPABILITIES);
    expect(
      publicCapabilitiesFrom({
        discover: 'true',
        scenarios: 1,
        saved: null,
        publications: {},
      }),
    ).toEqual(NO_PUBLIC_CAPABILITIES);
  });
});
