import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { InstitutionPrincipal } from '@edrion/auth';
import { samlStartSchema, type SamlStartInput } from '@edrion/schemas';
import { Public, SkipRateLimit } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal/portal-permissions.guard';
import { CurrentInstitutionPrincipal, RequireInstitutionPermissions } from '../portal/portal.decorators';
import { FederationService } from './federation.service';

@ApiTags('portal-auth-saml')
@Controller('portal/auth/saml')
@Public()
@SkipRateLimit()
export class PortalAuthSamlController {
  constructor(private readonly federation: FederationService) {}

  @Post('start')
  @UseGuards(InstitutionAuthGuard)
  start(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @Body(zodBody(samlStartSchema)) body: SamlStartInput,
  ) {
    return this.federation.startSamlLogin(p.institutionId, body.providerId, body.redirectUri);
  }

  @Post('acs')
  async acs(@Req() req: Request, @Res() res: Response) {
    const samlResponse = String(req.body?.SAMLResponse ?? '');
    const relayState = String(req.body?.RelayState ?? '');
    const result = await this.federation.completeSamlAcs(samlResponse, relayState);
    const redirect = new URL(result.redirectUri);
    redirect.searchParams.set('saml', 'complete');
    redirect.searchParams.set('institution_id', result.institutionId);
    if (result.email) redirect.searchParams.set('email', result.email);
    res.redirect(redirect.toString());
  }

  @Get('metadata/:providerId')
  @UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
  @RequireInstitutionPermissions('institution_settings.view')
  async metadata(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @Param('providerId') providerId: string,
    @Res() res: Response,
  ) {
    const xml = await this.federation.getSamlSpMetadata(p.institutionId, providerId);
    res.type('application/xml').send(xml);
  }
}
