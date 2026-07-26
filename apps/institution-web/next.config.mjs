import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Next.js only loads `.env*` from this app directory. The API loads the workspace-root `.env`
 * via dotenv — mirror that here so `NEXT_PUBLIC_DEV_INSTITUTION_USER` and friends are available
 * when running `pnpm dev` from the monorepo root.
 */
function loadWorkspacePublicEnv() {
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
  // Workspace packages ship TS source; let Next transpile them.
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
