import { createRequire, isBuiltin } from 'node:module';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { type KnowledgePdfProcess, PdfPreparationError } from '../knowledge-pdf-process';
import { extractionEvidenceSchema, M2_LIMITS, sha256, type ExtractionMetrics } from './content-adapter';

export const M2FA_LIMITS = {
  bytes: M2_LIMITS.bytes, characters: M2_LIMITS.characters, lines: 100_000, lineLength: 16_000,
  elements: 512, locatorBytes: 64 * 1024, zipEntries: 512, expandedBytes: 32 * 1024 * 1024,
  entryBytes: 4 * 1024 * 1024, compressionRatio: 100, xmlDepth: 64, xmlNodes: 100_000,
  paragraphs: 512, runs: 10_000, tableDepth: 4, rows: 100, columns: 32, cells: 1000,
  media: 32, imageDimension: 4096, imagePixels: 8_000_000, astDepth: 32, astNodes: 10_000,
  wallMs: 20_000, rssKiB: 262_144, outputBytes: 16 * 1024 * 1024,
} as const;

/** Exact installed parser package graph only; no API, storage or configuration mount. */
export function nativeRuntime(format: 'txt' | 'markdown' | 'docx') {
  const req = createRequire(__filename), roots = new Set<string>();
  const visit = (entry: string) => {
    let dir = dirname(realpathSync(entry));
    while (!existsSync(join(dir, 'package.json'))) dir = dirname(dir);
    if (roots.has(dir)) return;
    roots.add(dir);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const local = createRequire(join(dir, 'package.json'));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
      if (!isBuiltin(name) && !name.startsWith('@types/')) {
        try { visit(local.resolve(name)); } catch { if (pkg.dependencies?.[name]) throw new Error('PETROS_M2_RUNTIME_INVALID'); }
      }
    }
    const install = dir.lastIndexOf('/node_modules/');
    if (install >= 0) roots.add(dir.slice(0, install + '/node_modules'.length));
  };
  const entries: Record<string, string> = {};
  if (format === 'docx') {
    entries.zip = req.resolve('jszip');
    entries.sax = createRequire(req.resolve('mammoth')).resolve('sax');
    entries.canvas = req.resolve('@napi-rs/canvas');
  }
  if (format === 'markdown') {
    entries.markdown = req.resolve('mdast-util-from-markdown');
    entries.gfm = req.resolve('micromark-extension-gfm');
    entries.mdastGfm = req.resolve('mdast-util-gfm');
  }
  Object.values(entries).forEach(visit);
  const script = join(__dirname, 'm2fa-native.cjs');
  roots.add(join(__dirname, 'm2fa-text.cjs'));
  roots.add(join(__dirname, 'm2fa-docx.cjs'));
  return { script, readRoots: [...roots], args: [format, JSON.stringify(entries), JSON.stringify(M2FA_LIMITS)], addons: format === 'docx' };
}

export async function extractNativeFile(worker: KnowledgePdfProcess, format: 'txt' | 'markdown' | 'docx',
  buffer: Buffer, signal: AbortSignal, progress: (n: number) => void = () => {},
  onMetrics?: (m: ExtractionMetrics) => void) {
  if (!buffer.length || buffer.length > M2FA_LIMITS.bytes) throw new PdfPreparationError('PETROS_DOCUMENT_LIMIT');
  if (format !== 'docx' && (buffer.subarray(0,5).toString('ascii') === '%PDF-' ||
    buffer.subarray(0,4).equals(Buffer.from('504b0304','hex')) || buffer.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex'))))
    throw new PdfPreparationError('PETROS_M2_TYPE_MISMATCH');
  const runtime = nativeRuntime(format);
  const e = await worker.run(buffer, signal, progress, runtime.script, M2FA_LIMITS,
    extractionEvidenceSchema, { ...runtime, onMetrics });
  if (e.originalHash !== sha256(buffer) || e.format !== format) throw new PdfPreparationError('PETROS_M2_HASH_MISMATCH');
  return e;
}
