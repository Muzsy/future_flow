import { ImageResponse } from 'next/og';
import { externalProjection } from '../../../lib/public-exposure';
export const dynamic = 'force-dynamic';
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noimageindex',
};
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (new URL(request.url).search)
    return new Response('Unavailable', { status: 404, headers });
  const { slug } = await params,
    item = await externalProjection(slug);
  if (!item) return new Response('Unavailable', { status: 404, headers });
  // Restrict the code-native image to ASCII: no external emoji/font/image fetches.
  const title =
    item.title
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[^\x20-\x7e]/g, ' ')
      .trim()
      .slice(0, 140) || 'A simulated life';
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 64,
        background: '#111b22',
        color: '#f3f5ef',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', fontSize: 32, color: '#acd5c3' }}>
        alterward /{' '}
        {item.classification === 'official'
          ? 'Official life'
          : 'Community life'}
      </div>
      <div style={{ display: 'flex', fontSize: 54, lineHeight: 1.15 }}>
        {title}
      </div>
      <div style={{ display: 'flex', fontSize: 24, color: '#acd5c3' }}>
        AI-generated simulated life
        {item.userEdited ? ' / Edited for publication' : ''}
      </div>
    </div>,
    { width: 1200, height: 630, headers },
  );
}
