/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TS source; let Next transpile them.
  transpilePackages: [
    '@edrion/ui',
    '@edrion/shared-types',
    '@edrion/permissions',
    '@edrion/design-tokens',
  ],
  experimental: { optimizePackageImports: ['lucide-react'] },
};

export default nextConfig;
