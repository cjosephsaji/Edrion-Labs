import { ConflictException, Inject, Injectable, Logger, NotFoundException, UnprocessableEntityException, type OnModuleInit } from '@nestjs/common';
import { and, desc, eq, isNull, schema, sql, type Database } from '@edrion/database';
import type { DocumentRender, DocumentTemplate, NewDocumentTemplate } from '@edrion/database';
import type {
  CreateDocumentRenderInput,
  CreateDocumentTemplateInput,
  DocumentTemplatesListQuery,
  UpdateDocumentTemplateInput,
} from '@edrion/schemas';
import { familyFromDocType } from '@edrion/schemas';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { JobsService } from '../../common/queue/jobs.service';
import { basePortalAudit, type PortalActionContext } from '../portal/portal-action-context';
import { PLATFORM_DEFAULT_TEMPLATES } from './default-templates';
import { validateTemplateTokens } from './template-token-validator';
import { templateFingerprint } from './template-fingerprint';
import { resolveMergePayload, sampleMergeData } from './document-merge-resolver.registry';

export const RENDER_JOB = 'documents.render';
export const SAMPLE_VERIFY_CODE = 'SAMPLE-0000';

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
    this.assertTokens(input.html, input.fieldsSchema ?? {});
    const headerConfig = input.headerConfig as Record<string, unknown>;
    const requiresSignOff =
      input.requiresSignOff ||
      hasSignStep(headerConfig);
    const [row] = await this.db
      .insert(schema.documentTemplates)
      .values({
        institutionId: ctx.principal.institutionId,
        docType: input.docType,
        family: familyFromDocType(input.docType),
        name: input.name,
        html: input.html,
        css: input.css,
        fieldsSchema: input.fieldsSchema,
        headerConfig,
        isDefault: input.isDefault,
        requiresSignOff,
        active: true,
        createdBy: ctx.principal.institutionUserId,
      })
      .returning();
    await this.write(ctx, 'document_template.create', row!.id, { docType: input.docType, name: input.name });
    return row!;
  }

  async updateTemplate(ctx: PortalActionContext, id: string, input: UpdateDocumentTemplateInput): Promise<DocumentTemplate> {
    const existing = await this.requireTemplate(ctx, id);
    if (!existing.institutionId) {
      // Customize platform default: clone into institution override
      if (input.html || input.name || input.fieldsSchema || input.headerConfig) {
        return this.customizePlatformDefault(ctx, existing, input);
      }
      throw new ConflictException({ code: 'TEMPLATE_IS_PLATFORM', message: 'Platform default templates are read-only — create an institution override instead.' });
    }
    const html = input.html ?? existing.html;
    const fieldsSchema = (input.fieldsSchema ?? existing.fieldsSchema ?? {}) as Record<string, unknown>;
    this.assertTokens(html, fieldsSchema);
    const headerConfig = (input.headerConfig ?? existing.headerConfig) as Record<string, unknown>;
    const { version, ...patch } = input;
    const [row] = await this.db
      .update(schema.documentTemplates)
      .set({
        ...(patch as Record<string, unknown>),
        html,
        fieldsSchema,
        headerConfig,
        requiresSignOff: Boolean(patch.requiresSignOff ?? existing.requiresSignOff) || hasSignStep(headerConfig),
        family: familyFromDocType(patch.docType ?? existing.docType),
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

  /** Clone a platform default into an institution override on first customize. */
  async customizePlatformDefault(
    ctx: PortalActionContext,
    platform: DocumentTemplate,
    input: UpdateDocumentTemplateInput,
  ): Promise<DocumentTemplate> {
    const html = input.html ?? platform.html;
    const fieldsSchema = (input.fieldsSchema ?? platform.fieldsSchema ?? {}) as Record<string, unknown>;
    this.assertTokens(html, fieldsSchema);
    const headerConfig = (input.headerConfig ?? platform.headerConfig) as Record<string, unknown>;
    const [row] = await this.db
      .insert(schema.documentTemplates)
      .values({
        institutionId: ctx.principal.institutionId,
        docType: platform.docType,
        family: familyFromDocType(platform.docType),
        name: input.name ?? platform.name,
        html,
        css: input.css ?? platform.css,
        fieldsSchema,
        headerConfig,
        isDefault: false,
        active: true,
        requiresSignOff: Boolean(input.requiresSignOff ?? platform.requiresSignOff) || hasSignStep(headerConfig),
        platformTemplateKey: platform.platformTemplateKey ?? platform.docType,
        createdBy: ctx.principal.institutionUserId,
      })
      .returning();
    await this.write(ctx, 'document_template.customize', row!.id, { from: platform.id });
    return row!;
  }

  /**
   * Preview: enqueue a normal document_renders row with purpose=preview.
   * Never creates a vault row; sample verify code does not resolve.
   */
  async previewTemplate(ctx: PortalActionContext, templateId: string, payload?: Record<string, unknown>) {
    const template = await this.requireTemplate(ctx, templateId);
    const family = template.family ?? familyFromDocType(template.docType);
    const sample = sampleMergeData(family);
    const merge = resolveMergePayload(family, {
      ...sample,
      verifyCode: SAMPLE_VERIFY_CODE,
    });
    const fingerprint = templateFingerprint({
      html: template.html,
      css: template.css,
      headerConfig: template.headerConfig,
      fieldsSchema: template.fieldsSchema,
    });
    const [row] = await this.db
      .insert(schema.documentRenders)
      .values({
        institutionId: ctx.principal.institutionId,
        templateId: template.id,
        docType: template.docType,
        family,
        purpose: 'preview',
        templateFingerprint: fingerprint,
        requestedBy: ctx.principal.institutionUserId,
        title: `Preview · ${template.name}`,
        payload: { ...merge, ...(payload ?? {}) },
        status: 'queued',
      })
      .returning();
    await this.jobs.enqueue('reports', RENDER_JOB, { renderId: row!.id });
    await this.write(ctx, 'document_render.preview', row!.id, { templateId });
    return row!;
  }

  async createRender(
    ctx: PortalActionContext,
    input: CreateDocumentRenderInput & {
      purpose?: string;
      family?: string;
      refType?: string;
      refId?: string;
      batchItemId?: string;
      studentId?: string;
      templateFingerprint?: string;
      idempotencyKey?: string;
    },
    runId?: string,
  ): Promise<DocumentRender> {
    const family = input.family ?? familyFromDocType(input.docType);
    const [row] = await this.db
      .insert(schema.documentRenders)
      .values({
        institutionId: ctx.principal.institutionId,
        studentId: input.studentId ?? null,
        templateId: input.templateId ?? null,
        docType: input.docType,
        family,
        purpose: input.purpose ?? 'issuance',
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        batchItemId: input.batchItemId ?? null,
        templateFingerprint: input.templateFingerprint ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
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
      this.logger.warn('queues disabled — rendering inline');
    }
    await this.write(ctx, 'document_render.request', row!.id, {
      docType: input.docType,
      title: input.title,
      queued: Boolean(jobId),
      purpose: input.purpose ?? 'issuance',
    });
    return row!;
  }

  private assertTokens(html: string, fieldsSchema: Record<string, unknown>) {
    const result = validateTemplateTokens(html, fieldsSchema);
    if (!result.ok) {
      throw new UnprocessableEntityException({
        code: 'UNKNOWN_MERGE_FIELD',
        message: 'Template contains undeclared merge fields.',
        fields: result.unknown,
      });
    }
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

function hasSignStep(headerConfig: Record<string, unknown> | null | undefined): boolean {
  const slots = (headerConfig as { signatureSlots?: Array<{ mode?: string }> } | undefined)?.signatureSlots;
  return Array.isArray(slots) && slots.some((s) => s?.mode === 'sign_step');
}
