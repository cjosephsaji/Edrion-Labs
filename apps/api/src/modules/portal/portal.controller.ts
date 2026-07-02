import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { expandEffectiveKeys } from '@edrion/permissions';
import { ALL_INSTITUTION_PERMISSION_KEYS } from '@edrion/permissions/institution';
import { portalGlobalSearchQuerySchema, type PortalGlobalSearchQuery } from '@edrion/schemas';
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
import { PortalRepository } from './portal.repository';
import { PortalDashboardService } from './portal-dashboard.service';
import { PortalSearchService } from './portal-search.service';

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
    private readonly search: PortalSearchService,
  ) {}

  /** The authenticated portal user + their authorisation surface (permissions + scopes). */
  @Get('me')
  async me(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal) {
    const [meta, campuses] = await Promise.all([
      this.repo.getInstitutionMeta(principal.institutionId),
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
      institutionName: meta.name,
      institutionStatus: meta.status,
      onboardingStatus: meta.onboardingStatus,
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

  /**
   * Global search across every directory the caller may view (students, teachers, staff, parents,
   * classes, subjects, departments, grades). No handler-level permission — results are gated
   * per-group inside the service, and confined to the institution + active campus scope.
   */
  @Get('search')
  globalSearch(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Query(zodBody(portalGlobalSearchQuerySchema)) q: PortalGlobalSearchQuery,
  ) {
    return this.search.search({ principal, scope, request }, q);
  }
}
