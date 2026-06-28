import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { expandEffectiveKeys } from '@edrion/permissions';
import { ALL_INSTITUTION_PERMISSION_KEYS } from '@edrion/permissions/institution';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { SkipRateLimit } from '../../common/decorators';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import {
  CurrentInstitutionPrincipal,
  CurrentScope,
  RequireInstitutionPermissions,
} from './portal.decorators';
import { PortalRepository } from './portal.repository';
import { PortalDashboardService } from './portal-dashboard.service';

/**
 * Institution Portal API. Marked @Public so the platform AuthGuard skips it; the portal guards
 * (InstitutionAuthGuard → InstitutionPermissionsGuard) are the real boundary for tenant requests.
 * Routed under /v1/portal/* to keep it separate from the platform control-plane routes.
 */
@ApiTags('portal')
@Controller('portal')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalController {
  constructor(
    private readonly repo: PortalRepository,
    private readonly dashboard: PortalDashboardService,
  ) {}

  /** The authenticated portal user + their authorisation surface (permissions + scopes). */
  @Get('me')
  async me(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal) {
    const [institutionName, campuses] = await Promise.all([
      this.repo.getInstitutionName(principal.institutionId),
      this.repo.listCampuses(
        principal.institutionId,
        principal.isInstitutionWide ? null : principal.allowedCampusIds,
      ),
    ]);

    return {
      institutionUserId: principal.institutionUserId,
      fullName: principal.fullName,
      email: principal.email,
      institutionId: principal.institutionId,
      institutionName,
      roleKeys: principal.roleKeys,
      permissions: expandEffectiveKeys(principal.permissions, ALL_INSTITUTION_PERMISSION_KEYS),
      isInstitutionWide: principal.isInstitutionWide,
      campuses: campuses.map((c) => ({ id: c.id, name: c.name })),
    };
  }

  /** The adaptive, scope-aware dashboard in a single request. */
  @Get('dashboard')
  @RequireInstitutionPermissions('portal.dashboard.view')
  dashboardView(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
  ) {
    return this.dashboard.build(principal, scope);
  }
}
