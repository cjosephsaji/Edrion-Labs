import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createDocumentBatchSchema,
  documentBatchActionSchema,
  manualUploadMapSchema,
  type CreateDocumentBatchInput,
  type ManualUploadMapInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal/portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from '../portal/portal.decorators';
import type { PortalActionContext } from '../portal/portal-action-context';
import { DocumentBatchService } from './document-batch.service';

@ApiTags('portal-document-batches')
@Controller('portal/document-batches')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class DocumentBatchController {
  constructor(private readonly svc: DocumentBatchService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Post()
  @RequireInstitutionPermissions('documents.issue')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createDocumentBatchSchema)) body: CreateDocumentBatchInput,
  ) {
    return this.svc.create(this.ctx(p, s, r), body);
  }

  @Get(':id')
  @RequireInstitutionPermissions('documents.issue')
  get(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('id') id: string,
  ) {
    return this.svc.get(this.ctx(p, s, r), id);
  }

  @Post(':id/preview')
  @RequireInstitutionPermissions('documents.issue')
  preview(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(documentBatchActionSchema)) body: { version: number },
  ) {
    return this.svc.previewSamples(this.ctx(p, s, r), id, body.version);
  }

  @Post(':id/generate')
  @RequireInstitutionPermissions('documents.issue')
  generate(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(documentBatchActionSchema)) body: { version: number; acknowledgePreview?: boolean },
  ) {
    return this.svc.generate(this.ctx(p, s, r), id, body.version, body.acknowledgePreview ?? false);
  }

  @Post(':id/cancel')
  @RequireInstitutionPermissions('documents.issue')
  cancel(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(documentBatchActionSchema)) body: { version: number },
  ) {
    return this.svc.cancel(this.ctx(p, s, r), id, body.version);
  }

  @Post(':id/retry-failed')
  @RequireInstitutionPermissions('documents.issue')
  retry(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(documentBatchActionSchema)) body: { version: number },
  ) {
    return this.svc.retryFailed(this.ctx(p, s, r), id, body.version);
  }

  @Post(':id/manual-upload')
  @RequireInstitutionPermissions('documents.issue')
  manualUpload(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(manualUploadMapSchema)) body: ManualUploadMapInput,
  ) {
    return this.svc.mapManualUpload(this.ctx(p, s, r), id, body);
  }
}

export const BATCH_RENDER_COMPLETE_JOB = 'documents.batch_render_completed';
