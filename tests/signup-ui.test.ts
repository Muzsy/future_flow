import { describe, expect, it } from 'vitest';
import { signupUiAllowed } from '../apps/web/lib/signup';

const gate = {
  CLOSED_SITE_ENABLED: 'true',
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'fixture.cloudflareaccess.com',
  CLOUDFLARE_ACCESS_AUD: 'a'.repeat(64),
  CLOSED_SITE_ALLOWED_EMAILS: 'legacy@example.invalid',
};

const key = { TURNSTILE_SITE_KEY: '1x00000000000000000000AA' };

describe('registration on the sign-in screen', () => {
  it('is offered when there is no closed-site gate at all', () => {
    expect(signupUiAllowed({})).toBe(true);
    expect(signupUiAllowed({ CLOSED_SITE_ENABLED: 'false' })).toBe(true);
  });

  it('stays hidden in the legacy closed beta (Access gate, no service profile)', () => {
    expect(signupUiAllowed(gate)).toBe(false);
    expect(
      signupUiAllowed({ ...gate, SERVICE_ACCESS_ENFORCEMENT: 'false' }),
    ).toBe(false);
  });

  it('is offered in the service profile, where the Access gate is always on', () => {
    expect(
      signupUiAllowed({ ...gate, ...key, SERVICE_ACCESS_ENFORCEMENT: 'true' }),
    ).toBe(true);
  });

  it('fails closed in the service profile without a valid Turnstile site key', () => {
    for (const bad of [undefined, '', 'not-a-key', '1x'])
      expect(
        signupUiAllowed({
          ...gate,
          SERVICE_ACCESS_ENFORCEMENT: 'true',
          TURNSTILE_SITE_KEY: bad,
        }),
      ).toBe(false);
  });

  it('never opens on an unreadable service flag', () => {
    for (const bad of ['', 'yes', 'TRUE', '1'])
      expect(
        signupUiAllowed({ ...gate, ...key, SERVICE_ACCESS_ENFORCEMENT: bad }),
      ).toBe(false);
  });
});
