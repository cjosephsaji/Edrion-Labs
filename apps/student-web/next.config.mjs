import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Load workspace-root `NEXT_PUBLIC_*` vars (API URL, dev impersonation headers). */
function loadWorkspacePublicEnv() {
  if (process.env.PETROS_ISOLATED_VERIFICATION === '1') return;
  const rootEnv = join(dirname(fileURLToPath(import.meta.url)), '../../.env');
  if (!existsSync(rootEnv)) return;
  for (const line of readFileSync(rootEnv, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key.startsWith('NEXT_PUBLIC_')) continue;
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadWorkspacePublicEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `next dev` and `next build` cannot safely share one output directory. A build that ran
  // beside the local portal replaced the development manifests while its HTML still linked
  // to the old CSS chunks, leaving the browser with a fully unstyled page. Keep their
  // generated assets isolated so validation builds never break an active study session.
  distDir: process.env.PETROS_ISOLATED_VERIFICATION === '1'
    ? (process.env.NODE_ENV === 'development' ? '.next-petros-verification-dev' : '.next-petros-verification')
    : (process.env.NODE_ENV === 'development' ? '.next-dev' : '.next'),
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
