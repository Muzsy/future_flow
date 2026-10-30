import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';

export type ClosedSiteConfig =
  | { enabled: false }
  | { enabled: true; issuer: string; audience: string; emails: string[] };

export function closedSiteConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ClosedSiteConfig {
  const enabled = env.CLOSED_SITE_ENABLED ?? 'false';
  if (!['true', 'false'].includes(enabled))
    throw Error('CLOSED_SITE_ENABLED must be true or false');
  if (enabled === 'false') return { enabled: false };
  const team = env.CLOUDFLARE_ACCESS_TEAM_DOMAIN ?? '',
    audience = env.CLOUDFLARE_ACCESS_AUD ?? '',
    emails = (env.CLOSED_SITE_ALLOWED_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase());
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(
      team,
    ) ||
    !/^[a-f0-9]{64}$/.test(audience) ||
    emails.length > 11 ||
    new Set(emails).size !== emails.length ||
    emails.some((email) => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email))
  )
    throw Error(
      'Closed site requires a Cloudflare team hostname, application AUD and one to eleven distinct allowed emails',
    );
  return { enabled: true, issuer: `https://${team}`, audience, emails };
}

export type ClosedSiteGate = {
  enabled: boolean;
  verify: (assertion: string | undefined) => Promise<boolean>;
};

// Only the server-owned configuration determines the key endpoint. The optional
// transport is for deterministic tests, never an environment/request override.
export function createClosedSiteGate(
  env: NodeJS.ProcessEnv = process.env,
  transport?: typeof fetch,
): ClosedSiteGate {
  const config = closedSiteConfigFromEnv(env);
  if (!config.enabled) return { enabled: false, verify: async () => true };
  const allowedEmails = new Set(config.emails);
  const keys = createRemoteJWKSet(
    new URL('/cdn-cgi/access/certs', config.issuer),
    {
      timeoutDuration: 3000,
      cooldownDuration: 30000,
      cacheMaxAge: 300000,
      ...(transport ? { [customFetch]: transport } : {}),
    },
  );
  return {
    enabled: true,
    async verify(assertion) {
      if (!assertion || assertion.length > 16384 || /[\s,]/.test(assertion))
        return false;
      try {
        const { payload } = await jwtVerify(assertion, keys, {
          algorithms: ['RS256'],
          issuer: config.issuer,
          audience: config.audience,
          requiredClaims: ['exp', 'iat', 'sub', 'email', 'type'],
          clockTolerance: 0,
        });
        return (
          payload.type === 'app' &&
          typeof payload.email === 'string' &&
          payload.email.length > 0 &&
          allowedEmails.has(payload.email.toLowerCase()) &&
          typeof payload.sub === 'string' &&
          payload.sub.length > 0 &&
          typeof payload.iat === 'number' &&
          payload.iat <= Math.floor(Date.now() / 1000)
        );
      } catch {
        // Do not log credentials, email, attacker-controlled errors or claims.
        return false;
      }
    },
  };
}

// Exceptions expose only rights UI, public disclosure and inert build assets.
// There is deliberately no /_next/image, /login, /settings, prefix API bypass,
// Host, localhost, forwarded email, RSC or SSR exception.
export function publicWebException(method: string, path: string) {
  if (!['GET', 'HEAD'].includes(method)) return false;
  if (
    [
      '/healthz',
      '/privacy-notice',
      '/terms',
      '/account-access',
      '/favicon.ico',
    ].includes(path)
  )
    return true;
  return path.startsWith('/_next/static/') && !/[\\%]/.test(path);
}

export function publicApiException(method: string, path: string) {
  return (
    (['GET', 'HEAD'].includes(method) &&
      ['/health', '/api/v1/me/export'].includes(path)) ||
    (method === 'DELETE' && path === '/api/v1/me')
  );
}

export const closedSiteResponseHeaders = {
  'Cache-Control': 'private, no-store',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
} as const;
