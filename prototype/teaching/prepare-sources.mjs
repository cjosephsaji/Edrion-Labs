import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(root + 'apps/api/package.json');
const parser = root + 'apps/api/src/modules/student/knowledge/pdf-extract.cjs';
const pdf = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
const manifest = JSON.parse(
  await readFile(new URL('../assets/source-manifest.json', import.meta.url)),
);
const inventory = [];
for (const source of manifest.source_files) {
  const bytes = await readFile(
    new URL('../assets/source-pdfs/' + source.filename, import.meta.url),
  );
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== source.sha256 || bytes.length !== source.bytes)
    throw Error('Source mismatch: ' + source.filename);
  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--max-old-space-size=128', parser, pdf],
      { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin' } },
    );
    let output = '',
      err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(Error('Extraction timed out'));
    }, 20_000);
    child.stdout.on('data', (b) => (output += b));
    child.stderr.on('data', (b) => (err += b));
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code) reject(Error(err || 'PDF extraction failed'));
      else {
        const lines = output
          .trim()
          .split('\n')
          .map((x) => JSON.parse(x));
        resolve(lines.find((x) => x.result)?.result);
      }
    });
    child.stdin.end(bytes);
  });
  if (result.fileSha256 !== hash || result.pages.length !== source.pages)
    throw Error('Extraction mismatch');
  inventory.push({
    ...source,
    parser: 'Existing M2 pdf-extract.cjs / PDF.js 4.10.38',
    status: 'verified',
    extractedPages: result.pages.filter((x) => x.trim()).length,
    pages: result.pages.map((text, i) => ({ page: i + 1, text })),
  });
  console.log(
    source.filename,
    result.pages.length + ' pages',
    hash,
    'verified and extracted',
  );
}
await writeFile(
  new URL('../assets/extracted-sources.json', import.meta.url),
  JSON.stringify(inventory, null, 2),
);
await writeFile(
  new URL('../assets/source-receipts.json', import.meta.url),
  JSON.stringify(
    inventory.map(({ pages, ...s }) => ({ ...s, pageCount: pages.length })),
    null,
    2,
  ),
);
