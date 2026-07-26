import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import { OnboardingService } from './onboarding.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Onboarding API — the tenant-facing "Getting started" wizard that walks a
 * brand-new institution from Onboarding → Active. Reads need `institution_settings.view`; the
 * task toggle and go-live need the sensitive `institution_settings.manage` (admin-only).
 */
@ApiTags('portal-onboarding')
@Controller('portal/onboarding')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get()
  @RequireInstitutionPermissions('institution_settings.view')
  get(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.getSummary(this.ctx(p, s, r));
  }

  @Post('complete')
  @RequireInstitutionPermissions('institution_settings.manage')
  complete(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.complete(this.ctx(p, s, r));
  }
}
