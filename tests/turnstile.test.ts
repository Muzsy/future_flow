import { describe, expect, it } from 'vitest';
import { errorMessage } from '@future-flow/contracts';
import {
  TURNSTILE_SCRIPT_URL,
  TURNSTILE_TOKEN_MAX_LENGTH,
  captchaOptions,
  captchaSatisfied,
  turnstileSiteKey,
} from '../apps/web/lib/turnstile';
import { en, hu } from '../apps/web/lib/i18n/messages';

const KEY = '1x00000000000000000000AA';

describe('turnstile site key', () => {
  it('reads a well-formed public site key from the runtime environment', () => {
    expect(turnstileSiteKey({ TURNSTILE_SITE_KEY: KEY })).toBe(KEY);
    expect(turnstileSiteKey({ TURNSTILE_SITE_KEY: ` ${KEY}\n` })).toBe(KEY);
    expect(
      turnstileSiteKey({ TURNSTILE_SITE_KEY: '0x4AAAAAAAexample_key-123456' }),
    ).toBe('0x4AAAAAAAexample_key-123456');
  });

  it('treats absent or malformed values as not configured', () => {
    for (const bad of [
      undefined,
      '',
      '   ',
      'short',
      '1x',
      `4x${'A'.repeat(20)}`,
      `${KEY} extra`,
      `${KEY}"><script>`,
      `0x${'A'.repeat(65)}`,
    ])
      expect(turnstileSiteKey({ TURNSTILE_SITE_KEY: bad })).toBeNull();
    expect(turnstileSiteKey({})).toBeNull();
  });

  it('does not read the secret-looking or build-time variants', () => {
    expect(turnstileSiteKey({ TURNSTILE_SECRET_KEY: KEY })).toBeNull();
    expect(
      turnstileSiteKey({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: KEY }),
    ).toBeNull();
  });

  it('loads the challenge script only from Cloudflare, in explicit mode', () => {
    const url = new URL(TURNSTILE_SCRIPT_URL);
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('challenges.cloudflare.com');
    expect(url.searchParams.get('render')).toBe('explicit');
  });
});

describe('captcha token gate', () => {
  it('needs no token when no site key is configured', () => {
    expect(captchaSatisfied(null, '')).toBe(true);
    expect(captchaOptions(null, '')).toEqual({});
    expect(captchaOptions(null, 'stray-token')).toEqual({});
  });

  it('fails closed without a usable token when a site key is configured', () => {
    expect(captchaSatisfied(KEY, '')).toBe(false);
    expect(
      captchaSatisfied(KEY, 'x'.repeat(TURNSTILE_TOKEN_MAX_LENGTH + 1)),
    ).toBe(false);
    expect(captchaOptions(KEY, '')).toEqual({});
  });

  it('passes a fresh token to Supabase Auth as captchaToken', () => {
    expect(captchaSatisfied(KEY, 'token-1')).toBe(true);
    expect(captchaOptions(KEY, 'token-1')).toEqual({ captchaToken: 'token-1' });
  });
});

describe('captcha wording', () => {
  it('has a failure message for the Supabase captcha_failed code in both locales', () => {
    expect(errorMessage('en', 'captcha_failed')).toMatch(/security check/i);
    expect(errorMessage('hu', 'captcha_failed')).toMatch(/biztonsági/i);
  });

  it('has the same user-facing keys in both locales without banned wording', () => {
    for (const key of [
      'auth.captchaFailed',
      'auth.captchaRequired',
      'auth.captchaNote',
      'privacy.processor3',
      'privacy.collect6',
    ] as const) {
      expect(en[key]).toBeTruthy();
      expect(hu[key]).toBeTruthy();
      for (const text of [en[key], hu[key]])
        expect(text).not.toMatch(/tesztfázis|ízelítő|test phase/i);
    }
  });

  it('names Turnstile in the processor list of the privacy notice', () => {
    expect(en['privacy.processor3']).toContain('Turnstile');
    expect(hu['privacy.processor3']).toContain('Turnstile');
  });
});
