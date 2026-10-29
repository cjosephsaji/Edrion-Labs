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
import { convertPresentationForM2 } from '../../materials/presentation-converter';
import { PdfContentAdapter } from './pdf-content.adapter';
import { readFile } from 'node:fs/promises';

@Injectable()
export class PptxContentAdapter implements ContentAdapter {
  readonly format = 'pptx' as const;
  readonly capabilities = [
    'native_shapes',
    'tables',
    'connectors',
    'notes',
    'images',
    'chart_metadata',
    'native_preview',
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
    runtime.args.unshift('pptx');
    const evidence = await this.worker.run(
      buffer,
      signal,
      progress,
      join(__dirname, 'm2-native.cjs'),
      { wallMs: 20_000, rssKiB: 524288, outputBytes: 32 * 1024 * 1024 },
      extractionEvidenceSchema,
      { ...runtime, onMetrics },
    );
    if (evidence.originalHash !== sha256(buffer))
      throw new PdfPreparationError('PETROS_M2_HASH_MISMATCH');
    return evidence;
  }

  /** Original Office rendering is kept separate from deterministic native extraction identity. */
  async renderOriginal(buffer: Buffer, signal: AbortSignal, binary: string) {
    const converted = await convertPresentationForM2(buffer, 'pptx', signal, binary);
    const rendered = await new PdfContentAdapter(this.worker).extract(converted, signal);
    return {
      originalHash: sha256(buffer),
      convertedHash: sha256(converted),
      converterVersion: `office.binary.${sha256(await readFile(binary)).slice(0, 24)}`,
      pageCount: rendered.pageCount,
      surfaces: rendered.surfaces,
      warning:
        'Office export is an isolated rendering of the original bytes; application/font differences require review.',
    };
  }
}
