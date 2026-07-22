import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, schema, sql, type Database } from '@edrion/database';
import type { AuditWriter } from '@edrion/audit';
import { ActorType } from '@edrion/shared-types';
import type { CreateDocumentBatchInput, CreateDocumentRenderInput, ManualUploadMapInput } from '@edrion/schemas';
import { familyFromDocType } from '@edrion/schemas';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { basePortalAudit, type PortalActionContext } from '../portal/portal-action-context';
import { DocumentsGenService } from './documents-gen.service';
import { templateFingerprint } from './template-fingerprint';
import { resolveMergePayload, sampleMergeData } from './document-merge-resolver.registry';
import { randomUUID } from 'node:crypto';
import {
  DOCUMENT_VERIFY_CODE_VERSION,
  mintDocumentVerifyCode,
} from '../../common/crypto/document-verify-signer';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../common/tokens';

@Injectable()
export class DocumentBatchService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly documents: DocumentsGenService,
  ) {}

  async create(ctx: PortalActionContext, input: CreateDocumentBatchInput) {
    const studentIds = await this.resolvePopulation(ctx.principal.institutionId, input);
    const fingerprint = input.templateId
      ? await this.fingerprintTemplate(input.templateId)
      : null;

    const [batch] = await this.db
      .insert(schema.documentBatches)
      .values({
        institutionId: ctx.principal.institutionId,
        campusId: input.campusId ?? null,
        kind: input.kind,
        templateId: input.templateId ?? null,
        templateFingerprint: fingerprint,
        scope: input.scope,
        status: 'draft',
        counts: {
          total: studentIds.length,
          rendered: 0,
          failed: 0,
          signed: 0,
          delivered: 0,
        },
        populationSnapshot: { studentIds, capturedAt: new Date().toISOString() },
        createdBy: ctx.principal.institutionUserId,
      })
      .returning();

    if (studentIds.length) {
      await this.db.insert(schema.documentBatchItems).values(
        studentIds.map((studentId) => ({
          batchId: batch!.id,
          studentId,
          status: 'pending' as const,
        })),
      );
    }

    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action: 'document_batch.create',
      module: 'documents-issuance',
      entityType: 'document_batch',
      entityId: batch!.id,
      newState: { kind: input.kind, total: studentIds.length },
    });
    return batch!;
  }

  async get(ctx: PortalActionContext, id: string) {
    const batch = await this.requireBatch(ctx, id);
    const items = await this.db
      .select()
      .from(schema.documentBatchItems)
      .where(eq(schema.documentBatchItems.batchId, id));
    return { ...batch, items };
  }

  async previewSamples(ctx: PortalActionContext, id: string, version: number) {
    const batch = await this.requireBatch(ctx, id, version);
    if (batch.status !== 'draft') {
      throw new ConflictException({ code: 'INVALID_STATUS', message: 'Preview only in draft.' });
    }
    const items = await this.db
      .select()
      .from(schema.documentBatchItems)
      .where(eq(schema.documentBatchItems.batchId, id))
      .orderBy(schema.documentBatchItems.studentId);
    if (!items.length) {
      throw new ConflictException({ code: 'EMPTY_BATCH', message: 'No students in population.' });
    }
    const picks = sampleIndices(items.length).map((i) => items[i]!);
    const template = batch.templateId
      ? await this.documents.requireTemplate(ctx, batch.templateId)
      : null;
    const renders = [];
    for (const item of picks) {
      const family = template?.family ?? familyFromDocType(template?.docType ?? batch.kind);
      const merge = resolveMergePayload(family, {
        ...sampleMergeData(family),
        verifyCode: 'SAMPLE-0000',
      });
      const render = await this.documents.createRender(
        ctx,
        {
          docType: (template?.docType ?? batch.kind) as CreateDocumentRenderInput['docType'],
          family,
          title: `Sample · ${batch.kind}`,
          payload: merge,
          templateId: template?.id,
          purpose: 'preview',
          studentId: item.studentId,
          templateFingerprint: batch.templateFingerprint ?? undefined,
        },
      );
      renders.push(render);
    }
    return { renders };
  }

  async generate(ctx: PortalActionContext, id: string, version: number, acknowledgePreview = false) {
    const batch = await this.requireBatch(ctx, id, version);
    if (batch.status !== 'draft') {
      throw new ConflictException({ code: 'INVALID_STATUS', message: 'Generate only from draft.' });
    }
    if (!acknowledgePreview) {
      throw new ConflictException({
        code: 'PREVIEW_REQUIRED',
        message: 'Preview three samples and acknowledge before generate.',
      });
    }
    const [updated] = await this.db
      .update(schema.documentBatches)
      .set({ status: 'generating', version: version + 1, updatedAt: new Date() })
      .where(
        and(
          eq(schema.documentBatches.id, id),
          eq(schema.documentBatches.version, version),
          eq(schema.documentBatches.status, 'draft'),
        ),
      )
      .returning();
    if (!updated) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Batch changed.' });

    const pending = await this.db
      .select()
      .from(schema.documentBatchItems)
      .where(
        and(
          eq(schema.documentBatchItems.batchId, id),
          eq(schema.documentBatchItems.status, 'pending'),
        ),
      );

    const template = batch.templateId
      ? await this.documents.requireTemplate(ctx, batch.templateId)
      : null;

    for (const item of pending) {
      try {
        const family = template?.family ?? familyFromDocType(template?.docType ?? batch.kind);
        const student = await this.loadStudent(item.studentId);
        const merge = resolveMergePayload(family, {
          institution: { name: 'Institution' },
          student: {
            name: `${student?.firstName ?? ''} ${student?.lastName ?? ''}`.trim(),
            regNo: student?.admissionNo ?? undefined,
          },
          verifyCode: 'PENDING',
          issueDate: new Date().toISOString().slice(0, 10),
        });
        const render = await this.documents.createRender(ctx, {
          docType: (template?.docType ?? batch.kind) as CreateDocumentRenderInput['docType'],
          family,
          title: `${batch.kind} · ${student?.admissionNo ?? item.studentId}`,
          payload: merge,
          templateId: template?.id,
          purpose: 'batch',
          studentId: item.studentId,
          batchItemId: item.id,
          refType: 'document_batch',
          refId: batch.id,
          templateFingerprint: batch.templateFingerprint ?? undefined,
          idempotencyKey: `batch:${batch.id}:item:${item.id}:attempt:1`,
        });
        await this.db
          .update(schema.documentBatchItems)
          .set({
            status: 'rendering',
            renderId: render.id,
            mergeSnapshot: merge,
            version: item.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(schema.documentBatchItems.id, item.id));
      } catch (e) {
        await this.db
          .update(schema.documentBatchItems)
          .set({
            status: 'failed',
            error: {
              code: 'ENQUEUE_FAILED',
              message: e instanceof Error ? e.message : 'enqueue failed',
            },
            updatedAt: new Date(),
          })
          .where(eq(schema.documentBatchItems.id, item.id));
      }
    }

    return this.refreshCounts(ctx, id);
  }

  async cancel(ctx: PortalActionContext, id: string, version: number) {
    const [updated] = await this.db
      .update(schema.documentBatches)
      .set({ status: 'cancelled', version: version + 1, updatedAt: new Date() })
      .where(
        and(
          eq(schema.documentBatches.id, id),
          eq(schema.documentBatches.institutionId, ctx.principal.institutionId),
          eq(schema.documentBatches.version, version),
          eq(schema.documentBatches.status, 'generating'),
        ),
      )
      .returning();
    if (!updated) {
      throw new ConflictException({
        code: 'INVALID_STATUS',
        message: 'Cancel only while generating.',
      });
    }
    return updated;
  }

  async retryFailed(ctx: PortalActionContext, id: string, version: number) {
    const batch = await this.requireBatch(ctx, id, version);
    if (!['completed_with_errors', 'generating'].includes(batch.status)) {
      throw new ConflictException({ code: 'INVALID_STATUS', message: 'Cannot retry in this status.' });
    }
    const failed = await this.db
      .select()
      .from(schema.documentBatchItems)
      .where(
        and(
          eq(schema.documentBatchItems.batchId, id),
          eq(schema.documentBatchItems.status, 'failed'),
        ),
      );
    const template = batch.templateId
      ? await this.documents.requireTemplate(ctx, batch.templateId)
      : null;

    for (const item of failed) {
      const attempt = (item.version ?? 0) + 1;
      const family = template?.family ?? familyFromDocType(template?.docType ?? batch.kind);
      const student = await this.loadStudent(item.studentId);
      const merge =
        (item.mergeSnapshot as Record<string, unknown> | null) ??
        resolveMergePayload(family, {
          institution: { name: 'Institution' },
          student: {
            name: `${student?.firstName ?? ''} ${student?.lastName ?? ''}`.trim(),
          },
          verifyCode: 'PENDING',
        });
      const render = await this.documents.createRender(ctx, {
        docType: (template?.docType ?? batch.kind) as CreateDocumentRenderInput['docType'],
        family,
        title: `Retry · ${batch.kind}`,
        payload: merge,
        templateId: template?.id,
        purpose: 'batch',
        studentId: item.studentId,
        batchItemId: item.id,
        refType: 'document_batch',
        refId: batch.id,
        templateFingerprint: batch.templateFingerprint ?? undefined,
        idempotencyKey: `batch:${batch.id}:item:${item.id}:attempt:${attempt}`,
      });
      await this.db
        .update(schema.documentBatchItems)
        .set({
          status: 'rendering',
          renderId: render.id,
          error: null,
          version: attempt,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.documentBatchItems.id, item.id),
            eq(schema.documentBatchItems.status, 'failed'),
          ),
        );
    }
    return this.refreshCounts(ctx, id);
  }

  /** Called when a batch render completes — files vault for non-cancelled batches. */
  async onRenderDone(renderId: string) {
    const [render] = await this.db
      .select()
      .from(schema.documentRenders)
      .where(eq(schema.documentRenders.id, renderId))
      .limit(1);
    if (!render?.batchItemId || render.purpose === 'preview') return;

    const [item] = await this.db
      .select()
      .from(schema.documentBatchItems)
      .where(eq(schema.documentBatchItems.id, render.batchItemId))
      .limit(1);
    if (!item) return;

    const [batch] = await this.db
      .select()
      .from(schema.documentBatches)
      .where(eq(schema.documentBatches.id, item.batchId))
      .limit(1);
    if (!batch || batch.status === 'cancelled') {
      await this.db
        .update(schema.documentBatchItems)
        .set({ status: 'excluded', updatedAt: new Date() })
        .where(eq(schema.documentBatchItems.id, item.id));
      return;
    }

    if (render.status === 'failed') {
      await this.db
        .update(schema.documentBatchItems)
        .set({
          status: 'failed',
          error: { code: 'RENDER_FAILED', message: render.errorDetail ?? 'failed' },
          updatedAt: new Date(),
        })
        .where(eq(schema.documentBatchItems.id, item.id));
      await this.refreshCountsInternal(batch.id);
      return;
    }

    const vaultId = randomUUID();
    const secret = this.env.DOCUMENT_VERIFY_SECRET ?? this.env.SESSION_COOKIE_SECRET;
    const verifyCode = mintDocumentVerifyCode(vaultId, secret, DOCUMENT_VERIFY_CODE_VERSION);
    const [vault] = await this.db
      .insert(schema.studentDocumentVault)
      .values({
        id: vaultId,
        institutionId: batch.institutionId,
        studentId: item.studentId,
        documentRenderId: render.id,
        storageKey: render.storagePath,
        title: render.title,
        docType: render.docType,
        family: render.family ?? familyFromDocType(render.docType),
        source: 'batch',
        templateId: render.templateId,
        templateFingerprint: render.templateFingerprint,
        batchId: batch.id,
        batchItemId: item.id,
        verifyCode,
        verifyCodeVersion: DOCUMENT_VERIFY_CODE_VERSION,
        issuedBy: render.requestedBy,
        deliveredAt: batch.kind === 'report_card' ? null : new Date(),
      })
      .onConflictDoNothing()
      .returning();

    await this.db
      .update(schema.documentBatchItems)
      .set({
        status: vault?.deliveredAt ? 'delivered' : 'rendered',
        vaultDocumentId: vault?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.documentBatchItems.id, item.id));

    await this.refreshCountsInternal(batch.id);
  }

  private async refreshCounts(_ctx: PortalActionContext, id: string) {
    return this.refreshCountsInternal(id);
  }

  private async refreshCountsInternal(batchId: string) {
    const items = await this.db
      .select({ status: schema.documentBatchItems.status })
      .from(schema.documentBatchItems)
      .where(eq(schema.documentBatchItems.batchId, batchId));
    const counts = {
      total: items.length,
      rendered: items.filter((i) => ['rendered', 'delivered'].includes(i.status)).length,
      failed: items.filter((i) => i.status === 'failed').length,
      signed: 0,
      delivered: items.filter((i) => i.status === 'delivered').length,
    };
    const [batch] = await this.db
      .select()
      .from(schema.documentBatches)
      .where(eq(schema.documentBatches.id, batchId))
      .limit(1);
    if (!batch || batch.status === 'cancelled') return batch;

    const pending = items.some((i) => ['pending', 'rendering'].includes(i.status));
    let status = batch.status;
    if (!pending && batch.status === 'generating') {
      if (batch.kind === 'report_card') {
        status = 'review';
        await this.ensureReportReviews(batch);
      } else {
        status = counts.failed > 0 ? 'completed_with_errors' : 'completed';
      }
    }

    const [updated] = await this.db
      .update(schema.documentBatches)
      .set({ counts, status, updatedAt: new Date() })
      .where(eq(schema.documentBatches.id, batchId))
      .returning();
    return updated;
  }

  private async ensureReportReviews(batch: typeof schema.documentBatches.$inferSelect) {
    const sectionIds = (batch.scope as { sectionIds?: string[] })?.sectionIds ?? [];
    for (const sectionId of sectionIds) {
      await this.db
        .insert(schema.reportCardReviews)
        .values({ batchId: batch.id, sectionId, status: 'pending' })
        .onConflictDoNothing();
    }
  }

  private async requireBatch(ctx: PortalActionContext, id: string, version?: number) {
    const [batch] = await this.db
      .select()
      .from(schema.documentBatches)
      .where(
        and(
          eq(schema.documentBatches.id, id),
          eq(schema.documentBatches.institutionId, ctx.principal.institutionId),
        ),
      )
      .limit(1);
    if (!batch) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Batch not found.' });
    if (version != null && batch.version !== version) {
      throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Batch changed.' });
    }
    return batch;
  }

  private async fingerprintTemplate(templateId: string) {
    const [t] = await this.db
      .select()
      .from(schema.documentTemplates)
      .where(eq(schema.documentTemplates.id, templateId))
      .limit(1);
    if (!t) return null;
    return templateFingerprint({
      html: t.html,
      css: t.css,
      headerConfig: t.headerConfig,
      fieldsSchema: t.fieldsSchema,
    });
  }

  private async loadStudent(studentId: string) {
    const [s] = await this.db
      .select({
        firstName: schema.students.firstName,
        lastName: schema.students.lastName,
        admissionNo: schema.students.admissionNo,
      })
      .from(schema.students)
      .where(eq(schema.students.id, studentId))
      .limit(1);
    return s;
  }

  private async resolvePopulation(institutionId: string, input: CreateDocumentBatchInput): Promise<string[]> {
    if (input.kind === 'report_card') {
      const sectionIds = (input.scope.sectionIds as string[] | undefined) ?? [];
      if (!sectionIds.length) return [];
      const rows = await this.db
        .select({ id: schema.students.id })
        .from(schema.students)
        .where(
          and(
            eq(schema.students.institutionId, institutionId),
            inArray(schema.students.classId, sectionIds),
          ),
        );
      return rows.map((r) => r.id);
    }
    if (input.kind === 'hall_ticket') {
      const rows = await this.db
        .select({ id: schema.students.id })
        .from(schema.students)
        .where(eq(schema.students.institutionId, institutionId))
        .limit(5000);
      const ids = rows.map((r) => r.id);
      return this.excludeHallTicketDues(institutionId, ids);
    }
    if (input.kind === 'id_card') {
      const rows = await this.db
        .select({ id: schema.students.id })
        .from(schema.students)
        .where(eq(schema.students.institutionId, institutionId))
        .limit(5000);
      return rows.map((r) => r.id);
    }
    // manual_upload — empty until files mapped
    return [];
  }

  async mapManualUpload(ctx: PortalActionContext, batchId: string, input: ManualUploadMapInput) {
    const batch = await this.requireBatch(ctx, batchId, input.version);
    if (batch.kind !== 'manual_upload') {
      throw new ConflictException({ code: 'INVALID_KIND', message: 'Not a manual upload batch.' });
    }
    if (batch.status !== 'draft') {
      throw new ConflictException({ code: 'INVALID_STATUS', message: 'Upload mapping only in draft.' });
    }

    const regNos = new Set(input.mappings.map((m) => m.regNo.trim().toLowerCase()));
    const students = await this.db
      .select({ id: schema.students.id, admissionNo: schema.students.admissionNo })
      .from(schema.students)
      .where(eq(schema.students.institutionId, ctx.principal.institutionId));
    const byReg = new Map(
      students
        .filter((s) => s.admissionNo && regNos.has(String(s.admissionNo).toLowerCase()))
        .map((s) => [String(s.admissionNo).toLowerCase(), s.id]),
    );
    const unmatched: string[] = [];
    const createdItems: string[] = [];

    for (const mapping of input.mappings) {
      const studentId = byReg.get(mapping.regNo.trim().toLowerCase());
      if (!studentId) {
        unmatched.push(mapping.regNo);
        continue;
      }
      const vaultId = randomUUID();
      const verifyCode = mintDocumentVerifyCode(
        vaultId,
        this.env.DOCUMENT_VERIFY_SECRET ?? this.env.SESSION_COOKIE_SECRET,
        DOCUMENT_VERIFY_CODE_VERSION,
      );
      const [vault] = await this.db
        .insert(schema.studentDocumentVault)
        .values({
          id: vaultId,
          institutionId: ctx.principal.institutionId,
          studentId,
          storageKey: mapping.storageKey,
          title: mapping.filename ?? `Upload · ${mapping.regNo}`,
          docType: 'manual_upload',
          family: 'certificate',
          source: 'manual_upload',
          batchId: batch.id,
          verifyCode,
          verifyCodeVersion: DOCUMENT_VERIFY_CODE_VERSION,
          issuedBy: ctx.principal.institutionUserId,
          deliveredAt: new Date(),
          deliveryMode: 'digital',
        })
        .returning();
      const [item] = await this.db
        .insert(schema.documentBatchItems)
        .values({
          batchId: batch.id,
          studentId,
          status: 'delivered',
          vaultDocumentId: vault!.id,
        })
        .returning();
      createdItems.push(item!.id);
    }

    await this.db
      .update(schema.documentBatches)
      .set({
        status: 'completed',
        counts: {
          total: createdItems.length,
          rendered: createdItems.length,
          failed: unmatched.length,
          signed: 0,
          delivered: createdItems.length,
        },
        version: batch.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.documentBatches.id, batch.id));

    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action: 'document_batch.manual_upload_map',
      module: 'documents-issuance',
      entityType: 'document_batch',
      entityId: batch.id,
      newState: { mapped: createdItems.length, unmatched },
    });
    return { mapped: createdItems.length, unmatched };
  }

  private async excludeHallTicketDues(institutionId: string, studentIds: string[]): Promise<string[]> {
    const [config] = await this.db
      .select({ duesBlock: schema.institutionFeeConfig.duesBlock })
      .from(schema.institutionFeeConfig)
      .where(eq(schema.institutionFeeConfig.institutionId, institutionId))
      .limit(1);
    const raw = (config?.duesBlock ?? {}) as Record<string, unknown>;
    if (raw.hall_ticket !== true) return studentIds;

    const eligible: string[] = [];
    for (const studentId of studentIds) {
      const [balance] = await this.db
        .select({
          overdueMinor: sql<number>`coalesce(sum(greatest(0, ${schema.feeInvoices.amount} - ${schema.feeInvoices.amountPaid})) filter (where ${schema.feeInvoices.dueDate} < current_date and ${schema.feeInvoices.status} in ('pending','partial','overdue')), 0)::int`,
        })
        .from(schema.feeInvoices)
        .where(
          and(
            eq(schema.feeInvoices.institutionId, institutionId),
            eq(schema.feeInvoices.studentId, studentId),
            sql`${schema.feeInvoices.status} <> 'cancelled'`,
          ),
        );
      const overdueMinor = Number(balance?.overdueMinor ?? 0);
      const triggered =
        raw.threshold_mode === 'amount_gte'
          ? overdueMinor >= Number(raw.threshold_minor ?? 0)
          : overdueMinor > 0;
      if (!triggered) eligible.push(studentId);
    }
    return eligible;
  }
}

function sampleIndices(n: number): number[] {
  if (n === 1) return [0];
  if (n === 2) return [0, 1];
  return [0, Math.floor((n - 1) / 2), n - 1];
}
