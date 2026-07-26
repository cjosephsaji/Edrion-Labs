import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { InstitutionPrincipal } from '@edrion/auth';
import {
  onerosterCsvImportSchema,
  onerosterRestSyncSchema,
  upsertIdentityProviderSchema,
  type OnerosterCsvImportInput,
  type OnerosterRestSyncInput,
  type UpsertIdentityProviderInput,
} from '@edrion/schemas';
import { Public, SkipRateLimit } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal/portal-permissions.guard';
import { CurrentInstitutionPrincipal, RequireInstitutionPermissions } from '../portal/portal.decorators';
import { FederationService } from './federation.service';

@ApiTags('portal-federation')
@Controller('portal/federation')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalFederationController {
  constructor(private readonly federation: FederationService) {}

  @Get('identity-providers')
  @RequireInstitutionPermissions('institution_settings.view')
  listProviders(@CurrentInstitutionPrincipal() p: InstitutionPrincipal) {
    return this.federation.listProviders(p.institutionId);
  }

  @Post('identity-providers')
  @RequireInstitutionPermissions('institution_settings.manage')
  createProvider(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @Body(zodBody(upsertIdentityProviderSchema)) body: UpsertIdentityProviderInput,
  ) {
    return this.federation.upsertProvider(p.institutionId, body);
  }

  @Get('roster/jobs')
  @RequireInstitutionPermissions('integrations.view')
  rosterJobs(@CurrentInstitutionPrincipal() p: InstitutionPrincipal) {
    return this.federation.listRosterJobs(p.institutionId);
  }

  @Post('roster/oneroster/import')
  @RequireInstitutionPermissions('integrations.view')
  importOneroster(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @Body(zodBody(onerosterCsvImportSchema)) body: OnerosterCsvImportInput,
  ) {
    return this.federation.importOnerosterCsv(p.institutionId, body.csv);
  }

  @Post('roster/clever/sync')
  @RequireInstitutionPermissions('integrations.view')
  syncClever(@CurrentInstitutionPrincipal() p: InstitutionPrincipal) {
    return this.federation.syncClever(p.institutionId);
  }

  @Post('roster/classlink/sync')
  @RequireInstitutionPermissions('integrations.view')
  syncClasslink(@CurrentInstitutionPrincipal() p: InstitutionPrincipal) {
    return this.federation.syncClasslink(p.institutionId);
  }

  @Post('roster/oneroster/sync')
  @RequireInstitutionPermissions('integrations.view')
  syncOnerosterRest(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @Body(zodBody(onerosterRestSyncSchema)) body: OnerosterRestSyncInput,
  ) {
    return this.federation.syncOnerosterRest(p.institutionId, body.baseUrl, body.token);
  }
}
