import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  transpilePackages: ['@future-flow/contracts'],
  poweredByHeader: false,
  output: 'standalone',
  distDir: process.env.ALTERWARD_NEXT_DIST_DIR || '.next',
};
export default nextConfig;
