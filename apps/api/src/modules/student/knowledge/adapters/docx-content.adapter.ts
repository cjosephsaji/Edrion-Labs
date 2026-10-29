/* eslint-disable @typescript-eslint/consistent-type-imports -- Nest runtime metadata. */
import { Injectable } from '@nestjs/common';
import { KnowledgePdfProcess } from '../knowledge-pdf-process';
import { extractNativeFile } from './native-file.adapter';
import type { ContentAdapter, ExtractionMetrics } from './content-adapter';

@Injectable()
export class DocxContentAdapter implements ContentAdapter {
  readonly format = 'docx' as const;
  readonly capabilities = ['native_ooxml', 'paragraph_runs', 'numbering', 'merged_tables', 'embedded_images', 'inert_omml', 'visibility_channels'] as const;
  constructor(private readonly worker: KnowledgePdfProcess) {}
  extract(buffer: Buffer, signal: AbortSignal, progress?: (n: number) => void, metrics?: (m: ExtractionMetrics) => void) {
    return extractNativeFile(this.worker, this.format, buffer, signal, progress, metrics);
  }
}
