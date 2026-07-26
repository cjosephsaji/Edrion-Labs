import { Body, Controller, Get, Inject, Injectable, NotFoundException, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response as ExpressResponse } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, schema, type Database } from '@edrion/database';
import { resolveScopeFilter } from '@edrion/auth';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import type { ApiEnv } from '@edrion/config';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { AdmissionInfoFileRef, AdmissionInfoRequest } from '@edrion/database';
import { createInfoRequestSchema, type CreateInfoRequestInput } from '@edrion/schemas';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { emailButton, emailLayout } from '../../common/email-templates';
import { EmailService } from './email.service';
import { AttachmentStorageService } from './attachment-storage.service';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

/** Strip the secret hash before returning a request to staff. */
function sanitize(r: AdmissionInfoRequest) {
  const { resumeTokenHash: _omit, ...rest } = r;
  return rest;
}

/**
 * STAFF side of admission info-requests: build a custom form, send the applicant a token-secured link,
 * and review their responses. Creating a request moves the application to `info_requested` and emails
 * the applicant. Gated by `admissions.view` (read) / `admissions.manage` (create).
 */
@Injectable()
export class AdmissionInfoService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly email: EmailService,
    private readonly storage: AttachmentStorageService,
  ) {}

  async create(ctx: PortalActionContext, appId: string, input: CreateInfoRequestInput) {
    const app = await this.requireApp(ctx, appId);
    const token = randomBytes(32).toString('base64url');
    const [row] = await this.db
      .insert(schema.admissionInfoRequests)
      .values({
        institutionId: ctx.principal.institutionId,
        applicationId: appId,
        status: 'open',
        message: input.message ?? null,
        fields: input.fields,
        resumeTokenHash: createHash('sha256').update(token).digest('hex'),
        contactEmail: app.email,
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
        createdBy: ctx.principal.institutionUserId,
      })
      .returning();
    // Move the application into "info requested" so the pipeline reflects we're waiting on the parent.
    await this.db
      .update(schema.admissionApplications)
      .set({ status: 'info_requested', updatedBy: ctx.principal.institutionUserId, updatedAt: new Date() })
      .where(eq(schema.admissionApplications.id, appId));

    const link = `${this.env.REGISTRATION_WEB_URL}/apply/info/${row!.id}?token=${token}`;
    if (app.email) {
      const text = `Hello,\n\nThe admissions team needs a little more information to continue reviewing application ${app.applicationNo}.\n\nPlease complete the secure form here:\n${link}\n\n${input.message ?? ''}\n\nThank you.`;
      const html = emailLayout({
        heading: 'Additional information needed',
        preheader: `Application ${app.applicationNo}`,
        footer:
          "You're receiving this because you submitted an admission application through Edrion. If this wasn't you, you can safely ignore it.",
        bodyHtml: `<p style="margin:0 0 16px;">The admissions team needs a little more information to continue reviewing application <strong>${app.applicationNo}</strong>.</p>
          ${input.message ? `<p style="margin:0 0 16px;">${input.message}</p>` : ''}
          <p style="margin:0 0 18px;">Please complete the secure form below to provide the requested details.</p>
          ${emailButton(link, 'Complete the secure form')}`,
      });
      await this.email
        .send({
          to: app.email,
          subject: `Additional information needed for your application ${app.applicationNo}`,
          text,
          html,
        })
        .catch(() => undefined);
    }
    await this.write(ctx, 'admission.info_requested', row!.id, appId, { newState: { fields: input.fields.length } });
    return { request: sanitize(row!), link };
  }

  async list(ctx: PortalActionContext, appId: string) {
    await this.requireApp(ctx, appId);
    const rows = await this.db
      .select()
      .from(schema.admissionInfoRequests)
      .where(and(eq(schema.admissionInfoRequests.applicationId, appId), eq(schema.admissionInfoRequests.institutionId, ctx.principal.institutionId)))
      .orderBy(desc(schema.admissionInfoRequests.createdAt));
    return { items: rows.map(sanitize) };
  }

  /** Stream a file a parent uploaded in a response (staff review). The key must belong to the request. */
  async downloadFile(ctx: PortalActionContext, requestId: string, storageKey: string, res: ExpressResponse) {
    const [row] = await this.db
      .select()
      .from(schema.admissionInfoRequests)
      .where(and(eq(schema.admissionInfoRequests.id, requestId), eq(schema.admissionInfoRequests.institutionId, ctx.principal.institutionId)))
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Request not found' });
    const files = this.allFiles(row.responses ?? {});
    const file = files.find((f) => f.storageKey === storageKey);
    if (!file) throw new NotFoundException({ code: 'NOT_FOUND', message: 'File not found' });
    res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName.replace(/"/g, '')}"`);
    this.storage.stream(file.storageKey).pipe(res);
  }

  private allFiles(responses: Record<string, unknown>): AdmissionInfoFileRef[] {
    const out: AdmissionInfoFileRef[] = [];
    for (const v of Object.values(responses)) {
      if (Array.isArray(v)) for (const item of v) if (item && typeof item === 'object' && 'storageKey' in item) out.push(item as AdmissionInfoFileRef);
    }
    return out;
  }

  private async requireApp(ctx: PortalActionContext, appId: string) {
    const [app] = await this.db
      .select()
      .from(schema.admissionApplications)
      .where(and(eq(schema.admissionApplications.id, appId), eq(schema.admissionApplications.institutionId, ctx.principal.institutionId)))
      .limit(1);
    if (!app) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Application not found' });
    const f = resolveScopeFilter(ctx.principal, ctx.scope);
    if (f.campusIds !== null && app.campusId !== null && !f.campusIds.includes(app.campusId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found in the current scope' });
    }
    return app;
  }

  private async write(ctx: PortalActionContext, action: string, entityId: string, appId: string, extra: Partial<AuditEventInput> = {}) {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: 'portal-admission-info',
      entityType: 'admission_info_request',
      entityId,
      ...extra,
      metadata: { applicationId: appId },
    } as AuditEventInput);
  }
}

@ApiTags('portal-admission-info')
@Controller('portal/admissions')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class AdmissionInfoController {
  constructor(private readonly svc: AdmissionInfoService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Post(':id/info-requests')
  @RequireInstitutionPermissions('admissions.manage')
  create(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createInfoRequestSchema)) body: CreateInfoRequestInput,
  ) {
    return this.svc.create(this.ctx(p, s, r), id, body);
  }

  @Get(':id/info-requests')
  @RequireInstitutionPermissions('admissions.view')
  list(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.svc.list(this.ctx(p, s, r), id);
  }

  @Get('info-requests/:requestId/file')
  @RequireInstitutionPermissions('admissions.view')
  download(
    @Param('requestId') requestId: string,
    @Query('key') storageKey: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Res() res: ExpressResponse,
  ) {
    return this.svc.downloadFile(this.ctx(p, s, r), requestId, storageKey ?? '', res);
  }
}
