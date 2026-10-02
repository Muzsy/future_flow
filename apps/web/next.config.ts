import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  transpilePackages: ['@future-flow/contracts'],
  poweredByHeader: false,
  output: 'standalone',
};
export default nextConfig;
