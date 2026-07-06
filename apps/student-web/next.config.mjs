/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@edrion/ui',
    '@edrion/schemas',
    '@edrion/shared-types',
    '@edrion/permissions',
    '@edrion/design-tokens',
  ],
  experimental: { optimizePackageImports: ['lucide-react'] },
};

export default nextConfig;
