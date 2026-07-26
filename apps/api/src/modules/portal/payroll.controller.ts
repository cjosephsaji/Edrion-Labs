import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createPayrollItemSchema,
  createPayrollRunSchema,
  payrollRunsListQuerySchema,
  updatePayrollItemSchema,
  updatePayrollRunSchema,
  versionedDeleteSchema,
  type CreatePayrollItemInput,
  type CreatePayrollRunInput,
  type PayrollRunsListQuery,
  type UpdatePayrollItemInput,
  type UpdatePayrollRunInput,
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
import { PayrollService } from './payroll.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Payroll API (Phase 7) — payroll runs + per-employee items. Same boundary as the
 * rest of the portal. Reads need payroll.view; mutations need payroll.manage (sensitive). Items are
 * nested under a run.
 */
@ApiTags('portal-payroll')
@Controller('portal/payroll')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PayrollController {
  constructor(private readonly service: PayrollService) {}

  private ctx(
    principal: InstitutionPrincipal,
    scope: InstitutionScope,
    request: EdrionRequestContext,
  ): PortalActionContext {
    return { principal, scope, request };
  }

  @Get('runs')
  @RequireInstitutionPermissions('payroll.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(payrollRunsListQuerySchema)) q: PayrollRunsListQuery,
  ) {
    return this.service.list(this.ctx(p, s, r), q);
  }

  @Post('runs')
  @RequireInstitutionPermissions('payroll.manage')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createPayrollRunSchema)) body: CreatePayrollRunInput,
  ) {
    return this.service.create(this.ctx(p, s, r), body);
  }

  @Patch('runs/:id')
  @RequireInstitutionPermissions('payroll.manage')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updatePayrollRunSchema)) body: UpdatePayrollRunInput,
  ) {
    return this.service.update(this.ctx(p, s, r), id, body);
  }

  @Delete('runs/:id')
  @RequireInstitutionPermissions('payroll.manage')
  delete(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.delete(this.ctx(p, s, r), id, body.version);
  }

  // --- items (per employee) --------------------------------------------------

  @Get('runs/:id/items')
  @RequireInstitutionPermissions('payroll.view')
  listItems(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listItems(this.ctx(p, s, r), id);
  }

  @Post('runs/:id/items')
  @RequireInstitutionPermissions('payroll.manage')
  createItem(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createPayrollItemSchema)) body: CreatePayrollItemInput,
  ) {
    return this.service.createItem(this.ctx(p, s, r), id, body);
  }

  @Patch('runs/:id/items/:itemId')
  @RequireInstitutionPermissions('payroll.manage')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updatePayrollItemSchema)) body: UpdatePayrollItemInput,
  ) {
    return this.service.updateItem(this.ctx(p, s, r), id, itemId, body);
  }

  @Delete('runs/:id/items/:itemId')
  @RequireInstitutionPermissions('payroll.manage')
  deleteItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteItem(this.ctx(p, s, r), id, itemId, body.version);
  }
}
