import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { expandEffectiveKeys } from '@edrion/permissions';
import { ALL_INSTITUTION_PERMISSION_KEYS, PERSONA_ORDER } from '@edrion/permissions/institution';
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
import { DashboardPrefsService } from './dashboard/dashboard-prefs.service';
import { PortalSearchService } from './portal-search.service';
import { SettingsService } from './settings.service';
import type { PortalActionContext } from './portal-action-context';

/** Widget ids are validated against the caller's entitled set in DashboardPrefsService.save(). */
const dashboardPrefsSchema = z.object({
  hidden: z.array(z.string()).max(100).default([]),
  pinned: z.array(z.string()).max(100).default([]),
  activePersona: z.enum(PERSONA_ORDER).nullable().default(null),
});

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
    private readonly dashboardPrefs: DashboardPrefsService,
    private readonly search: PortalSearchService,
    private readonly settings: SettingsService,
  ) {}

  /** The authenticated portal user + their authorisation surface (permissions + scopes). */
  @Get('me')
  async me(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
  ) {
    const ctx: PortalActionContext = { principal, scope, request };
    const [meta, campuses, effective] = await Promise.all([
      this.repo.getInstitutionMeta(principal.institutionId),
      this.repo.listCampuses(
        principal.institutionId,
        principal.isInstitutionWide ? null : principal.allowedCampusIds,
      ),
      this.settings.getEffective(ctx),
    ]);

    return {
      institutionUserId: principal.institutionUserId,
      fullName: principal.fullName,
      email: principal.email,
      institutionId: principal.institutionId,
      institutionName: meta.name,
      institutionStatus: meta.status,
      onboardingStatus: meta.onboardingStatus,
      institutionType: meta.type,
      /** ISO 3166-1 alpha-2 — used as the default phone-input country across the portal. */
      institutionCountry: meta.country,
      nomenclature: effective.nomenclature,
      navigation: effective.navigation,
      roleKeys: principal.roleKeys,
      permissions: expandEffectiveKeys(principal.permissions, ALL_INSTITUTION_PERMISSION_KEYS),
      isInstitutionWide: principal.isInstitutionWide,
      campuses: campuses.map((c) => ({ id: c.id, name: c.name })),
    };
  }

  /** The composed, scope-aware dashboard in a single request. */
  @Get('dashboard')
  @RequireInstitutionPermissions('portal.dashboard.view')
  dashboardView(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
  ) {
    return this.dashboard.build(principal, scope);
  }

  /** This user's saved dashboard layout, filtered to widgets they may currently see. */
  @Get('dashboard/prefs')
  @RequireInstitutionPermissions('portal.dashboard.view')
  dashboardPrefsView(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal) {
    return this.dashboardPrefs.get(principal);
  }

  /**
   * Save pin/hide. Rejects any widget id the caller isn't entitled to — preferences are a view
   * filter over an already-authorised set and can only ever subtract from it.
   */
  @Put('dashboard/prefs')
  @RequireInstitutionPermissions('portal.dashboard.view')
  dashboardPrefsSave(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Body(zodBody(dashboardPrefsSchema)) body: z.infer<typeof dashboardPrefsSchema>,
  ) {
    return this.dashboardPrefs.save(principal, body);
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
