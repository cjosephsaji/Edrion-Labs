import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  portalAuditExportQuerySchema,
  portalAuditListQuerySchema,
  type PortalAuditExportQuery,
  type PortalAuditListQuery,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import { PortalAuditService } from './portal-audit.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Audit viewer API (Phase 11) — read-only over the tenant's append-only
 * audit_events. Reads need `audit.view`; the CSV export needs the sensitive `audit.export` (and the
 * export is itself audited). Always confined to the principal's institution.
 */
@ApiTags('portal-audit')
@Controller('portal/audit')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalAuditController {
  constructor(private readonly service: PortalAuditService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get()
  @RequireInstitutionPermissions('audit.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(portalAuditListQuerySchema)) q: PortalAuditListQuery,
  ) {
    return this.service.list(this.ctx(p, s, r), q);
  }

  /** Distinct modules + summary counts for the viewer's filters/header. */
  @Get('filters')
  @RequireInstitutionPermissions('audit.view')
  filters(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.filters(this.ctx(p, s, r));
  }

  @Get('export')
  @RequireInstitutionPermissions('audit.export')
  @Header('content-type', 'text/csv')
  async export(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(portalAuditExportQuerySchema)) q: PortalAuditExportQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { csv } = await this.service.export(this.ctx(p, s, r), q);
    res.setHeader('content-disposition', `attachment; filename="audit-export-${Date.now()}.csv"`);
    return csv;
  }
}
