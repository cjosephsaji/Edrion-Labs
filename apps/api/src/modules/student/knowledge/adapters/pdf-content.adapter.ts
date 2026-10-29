/* eslint-disable @typescript-eslint/consistent-type-imports -- Nest needs runtime constructor metadata. */
import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import { KnowledgePdfProcess, PdfPreparationError } from '../knowledge-pdf-process';
import {
  extractionEvidenceSchema,
  parserRuntime,
  sha256,
  M2_LIMITS,
  type ContentAdapter,
  type ExtractionMetrics,
} from './content-adapter';

@Injectable()
export class PdfContentAdapter implements ContentAdapter {
  readonly format = 'pdf' as const;
  readonly capabilities = [
    'native_text',
    'text_geometry',
    'page_render',
    'columns',
    'conservative_tables',
    'visual_regions',
  ] as const;
  constructor(private readonly worker: KnowledgePdfProcess) {}
  async extract(
    buffer: Buffer,
    signal: AbortSignal,
    progress: (surface: number) => void = () => {},
    onMetrics?: (metrics: ExtractionMetrics) => void,
  ) {
    if (buffer.length > M2_LIMITS.bytes) throw new PdfPreparationError('PETROS_DOCUMENT_LIMIT');
    const runtime = parserRuntime();
    runtime.readRoots.push(join(__dirname, 'm2-native.cjs'));
    runtime.args.unshift('m2');
    const evidence = await this.worker.run(
      buffer,
      signal,
      progress,
      join(__dirname, '../pdf-extract.cjs'),
      { wallMs: 20_000, rssKiB: 524288, outputBytes: 32 * 1024 * 1024 },
      extractionEvidenceSchema,
      { ...runtime, onMetrics },
    );
    if (evidence.originalHash !== sha256(buffer))
      throw new PdfPreparationError('PETROS_M2_HASH_MISMATCH');
    return evidence;
  }
}
