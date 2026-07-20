import { Body, Controller, Get, NotFoundException, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import {
  issuanceSendBackSchema,
  portalRequestsListQuerySchema,
  requestApproveSchema,
  requestBulkApproveSchema,
  requestInfoSchema,
  requestNoteSchema,
  requestReassignSchema,
  requestRejectSchema,
  requestVersionSchema,
  vaultRevokeSchema,
  type IssuanceSendBackInput,
  type PortalRequestsListQuery,
  type RequestApproveInput,
  type RequestBulkApproveInput,
  type RequestInfoInput,
  type RequestNoteInput,
  type RequestReassignInput,
  type RequestRejectInput,
  type RequestVersionInput,
  type VaultRevokeInput,
} from '@edrion/schemas';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal/portal-permissions.guard';
import {
  CurrentInstitutionPrincipal,
  CurrentScope,
  RequireInstitutionPermissions,
} from '../portal/portal.decorators';
import type { PortalActionContext } from '../portal/portal-action-context';
import { RequestDocumentService } from './request-document.service';
import { RequestEngineService } from './request-engine.service';

@ApiTags('portal-requests')
@Controller('portal/requests')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalRequestsController {
  constructor(
    private readonly engine: RequestEngineService,
    private readonly documents: RequestDocumentService,
  ) {}

  private ctx(
    principal: InstitutionPrincipal,
    scope: InstitutionScope,
    request: EdrionRequestContext,
  ): PortalActionContext {
    return { principal, scope, request };
  }

  @Get('issuance')
  @RequireInstitutionPermissions('documents.issue')
  issuance(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.documents.listIssuance(this.ctx(principal, scope, request));
  }

  @Post('issuance/:vaultId/deliver')
  @RequireInstitutionPermissions('documents.issue')
  deliver(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('vaultId') vaultId: string,
  ) {
    return this.documents.signAndDeliver(this.ctx(principal, scope, request), vaultId);
  }

  @Post('issuance/render/:renderId/retry')
  @RequireInstitutionPermissions('documents.issue')
  retryRender(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('renderId') renderId: string,
  ) {
    return this.documents.retryRender(this.ctx(principal, scope, request), renderId);
  }

  @Post('issuance/:vaultId/send-back')
  @RequireInstitutionPermissions('documents.issue')
  sendBack(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('vaultId') vaultId: string,
    @Body(zodBody(issuanceSendBackSchema)) body: IssuanceSendBackInput,
  ) {
    return this.documents.sendBack(this.ctx(principal, scope, request), vaultId, body.note);
  }

  @Post('issuance/:vaultId/revoke')
  @RequireInstitutionPermissions('documents.issue')
  revoke(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('vaultId') vaultId: string,
    @Body(zodBody(vaultRevokeSchema)) body: VaultRevokeInput,
  ) {
    return this.documents.revoke(this.ctx(principal, scope, request), vaultId, body);
  }

  @Get('issuance/:vaultId/file')
  @RequireInstitutionPermissions('documents.issue')
  async issuanceFile(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('vaultId') vaultId: string,
    @Res() response: Response,
  ) {
    const item = await this.documents.listIssuance(this.ctx(principal, scope, request));
    const row = [...item.items, ...item.issued].find((entry) => entry.vault?.id === vaultId);
    const storagePath = row?.render?.storagePath;
    if (!storagePath) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Document not found.' });
    }
    response.setHeader('Content-Type', 'application/pdf');
    this.documents.stream(storagePath).pipe(response);
  }

  @Post('bulk-approve')
  @RequireInstitutionPermissions('requests.review')
  bulkApprove(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Body(zodBody(requestBulkApproveSchema)) body: RequestBulkApproveInput,
  ) {
    return this.engine.bulkApprove(this.ctx(principal, scope, request), body);
  }

  @Get()
  @RequireInstitutionPermissions('requests.review')
  list(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Query(zodBody(portalRequestsListQuerySchema)) query: PortalRequestsListQuery,
  ) {
    return this.engine.listPortal(this.ctx(principal, scope, request), query);
  }

  @Get(':id')
  @RequireInstitutionPermissions('requests.review')
  get(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('id') id: string,
  ) {
    return this.engine.getPortal(this.ctx(principal, scope, request), id);
  }

  @Get(':id/attachments/:storageObjectId/file')
  @RequireInstitutionPermissions('requests.review')
  async attachmentFile(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('id') id: string,
    @Param('storageObjectId') storageObjectId: string,
    @Res() response: Response,
  ) {
    const { object, stream } = await this.engine.portalAttachment(
      this.ctx(principal, scope, request),
      id,
      storageObjectId,
    );
    response.setHeader('Content-Type', object.mimeType);
    if (object.filename) response.setHeader('Content-Disposition', `inline; filename="${object.filename.replace(/["\r\n]/g, '')}"`);
    stream.pipe(response);
  }

  @Post(':id/claim')
  @RequireInstitutionPermissions('requests.review')
  claim(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(requestVersionSchema)) body: RequestVersionInput,
  ) {
    return this.engine.claim(this.ctx(principal, scope, request), id, body);
  }

  @Post(':id/unclaim')
  @RequireInstitutionPermissions('requests.review')
  unclaim(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(requestVersionSchema)) body: RequestVersionInput,
  ) {
    return this.engine.unclaim(this.ctx(principal, scope, request), id, body);
  }

  @Post(':id/approve')
  @RequireInstitutionPermissions('requests.review')
  approve(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(requestApproveSchema)) body: RequestApproveInput,
  ) {
    return this.engine.approve(this.ctx(principal, scope, request), id, body);
  }

  @Post(':id/reject')
  @RequireInstitutionPermissions('requests.review')
  reject(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(requestRejectSchema)) body: RequestRejectInput,
  ) {
    return this.engine.reject(this.ctx(principal, scope, request), id, body);
  }

  @Post(':id/request-info')
  @RequireInstitutionPermissions('requests.review')
  requestInfo(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(requestInfoSchema)) body: RequestInfoInput,
  ) {
    return this.engine.requestInfo(this.ctx(principal, scope, request), id, body);
  }

  @Post(':id/reassign')
  @RequireInstitutionPermissions('requests.review')
  reassign(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(requestReassignSchema)) body: RequestReassignInput,
  ) {
    return this.engine.reassign(this.ctx(principal, scope, request), id, body);
  }

  @Post(':id/notes')
  @RequireInstitutionPermissions('requests.review')
  note(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(requestNoteSchema)) body: RequestNoteInput,
  ) {
    return this.engine.addNote(this.ctx(principal, scope, request), id, body);
  }
}
