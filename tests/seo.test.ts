import { describe, expect, it } from 'vitest';
import {
  isPublicIndexablePath,
  publicIndexingAllowed,
  publicSiteOrigin,
} from '../apps/web/lib/seo';

describe('public SEO indexing helpers', () => {
  it('blocks indexing in legacy closed-beta mode and allows it in service mode', () => {
    expect(publicIndexingAllowed({ CLOSED_SITE_ENABLED: 'true' })).toBe(false);
    expect(
      publicIndexingAllowed({
        CLOSED_SITE_ENABLED: 'true',
        SERVICE_ACCESS_ENFORCEMENT: 'false',
      }),
    ).toBe(false);
    expect(
      publicIndexingAllowed({
        CLOSED_SITE_ENABLED: 'true',
        SERVICE_ACCESS_ENFORCEMENT: 'true',
      }),
    ).toBe(true);
    expect(publicIndexingAllowed({ CLOSED_SITE_ENABLED: 'false' })).toBe(true);
  });

  it('allows indexing only on explicit public GET/HEAD routes', () => {
    expect(isPublicIndexablePath('GET', '/')).toBe(true);
    expect(isPublicIndexablePath('HEAD', '/sitemap.xml')).toBe(true);
    expect(isPublicIndexablePath('GET', '/robots.txt')).toBe(true);
    expect(
      isPublicIndexablePath(
        'GET',
        '/official-lives/official-e8acd32f71ecfb23ace2c4151c53daa1',
      ),
    ).toBe(true);

    expect(isPublicIndexablePath('POST', '/')).toBe(false);
    expect(isPublicIndexablePath('GET', '/account')).toBe(false);
    expect(isPublicIndexablePath('GET', '/billing')).toBe(false);
    expect(isPublicIndexablePath('GET', '/lives/abc')).toBe(false);
    expect(isPublicIndexablePath('GET', '/unlisted/abc')).toBe(false);
    expect(isPublicIndexablePath('GET', '/share-preview/slug')).toBe(false);
    expect(isPublicIndexablePath('GET', '/official-lives/not-hex')).toBe(false);
  });

  it('uses PUBLIC_SITE_URL origin when valid and falls back to alterward.com', () => {
    expect(
      publicSiteOrigin({ PUBLIC_SITE_URL: 'https://alterward.com/path' }),
    ).toBe('https://alterward.com');
    expect(publicSiteOrigin({})).toBe('https://alterward.com');
  });
});
