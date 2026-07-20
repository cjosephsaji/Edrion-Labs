import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { eq, schema, type Database } from '@edrion/database';
import type { HeaderConfig } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import { QueueWorkers } from '../../common/queue/queue.worker';
import { JobsService } from '../../common/queue/jobs.service';
import { AttachmentStorageService } from '../portal/attachment-storage.service';
import { DocumentsGenService, RENDER_JOB } from './documents-gen.service';
import { buildDocumentHtml, renderPdf } from './document-renderer';

/** Raw-HTML payload keys — only the server (report queries / chart builder) may set these. */
const SERVER_ONLY_KEYS = ['tableHtml', 'chartSvg', 'paragraphsHtml'];

/**
 * BullMQ processor for document renders (existing `reports` queue): resolve template → merge
 * branding → Handlebars → Playwright (system Chrome) → storage → petros_artifacts → done.
 * Render failures land as status=failed with the error surfaced to the chat card.
 */
@Injectable()
export class DocumentRenderProcessor implements OnModuleInit {
  private readonly logger = new Logger(DocumentRenderProcessor.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly workers: QueueWorkers,
    private readonly jobs: JobsService,
    private readonly storage: AttachmentStorageService,
    private readonly svc: DocumentsGenService,
  ) {}

  onModuleInit(): void {
    this.workers.register(RENDER_JOB, (job: Job) => this.process(String((job.data as { renderId: string }).renderId)));
  }

  async process(renderId: string): Promise<{ ok: boolean }> {
    const [render] = await this.db
      .select()
      .from(schema.documentRenders)
      .where(eq(schema.documentRenders.id, renderId))
      .limit(1);
    // A worker can win the race against the transaction that creates the render.
    // Throw so the existing BullMQ retry policy handles it instead of losing the job.
    if (!render) throw new Error(`Document render ${renderId} is not committed yet`);
    if (render.status === 'done') return { ok: true };

    await this.db
      .update(schema.documentRenders)
      .set({ status: 'rendering', updatedAt: new Date() })
      .where(eq(schema.documentRenders.id, renderId));

    try {
      const [institution] = await this.db
        .select({ name: schema.institutions.displayName, type: schema.institutions.type, logoUrl: schema.institutions.logoUrl })
        .from(schema.institutions)
        .where(eq(schema.institutions.id, render.institutionId))
        .limit(1);
      const template = await this.svc.resolveTemplate(
        render.institutionId,
        institution?.type ?? 'school',
        render.docType,
        render.templateId ?? undefined,
      );
      if (!template) throw new Error(`No template available for doc type ${render.docType}`);

      const payload = { ...(render.payload ?? {}) };
      const serverBlocks = (payload.__server as Record<string, unknown> | undefined) ?? {};
      delete payload.__server;
      for (const key of SERVER_ONLY_KEYS) delete payload[key];
      for (const key of SERVER_ONLY_KEYS) {
        if (typeof serverBlocks[key] === 'string') payload[key] = serverBlocks[key];
      }

      const html = buildDocumentHtml({
        html: template.html,
        css: template.css,
        headerConfig: (template.headerConfig ?? {}) as HeaderConfig,
        branding: { institutionName: institution?.name ?? 'Institution', logoUrl: institution?.logoUrl ?? null },
        payload,
        title: render.title,
      });
      const pdf = await renderPdf(html);
      const storagePath = await this.storage.save(render.institutionId, pdf);

      let artifactId: string | null = null;
      if (render.conversationId) {
        const [artifact] = await this.db
          .insert(schema.petrosArtifacts)
          .values({
            conversationId: render.conversationId,
            institutionId: render.institutionId,
            kind: 'document_pdf',
            title: render.title,
            docType: render.docType,
            storagePath,
            mimeType: 'application/pdf',
            sizeBytes: pdf.length,
            meta: { renderId },
          })
          .returning();
        artifactId = artifact!.id;
      }

      await this.db
        .update(schema.documentRenders)
        .set({ status: 'done', storagePath, artifactId, updatedAt: new Date() })
        .where(eq(schema.documentRenders.id, renderId));
      if (render.runId && typeof render.payload?.request_id === 'string') {
        await this.jobs.enqueue(
          'notifications',
          'requests.document_render_completed',
          { institutionId: render.institutionId, renderId },
          { jobId: `request-render-complete-${renderId}` },
        );
      }
      if (typeof render.payload?.fee_receipt_id === 'string' || typeof render.payload?.fee_statement_student_id === 'string') {
        await this.jobs.enqueue(
          'notifications',
          'fees.receipt_render_completed',
          { institutionId: render.institutionId, renderId },
          { jobId: `fee-receipt-render-complete-${renderId}` },
        );
      }
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'render failed';
      this.logger.error(`render ${renderId} failed: ${message}`);
      await this.db
        .update(schema.documentRenders)
        .set({ status: 'failed', errorDetail: message.slice(0, 1000), updatedAt: new Date() })
        .where(eq(schema.documentRenders.id, renderId));
      return { ok: false };
    }
  }
}
