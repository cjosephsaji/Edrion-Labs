import { Injectable } from '@nestjs/common';
import type { VisualArchetype } from '@edrion/schemas';

export type CanvasExportFormat = 'svg' | 'png' | 'pdf';

@Injectable()
export class VisualCanvasExportService {
  async requestExport(input: {
    canvasId: string;
    revisionNumber?: number;
    format: CanvasExportFormat;
    idempotencyKey: string;
  }): Promise<{ jobId: string; status: 'queued' }> {
    void input;
    return { jobId: `export:${input.canvasId}`, status: 'queued' };
  }

  layoutArchetype(archetype: VisualArchetype): string {
    return archetype;
  }
}
