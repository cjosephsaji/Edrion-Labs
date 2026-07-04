import { ConflictException, Inject, Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { and, desc, eq, isNull, schema, sql, type Database } from '@edrion/database';
import type { DocumentRender, DocumentTemplate, NewDocumentTemplate } from '@edrion/database';
import type {
  CreateDocumentRenderInput,
  CreateDocumentTemplateInput,
  DocumentTemplatesListQuery,
  UpdateDocumentTemplateInput,
} from '@edrion/schemas';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { JobsService } from '../../common/queue/jobs.service';
import { basePortalAudit, type PortalActionContext } from '../portal/portal-action-context';
import { PLATFORM_DEFAULT_TEMPLATES } from './default-templates';

export const RENDER_JOB = 'documents.render';

/**
 * Template CRUD + render orchestration. Templates resolve institution override → platform default
 * (by doc_type + institution type). Renders are queued onto the existing `reports` BullMQ queue
 * and processed by DocumentRenderProcessor.
 */
@Injectable()
export class DocumentsGenService implements OnModuleInit {
  private readonly logger = new Logger(DocumentsGenService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly jobs: JobsService,
  ) {}

  /** Seed the platform default templates (idempotent by (NULL institution, doc_type, name)). */
  async onModuleInit(): Promise<void> {
    try {
      for (const tpl of PLATFORM_DEFAULT_TEMPLATES) {
        const [existing] = await this.db
          .select({ id: schema.documentTemplates.id })
          .from(schema.documentTemplates)
          .where(
            and(
              isNull(schema.documentTemplates.institutionId),
              eq(schema.documentTemplates.docType, tpl.docType),
              eq(schema.documentTemplates.name, tpl.name),
            ),
          )
          .limit(1);
        if (!existing) {
          await this.db.insert(schema.documentTemplates).values({ ...tpl, isDefault: true } as NewDocumentTemplate);
        }
      }
    } catch (e) {
      this.logger.warn(`default template seed skipped: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ── Templates ────────────────────────────────────────────────────────────────

  async listTemplates(ctx: PortalActionContext, q: DocumentTemplatesListQuery) {
    const t = schema.documentTemplates;
    const where = and(
      sql`(${t.institutionId} = ${ctx.principal.institutionId} or ${t.institutionId} is null)`,
      q.docType ? eq(t.docType, q.docType) : undefined,
    );
    const items = await this.db
      .select()
      .from(t)
      .where(where)
      .orderBy(desc(t.institutionId), t.docType, desc(t.updatedAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [total] = await this.db.select({ value: sql<number>`count(*)` }).from(t).where(where);
    return { items, total: Number(total?.value ?? 0), page: q.page, pageSize: q.pageSize };
  }

  async createTemplate(ctx: PortalActionContext, input: CreateDocumentTemplateInput): Promise<DocumentTemplate> {
    const [row] = await this.db
      .insert(schema.documentTemplates)
      .values({
        institutionId: ctx.principal.institutionId,
        docType: input.docType,
        name: input.name,
        html: input.html,
        css: input.css,
        fieldsSchema: input.fieldsSchema,
        headerConfig: input.headerConfig as Record<string, unknown>,
        isDefault: input.isDefault,
        createdBy: ctx.principal.institutionUserId,
      })
      .returning();
    await this.write(ctx, 'document_template.create', row!.id, { docType: input.docType, name: input.name });
    return row!;
  }

  async updateTemplate(ctx: PortalActionContext, id: string, input: UpdateDocumentTemplateInput): Promise<DocumentTemplate> {
    const existing = await this.requireTemplate(ctx, id);
    if (!existing.institutionId) {
      throw new ConflictException({ code: 'TEMPLATE_IS_PLATFORM', message: 'Platform default templates are read-only — create an institution override instead.' });
    }
    const { version, ...patch } = input;
    const [row] = await this.db
      .update(schema.documentTemplates)
      .set({
        ...(patch as Record<string, unknown>),
        headerConfig: (patch.headerConfig ?? existing.headerConfig) as Record<string, unknown>,
        version: version + 1,
        updatedBy: ctx.principal.institutionUserId,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.documentTemplates.id, id), eq(schema.documentTemplates.version, version)))
      .returning();
    if (!row) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'This template changed. Reload and retry.' });
    await this.write(ctx, 'document_template.update', id, { name: row.name });
    return row;
  }

  async deleteTemplate(ctx: PortalActionContext, id: string, version: number): Promise<void> {
    const existing = await this.requireTemplate(ctx, id);
    if (!existing.institutionId) {
      throw new ConflictException({ code: 'TEMPLATE_IS_PLATFORM', message: 'Platform default templates cannot be deleted.' });
    }
    const res = await this.db
      .delete(schema.documentTemplates)
      .where(and(eq(schema.documentTemplates.id, id), eq(schema.documentTemplates.version, version)))
      .returning({ id: schema.documentTemplates.id });
    if (!res.length) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'This template changed. Reload and retry.' });
    await this.write(ctx, 'document_template.delete', id, {});
  }

  async requireTemplate(ctx: PortalActionContext, id: string): Promise<DocumentTemplate> {
    const [row] = await this.db
      .select()
      .from(schema.documentTemplates)
      .where(eq(schema.documentTemplates.id, id))
      .limit(1);
    if (!row || (row.institutionId && row.institutionId !== ctx.principal.institutionId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Template not found' });
    }
    return row;
  }

  /** Institution override → platform default (matching institution type) → any platform default. */
  async resolveTemplate(institutionId: string, institutionType: string, docType: string, templateId?: string): Promise<DocumentTemplate | undefined> {
    const t = schema.documentTemplates;
    if (templateId) {
      const [row] = await this.db
        .select()
        .from(t)
        .where(and(eq(t.id, templateId), sql`(${t.institutionId} = ${institutionId} or ${t.institutionId} is null)`))
        .limit(1);
      if (row) return row;
    }
    const [override] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.institutionId, institutionId), eq(t.docType, docType)))
      .orderBy(desc(t.isDefault), desc(t.updatedAt))
      .limit(1);
    if (override) return override;
    const defaults = await this.db.select().from(t).where(and(isNull(t.institutionId), eq(t.docType, docType)));
    return (
      defaults.find((d) => (d.appliesToTypes ?? []).includes(institutionType)) ??
      defaults.find((d) => !(d.appliesToTypes ?? []).length)
    );
  }

  /** False when Redis queues are disabled — callers then render inline (dev fallback). */
  get queueEnabled(): boolean {
    return this.jobs.enabled;
  }

  // ── Renders ──────────────────────────────────────────────────────────────────

  async createRender(ctx: PortalActionContext, input: CreateDocumentRenderInput, runId?: string): Promise<DocumentRender> {
    const [row] = await this.db
      .insert(schema.documentRenders)
      .values({
        institutionId: ctx.principal.institutionId,
        templateId: input.templateId ?? null,
        docType: input.docType,
        requestedBy: ctx.principal.institutionUserId,
        conversationId: input.conversationId ?? null,
        runId: runId ?? null,
        title: input.title,
        payload: input.payload,
        status: 'queued',
      })
      .returning();
    const jobId = await this.jobs.enqueue('reports', RENDER_JOB, { renderId: row!.id });
    if (!jobId) {
      // Queues disabled (dev without Redis worker) — render inline so the feature still works.
      this.logger.warn('queues disabled — rendering inline');
    }
    await this.write(ctx, 'document_render.request', row!.id, { docType: input.docType, title: input.title, queued: Boolean(jobId) });
    return row!;
  }

  async getRender(ctx: PortalActionContext, id: string): Promise<DocumentRender> {
    const [row] = await this.db
      .select()
      .from(schema.documentRenders)
      .where(and(eq(schema.documentRenders.id, id), eq(schema.documentRenders.institutionId, ctx.principal.institutionId)))
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Render not found' });
    return row;
  }

  private async write(ctx: PortalActionContext, action: string, entityId: string, detail: Record<string, unknown>): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: 'documents-gen',
      entityType: 'document',
      entityId,
      institutionId: ctx.principal.institutionId,
      newState: detail,
    } as AuditEventInput);
  }
}
