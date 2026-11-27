import type { MetadataRoute } from 'next';
import { publicIndexingAllowed, publicSiteOrigin } from '../lib/seo';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const origin = publicSiteOrigin();
  if (!publicIndexingAllowed()) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
    };
  }
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/official-lives/'],
        disallow: [
          '/account',
          '/account-access',
          '/billing',
          '/lives/',
          '/unlisted/',
          '/official-unlisted/',
          '/share-preview/',
          '/api/',
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
