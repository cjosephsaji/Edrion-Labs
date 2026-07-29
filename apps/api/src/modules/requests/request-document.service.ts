import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  or,
  schema,
  sql,
  type Database,
} from '@edrion/database';
import type { AuditWriter } from '@edrion/audit';
import type { ApiEnv } from '@edrion/config';
import { ActorType } from '@edrion/shared-types';
import type { DocumentRequestPayload, SignatureSlot, VaultRevokeInput, CreateDocumentRenderInput } from '@edrion/schemas';
import QRCode from 'qrcode';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { hmacSha256Base64Url } from '../../common/jwt';
import {
  DOCUMENT_VERIFY_CODE_VERSION,
  mintDocumentVerifyCode,
  normalizeVerifyCodeInput,
} from '../../common/crypto/document-verify-signer';
import { JobsService } from '../../common/queue/jobs.service';
import { AttachmentStorageService } from '../portal/attachment-storage.service';
import type { PortalActionContext } from '../portal/portal-action-context';
import { basePortalAudit } from '../portal/portal-action-context';
import { resolveScopeFilter } from '@edrion/auth';
import type { InstitutionalStudentPrincipal } from '../student/student.types';
import { DocumentsGenService, RENDER_JOB } from '../documents/documents-gen.service';
import { DocumentRenderProcessor } from '../documents/document-render.processor';
import { DocumentCatalogService } from '../documents/document-catalog.service';
import { RequestNotifyService } from './request-notify.service';
import { familyFromDocType } from '@edrion/schemas';
import { randomUUID } from 'node:crypto';

type RequestRow = typeof schema.studentRequests.$inferSelect;

export const REQUEST_RENDER_COMPLETE_JOB = 'requests.document_render_completed';

@Injectable()
export class RequestDocumentService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly documents: DocumentsGenService,
    private readonly processor: DocumentRenderProcessor,
    private readonly jobs: JobsService,
    private readonly storage: AttachmentStorageService,
    private readonly notifications: RequestNotifyService,
    private readonly catalog: DocumentCatalogService,
  ) {}

  async assertRequestableTemplate(institutionId: string, docType: string) {
    const [institution] = await this.db
      .select({ type: schema.institutions.type })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, institutionId))
      .limit(1);
    const template = await this.documents.resolveTemplate(
      institutionId,
      institution?.type ?? 'school',
      docType,
    );
    if (!template) {
      throw new ConflictException({
        code: 'DOCUMENT_TYPE_UNAVAILABLE',
        message: 'This document type is not available for your institution.',
      });
    }
    return template;
  }

  async listRequestableTemplates(institutionId: string) {
    const rows = await this.catalog.listActive(institutionId);
    const out = [];
    for (const entry of rows) {
      try {
        let template;
        if (entry.templateId) {
          [template] = await this.db
            .select()
            .from(schema.documentTemplates)
            .where(
              and(
                eq(schema.documentTemplates.id, entry.templateId),
                eq(schema.documentTemplates.active, true),
                or(
                  eq(schema.documentTemplates.institutionId, institutionId),
                  isNull(schema.documentTemplates.institutionId),
                ),
              ),
            )
            .limit(1);
        } else {
          template = await this.assertRequestableTemplate(institutionId, entry.docType);
        }
        if (!template) throw new Error('missing template');
        out.push({
          subtypeKey: entry.subtypeKey,
          docType: entry.docType,
          name: entry.title,
          description: entry.description ?? null,
          templateId: template.id,
          requiresSignOff: template.requiresSignOff,
          enabled: true,
          reason: null,
          deliveryModes: (entry.deliveryModes as string[]) ?? ['digital'],
          requiresPayment: entry.requiresPayment,
          feeAmountMinor: entry.feeAmountMinor,
          family: entry.family,
        });
      } catch {
        out.push({
          subtypeKey: entry.subtypeKey,
          docType: entry.docType,
          name: entry.title,
          description: entry.description ?? null,
          templateId: entry.templateId,
          requiresSignOff: false,
          enabled: false,
          reason: 'No active template',
          deliveryModes: (entry.deliveryModes as string[]) ?? ['digital'],
          requiresPayment: entry.requiresPayment,
          feeAmountMinor: entry.feeAmountMinor,
          family: entry.family,
        });
      }
    }
    return out;
  }

  async enqueue(ctx: PortalActionContext, request: RequestRow) {
    const payload = request.payload as unknown as DocumentRequestPayload;
    const template = await this.assertRequestableTemplate(request.institutionId, payload.doc_type);
    const [existing] = await this.db
      .select()
      .from(schema.documentRenders)
      .where(
        and(
          eq(schema.documentRenders.institutionId, request.institutionId),
          eq(schema.documentRenders.runId, request.id),
        ),
      )
      .orderBy(desc(schema.documentRenders.createdAt))
      .limit(1);

    let render = existing;
    if (!render) {
      const [student] = await this.db
        .select({
          fullName: sql<string>`concat_ws(' ', ${schema.students.firstName}, ${schema.students.middleName}, ${schema.students.lastName})`,
          admissionNo: schema.students.admissionNo,
          className: schema.classes.name,
          levelName: schema.gradeLevels.name,
          programmeName: schema.departments.name,
        })
        .from(schema.students)
        .leftJoin(schema.classes, eq(schema.classes.id, schema.students.classId))
        .leftJoin(schema.gradeLevels, eq(schema.gradeLevels.id, schema.students.gradeLevelId))
        .leftJoin(schema.departmentGradeLevels, eq(schema.departmentGradeLevels.id, schema.classes.programmeLevelId))
        .leftJoin(schema.departments, eq(schema.departments.id, schema.departmentGradeLevels.departmentId))
        .where(eq(schema.students.id, request.studentId))
        .limit(1);
      const verifyCode = this.codeFor(request.id);
      const verifyUrl = `https://verify.edrion.com/${verifyCode}`;
      const verifyQrDataUrl = await QRCode.toDataURL(verifyUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 180,
      });
      render = await this.documents.createRender(
        ctx,
        {
          templateId: template.id,
          docType: payload.doc_type as unknown as CreateDocumentRenderInput['docType'],
          title: `${payload.doc_type.replace(/_/g, ' ')} · ${request.humanCode}`,
          payload: {
            student: {
              full_name: student?.fullName ?? 'Student',
              admission_no: student?.admissionNo ?? '',
            },
            purpose_label: payload.purpose?.replace(/_/g, ' ') ?? '',
            purpose_text: payload.purpose_text ?? '',
            copies: payload.copies ?? 1,
            academic: {
              summary: [student?.programmeName, student?.levelName, student?.className]
                .filter((value): value is string => Boolean(value))
                .join(' · ') || 'Academic record supplied by the institution.',
            },
            issue: {
              verify_code: verifyCode,
              verify_url: verifyUrl,
              verify_qr_data_url: verifyQrDataUrl,
              role_label: 'Registrar',
            },
            request_id: request.id,
          },
        },
        request.id,
      );
    } else if (render.status === 'failed') {
      const [retried] = await this.db
        .update(schema.documentRenders)
        .set({ status: 'queued', errorDetail: null, updatedAt: new Date() })
        .where(eq(schema.documentRenders.id, render.id))
        .returning();
      render = retried!;
      await this.jobs.enqueue('reports', RENDER_JOB, { renderId: render.id }, { jobId: `document-render-${render.id}` });
    }

    if (!this.documents.queueEnabled) {
      await this.processor.process(render.id);
      await this.completeRender(render.id);
    }
    return render;
  }

  /** Documents-backed student ID card render after `id_card_reissue` approval. */
  async enqueueIdCardReissue(ctx: PortalActionContext, request: RequestRow) {
    const template = await this.assertRequestableTemplate(request.institutionId, 'id_card');
    const [student] = await this.db
      .select({
        fullName: sql<string>`concat_ws(' ', ${schema.students.firstName}, ${schema.students.middleName}, ${schema.students.lastName})`,
        admissionNo: schema.students.admissionNo,
        className: schema.classes.name,
      })
      .from(schema.students)
      .leftJoin(schema.classes, eq(schema.classes.id, schema.students.classId))
      .where(eq(schema.students.id, request.studentId))
      .limit(1);
    const verifyCode = this.codeFor(request.id);
    const verifyUrl = `https://verify.edrion.com/${verifyCode}`;
    const verifyQrDataUrl = await QRCode.toDataURL(verifyUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 180,
    });
    const render = await this.documents.createRender(
      ctx,
      {
        templateId: template.id,
        docType: 'id_card',
        title: `ID card · ${request.humanCode}`,
        payload: {
          student: {
            full_name: student?.fullName ?? 'Student',
            admission_no: student?.admissionNo ?? '',
            class_name: student?.className ?? '',
          },
          issue: {
            verify_code: verifyCode,
            verify_url: verifyUrl,
            verify_qr_data_url: verifyQrDataUrl,
            role_label: 'Registrar',
          },
          request_id: request.id,
          reissue_reason: (request.payload as { reason?: string }).reason ?? 'reissue',
        },
      },
      request.id,
    );
    if (!this.documents.queueEnabled) {
      await this.processor.process(render.id);
      await this.completeRender(render.id);
    }
    return render;
  }

  async completeRender(renderId: string): Promise<{ completed: boolean; requestId?: string }> {
    const [render] = await this.db
      .select()
      .from(schema.documentRenders)
      .where(eq(schema.documentRenders.id, renderId))
      .limit(1);
    if (!render?.runId || render.status !== 'done' || !render.storagePath) return { completed: false };
    const [request] = await this.db
      .select()
      .from(schema.studentRequests)
      .where(
        and(
          eq(schema.studentRequests.id, render.runId),
          render.institutionId
            ? eq(schema.studentRequests.institutionId, render.institutionId)
            : sql`true`,
          eq(schema.studentRequests.type, 'document_request'),
        ),
      )
      .limit(1);
    if (!request) return { completed: false };
    const [template] = render.templateId
      ? await this.db
          .select({
            requiresSignOff: schema.documentTemplates.requiresSignOff,
            headerConfig: schema.documentTemplates.headerConfig,
          })
          .from(schema.documentTemplates)
          .where(eq(schema.documentTemplates.id, render.templateId))
          .limit(1)
      : [{ requiresSignOff: false, headerConfig: null }];

    const [existingVault] = await this.db
      .select()
      .from(schema.studentDocumentVault)
      .where(eq(schema.studentDocumentVault.documentRenderId, render.id))
      .limit(1);
    let vault = existingVault;
    if (!vault) {
      const vaultId = randomUUID();
      const verifyCode = this.codeForVault(vaultId);
      const [created] = await this.db
        .insert(schema.studentDocumentVault)
        .values({
          id: vaultId,
          institutionId: request.institutionId,
          studentId: request.studentId,
          requestId: request.id,
          documentRenderId: render.id,
          storageKey: render.storagePath ?? null,
          title: render.title,
          docType: render.docType,
          family: familyFromDocType(render.docType),
          source: 'request',
          templateId: render.templateId,
          templateFingerprint: render.templateFingerprint,
          verifyCode,
          verifyCodeVersion: DOCUMENT_VERIFY_CODE_VERSION,
          issuedBy: render.requestedBy,
        })
        .onConflictDoNothing()
        .returning();
      vault = created;
      if (!vault) {
        [vault] = await this.db
          .select()
          .from(schema.studentDocumentVault)
          .where(eq(schema.studentDocumentVault.documentRenderId, render.id))
          .limit(1);
      }
    }
    if (!vault) throw new Error('Could not create document vault entry');

    if (request.fulfilmentDocumentId !== vault.id) {
      await this.db
        .update(schema.studentRequests)
        .set({ fulfilmentDocumentId: vault.id, updatedAt: new Date() })
        .where(eq(schema.studentRequests.id, request.id));
    }
    if (template?.requiresSignOff || request.status === 'fulfilled') {
      return { completed: true, requestId: request.id };
    }
    if (this.signStepsFromTemplate(template?.headerConfig as Record<string, unknown> | null).length > 0) {
      return { completed: true, requestId: request.id };
    }

    const [fulfilled] = await this.db
      .update(schema.studentRequests)
      .set({ status: 'fulfilled', resolvedAt: new Date(), version: request.version + 1, updatedAt: new Date() })
      .where(
        and(
          eq(schema.studentRequests.id, request.id),
          eq(schema.studentRequests.status, 'approved'),
          eq(schema.studentRequests.version, request.version),
        ),
      )
      .returning();
    if (fulfilled) {
      await this.db
        .update(schema.studentDocumentVault)
        .set({ deliveredAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.studentDocumentVault.id, vault.id));
      const seq = await this.appendEvent(fulfilled, 'fulfilled', 'system', null);
      await this.audit.logAudit({
        actorType: ActorType.System,
        institutionId: fulfilled.institutionId,
        action: 'student_request.fulfil',
        module: 'request-engine',
        entityType: 'student_request',
        entityId: fulfilled.id,
        previousState: { status: 'approved' },
        newState: { status: 'fulfilled', vaultId: vault.id, renderId },
      });
      await this.notifications.dispatch({ institutionId: fulfilled.institutionId, requestId: fulfilled.id, eventSeq: seq });
    }
    return { completed: true, requestId: request.id };
  }

  async listIssuance(ctx: PortalActionContext, query?: { verifyCode?: string; q?: string }) {
    const scope = resolveScopeFilter(ctx.principal, ctx.scope);
    const requestScope = [eq(schema.studentRequests.institutionId, ctx.principal.institutionId)];
    if (scope.campusIds) requestScope.push(inArray(schema.studentRequests.campusId, scope.campusIds));
    const verifyFilter = query?.verifyCode?.trim()
      ? normalizeVerifyCodeInput(query.verifyCode.trim())
      : null;
    const textFilter = query?.q?.trim().toLowerCase();
    const rows = await this.db
      .select({
        vault: schema.studentDocumentVault,
        request: schema.studentRequests,
        render: schema.documentRenders,
        studentName: sql<string>`concat_ws(' ', ${schema.students.firstName}, ${schema.students.middleName}, ${schema.students.lastName})`,
      })
      .from(schema.studentRequests)
      .leftJoin(schema.documentRenders, eq(schema.documentRenders.runId, schema.studentRequests.id))
      .leftJoin(schema.studentDocumentVault, eq(schema.studentDocumentVault.documentRenderId, schema.documentRenders.id))
      .innerJoin(schema.students, eq(schema.students.id, schema.studentRequests.studentId))
      .where(
        and(
          ...requestScope,
          eq(schema.studentRequests.type, 'document_request'),
          eq(schema.studentRequests.status, 'approved'),
        ),
      )
      .orderBy(schema.studentRequests.submittedAt);
    const issued = await this.db
      .select({
        vault: schema.studentDocumentVault,
        request: schema.studentRequests,
        render: schema.documentRenders,
        studentName: sql<string>`concat_ws(' ', ${schema.students.firstName}, ${schema.students.middleName}, ${schema.students.lastName})`,
      })
      .from(schema.studentDocumentVault)
      .innerJoin(schema.studentRequests, eq(schema.studentRequests.id, schema.studentDocumentVault.requestId))
      .innerJoin(schema.documentRenders, eq(schema.documentRenders.id, schema.studentDocumentVault.documentRenderId))
      .innerJoin(schema.students, eq(schema.students.id, schema.studentDocumentVault.studentId))
      .where(
        and(
          ...requestScope,
          eq(schema.studentRequests.type, 'document_request'),
          eq(schema.studentRequests.status, 'fulfilled'),
          isNull(schema.studentDocumentVault.abandonedAt),
        ),
      )
      .orderBy(desc(schema.studentDocumentVault.issuedAt));
    const filterRow = (entry: { vault: typeof schema.studentDocumentVault.$inferSelect | null; studentName: string | null }) => {
      if (!entry.vault) return true;
      if (verifyFilter && entry.vault.verifyCode !== verifyFilter) return false;
      if (textFilter) {
        const hay = `${entry.studentName ?? ''} ${entry.vault.verifyCode} ${entry.vault.title}`.toLowerCase();
        if (!hay.includes(textFilter)) return false;
      }
      return true;
    };
    return {
      items: rows.filter(filterRow),
      issued: issued.filter(filterRow),
    };
  }

  async retryRender(ctx: PortalActionContext, renderId: string) {
    const [render] = await this.db
      .select({ render: schema.documentRenders, requestStatus: schema.studentRequests.status })
      .from(schema.documentRenders)
      .innerJoin(schema.studentRequests, eq(schema.studentRequests.id, schema.documentRenders.runId))
      .where(
        and(
          eq(schema.documentRenders.id, renderId),
          eq(schema.documentRenders.institutionId, ctx.principal.institutionId),
          eq(schema.studentRequests.status, 'approved'),
        ),
      )
      .limit(1);
    if (!render || render.render.status !== 'failed') {
      throw new ConflictException({ code: 'RENDER_NOT_RETRYABLE', message: 'This render is not awaiting a retry.' });
    }
    await this.db
      .update(schema.documentRenders)
      .set({ status: 'queued', errorDetail: null, updatedAt: new Date() })
      .where(eq(schema.documentRenders.id, renderId));
    if (this.jobs.enabled) {
      await this.jobs.enqueue('reports', RENDER_JOB, { renderId });
    } else {
      await this.processor.process(renderId);
      await this.completeRender(renderId);
    }
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action: 'student_request.document_render_retry',
      module: 'request-engine',
      entityType: 'document_render',
      entityId: renderId,
      previousState: { status: 'failed' },
      newState: { status: 'queued' },
    });
    return { queued: true };
  }

  async signAndDeliver(ctx: PortalActionContext, vaultId: string, pickupNote?: string) {
    const { vault, request, render } = await this.requireIssuance(ctx, vaultId);
    const payload = request.payload as unknown as DocumentRequestPayload;
    const deliveryMode = payload.deliveryMode ?? 'digital';
    const [template] = render.templateId
      ? await this.db
          .select()
          .from(schema.documentTemplates)
          .where(eq(schema.documentTemplates.id, render.templateId))
          .limit(1)
      : [null];

    const signSteps = this.signStepsFromTemplate(template?.headerConfig);
    const completed = await this.completedSignSlots(request.id);
    const next = signSteps.find((slot) => !completed.has(slot.slotKey));

    if (next) {
      const roles = ctx.principal.roleKeys ?? [];
      if (next.signRole && roles.length && !roles.includes(next.signRole)) {
        throw new ConflictException({
          code: 'SIGN_ORDER',
          message: `This document awaits signature from ${next.signRole}.`,
        });
      }
      await this.appendEvent(request, 'document_signed', 'staff', ctx.principal.institutionUserId, null, {
        slotKey: next.slotKey,
        label: next.label,
      });
      completed.add(next.slotKey);
      const remaining = signSteps.some((slot) => !completed.has(slot.slotKey));
      if (remaining) {
        await this.audit.logAudit({
          ...basePortalAudit(ctx),
          actorType: ActorType.InstitutionUser,
          action: 'student_request.document_sign_step',
          module: 'request-engine',
          entityType: 'student_request',
          entityId: request.id,
          newState: { vaultId, slotKey: next.slotKey, pending: true },
        });
        return { status: 'signing', slotKey: next.slotKey, vaultId };
      }
    }

    const now = new Date();
    const vaultPatch =
      deliveryMode === 'physical_pickup'
        ? {
            pickupReadyAt: now,
            pickupNote: pickupNote?.trim() || null,
            deliveryMode,
            updatedAt: now,
          }
        : { deliveredAt: now, deliveryMode, updatedAt: now };

    const [fulfilled] = await this.db
      .update(schema.studentRequests)
      .set({
        status: 'fulfilled',
        resolvedAt: now,
        fulfilmentDocumentId: vault.id,
        version: request.version + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.studentRequests.id, request.id),
          eq(schema.studentRequests.status, 'approved'),
          eq(schema.studentRequests.version, request.version),
        ),
      )
      .returning();
    if (!fulfilled) throw this.versionConflict();

    await this.db
      .update(schema.studentDocumentVault)
      .set(vaultPatch)
      .where(eq(schema.studentDocumentVault.id, vault.id));

    const seq = await this.appendEvent(fulfilled, 'fulfilled', 'staff', ctx.principal.institutionUserId, null, {
      deliveryMode,
      pickupNote: pickupNote?.trim() || null,
    });
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action: 'student_request.sign_deliver',
      module: 'request-engine',
      entityType: 'student_request',
      entityId: request.id,
      previousState: { status: 'approved' },
      newState: { status: 'fulfilled', vaultId, deliveryMode },
    });
    await this.notifications.dispatch({ institutionId: request.institutionId, requestId: request.id, eventSeq: seq });
    return { status: 'fulfilled', deliveryMode, vaultId };
  }

  async markCollected(ctx: PortalActionContext, vaultId: string) {
    const [row] = await this.db
      .select({ vault: schema.studentDocumentVault, request: schema.studentRequests })
      .from(schema.studentDocumentVault)
      .innerJoin(schema.studentRequests, eq(schema.studentRequests.id, schema.studentDocumentVault.requestId))
      .where(
        and(
          eq(schema.studentDocumentVault.id, vaultId),
          eq(schema.studentDocumentVault.institutionId, ctx.principal.institutionId),
          eq(schema.studentRequests.status, 'fulfilled'),
          isNull(schema.studentDocumentVault.abandonedAt),
        ),
      )
      .limit(1);
    if (!row?.vault) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Issued document not found.' });
    }
    if (row.vault.deliveryMode !== 'physical_pickup') {
      throw new ConflictException({
        code: 'NOT_PICKUP',
        message: 'Only physical pickup documents can be marked collected.',
      });
    }
    if (row.vault.collectedAt) {
      return row.vault;
    }
    const [updated] = await this.db
      .update(schema.studentDocumentVault)
      .set({
        collectedAt: new Date(),
        collectedBy: ctx.principal.institutionUserId,
        updatedAt: new Date(),
      })
      .where(eq(schema.studentDocumentVault.id, vaultId))
      .returning();
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action: 'student_document.collected',
      module: 'request-engine',
      entityType: 'student_document_vault',
      entityId: vaultId,
    });
    return updated;
  }

  async reissueVault(ctx: PortalActionContext, vaultId: string, reason: string) {
    const [row] = await this.db
      .select({
        vault: schema.studentDocumentVault,
        request: schema.studentRequests,
        render: schema.documentRenders,
      })
      .from(schema.studentDocumentVault)
      .leftJoin(schema.studentRequests, eq(schema.studentRequests.id, schema.studentDocumentVault.requestId))
      .leftJoin(schema.documentRenders, eq(schema.documentRenders.id, schema.studentDocumentVault.documentRenderId))
      .where(
        and(
          eq(schema.studentDocumentVault.id, vaultId),
          eq(schema.studentDocumentVault.institutionId, ctx.principal.institutionId),
          isNull(schema.studentDocumentVault.abandonedAt),
        ),
      )
      .limit(1);
    if (!row?.vault || !row.render) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Document not found.' });
    }
    const newVaultId = randomUUID();
    const verifyCode = this.codeForVault(newVaultId);
    const [created] = await this.db
      .insert(schema.studentDocumentVault)
      .values({
        id: newVaultId,
        institutionId: row.vault.institutionId,
        studentId: row.vault.studentId,
        requestId: row.vault.requestId,
        documentRenderId: row.render.id,
        storageKey: row.render.storagePath ?? row.vault.storageKey,
        title: row.vault.title,
        docType: row.vault.docType,
        family: row.vault.family,
        source: row.vault.source,
        templateId: row.vault.templateId,
        templateFingerprint: row.vault.templateFingerprint,
        verifyCode,
        verifyCodeVersion: DOCUMENT_VERIFY_CODE_VERSION,
        issuedBy: ctx.principal.institutionUserId,
        deliveryMode: row.vault.deliveryMode,
        supersedes: row.vault.id,
        reissueReason: reason,
      })
      .returning();
    await this.db
      .update(schema.studentDocumentVault)
      .set({ supersededBy: newVaultId, updatedAt: new Date() })
      .where(eq(schema.studentDocumentVault.id, row.vault.id));
    if (row.request) {
      await this.db
        .update(schema.studentRequests)
        .set({ fulfilmentDocumentId: newVaultId, updatedAt: new Date() })
        .where(eq(schema.studentRequests.id, row.request.id));
    }
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action: 'student_document.reissue',
      module: 'request-engine',
      entityType: 'student_document_vault',
      entityId: newVaultId,
      previousState: { supersededVaultId: row.vault.id },
      reason,
    });
    return created;
  }

  async sendBack(ctx: PortalActionContext, vaultId: string, note: string) {
    if (note.trim().length < 10) {
      throw new ConflictException({
        code: 'NOTE_TOO_SHORT',
        message: 'Send-back note must be at least 10 characters.',
      });
    }
    const { vault, request, render } = await this.requireIssuance(ctx, vaultId);
    const [updated] = await this.db
      .update(schema.studentRequests)
      .set({
        status: 'in_review',
        fulfilmentDocumentId: null,
        version: request.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.studentRequests.id, request.id),
          eq(schema.studentRequests.status, 'approved'),
          eq(schema.studentRequests.version, request.version),
        ),
      )
      .returning();
    if (!updated) throw this.versionConflict();
    // Tombstone — do not hard-delete; student projection excludes abandoned_at rows.
    await this.db
      .update(schema.studentDocumentVault)
      .set({
        abandonedAt: new Date(),
        deliveredAt: null,
        version: vault.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.studentDocumentVault.id, vault.id));
    await this.db
      .update(schema.documentRenders)
      .set({ status: 'failed', errorDetail: `Sent back: ${note}`, updatedAt: new Date() })
      .where(eq(schema.documentRenders.id, render.id));
    await this.appendEvent(updated, 'note_added', 'staff', ctx.principal.institutionUserId, note, {
      internal: true,
      action: 'issuance_send_back',
      vaultAbandoned: vault.id,
    });
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action: 'student_request.issuance_send_back',
      module: 'request-engine',
      entityType: 'student_request',
      entityId: request.id,
      previousState: { status: 'approved', vaultId },
      newState: { status: 'in_review', abandonedVaultId: vault.id },
      reason: note,
    });
    return updated;
  }

  async revoke(ctx: PortalActionContext, vaultId: string, input: VaultRevokeInput) {
    const [vault] = await this.db
      .update(schema.studentDocumentVault)
      .set({ revokedAt: new Date(), revokedReason: input.reason })
      .where(
        and(
          eq(schema.studentDocumentVault.id, vaultId),
          eq(schema.studentDocumentVault.institutionId, ctx.principal.institutionId),
          isNull(schema.studentDocumentVault.revokedAt),
        ),
      )
      .returning();
    if (!vault) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Issued document not found.' });
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action: 'student_document.revoke',
      module: 'request-engine',
      entityType: 'student_document_vault',
      entityId: vault.id,
      newState: { revokedAt: vault.revokedAt?.toISOString() },
      reason: input.reason,
    });
    return vault;
  }

  async listStudentVault(principal: InstitutionalStudentPrincipal) {
    const rows = await this.db
      .select({ vault: schema.studentDocumentVault, render: schema.documentRenders, requestStatus: schema.studentRequests.status })
      .from(schema.studentDocumentVault)
      .leftJoin(schema.documentRenders, eq(schema.documentRenders.id, schema.studentDocumentVault.documentRenderId))
      .leftJoin(schema.studentRequests, eq(schema.studentRequests.id, schema.studentDocumentVault.requestId))
      .where(
        and(
          eq(schema.studentDocumentVault.institutionId, principal.institutionId),
          eq(schema.studentDocumentVault.studentId, principal.studentId),
          isNull(schema.studentDocumentVault.abandonedAt),
          isNull(schema.studentDocumentVault.supersededBy),
          isNull(schema.studentDocumentVault.revokedAt),
          or(
            and(
              eq(schema.studentDocumentVault.deliveryMode, 'physical_pickup'),
              sql`${schema.studentDocumentVault.pickupReadyAt} IS NOT NULL`,
              isNull(schema.studentDocumentVault.collectedAt),
            ),
            and(
              sql`coalesce(${schema.studentDocumentVault.deliveryMode}, 'digital') <> 'physical_pickup'`,
              sql`${schema.studentDocumentVault.deliveredAt} IS NOT NULL`,
            ),
          ),
          or(isNull(schema.studentDocumentVault.requestId), eq(schema.studentRequests.status, 'fulfilled')),
        ),
      )
      .orderBy(desc(schema.studentDocumentVault.issuedAt));
    return {
      items: rows.map(({ vault, render }) => ({
        ...vault,
        hasFile:
          vault.deliveryMode !== 'physical_pickup' && Boolean(render?.storagePath || vault.storageKey),
        pickupReady: vault.deliveryMode === 'physical_pickup' && Boolean(vault.pickupReadyAt),
      })),
    };
  }

  async studentFile(principal: InstitutionalStudentPrincipal, vaultId: string) {
    const [row] = await this.db
      .select({ vault: schema.studentDocumentVault, render: schema.documentRenders, status: schema.studentRequests.status })
      .from(schema.studentDocumentVault)
      .leftJoin(schema.documentRenders, eq(schema.documentRenders.id, schema.studentDocumentVault.documentRenderId))
      .leftJoin(schema.studentRequests, eq(schema.studentRequests.id, schema.studentDocumentVault.requestId))
      .where(
        and(
          eq(schema.studentDocumentVault.id, vaultId),
          eq(schema.studentDocumentVault.institutionId, principal.institutionId),
          eq(schema.studentDocumentVault.studentId, principal.studentId),
          isNull(schema.studentDocumentVault.abandonedAt),
        ),
      )
      .limit(1);
    const storagePath = row?.render?.storagePath ?? row?.vault.storageKey;
    if (!row || (row.vault.requestId && row.status !== 'fulfilled') || !storagePath) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Document not found.' });
    }
    if (row.vault.revokedAt) {
      throw new ForbiddenException({
        code: 'DOCUMENT_REVOKED',
        message: 'This document has been revoked and is no longer available for download.',
      });
    }
    if (row.vault.deliveryMode === 'physical_pickup') {
      throw new ConflictException({
        code: 'PICKUP_ONLY',
        message: 'This document is for physical pickup only.',
      });
    }
    return { ...row, storagePath, revoked: Boolean(row.vault.revokedAt) };
  }

  async verify(code: string) {
    const started = Date.now();
    const normalized = normalizeVerifyCodeInput(code);
    const notFound = () => {
      // Equalize work for timing
      while (Date.now() - started < 25) {
        /* spin */
      }
      throw new NotFoundException({ code: 'VERIFY_NOT_FOUND', message: 'Document not found' });
    };
    if (!normalized) return notFound();

    const [row] = await this.db
      .select({
        vault: schema.studentDocumentVault,
        issuer: schema.institutions.displayName,
        logo: schema.institutions.logoUrl,
        firstName: schema.students.firstName,
        lastName: schema.students.lastName,
      })
      .from(schema.studentDocumentVault)
      .leftJoin(schema.institutions, eq(schema.institutions.id, schema.studentDocumentVault.institutionId))
      .leftJoin(schema.students, eq(schema.students.id, schema.studentDocumentVault.studentId))
      .where(
        and(
          eq(schema.studentDocumentVault.verifyCode, normalized),
          isNull(schema.studentDocumentVault.abandonedAt),
        ),
      )
      .limit(1);
    if (!row?.vault) return notFound();

    let showFullName = false;
    if (row.vault.institutionId) {
      const [setting] = await this.db
        .select({ value: schema.institutionSettings.value })
        .from(schema.institutionSettings)
        .where(
          and(
            eq(schema.institutionSettings.institutionId, row.vault.institutionId),
            eq(schema.institutionSettings.category, 'documents'),
            eq(schema.institutionSettings.key, 'verify_show_full_name'),
          ),
        )
        .limit(1);
      showFullName = setting?.value === 'true' || setting?.value === '1';
    }

    let status: 'Valid' | 'Revoked' | 'Superseded' = 'Valid';
    if (row.vault.revokedAt) status = 'Revoked';
    else if (row.vault.supersededBy) status = 'Superseded';

    const initials = `${row.firstName?.[0] ?? ''}${row.lastName?.[0] ?? ''}`.toUpperCase() || '—';
    const fullName = showFullName && row.firstName ? `${row.firstName} ${row.lastName ?? ''}`.trim() : null;

    while (Date.now() - started < 25) {
      /* spin */
    }

    return {
      issuerName: row.issuer ?? 'Issuer',
      issuerLogoUrl: row.logo ?? null,
      docTypeLabel: row.vault.title || row.vault.docType,
      studentInitials: initials,
      studentFullName: fullName,
      issueDate: row.vault.issuedAt.toISOString().slice(0, 10),
      status,
    };
  }

  stream(key: string) {
    return this.storage.stream(key);
  }

  /** v1 signer for new vault rows; legacy codes remain lookup-verifiable. */
  private codeForVault(vaultId: string): string {
    const secret = this.env.DOCUMENT_VERIFY_SECRET ?? this.env.SESSION_COOKIE_SECRET;
    return mintDocumentVerifyCode(vaultId, secret, DOCUMENT_VERIFY_CODE_VERSION);
  }

  /** @deprecated legacy request-id codes — kept only for migration-era lookups */
  private codeFor(requestId: string): string {
    return hmacSha256Base64Url(`student-document:${requestId}`, this.env.SESSION_COOKIE_SECRET).slice(0, 12);
  }

  private async requireIssuance(ctx: PortalActionContext, vaultId: string) {
    const [row] = await this.db
      .select({ vault: schema.studentDocumentVault, request: schema.studentRequests, render: schema.documentRenders })
      .from(schema.studentDocumentVault)
      .innerJoin(schema.studentRequests, eq(schema.studentRequests.id, schema.studentDocumentVault.requestId))
      .innerJoin(schema.documentRenders, eq(schema.documentRenders.id, schema.studentDocumentVault.documentRenderId))
      .where(
        and(
          eq(schema.studentDocumentVault.id, vaultId),
          eq(schema.studentDocumentVault.institutionId, ctx.principal.institutionId),
          eq(schema.studentRequests.status, 'approved'),
          isNull(schema.studentDocumentVault.abandonedAt),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Issuance item not found.' });
    return row;
  }

  private async appendEvent(
    request: RequestRow,
    type: string,
    actorKind: 'staff' | 'system',
    actorUserId: string | null,
    note?: string | null,
    data: Record<string, unknown> = {},
  ) {
    const [last] = await this.db
      .select({ value: sql<number>`coalesce(max(${schema.studentRequestEvents.seq}), 0)` })
      .from(schema.studentRequestEvents)
      .where(eq(schema.studentRequestEvents.requestId, request.id));
    const seq = Number(last?.value ?? 0) + 1;
    await this.db.insert(schema.studentRequestEvents).values({
      requestId: request.id,
      institutionId: request.institutionId,
      seq,
      eventType: type,
      actorKind,
      actorUserId,
      actorRole: actorKind === 'system' ? 'system' : request.assignedRole,
      note: note ?? null,
      data,
    });
    return seq;
  }

  private versionConflict() {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This request changed since you loaded it. Reload and try again.',
    });
  }

  private signStepsFromTemplate(headerConfig: Record<string, unknown> | null | undefined): SignatureSlot[] {
    const slots = (headerConfig as { signatureSlots?: SignatureSlot[] } | undefined)?.signatureSlots;
    if (!Array.isArray(slots)) return [];
    return slots
      .filter((slot) => slot?.mode === 'sign_step')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  private async completedSignSlots(requestId: string): Promise<Set<string>> {
    const events = await this.db
      .select({ data: schema.studentRequestEvents.data })
      .from(schema.studentRequestEvents)
      .where(
        and(
          eq(schema.studentRequestEvents.requestId, requestId),
          eq(schema.studentRequestEvents.eventType, 'document_signed'),
        ),
      );
    const completed = new Set<string>();
    for (const event of events) {
      const slotKey = (event.data as { slotKey?: string } | null)?.slotKey;
      if (slotKey) completed.add(slotKey);
    }
    return completed;
  }

  async digilockerManifest(principal: InstitutionalStudentPrincipal) {
    const vault = await this.listStudentVault(principal);
    return {
      version: 1,
      issuer: principal.institutionId,
      documents: vault.items.map((item) => ({
        id: item.id,
        title: item.title,
        docType: item.docType,
        verifyCode: item.verifyCode,
        issuedAt: item.issuedAt,
        downloadable: item.hasFile === true,
      })),
    };
  }

  async listIndependentVault(independentUserId: string) {
    const rows = await this.db
      .select()
      .from(schema.studentDocumentVault)
      .where(
        and(
          eq(schema.studentDocumentVault.independentUserId, independentUserId),
          isNull(schema.studentDocumentVault.abandonedAt),
          isNull(schema.studentDocumentVault.supersededBy),
          isNull(schema.studentDocumentVault.revokedAt),
          sql`${schema.studentDocumentVault.deliveredAt} IS NOT NULL`,
        ),
      )
      .orderBy(desc(schema.studentDocumentVault.issuedAt));
    return {
      items: rows.map((vault) => ({
        ...vault,
        hasFile: Boolean(vault.storageKey),
      })),
    };
  }
}
