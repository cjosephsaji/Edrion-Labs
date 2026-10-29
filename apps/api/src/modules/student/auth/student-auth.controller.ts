import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import {
  independentSignupSchema,
  independentVerifySchema,
  studentActivateSchema,
  studentChangePasswordSchema,
  studentLoginSchema,
  studentResetRequestSchema,
  studentResetSchema,
  type IndependentSignupInput,
  type IndependentVerifyInput,
  type StudentActivateInput,
  type StudentChangePasswordInput,
  type StudentLoginInput,
  type StudentResetInput,
  type StudentResetRequestInput,
} from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../../common/decorators';
import type { EdrionRequestContext } from '../../../common/request-context';
import { zodBody } from '../../../common/zod-validation.pipe';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentSessionService } from '../core/student-session.service';
import { AllowStudentPasswordSetup, CurrentStudentContext } from '../core/student.decorators';
import type { StudentContext } from '../student.types';
import { StudentAuthService } from './student-auth.service';

@ApiTags('student-auth')
@Controller('student/auth')
@Public()
@SkipRateLimit()
export class StudentAuthController {
  constructor(
    private readonly auth: StudentAuthService,
    private readonly sessions: StudentSessionService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(zodBody(studentLoginSchema)) body: StudentLoginInput,
    @ReqContext() req: EdrionRequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, passwordChangeRequired } = await this.auth.login(body, req);
    res.cookie(this.sessions.cookieName, token, this.sessions.cookieOptions());
    return { authenticated: true, passwordChangeRequired };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StudentAuthGuard)
  @AllowStudentPasswordSetup()
  async changePassword(
    @Body(zodBody(studentChangePasswordSchema)) body: StudentChangePasswordInput,
    @CurrentStudentContext() sc: StudentContext,
    @ReqContext() req: EdrionRequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.requireSessionId(sc);
    const { token } = await this.auth.changePassword(sc.principal, body, req);
    res.cookie(this.sessions.cookieName, token, this.sessions.cookieOptions());
    return { passwordChanged: true };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StudentAuthGuard)
  @AllowStudentPasswordSetup()
  async logout(
    @CurrentStudentContext() sc: StudentContext,
    @ReqContext() req: EdrionRequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionId = this.requireSessionId(sc);
    await this.auth.logout(sessionId, sc.principal, req);
    res.clearCookie(this.sessions.cookieName, this.sessions.clearCookieOptions());
    return { loggedOut: true };
  }

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  async activate(
    @Body(zodBody(studentActivateSchema)) body: StudentActivateInput,
    @ReqContext() req: EdrionRequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token } = await this.auth.activate(body, req);
    res.cookie(this.sessions.cookieName, token, this.sessions.cookieOptions());
    return { activated: true };
  }

  @Post('request-reset')
  @HttpCode(HttpStatus.OK)
  async requestReset(
    @Body(zodBody(studentResetRequestSchema)) body: StudentResetRequestInput,
    @ReqContext() req: EdrionRequestContext,
  ) {
    await this.auth.requestReset(body, req);
    return { ok: true };
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  async reset(
    @Body(zodBody(studentResetSchema)) body: StudentResetInput,
    @ReqContext() req: EdrionRequestContext,
  ) {
    await this.auth.resetPassword(body, req);
    return { ok: true };
  }

  @Post('independent/signup')
  @HttpCode(HttpStatus.OK)
  async independentSignup(
    @Body(zodBody(independentSignupSchema)) body: IndependentSignupInput,
    @ReqContext() req: EdrionRequestContext,
  ) {
    return this.auth.independentSignup(body, req);
  }

  @Post('independent/verify')
  @HttpCode(HttpStatus.OK)
  async independentVerify(
    @Body(zodBody(independentVerifySchema)) body: IndependentVerifyInput,
    @ReqContext() req: EdrionRequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token } = await this.auth.independentVerify(body, req);
    res.cookie(this.sessions.cookieName, token, this.sessions.cookieOptions());
    return { verified: true };
  }

  private requireSessionId(sc: StudentContext): string {
    if (!sc.authSessionId) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'No server session (cookie auth required for this action)',
      });
    }
    return sc.authSessionId;
  }
}
