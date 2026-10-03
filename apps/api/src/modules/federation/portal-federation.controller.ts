import { Body, Controller, Get, Header, Headers, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import {
  onerosterCsvImportSchema,
  onerosterRestSyncSchema,
  upsertIdentityProviderSchema,
  type OnerosterCsvImportInput,
  type OnerosterRestSyncInput,
  type UpsertIdentityProviderInput,
  providerMappingInputSchema, providerMappingKeySchema, PROVIDER_MAPPING_VERSION,
  type ProviderMappingInput,
} from '@edrion/schemas';
import { Public, ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal/portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from '../portal/portal.decorators';
import { FederationService } from './federation.service';
import { ProviderMappingsService } from '../integrations/provider-mappings.service';
import { z } from 'zod';

@ApiTags('portal-federation')
@Controller('portal/federation')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalFederationController {
  constructor(private readonly federation: FederationService, private readonly mappings: ProviderMappingsService) {}

  @Put('identity-providers/:id/mappings')
  @Header('Cache-Control', 'private, no-store')
  @RequireInstitutionPermissions('integrations.mappings.manage')
  writeMapping(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Body(zodBody(providerMappingInputSchema)) body: ProviderMappingInput,
  ) {
    return this.mappings.write({ principal: p, scope, request }, id, body);
  }

  @Post('identity-providers/:id/mappings/resolve')
  @Header('Cache-Control', 'private, no-store')
  @RequireInstitutionPermissions('integrations.view')
  readMapping(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Body(zodBody(providerMappingKeySchema)) body: z.infer<typeof providerMappingKeySchema>,
  ) {
    return this.mappings.read({ principal: p, scope, request }, id, body);
  }

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
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'x-petros-provider-mapping')
  @RequireInstitutionPermissions('integrations.view')
  rosterJobs(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @Headers('x-petros-provider-mapping') version?: string) {
    return this.federation.listRosterJobs(p.institutionId, version === PROVIDER_MAPPING_VERSION);
  }

  @Post('roster/oneroster/import')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'x-petros-provider-mapping')
  @RequireInstitutionPermissions('integrations.view')
  importOneroster(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Body(zodBody(onerosterCsvImportSchema)) body: OnerosterCsvImportInput,
    @Headers('x-petros-provider-mapping') version?: string,
  ) {
    return this.federation.importOnerosterCsv(p.institutionId, body.csv, { principal: p, scope, request }, body.mappingContext, version === PROVIDER_MAPPING_VERSION);
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
