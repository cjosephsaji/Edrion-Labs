import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ApiEnv } from '@edrion/config';
import { eq, schema, type Database } from '@edrion/database';
import { API_ENV, DATABASE } from '../../../common/tokens';
import { LocalDiskDriver } from '../storage/drivers/local-disk.driver';
import { canonicalMaterialMimeType, isPresentationMaterial, materialFileExtension } from './material-file-types';
import { convertPresentation } from './presentation-converter';

const execFileAsync = promisify(execFile);

export type MaterialStoredFile = {
  objectId: string;
  storageKey: string;
  filename: string | null;
  mimeType: string;
  derived: Record<string, unknown>;
};

export type MaterialRenderedFile = {
  storageKey: string;
  filename: string;
  mimeType: 'application/pdf';
};

type ViewerPdfMetadata = MaterialRenderedFile & {
  sizeBytes: number;
  sourceSha256: string;
};

/**
 * Produces a layout-faithful PDF copy of presentation files for the private student viewer.
 * The teacher's original deck stays untouched and remains the file students download.
 */
@Injectable()
export class MaterialVisualPreviewService {
  private readonly logger = new Logger(MaterialVisualPreviewService.name);
  private readonly driver: LocalDiskDriver;
  private readonly pending = new Map<string, Promise<MaterialRenderedFile | null>>();
  private readonly pageCounts = new Map<string, number>();
  private readonly pageCache = new Map<string, Buffer>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.driver = new LocalDiskDriver(env);
  }

  async resolve(file: MaterialStoredFile, sourceBuffer?: Buffer): Promise<MaterialRenderedFile | null> {
    const mimeType = canonicalMaterialMimeType(file.filename, file.mimeType);
    if (!isPresentationMaterial(file.filename, mimeType)) return null;

    const cached = viewerPdf(file.derived);
    if (cached) {
      try {
        await this.driver.size(cached.storageKey);
        return cached;
      } catch {
        // Regenerate a missing derived object from the protected original below.
      }
    }

    const current = this.pending.get(file.objectId);
    if (current) return current;
    const task = this.create(file, sourceBuffer).finally(() => this.pending.delete(file.objectId));
    this.pending.set(file.objectId, task);
    return task;
  }

  async metadata(file: MaterialStoredFile): Promise<{ pageCount: number; mimeType: 'application/pdf' } | null> {
    const pdf = await this.asPdf(file);
    if (!pdf) return null;
    return { pageCount: await this.pageCount(pdf), mimeType: 'application/pdf' };
  }

  async renderPage(file: MaterialStoredFile, pageNumber: number): Promise<Buffer | null> {
    const pdf = await this.asPdf(file);
    if (!pdf) return null;
    const pageCount = await this.pageCount(pdf);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) return null;

    const cacheKey = `${pdf.storageKey}:${pageNumber}`;
    const cached = this.pageCache.get(cacheKey);
    if (cached) return cached;

    const workDir = await mkdtemp(join(tmpdir(), 'edrion-pdf-page-'));
    try {
      const inputPath = this.driver.resolvePath(pdf.storageKey);
      const outputPrefix = join(workDir, 'page');
      await execFileAsync(await pdfPageRenderer(), [
        '-f', String(pageNumber),
        '-l', String(pageNumber),
        '-singlefile',
        '-png',
        '-r', '120',
        inputPath,
        outputPrefix,
      ], { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
      const image = await readFile(`${outputPrefix}.png`);
      this.pageCache.set(cacheKey, image);
      if (this.pageCache.size > 12) this.pageCache.delete(this.pageCache.keys().next().value!);
      return image;
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  private async asPdf(file: MaterialStoredFile): Promise<MaterialRenderedFile | null> {
    const mimeType = canonicalMaterialMimeType(file.filename, file.mimeType);
    if (mimeType === 'application/pdf') {
      return {
        storageKey: file.storageKey,
        filename: file.filename ?? 'document.pdf',
        mimeType: 'application/pdf',
      };
    }
    return this.resolve(file);
  }

  private async pageCount(pdf: MaterialRenderedFile): Promise<number> {
    const cached = this.pageCounts.get(pdf.storageKey);
    if (cached) return cached;
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await pdfjs.getDocument({
      data: new Uint8Array(await this.driver.read(pdf.storageKey)),
      useWorkerFetch: false,
    }).promise;
    try {
      this.pageCounts.set(pdf.storageKey, document.numPages);
      return document.numPages;
    } finally {
      await document.destroy();
    }
  }

  private async create(file: MaterialStoredFile, sourceBuffer?: Buffer): Promise<MaterialRenderedFile | null> {
    const extension = materialFileExtension(file.filename);
    const inputExtension = ['ppt', 'pptx', 'odp'].includes(extension) ? extension : 'pptx';
    try {
      const source = sourceBuffer ?? await this.driver.read(file.storageKey);
      const sourceSha256 = createHash('sha256').update(source).digest('hex');
      const pdf = await convertPresentation(source, inputExtension as 'ppt' | 'pptx' | 'odp', 'pdf');
      if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Converter did not produce a PDF');

      const previewStorageKey = await this.driver.put(join(dirname(file.storageKey), 'derived'), pdf);
      const preview: ViewerPdfMetadata = {
        storageKey: previewStorageKey,
        filename: `${basename(file.filename ?? 'presentation', `.${extension || inputExtension}`)}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: pdf.length,
        sourceSha256,
      };
      await this.db
        .update(schema.storageObjects)
        .set({ derived: { ...file.derived, viewerPdf: preview } })
        .where(eq(schema.storageObjects.id, file.objectId));
      return preview;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not render presentation ${file.objectId}: ${message}`);
      return null;
    }
  }
}

async function pdfPageRenderer(): Promise<string> {
  const configured = process.env.MATERIAL_PDF_RENDERER_BIN?.trim();
  if (configured) return configured;
  const candidates = process.platform === 'darwin'
    ? ['/opt/homebrew/bin/pdftoppm', '/usr/local/bin/pdftoppm']
    : ['/usr/bin/pdftoppm', '/usr/local/bin/pdftoppm'];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next standard installation location.
    }
  }
  return 'pdftoppm';
}

function viewerPdf(derived: Record<string, unknown>): MaterialRenderedFile | null {
  const value = derived.viewerPdf;
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.storageKey !== 'string'
    || typeof candidate.filename !== 'string'
    || candidate.mimeType !== 'application/pdf'
  ) return null;
  return {
    storageKey: candidate.storageKey,
    filename: candidate.filename,
    mimeType: 'application/pdf',
  };
}
