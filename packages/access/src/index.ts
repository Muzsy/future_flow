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

export type VerifiedAccessIdentity = Readonly<{
  subject: string;
  email: string;
  expiresAt: number;
}>;

// Proves identity only. Admission must be checked separately against trusted
// application state; a valid Access token is not itself an invitation.
export function createAccessIdentityVerifier(
  config: Readonly<{ issuer: string; audience: string }>,
  transport?: typeof fetch,
): (assertion: string | undefined) => Promise<VerifiedAccessIdentity | null> {
  const { issuer, audience } = config;
  // Only server-owned, constrained configuration determines the key endpoint.
  // Never follow a URL supplied by the token, headers, or a caller's request.
  if (
    typeof issuer !== 'string' ||
    typeof audience !== 'string' ||
    issuer.trim() !== issuer ||
    audience.length !== 64 ||
    !/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(
      issuer,
    ) ||
    !/^[a-f0-9]{64}$/.test(audience)
  )
    throw Error('A pinned Cloudflare issuer and audience are required');
  const keys = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer), {
    timeoutDuration: 3000,
    cooldownDuration: 30000,
    cacheMaxAge: 300000,
    ...(transport ? { [customFetch]: transport } : {}),
  });
  return async (assertion) => {
    if (!assertion || assertion.length > 16384 || /[\s,]/.test(assertion))
      return null;
    try {
      const { payload } = await jwtVerify(assertion, keys, {
        algorithms: ['RS256'],
        issuer,
        audience,
        requiredClaims: ['exp', 'iat', 'sub', 'email', 'type'],
        clockTolerance: 0,
      });
      const valid =
        payload.type === 'app' &&
        typeof payload.email === 'string' &&
        payload.email.length > 0 &&
        payload.email.trim() === payload.email &&
        /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(payload.email) &&
        typeof payload.sub === 'string' &&
        payload.sub.length > 0 &&
        typeof payload.iat === 'number' &&
        payload.iat <= Math.floor(Date.now() / 1000);
      return valid && typeof payload.exp === 'number'
        ? Object.freeze({
            subject: payload.sub as string,
            email: (payload.email as string).toLowerCase(),
            expiresAt: payload.exp,
          })
        : null;
    } catch {
      // Do not log credentials, email, attacker-controlled errors or claims.
      return null;
    }
  };
}

// Legacy static admission remains unchanged until the durable registry and
// API/web callers are integrated in a separately reviewed activation.
export function createClosedSiteGate(
  env: NodeJS.ProcessEnv = process.env,
  transport?: typeof fetch,
): ClosedSiteGate {
  const config = closedSiteConfigFromEnv(env);
  if (!config.enabled) return { enabled: false, verify: async () => true };
  const allowedEmails = new Set(config.emails);
  const identity = createAccessIdentityVerifier(config, transport);
  return {
    enabled: true,
    async verify(assertion) {
      const verified = await identity(assertion);
      return verified !== null && allowedEmails.has(verified.email);
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
    (method === 'DELETE' && path === '/api/v1/me') ||
    // Stripe cannot present a Cloudflare Access token; the route is closed
    // unless billing is configured and authenticates by the Stripe signature.
    (method === 'POST' && path === '/api/v1/billing/webhook')
  );
}

export const closedSiteResponseHeaders = {
  'Cache-Control': 'private, no-store',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
} as const;

// In the service profile Access authenticates the pre-login shell. The API
// independently binds that identity to getUser() and the durable UUID registry.
export function createServiceSiteGate(
  env: NodeJS.ProcessEnv = process.env,
  transport?: typeof fetch,
): {
  enabled: boolean;
  identity: (
    assertion: string | undefined,
  ) => Promise<VerifiedAccessIdentity | null>;
} {
  const value = env.SERVICE_ACCESS_ENFORCEMENT ?? 'false';
  if (!['true', 'false'].includes(value))
    throw Error('SERVICE_ACCESS_ENFORCEMENT must be true or false');
  if (value === 'false') return { enabled: false, identity: async () => null };
  if (env.CLOSED_SITE_ENABLED !== 'true')
    throw Error('Service admission requires closed-site identity enforcement');
  const identity = createAccessIdentityVerifier(
    {
      issuer: `https://${env.CLOUDFLARE_ACCESS_TEAM_DOMAIN ?? ''}`,
      audience: env.CLOUDFLARE_ACCESS_AUD ?? '',
    },
    transport,
  );
  return { enabled: true, identity };
}

export function serviceAccountControlException(
  method: string,
  path: string,
): boolean {
  return (
    (['GET', 'HEAD'].includes(method) &&
      ['/api/v1/me/export', '/api/v1/billing/status'].includes(path)) ||
    (method === 'DELETE' && path === '/api/v1/me') ||
    (method === 'POST' && path === '/api/v1/billing/portal')
  );
}
