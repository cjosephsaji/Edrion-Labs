import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { paginationQuerySchema, type PaginationQuery } from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import { BillingService } from './billing.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Billing API (Administration) — READ-ONLY tenant view of the Edrion plan,
 * subscription and invoices. All routes gated by `billing.view`; no writes in this pass.
 */
@ApiTags('portal-billing')
@Controller('portal/billing')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class BillingController {
  constructor(private readonly svc: BillingService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get('subscription')
  @RequireInstitutionPermissions('billing.view')
  subscription(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.svc.getSubscription(this.ctx(p, s, r));
  }

  @Get('invoices')
  @RequireInstitutionPermissions('billing.view')
  invoices(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(paginationQuerySchema)) q: PaginationQuery,
  ) {
    return this.svc.listInvoices(this.ctx(p, s, r), q);
  }

  @Get('plans')
  @RequireInstitutionPermissions('billing.view')
  plans() {
    return this.svc.listPlans();
  }
}
