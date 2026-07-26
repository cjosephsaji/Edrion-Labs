// Copies non-TypeScript runtime assets into dist after `tsc` (which only emits .js).
// The library ingest worker spawns .cjs child scripts by absolute path next to the
// compiled module, so a production build without them breaks every PDF upload.
import { copyFileSync, globSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distSrcRoot = join(apiRoot, 'dist', 'apps', 'api', 'src');

const assets = globSync(join(apiRoot, 'src', '**', '*.cjs'));
if (assets.length === 0) {
  console.warn('copy-build-assets: no .cjs assets found under src — nothing copied');
}
for (const abs of assets) {
  const rel = relative(join(apiRoot, 'src'), abs);
  const dest = join(distSrcRoot, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(abs, dest);
  console.log(`copy-build-assets: ${rel} -> dist/apps/api/src/${rel.replace(/\\/g, '/')}`);
}
