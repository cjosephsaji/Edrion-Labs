import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createFeeInvoiceSchema,
  createFeeStructureSchema,
  feeInvoicesListQuerySchema,
  feeStructuresListQuerySchema,
  recordFeePaymentSchema,
  updateFeeInvoiceSchema,
  updateFeeStructureSchema,
  versionedDeleteSchema,
  type CreateFeeInvoiceInput,
  type CreateFeeStructureInput,
  type FeeInvoicesListQuery,
  type FeeStructuresListQuery,
  type RecordFeePaymentInput,
  type UpdateFeeInvoiceInput,
  type UpdateFeeStructureInput,
  type VersionedDeleteInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import {
  CurrentInstitutionPrincipal,
  CurrentScope,
  RequireInstitutionPermissions,
} from './portal.decorators';
import { FeesService } from './fees.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Fees API (Phase 7) — fee structures, per-student invoices, and payments. Same
 * boundary as the rest of the portal. Reads need fees.view; mutations need fees.manage (sensitive).
 * Payments are nested under an invoice; recording one updates the invoice's balance/status.
 */
@ApiTags('portal-fees')
@Controller('portal/fees')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class FeesController {
  constructor(private readonly service: FeesService) {}

  private ctx(
    principal: InstitutionPrincipal,
    scope: InstitutionScope,
    request: EdrionRequestContext,
  ): PortalActionContext {
    return { principal, scope, request };
  }

  // --- fee structures --------------------------------------------------------

  @Get('structures')
  @RequireInstitutionPermissions('fees.view')
  listStructures(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(feeStructuresListQuerySchema)) q: FeeStructuresListQuery,
  ) {
    return this.service.listStructures(this.ctx(p, s, r), q);
  }

  @Post('structures')
  @RequireInstitutionPermissions('fees.manage')
  createStructure(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createFeeStructureSchema)) body: CreateFeeStructureInput,
  ) {
    return this.service.createStructure(this.ctx(p, s, r), body);
  }

  @Patch('structures/:id')
  @RequireInstitutionPermissions('fees.manage')
  updateStructure(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateFeeStructureSchema)) body: UpdateFeeStructureInput,
  ) {
    return this.service.updateStructure(this.ctx(p, s, r), id, body);
  }

  @Delete('structures/:id')
  @RequireInstitutionPermissions('fees.manage')
  deleteStructure(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteStructure(this.ctx(p, s, r), id, body.version);
  }

  // --- fee invoices ----------------------------------------------------------

  @Get('invoices')
  @RequireInstitutionPermissions('fees.view')
  listInvoices(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(feeInvoicesListQuerySchema)) q: FeeInvoicesListQuery,
  ) {
    return this.service.listInvoices(this.ctx(p, s, r), q);
  }

  @Post('invoices')
  @RequireInstitutionPermissions('fees.manage')
  createInvoice(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createFeeInvoiceSchema)) body: CreateFeeInvoiceInput,
  ) {
    return this.service.createInvoice(this.ctx(p, s, r), body);
  }

  @Patch('invoices/:id')
  @RequireInstitutionPermissions('fees.manage')
  updateInvoice(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateFeeInvoiceSchema)) body: UpdateFeeInvoiceInput,
  ) {
    return this.service.updateInvoice(this.ctx(p, s, r), id, body);
  }

  @Delete('invoices/:id')
  @RequireInstitutionPermissions('fees.manage')
  deleteInvoice(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteInvoice(this.ctx(p, s, r), id, body.version);
  }

  // --- payments (against an invoice) -----------------------------------------

  @Get('invoices/:id/payments')
  @RequireInstitutionPermissions('fees.view')
  listPayments(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listPayments(this.ctx(p, s, r), id);
  }

  @Post('invoices/:id/payments')
  @RequireInstitutionPermissions('fees.manage')
  recordPayment(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(recordFeePaymentSchema)) body: RecordFeePaymentInput,
  ) {
    return this.service.recordPayment(this.ctx(p, s, r), id, body);
  }

  @Delete('invoices/:id/payments/:paymentId')
  @RequireInstitutionPermissions('fees.manage')
  removePayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.removePayment(this.ctx(p, s, r), id, paymentId);
  }
}
