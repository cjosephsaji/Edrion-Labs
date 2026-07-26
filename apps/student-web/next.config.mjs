/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@edrion/ui',
    '@edrion/schemas',
    '@edrion/shared-types',
    '@edrion/permissions',
    '@edrion/design-tokens',
    'react-pdf',
    'pdfjs-dist',
  ],
  experimental: { optimizePackageImports: ['lucide-react'] },
  webpack: (config) => {
    // react-pdf / pdfjs optional native deps — not used in the browser viewer.
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },
};

export default nextConfig;
