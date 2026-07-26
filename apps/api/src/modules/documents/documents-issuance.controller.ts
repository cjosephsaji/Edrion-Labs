import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { ReqContext } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal/portal-permissions.guard';
import {
  CurrentInstitutionPrincipal,
  CurrentScope,
  RequireInstitutionPermissions,
} from '../portal/portal.decorators';
import type { PortalActionContext } from '../portal/portal-action-context';
import { DocumentCatalogService } from './document-catalog.service';
import { DocumentBatchesService } from './document-batches.service';

@ApiTags('portal-documents-issuance')
@Controller('portal/documents/issuance')
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class DocumentsIssuanceController {
  constructor(
    private readonly catalog: DocumentCatalogService,
    private readonly batches: DocumentBatchesService,
  ) {}

  @Get('catalog')
  @RequireInstitutionPermissions('documents.view')
  listCatalog(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.catalog.listForInstitution(this.ctx(principal, scope, request));
  }

  @Post('catalog')
  @RequireInstitutionPermissions('documents.manage')
  upsertCatalog(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Body() body: unknown,
  ) {
    return this.catalog.upsertEntry(this.ctx(principal, scope, request), body as never);
  }

  @Post('batches')
  @RequireInstitutionPermissions('documents.manage')
  createBatch(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Body() body: unknown,
  ) {
    return this.batches.create(this.ctx(principal, scope, request), body);
  }

  @Get('batches/:id')
  @RequireInstitutionPermissions('documents.view')
  getBatch(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('id') id: string,
  ) {
    return this.batches.get(this.ctx(principal, scope, request), id);
  }

  @Post('batches/:id/generate')
  @RequireInstitutionPermissions('documents.manage')
  generateBatch(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('id') id: string,
  ) {
    return this.batches.lockForGeneration(this.ctx(principal, scope, request), id);
  }

  @Post('report-cards/reissue')
  @RequireInstitutionPermissions('documents.manage')
  reissue(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Body() body: unknown,
  ) {
    return this.batches.reissueReportCard(this.ctx(principal, scope, request), body);
  }

  private ctx(
    principal: InstitutionPrincipal,
    scope: InstitutionScope,
    request: EdrionRequestContext,
  ): PortalActionContext {
    return { principal, scope, request };
  }
}
