import type { Metadata } from 'next';
import {
  publicExposureSlugSchema,
  publicExposureSchema,
  publicExposureSitemapSchema,
  type PublicExposure,
} from '@future-flow/contracts';

// Configuration is server-owned. Request Host, cookies, queries and fragment credentials are never used.
export function externalWebConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.PUBLIC_EXTERNAL_EXPOSURE_ENABLED !== 'true') return null;
  try {
    const site = new URL(env.PUBLIC_SITE_URL ?? ''),
      api = new URL(env.API_INTERNAL_URL ?? '');
    const local = (u: URL) =>
      ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    if (
      site.username ||
      site.password ||
      site.search ||
      site.hash ||
      site.pathname !== '/' ||
      !(
        site.protocol === 'https:' ||
        (site.protocol === 'http:' && local(site))
      ) ||
      api.username ||
      api.password ||
      api.search ||
      api.hash ||
      api.pathname.replace(/\/$/, '') !== '/api/public' ||
      !['https:', 'http:'].includes(api.protocol)
    )
      return null;
    return { site: site.origin, api: api.toString().replace(/\/$/, '') };
  } catch {
    return null;
  }
}
async function json(url: string, fetcher: typeof fetch) {
  const response = await fetcher(url, {
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw Error('External permission unavailable');
  const text = await response.text();
  if (text.length > 1000000) throw Error('Unexpected response size');
  return JSON.parse(text) as unknown;
}
export async function externalProjection(
  slug: string,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): Promise<PublicExposure | null> {
  const config = externalWebConfig(env);
  if (!config || !publicExposureSlugSchema.safeParse(slug).success) return null;
  try {
    const item = publicExposureSchema.parse(
      await json(`${config.api}/external/${slug}`, fetcher),
    );
    return item.slug === slug ? item : null;
  } catch {
    return null;
  }
}
export function externalStoryPath(
  item: Pick<PublicExposure, 'slug' | 'classification'>,
) {
  return `${item.classification === 'official' ? '/official-lives/' : '/lives/'}${item.slug}`;
}
export function externalMetadata(
  item: PublicExposure | null,
  site: string | null,
): Metadata {
  if (!item || !site)
    return {
      title: 'A simulated life · alterward',
      description: 'Explore AI-generated simulated lives on alterward.',
      robots: {
        index: false,
        follow: false,
        noarchive: true,
        noimageindex: true,
      },
      referrer: 'no-referrer',
    };
  const url = site + externalStoryPath(item),
    image = {
      url: `${site}/share-preview/${item.slug}`,
      width: 1200,
      height: 630,
      alt: `${item.title} · AI-generated simulated life on alterward`,
    };
  return {
    title: `${item.title} · alterward`,
    description: item.summary,
    referrer: 'no-referrer',
    alternates: { canonical: url },
    robots: {
      index: item.indexable,
      follow: item.indexable,
      noarchive: true,
      noimageindex: !item.indexable,
    },
    openGraph: {
      type: 'article',
      title: item.title,
      description: item.summary,
      url,
      siteName: 'alterward',
      locale: 'en_US',
      publishedTime: item.publishedAt,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: item.title,
      description: item.summary,
      images: [image.url],
    },
  };
}
export async function storyMetadata(slug: string) {
  const config = externalWebConfig();
  return externalMetadata(await externalProjection(slug), config?.site ?? null);
}
export async function externalSitemap(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
) {
  const config = externalWebConfig(env);
  if (!config) return [];
  const result: { url: string; lastModified: string }[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ limit: '100' });
    if (cursor) q.set('cursor', cursor);
    const data = publicExposureSitemapSchema.parse(
      await json(`${config.api}/external/sitemap?${q}`, fetcher),
    );
    let previous = cursor;
    for (const item of data.items) {
      if (!item.indexable) throw Error('Unexpected sitemap permission');
      if (previous && item.slug <= previous)
        throw Error('Unstable sitemap order');
      previous = item.slug;
      result.push({
        url: config.site + externalStoryPath(item),
        lastModified: item.publishedAt,
      });
    }
    if (!data.nextCursor) return result;
    if (previous && data.nextCursor < previous)
      throw Error('Unstable sitemap cursor');
    if (cursor && data.nextCursor <= cursor)
      throw Error('Unstable sitemap cursor');
    cursor = data.nextCursor;
  }
  throw Error('Sitemap exceeds pilot capacity'); // Explicit failure instead of silently dropping entries.
}
