import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  transpilePackages: ['@future-flow/contracts'],
  poweredByHeader: false,
  htmlLimitedBots: /.*/,
  async headers() {
    const headers = [
      { key: 'CDN-Cache-Control', value: 'no-store' },
      { key: 'Cloudflare-CDN-Cache-Control', value: 'no-store' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
    ];
    return [
      '/lives/:slug',
      '/official-lives/:slug',
      '/share-preview/:slug',
      '/unlisted',
      '/official-unlisted',
      '/discover',
      '/collections/:collectionId',
      '/sitemap.xml',
    ].map((source) => ({ source, headers }));
  },
  output: 'standalone',
  distDir: process.env.ALTERWARD_NEXT_DIST_DIR || '.next',
};
export default nextConfig;
