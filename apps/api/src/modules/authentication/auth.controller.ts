import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { expandEffectiveKeys, ALL_PERMISSION_KEYS } from '@edrion/permissions';
import {
  forgotPasswordSchema,
  loginSchema,
  reauthSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type ReauthInput,
  type ResetPasswordInput,
} from '@edrion/schemas';
import type { EmployeePrincipal, PrincipalContext } from '@edrion/auth';
import { CurrentPrincipal, PrincipalCtx, ReqContext } from '../../common/decorators';
import { Public } from '../../common/guards/auth.guard';
import { zodBody } from '../../common/zod-validation.pipe';
import type { EdrionRequestContext } from '../../common/request-context';
import { AuthLoginService } from './auth-login.service';
import { CredentialService } from './credential.service';
import { SessionService } from './session.service';

@ApiTags('authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: AuthLoginService,
    private readonly credentials: CredentialService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Authenticate and set the HTTP-only session cookie. Public (it establishes the session).
   * Body is a verified Supabase access token in production; email-only when AUTH_DEV_LOGIN is on.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async loginHandler(
    @Body(zodBody(loginSchema)) body: LoginInput,
    @ReqContext() req: EdrionRequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token } = await this.login.login(body, req);
    res.cookie(this.sessions.cookieName, token, this.sessions.cookieOptions());
    return { authenticated: true };
  }

  /** Request a password-reset link. Always 200 (never reveals whether the email exists). */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPasswordHandler(
    @Body(zodBody(forgotPasswordSchema)) body: ForgotPasswordInput,
    @ReqContext() req: EdrionRequestContext,
  ) {
    await this.credentials.forgotPassword(body, req);
    return { ok: true };
  }

  /** Complete a password reset with the single-use token from the email link. */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPasswordHandler(
    @Body(zodBody(resetPasswordSchema)) body: ResetPasswordInput,
    @ReqContext() req: EdrionRequestContext,
  ) {
    await this.credentials.resetPassword(body, req);
    return { ok: true };
  }

  /** Strong re-authentication; refreshes the recent-auth window for sensitive actions. */
  @Post('reauth')
  @HttpCode(HttpStatus.OK)
  async reauthHandler(
    @Body(zodBody(reauthSchema)) body: ReauthInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() req: EdrionRequestContext,
  ) {
    await this.login.reauth(body, this.requireSessionId(pc), pc.principal, req);
    return { reauthenticated: true };
  }

  /** Revoke the current session and clear the cookie. */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logoutHandler(
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() req: EdrionRequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.login.logout(this.requireSessionId(pc), pc.principal, req);
    res.clearCookie(this.sessions.cookieName, this.sessions.clearCookieOptions());
    return { loggedOut: true };
  }

  /** The current employee + their effective permissions. Drives UI gating on the client. */
  @Get('me')
  me(@CurrentPrincipal() principal: EmployeePrincipal) {
    return {
      employeeId: principal.employeeId,
      email: principal.email,
      fullName: principal.fullName,
      roleKeys: principal.roleKeys,
      mfaEnrolled: principal.mfaEnrolled,
      permissions: expandEffectiveKeys(principal.permissions, ALL_PERMISSION_KEYS),
    };
  }

  private requireSessionId(pc: PrincipalContext): string {
    if (!pc.authSessionId) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'No server session (cookie auth required for this action)',
      });
    }
    return pc.authSessionId;
  }
}
