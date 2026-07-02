import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createPortalDocumentSchema,
  portalDocumentsListQuerySchema,
  updatePortalDocumentSchema,
  versionedDeleteSchema,
  type CreatePortalDocumentInput,
  type PortalDocumentsListQuery,
  type UpdatePortalDocumentInput,
  type VersionedDeleteInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import { DocumentsService } from './documents.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Documents & Policies API (Administration). Reads need `documents.view`;
 * create/update/delete the sensitive `documents.manage`.
 */
@ApiTags('portal-documents')
@Controller('portal/documents')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get()
  @RequireInstitutionPermissions('documents.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(portalDocumentsListQuerySchema)) q: PortalDocumentsListQuery,
  ) {
    return this.svc.list(this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('documents.manage')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createPortalDocumentSchema)) body: CreatePortalDocumentInput,
  ) {
    return this.svc.create(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('documents.manage')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updatePortalDocumentSchema)) body: UpdatePortalDocumentInput,
  ) {
    return this.svc.update(this.ctx(p, s, r), id, body);
  }

  @Delete(':id')
  @RequireInstitutionPermissions('documents.manage')
  remove(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove(this.ctx(p, s, r), id, body.version);
  }
}
