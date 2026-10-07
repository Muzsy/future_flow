import { externalSitemap } from '../../lib/public-exposure';
export const dynamic = 'force-dynamic';
const headers = {
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};
const escapeXml = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
export async function GET(request: Request) {
  if (new URL(request.url).search)
    return new Response('Unavailable', { status: 404, headers });
  try {
    const items = await externalSitemap();
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        items
          .map(
            (i) =>
              `<url><loc>${escapeXml(i.url)}</loc><lastmod>${escapeXml(i.lastModified)}</lastmod></url>`,
          )
          .join('') +
        '</urlset>',
      { headers },
    );
  } catch {
    return new Response('Temporarily unavailable', {
      status: 503,
      headers: {
        ...headers,
        'Content-Type': 'text/plain; charset=utf-8',
        'Retry-After': '60',
      },
    });
  }
}
