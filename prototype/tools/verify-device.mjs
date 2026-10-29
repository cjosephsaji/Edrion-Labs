import { readFile, stat, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(await readFile(join(root, 'prototype/assets/source-manifest.json'), 'utf8'));
const assetRegister = JSON.parse(await readFile(join(root, 'prototype/assets/realism/asset-register.json'), 'utf8'));
const errors = [];
const results = [];
const [major, minor] = process.versions.node.split('.').map(Number);
if (major !== 24 || minor < 21) errors.push('Use Node 24.21.0 or newer within Node 24 (see .nvmrc).');
for (const source of manifest.source_files) {
  const relative = 'prototype/assets/source-pdfs/' + source.filename;
  try {
    const bytes = await readFile(join(root, relative));
    if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw Error('SHA256 mismatch');
    results.push(relative);
  } catch (error) { errors.push(`${relative}: ${error.code === 'ENOENT' ? 'missing; restore the private module pack' : error.message}`); }
}
try {
  const inventory = JSON.parse(await readFile(join(root, 'prototype/assets/extracted-sources.json'), 'utf8'));
  for (const source of manifest.source_files) {
    const item = inventory.find(item => item.filename === source.filename);
    if (!item || item.sha256 !== source.sha256 || item.pages.length !== source.pages || !item.pages.every((page,i) => page.page === i+1 && typeof page.text === 'string')) {
      throw Error('Missing or inconsistent page inventory for ' + source.filename);
    }
  }
  results.push('prototype/assets/extracted-sources.json');
} catch (error) { errors.push(`Extracted pages: ${error.code === 'ENOENT' ? 'missing; restore the private pack or run prepare:sources' : error.message}`); }
const runtimeManifest = await readFile(join(root,'prototype/assets/realism/runtime-manifest.ts'),'utf8');
const filenames = [...runtimeManifest.matchAll(/'([^']+\.(?:glb|hdr))'/g)].map(match => match[1]);
for (const filename of filenames) {
  const relative = 'prototype/assets/realism/runtime/' + filename;
  try { if ((await stat(join(root,relative))).size === 0) throw Error('empty asset'); results.push(relative); }
  catch { errors.push(relative + ': missing; pull the runtime assets from Git'); }
}
for (const pose of ['idle','listening','thinking','point-right']) {
  const relative = `apps/student-web/public/petros/states/petros-${pose}.png`;
  try { await access(join(root,relative)); results.push(relative); } catch { errors.push(relative + ': missing'); }
}
try {
  const require = createRequire(join(root,'apps/api/package.json'));
  require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  results.push('PDF.js upload/extraction dependency installed');
} catch { errors.push('PDF.js is missing; run pnpm install from the repository root (including apps/api).'); }
// The register is tracked provenance, not a download instruction at runtime.
if (!assetRegister) errors.push('Missing asset register');
for (const error of errors) console.error('MISSING:',error);
console.log(`${results.length} device prerequisites checked; ${errors.length} problem(s).`);
if (!errors.length) console.log('Ready for the local prototype. No database, API server, or shared secrets are required.');
process.exitCode = errors.length ? 1 : 0;
