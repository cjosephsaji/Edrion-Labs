/** Standalone preview: no academic API, database, root environment or production routes. */
export default {
  reactStrictMode: true,
  devIndicators: false,
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  experimental: { cpus: 2 },
};
