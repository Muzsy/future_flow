import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { errorMessage } from '@future-flow/contracts';
import {
  sendPasswordRecovery,
  signInWithPassword,
  signUpWithPassword,
} from '../apps/web/lib/auth-requests';
import { clientErrorMessage } from '../apps/web/lib/client';

const KEY = '1x00000000000000000000AA';
const done = { data: {}, error: null };
function fakeAuth() {
  return {
    signUp: vi.fn().mockResolvedValue(done),
    signInWithPassword: vi.fn().mockResolvedValue(done),
    resetPasswordForEmail: vi.fn().mockResolvedValue(done),
  };
}
type FakeAuth = ReturnType<typeof fakeAuth>;
const calls = [
  [
    'registration',
    (auth: FakeAuth, captcha: { siteKey: string | null; token: string }) =>
      signUpWithPassword(
        auth as never,
        {
          email: 'a@example.invalid',
          password: 'p'.repeat(10),
          emailRedirectTo: '/login',
        },
        captcha,
      ),
    (auth: FakeAuth) => auth.signUp,
  ],
  [
    'password sign-in',
    (auth: FakeAuth, captcha: { siteKey: string | null; token: string }) =>
      signInWithPassword(
        auth as never,
        { email: 'a@example.invalid', password: 'p'.repeat(10) },
        captcha,
      ),
    (auth: FakeAuth) => auth.signInWithPassword,
  ],
  [
    'password recovery',
    (auth: FakeAuth, captcha: { siteKey: string | null; token: string }) =>
      sendPasswordRecovery(
        auth as never,
        { email: 'a@example.invalid', redirectTo: '/account-access' },
        captcha,
      ),
    (auth: FakeAuth) => auth.resetPasswordForEmail,
  ],
] as const;

describe.each(calls)('%s and the Turnstile token', (_name, call, target) => {
  it('sends the token to Supabase Auth exactly once when a site key is set', async () => {
    const auth = fakeAuth();
    await call(auth, { siteKey: KEY, token: 'token-1' });
    const method = target(auth);
    expect(method).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(method.mock.calls[0])).toContain(
      '"captchaToken":"token-1"',
    );
  });

  it('does not reach Supabase without a token when a site key is set', () => {
    const auth = fakeAuth();
    expect(() => call(auth, { siteKey: KEY, token: '' })).toThrowError(
      expect.objectContaining({ code: 'CAPTCHA_REQUIRED' }),
    );
    expect(target(auth)).not.toHaveBeenCalled();
  });

  it('sends no token where no site key is configured', async () => {
    const auth = fakeAuth();
    await call(auth, { siteKey: null, token: 'stray' });
    expect(JSON.stringify(target(auth).mock.calls[0])).not.toContain(
      'captchaToken',
    );
  });
});

describe('registration options', () => {
  it('keeps the confirmation redirect next to the token', async () => {
    const auth = fakeAuth();
    await signUpWithPassword(
      auth as never,
      {
        email: 'a@example.invalid',
        password: 'p'.repeat(10),
        emailRedirectTo: '/login?returnTo=%2Flives',
      },
      { siteKey: KEY, token: 't' },
    );
    expect(auth.signUp.mock.calls[0]![0].options).toEqual({
      captchaToken: 't',
      emailRedirectTo: '/login?returnTo=%2Flives',
    });
  });
});

describe('the missing-token message', () => {
  it('is localized and shown for the client error', () => {
    expect(errorMessage('en', 'CAPTCHA_REQUIRED')).toMatch(/security check/i);
    expect(errorMessage('hu', 'CAPTCHA_REQUIRED')).toMatch(/biztonsági/i);
    try {
      signInWithPassword(
        fakeAuth() as never,
        { email: 'a@example.invalid', password: 'x' },
        { siteKey: KEY, token: '' },
      );
    } catch (error) {
      expect(clientErrorMessage(error)).not.toBe(
        errorMessage('en', 'REQUEST_FAILED'),
      );
    }
  });
});

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory())
      return entry.name === 'node_modules' || entry.name === '.next'
        ? []
        : sources(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('component wiring', () => {
  it('lets only lib/auth-requests.ts call the CAPTCHA-protected Auth methods', () => {
    const offenders = sources('apps/web')
      .filter((path) => relative('apps/web', path) !== 'lib/auth-requests.ts')
      .filter((path) =>
        /\.(signUp|signInWithPassword|resetPasswordForEmail|signInWithOtp|resend)\(/.test(
          readFileSync(path, 'utf8'),
        ),
      );
    expect(offenders).toEqual([]);
  });

  it('routes registration, sign-in and recovery through the helpers', () => {
    const experience = readFileSync(
      'apps/web/components/experience.tsx',
      'utf8',
    );
    const access = readFileSync(
      'apps/web/components/account-access.tsx',
      'utf8',
    );
    expect(experience).toMatch(/signUpWithPassword\(/);
    expect(experience).toMatch(/signInWithPassword\(/);
    expect(access).toMatch(/signInWithPassword\(/);
    expect(access).toMatch(/sendPasswordRecovery\(/);
    for (const text of [experience, access])
      expect(text).toMatch(/<TurnstileWidget/);
  });
});
