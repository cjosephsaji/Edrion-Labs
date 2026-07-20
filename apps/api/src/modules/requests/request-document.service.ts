import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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
import type { DocumentRequestPayload, VaultRevokeInput } from '@edrion/schemas';
import QRCode from 'qrcode';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { hmacSha256Base64Url } from '../../common/jwt';
import { JobsService } from '../../common/queue/jobs.service';
import { AttachmentStorageService } from '../portal/attachment-storage.service';
import type { PortalActionContext } from '../portal/portal-action-context';
import { basePortalAudit } from '../portal/portal-action-context';
import { resolveScopeFilter } from '@edrion/auth';
import type { InstitutionalStudentPrincipal } from '../student/student.types';
import { DocumentsGenService, RENDER_JOB } from '../documents/documents-gen.service';
import { DocumentRenderProcessor } from '../documents/document-render.processor';
import { RequestNotifyService } from './request-notify.service';

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
    const out = [];
    for (const docType of ['bonafide', 'transcript']) {
      try {
        const template = await this.assertRequestableTemplate(institutionId, docType);
        out.push({
          docType,
          name: template.name,
          templateId: template.id,
          requiresSignOff: template.requiresSignOff,
          enabled: true,
          reason: null,
        });
      } catch {
        out.push({ docType, name: docType.replace(/_/g, ' '), templateId: null, requiresSignOff: false, enabled: false, reason: 'No active template' });
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
          docType: payload.doc_type,
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
          eq(schema.studentRequests.institutionId, render.institutionId),
          eq(schema.studentRequests.type, 'document_request'),
        ),
      )
      .limit(1);
    if (!request) return { completed: false };
    const [template] = render.templateId
      ? await this.db
          .select({ requiresSignOff: schema.documentTemplates.requiresSignOff })
          .from(schema.documentTemplates)
          .where(eq(schema.documentTemplates.id, render.templateId))
          .limit(1)
      : [{ requiresSignOff: false }];

    const [existingVault] = await this.db
      .select()
      .from(schema.studentDocumentVault)
      .where(eq(schema.studentDocumentVault.documentRenderId, render.id))
      .limit(1);
    let vault = existingVault;
    if (!vault) {
      const [created] = await this.db
        .insert(schema.studentDocumentVault)
        .values({
          institutionId: request.institutionId,
          studentId: request.studentId,
          requestId: request.id,
          documentRenderId: render.id,
          title: render.title,
          docType: render.docType,
          verifyCode: this.codeFor(request.id),
          issuedBy: render.requestedBy,
        })
        .onConflictDoNothing({ target: schema.studentDocumentVault.documentRenderId })
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

  async listIssuance(ctx: PortalActionContext) {
    const scope = resolveScopeFilter(ctx.principal, ctx.scope);
    const requestScope = [eq(schema.studentRequests.institutionId, ctx.principal.institutionId)];
    if (scope.campusIds) requestScope.push(inArray(schema.studentRequests.campusId, scope.campusIds));
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
        ),
      )
      .orderBy(desc(schema.studentDocumentVault.issuedAt));
    return { items: rows, issued };
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

  async signAndDeliver(ctx: PortalActionContext, vaultId: string) {
    const { vault, request } = await this.requireIssuance(ctx, vaultId);
    const [fulfilled] = await this.db
      .update(schema.studentRequests)
      .set({
        status: 'fulfilled',
        resolvedAt: new Date(),
        fulfilmentDocumentId: vault.id,
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
    if (!fulfilled) throw this.versionConflict();
    const seq = await this.appendEvent(fulfilled, 'fulfilled', 'staff', ctx.principal.institutionUserId);
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action: 'student_request.sign_deliver',
      module: 'request-engine',
      entityType: 'student_request',
      entityId: request.id,
      previousState: { status: 'approved' },
      newState: { status: 'fulfilled', vaultId },
    });
    await this.notifications.dispatch({ institutionId: request.institutionId, requestId: request.id, eventSeq: seq });
    return fulfilled;
  }

  async sendBack(ctx: PortalActionContext, vaultId: string, note: string) {
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
    await this.db.delete(schema.studentDocumentVault).where(eq(schema.studentDocumentVault.id, vault.id));
    if (render.storagePath) await this.storage.remove(render.storagePath);
    await this.db
      .update(schema.documentRenders)
      .set({ status: 'failed', storagePath: null, errorDetail: `Sent back: ${note}`, updatedAt: new Date() })
      .where(eq(schema.documentRenders.id, render.id));
    await this.appendEvent(updated, 'note_added', 'staff', ctx.principal.institutionUserId, note, {
      internal: true,
      action: 'issuance_send_back',
    });
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action: 'student_request.issuance_send_back',
      module: 'request-engine',
      entityType: 'student_request',
      entityId: request.id,
      previousState: { status: 'approved', vaultId },
      newState: { status: 'in_review' },
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
      .innerJoin(schema.documentRenders, eq(schema.documentRenders.id, schema.studentDocumentVault.documentRenderId))
      .leftJoin(schema.studentRequests, eq(schema.studentRequests.id, schema.studentDocumentVault.requestId))
      .where(
        and(
          eq(schema.studentDocumentVault.institutionId, principal.institutionId),
          eq(schema.studentDocumentVault.studentId, principal.studentId),
          or(isNull(schema.studentDocumentVault.requestId), eq(schema.studentRequests.status, 'fulfilled')),
        ),
      )
      .orderBy(desc(schema.studentDocumentVault.issuedAt));
    return { items: rows.map(({ vault, render }) => ({ ...vault, hasFile: Boolean(render.storagePath) })) };
  }

  async studentFile(principal: InstitutionalStudentPrincipal, vaultId: string) {
    const [row] = await this.db
      .select({ vault: schema.studentDocumentVault, render: schema.documentRenders, status: schema.studentRequests.status })
      .from(schema.studentDocumentVault)
      .innerJoin(schema.documentRenders, eq(schema.documentRenders.id, schema.studentDocumentVault.documentRenderId))
      .leftJoin(schema.studentRequests, eq(schema.studentRequests.id, schema.studentDocumentVault.requestId))
      .where(
        and(
          eq(schema.studentDocumentVault.id, vaultId),
          eq(schema.studentDocumentVault.institutionId, principal.institutionId),
          eq(schema.studentDocumentVault.studentId, principal.studentId),
        ),
      )
      .limit(1);
    if (!row || (row.vault.requestId && row.status !== 'fulfilled') || !row.render.storagePath) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Document not found.' });
    }
    return row;
  }

  async verify(code: string) {
    const [row] = await this.db
      .select({
        vault: schema.studentDocumentVault,
        issuer: schema.institutions.displayName,
        firstName: schema.students.firstName,
        lastName: schema.students.lastName,
      })
      .from(schema.studentDocumentVault)
      .innerJoin(schema.institutions, eq(schema.institutions.id, schema.studentDocumentVault.institutionId))
      .innerJoin(schema.students, eq(schema.students.id, schema.studentDocumentVault.studentId))
      .where(eq(schema.studentDocumentVault.verifyCode, code))
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Verification code not found.' });
    return {
      issuer: row.issuer,
      studentInitials: `${row.firstName[0] ?? ''}${row.lastName[0] ?? ''}`.toUpperCase(),
      docType: row.vault.docType,
      issueDate: row.vault.issuedAt.toISOString(),
      status: row.vault.revokedAt ? 'revoked' : 'valid',
    };
  }

  stream(key: string) {
    return this.storage.stream(key);
  }

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
}
