// Cloudflare Turnstile for registration and sign-in. The site key is public by
// design; it is read from the web runtime environment (never a secret, never a
// build argument). The secret key lives only in the Supabase Auth CAPTCHA
// setting, which verifies each token server-side; this app never sees it.
export const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
// Turnstile tokens are at most 2048 characters.
export const TURNSTILE_TOKEN_MAX_LENGTH = 2048;
const SITE_KEY = /^[0-3]x[A-Za-z0-9_-]{15,64}$/;

export function turnstileSiteKey(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const value = env.TURNSTILE_SITE_KEY?.trim();
  return value && SITE_KEY.test(value) ? value : null;
}

// With a site key configured an action may only run with a fresh token; without
// one there is no challenge (the legacy and local setups).
export function captchaSatisfied(siteKey: string | null, token: string) {
  return (
    siteKey === null ||
    (token.length > 0 && token.length <= TURNSTILE_TOKEN_MAX_LENGTH)
  );
}

// Supabase Auth `options` fragment. A token is single-use, so callers pass it to
// exactly one request and then reset the widget.
export function captchaOptions(
  siteKey: string | null,
  token: string,
): { captchaToken?: string } {
  return siteKey !== null && captchaSatisfied(siteKey, token)
    ? { captchaToken: token }
    : {};
}
