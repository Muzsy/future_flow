import type { SupabaseClient } from '@supabase/supabase-js';
import { ClientError } from './client';
import { captchaOptions, captchaSatisfied } from './turnstile';

// The only place in the web app that calls the Supabase Auth methods that are
// protected by the CAPTCHA setting (sign-up, password sign-in, password
// recovery). Every call goes through the same fail-closed token gate and passes
// the single-use Turnstile token to exactly one request. tests/auth-requests
// .test.ts also fails if any other web file calls these methods directly.
type Auth = Pick<
  SupabaseClient['auth'],
  'signUp' | 'signInWithPassword' | 'resetPasswordForEmail'
>;
export type Captcha = { siteKey: string | null; token: string };

function captchaFor({ siteKey, token }: Captcha) {
  if (!captchaSatisfied(siteKey, token))
    throw new ClientError('CAPTCHA_REQUIRED');
  return captchaOptions(siteKey, token);
}

export function signUpWithPassword(
  auth: Auth,
  input: { email: string; password: string; emailRedirectTo: string },
  captcha: Captcha,
) {
  const { email, password, emailRedirectTo } = input;
  return auth.signUp({
    email,
    password,
    options: { ...captchaFor(captcha), emailRedirectTo },
  });
}

export function signInWithPassword(
  auth: Auth,
  input: { email: string; password: string },
  captcha: Captcha,
) {
  return auth.signInWithPassword({
    email: input.email,
    password: input.password,
    options: captchaFor(captcha),
  });
}

export function sendPasswordRecovery(
  auth: Auth,
  input: { email: string; redirectTo: string },
  captcha: Captcha,
) {
  return auth.resetPasswordForEmail(input.email, {
    redirectTo: input.redirectTo,
    ...captchaFor(captcha),
  });
}
