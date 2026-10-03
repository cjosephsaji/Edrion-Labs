// Copies non-TypeScript runtime assets into dist after `tsc` (which only emits .js).
// PDF preparation launches its .cjs child by absolute path next to the compiled
// module. Keep that executable in the build; there is no inline parser fallback.
import { copyFileSync, globSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stdout, stderr } from 'node:process';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distSrcRoot = join(apiRoot, 'dist', 'apps', 'api', 'src');

const assets = globSync(join(apiRoot, 'src', '**', '*.cjs'));
if (assets.length === 0) {
  stderr.write('copy-build-assets: no .cjs assets found under src — nothing copied\n');
}
for (const abs of assets) {
  const rel = relative(join(apiRoot, 'src'), abs);
  const dest = join(distSrcRoot, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(abs, dest);
  stdout.write(`copy-build-assets: ${rel} -> dist/apps/api/src/${rel.replace(/\\/g, '/')}\n`);
}
