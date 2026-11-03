import { closedSiteConfigFromEnv } from '@future-flow/access';

// Whether the sign-in screen offers "create account". Server-side only.
// The legacy closed beta (an Access gate, no durable service profile) keeps it
// hidden: there accounts exist only by invitation and Supabase signup is off.
// In the service profile (SERVICE_ACCESS_ENFORCEMENT=true) the closed-site gate
// is always on, because the Access identity is mandatory; the screen offers
// registration there, and the API alone decides who is admitted (open wave,
// capacity, confirmed email, 18+/terms acceptance). The screen never grants
// anything; Supabase signup and the Access policy remain separate switches.
export function signupUiAllowed(env: NodeJS.ProcessEnv = process.env) {
  return (
    !closedSiteConfigFromEnv(env).enabled ||
    env.SERVICE_ACCESS_ENFORCEMENT === 'true'
  );
}
