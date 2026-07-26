import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { InstitutionPrincipal } from '@edrion/auth';
import { oidcCallbackSchema, oidcStartSchema, type OidcStartInput } from '@edrion/schemas';
import { Public, SkipRateLimit } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { CurrentInstitutionPrincipal } from '../portal/portal.decorators';
import { FederationService } from './federation.service';

@ApiTags('portal-auth-oidc')
@Controller('portal/auth/oidc')
@Public()
@SkipRateLimit()
export class PortalAuthOidcController {
  constructor(private readonly federation: FederationService) {}

  @Post('start')
  @UseGuards(InstitutionAuthGuard)
  start(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @Body(zodBody(oidcStartSchema)) body: OidcStartInput,
  ) {
    return this.federation.startOidcLogin(p.institutionId, body.providerId, body.redirectUri);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const query = oidcCallbackSchema.parse({ code, state });
    const result = await this.federation.completeOidcCallback(query.code, query.state);
    const redirect = new URL(result.redirectUri);
    redirect.searchParams.set('oidc', 'complete');
    redirect.searchParams.set('institution_id', result.institutionId);
    if (result.idToken) redirect.searchParams.set('has_id_token', '1');
    res.redirect(redirect.toString());
  }
}
