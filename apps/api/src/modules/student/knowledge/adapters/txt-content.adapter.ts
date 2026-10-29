/* eslint-disable @typescript-eslint/consistent-type-imports -- Nest runtime metadata. */
import { Injectable } from '@nestjs/common';
import { KnowledgePdfProcess } from '../knowledge-pdf-process';
import { extractNativeFile } from './native-file.adapter';
import type { ContentAdapter, ExtractionMetrics } from './content-adapter';

@Injectable()
export class TxtContentAdapter implements ContentAdapter {
  readonly format = 'txt' as const;
  readonly capabilities = ['strict_encoding', 'original_bytes', 'paragraphs', 'line_spans'] as const;
  constructor(private readonly worker: KnowledgePdfProcess) {}
  extract(buffer: Buffer, signal: AbortSignal, progress?: (n: number) => void, metrics?: (m: ExtractionMetrics) => void) {
    return extractNativeFile(this.worker, this.format, buffer, signal, progress, metrics);
  }
}
