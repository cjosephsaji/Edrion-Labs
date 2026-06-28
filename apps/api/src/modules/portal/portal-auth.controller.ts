import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import {
  portalLoginSchema,
  portalReauthSchema,
  type PortalLoginInput,
  type PortalReauthInput,
} from '@edrion/schemas';
import { isRecentAuth, recentAuthRemaining, type InstitutionContext } from '@edrion/auth';
import { currentTenantInstitutionId, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import { API_ENV, DATABASE } from '../../common/tokens';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { CurrentInstitutionContext } from './portal.decorators';
import { PortalAuthLoginService } from './portal-auth-login.service';
import { PortalSessionService } from './portal-session.service';

/**
 * Institution-portal authentication (Phase 12). Real session auth for tenant users: a verified
 * Supabase access token (or `{ email }` when PORTAL_AUTH_DEV_LOGIN is on) is exchanged for an
 * HTTP-only portal session cookie. `reauth` refreshes the recent-auth window that gates sensitive
 * actions; `session` introspects the current session (and proves the RLS GUC is bound on this
 * request path). The platform AuthGuard is skipped via @Public; the portal guards are the boundary.
 */
@ApiTags('portal-auth')
@Controller('portal/auth')
@Public()
@SkipRateLimit()
export class PortalAuthController {
  constructor(
    private readonly login: PortalAuthLoginService,
    private readonly sessions: PortalSessionService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  /** Authenticate and set the HTTP-only portal session cookie. Public — it establishes the session. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async loginHandler(
    @Body(zodBody(portalLoginSchema)) body: PortalLoginInput,
    @ReqContext() req: EdrionRequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token } = await this.login.login(body, req);
    res.cookie(this.sessions.cookieName, token, this.sessions.cookieOptions());
    return { authenticated: true };
  }

  /** Strong re-authentication; refreshes the recent-auth window for sensitive actions. */
  @Post('reauth')
  @HttpCode(HttpStatus.OK)
  @UseGuards(InstitutionAuthGuard)
  async reauthHandler(
    @Body(zodBody(portalReauthSchema)) body: PortalReauthInput,
    @CurrentInstitutionContext() ic: InstitutionContext,
    @ReqContext() req: EdrionRequestContext,
  ) {
    await this.login.reauth(body, this.requireSessionId(ic), this.userOf(ic), req);
    return { reauthenticated: true };
  }

  /** Revoke the current session and clear the cookie. */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(InstitutionAuthGuard)
  async logoutHandler(
    @CurrentInstitutionContext() ic: InstitutionContext,
    @ReqContext() req: EdrionRequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.login.logout(this.requireSessionId(ic), this.userOf(ic), req);
    res.clearCookie(this.sessions.cookieName, this.sessions.clearCookieOptions());
    return { loggedOut: true };
  }

  /** Introspect the current portal session — identity, recent-auth freshness, and tenant binding. */
  @Get('session')
  @UseGuards(InstitutionAuthGuard)
  async sessionHandler(@CurrentInstitutionContext() ic: InstitutionContext) {
    const p = ic.principal;
    const window = this.env.RECENT_AUTH_WINDOW_SECONDS;
    // Proves the RLS GUC is set on the portal request path: the value read inside this request's
    // tenant transaction must equal the principal's institution id.
    const boundInstitutionId = await currentTenantInstitutionId(this.db);
    return {
      institutionUserId: p.institutionUserId,
      institutionId: p.institutionId,
      email: p.email,
      fullName: p.fullName,
      mfaEnrolled: p.mfaEnrolled,
      hasServerSession: Boolean(ic.authSessionId),
      recentAuth: isRecentAuth(p.lastAuthAt, window),
      recentAuthRemainingSeconds: recentAuthRemaining(p.lastAuthAt, window),
      tenantBound: boundInstitutionId === p.institutionId,
    };
  }

  private requireSessionId(ic: InstitutionContext): string {
    if (!ic.authSessionId) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'No server session (cookie auth required for this action)',
      });
    }
    return ic.authSessionId;
  }

  private userOf(ic: InstitutionContext) {
    return {
      id: ic.principal.institutionUserId,
      institutionId: ic.principal.institutionId,
      fullName: ic.principal.fullName,
      mfaEnrolled: ic.principal.mfaEnrolled,
    };
  }
}
