const DEFAULT_SITE_ORIGIN = 'https://alterward.com';
const OFFICIAL_STORY_PATH = /^\/official-lives\/official-[a-f0-9]{32}$/;

/**
 * Whether public landing and official sample pages may be indexed by search engines.
 * Legacy closed-beta mode remains noindex; the live service profile allows indexing
 * on explicitly public routes while keeping private routes noindex.
 */
export function publicIndexingAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.CLOSED_SITE_ENABLED !== 'true') return true;
  return env.SERVICE_ACCESS_ENFORCEMENT === 'true';
}

/**
 * Canonical public origin for sitemap, robots, and landing metadata.
 */
export function publicSiteOrigin(env: NodeJS.ProcessEnv = process.env): string {
  try {
    const u = new URL(env.PUBLIC_SITE_URL ?? '');
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.origin;
  } catch {
    // Fall back to canonical production origin when PUBLIC_SITE_URL is unset.
  }
  return DEFAULT_SITE_ORIGIN;
}

/**
 * Paths explicitly intended for search engine indexing in service mode.
 */
export function isPublicIndexablePath(method: string, path: string): boolean {
  if (!['GET', 'HEAD'].includes(method)) return false;
  if (
    ['/', '/robots.txt', '/sitemap.xml', '/terms', '/privacy-notice'].includes(
      path,
    )
  ) {
    return true;
  }
  return OFFICIAL_STORY_PATH.test(path);
}
