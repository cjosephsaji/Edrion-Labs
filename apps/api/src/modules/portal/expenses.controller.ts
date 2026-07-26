import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createExpenseSchema,
  expensesListQuerySchema,
  updateExpenseSchema,
  versionedDeleteSchema,
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
import { ExpensesService } from './expenses.service';
import type { CrudListQuery } from './portal-crud.engine';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal School Expenses API (money out; Finance Manager). Reads gated by
 * `expenses.view`; every write by the sensitive `expenses.manage`. Tenancy + campus scope come from
 * the principal/scope, never the body.
 */
@ApiTags('portal-expenses')
@Controller('portal/expenses')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class ExpensesController {
  constructor(private readonly svc: ExpensesService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get()
  @RequireInstitutionPermissions('expenses.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(expensesListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('expenses', this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('expenses.manage')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createExpenseSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('expenses', this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('expenses.manage')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateExpenseSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('expenses', this.ctx(p, s, r), id, body);
  }

  @Delete(':id')
  @RequireInstitutionPermissions('expenses.manage')
  remove(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('expenses', this.ctx(p, s, r), id, body.version);
  }
}
