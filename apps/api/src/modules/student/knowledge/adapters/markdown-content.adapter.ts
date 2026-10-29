/* eslint-disable @typescript-eslint/consistent-type-imports -- Nest runtime metadata. */
import { Injectable } from '@nestjs/common';
import { KnowledgePdfProcess } from '../knowledge-pdf-process';
import { extractNativeFile } from './native-file.adapter';
import type { ContentAdapter, ExtractionMetrics } from './content-adapter';

@Injectable()
export class MarkdownContentAdapter implements ContentAdapter {
  readonly format = 'markdown' as const;
  readonly capabilities = ['commonmark_gfm', 'syntax_nodes', 'tables', 'inert_code', 'original_spans'] as const;
  constructor(private readonly worker: KnowledgePdfProcess) {}
  extract(buffer: Buffer, signal: AbortSignal, progress?: (n: number) => void, metrics?: (m: ExtractionMetrics) => void) {
    return extractNativeFile(this.worker, this.format, buffer, signal, progress, metrics);
  }
}
