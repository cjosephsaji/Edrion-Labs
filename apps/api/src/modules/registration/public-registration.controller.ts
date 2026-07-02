import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  draftPatchSchema,
  otpRequestSchema,
  otpVerifySchema,
  startRegistrationSchema,
  submitRegistrationSchema,
  type DraftPatchInput,
  type OtpRequestInput,
  type OtpVerifyInput,
  type StartRegistrationInput,
  type SubmitRegistrationInput,
} from '@edrion/schemas';
import { Public } from '../../common/guards/auth.guard';
import { RateLimit, ReqContext } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import type { EdrionRequestContext } from '../../common/request-context';
import { RegistrationService } from './registration.service';

/**
 * Public institution-registration funnel. Unauthenticated (`@Public`) so it bypasses the platform
 * AuthGuard; protected instead by the global IP rate-limiter (tightened per-handler here), a signed
 * resume token (`x-registration-token`), the OTP lifecycle, and full server-side re-validation.
 */
@ApiTags('registration')
@Public()
@Controller('registration')
export class PublicRegistrationController {
  constructor(private readonly service: RegistrationService) {}

  /** Start a draft application. Returns the resume token the client stores to continue later. */
  @Post()
  @RateLimit(10)
  start(
    @Body(zodBody(startRegistrationSchema)) body: StartRegistrationInput,
    @ReqContext() ctx: EdrionRequestContext,
  ) {
    return this.service.startDraft(body, ctx);
  }

  /** Published plan catalogue for the funnel picker. Declared before `:id` so it isn't shadowed. */
  @Get('plans')
  plans() {
    return this.service.listPublicPlans();
  }

  /** Resume a draft (the signed token must match this id). */
  @Get(':id')
  resume(@Param('id') id: string, @Headers('x-registration-token') token: string) {
    return this.service.getDraft(id, token);
  }

  /** Autosave one or more sections. */
  @Patch(':id')
  patch(
    @Param('id') id: string,
    @Headers('x-registration-token') token: string,
    @Body(zodBody(draftPatchSchema)) body: DraftPatchInput,
    @ReqContext() ctx: EdrionRequestContext,
  ) {
    return this.service.patchDraft(id, token, body, ctx);
  }

  /** Generate + email a verification code for the contact email. */
  @Post(':id/otp')
  @RateLimit(5)
  requestOtp(
    @Param('id') id: string,
    @Headers('x-registration-token') token: string,
    @Body(zodBody(otpRequestSchema)) body: OtpRequestInput,
    @ReqContext() ctx: EdrionRequestContext,
  ) {
    return this.service.requestOtp(id, token, body, ctx);
  }

  /** Verify the code. On success the contact email is marked verified. */
  @Post(':id/otp/verify')
  @RateLimit(10)
  verifyOtp(
    @Param('id') id: string,
    @Headers('x-registration-token') token: string,
    @Body(zodBody(otpVerifySchema)) body: OtpVerifyInput,
    @ReqContext() ctx: EdrionRequestContext,
  ) {
    return this.service.verifyOtp(id, token, body, ctx);
  }

  /** Final submission. Re-validates everything; requires a verified contact email. */
  @Post(':id/submit')
  @RateLimit(5)
  submit(
    @Param('id') id: string,
    @Headers('x-registration-token') token: string,
    @Body(zodBody(submitRegistrationSchema)) body: SubmitRegistrationInput,
    @ReqContext() ctx: EdrionRequestContext,
  ) {
    return this.service.submit(id, token, body, ctx);
  }
}
