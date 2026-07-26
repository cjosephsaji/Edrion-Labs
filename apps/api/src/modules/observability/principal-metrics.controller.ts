import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public, SkipRateLimit } from '../../common/decorators';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal/portal-permissions.guard';
import {
  CurrentInstitutionPrincipal,
  RequireInstitutionPermissions,
} from '../portal/portal.decorators';
import type { InstitutionPrincipal } from '@edrion/auth';
import { PrincipalMetricsService } from './principal-metrics.service';

@ApiTags('portal-principal-metrics')
@Controller('portal/principal-metrics')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PrincipalMetricsController {
  constructor(private readonly metrics: PrincipalMetricsService) {}

  @Get()
  @RequireInstitutionPermissions('dashboard.view')
  list(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Query('as_of') asOf?: string,
  ) {
    return this.metrics.listRollups(principal.institutionId, asOf);
  }
}
