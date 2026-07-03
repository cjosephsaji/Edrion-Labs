/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@edrion/schemas', '@edrion/shared-types'],
  experimental: { optimizePackageImports: ['lucide-react'] },
};

export default nextConfig;
