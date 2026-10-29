// Copies non-TypeScript runtime assets into dist after `tsc` (which only emits .js).
// PDF preparation launches its .cjs child by absolute path next to the compiled
// module. Keep that executable in the build; there is no inline parser fallback.
import { copyFileSync, existsSync, globSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stdout, stderr } from 'node:process';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distSrcRoot = join(apiRoot, 'dist', 'apps', 'api', 'src');
const distRoot = join(apiRoot, 'dist');
const workspaceRoot = resolve(apiRoot, '../..');

// Workspace exports point at TypeScript during development. Route the built API
// to emitted JavaScript and retain each package's own installed dependency lookup.
const paths = {};
for (const entry of readdirSync(join(distRoot, 'packages'), { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('._')) continue;
  const name = entry.name;
  const packageRoot = join(workspaceRoot, 'packages', name);
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
    if (typeof target !== 'string' || !target.endsWith('.ts')) continue;
    const emitted = join('packages', name, target.replace(/\.ts$/, '.js'));
    if (!existsSync(join(distRoot, emitted))) continue;
    paths[manifest.name + (subpath === '.' ? '' : subpath.slice(1))] = [emitted];
  }
  const dependencies = join(packageRoot, 'node_modules');
  const link = join(distRoot, 'packages', name, 'node_modules');
  if (existsSync(dependencies)) {
    rmSync(link, { recursive: true, force: true });
    symlinkSync(relative(dirname(link), dependencies), link, 'dir');
  }
}
writeFileSync(join(distRoot, 'package.json'), JSON.stringify({ type: 'commonjs' }) + '\n');
writeFileSync(join(distRoot, 'runtime-paths.json'), JSON.stringify(paths, null, 2) + '\n');

const assets = globSync(join(apiRoot, 'src', '**', '*.cjs')).filter(abs =>
  !relative(join(apiRoot, 'src'), abs).split(/[\\/]/).some(part => part.startsWith('._')));
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
