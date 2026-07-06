import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  draftPatchSchema,
  otpRequestSchema,
  otpVerifySchema,
  resumeRequestSchema,
  resumeVerifySchema,
  startRegistrationSchema,
  submitRegistrationSchema,
  type DraftPatchInput,
  type OtpRequestInput,
  type OtpVerifyInput,
  type ResumeRequestInput,
  type ResumeVerifyInput,
  type StartRegistrationInput,
  type SubmitRegistrationInput,
} from '@edrion/schemas';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import type { EdrionRequestContext } from '../../common/request-context';
import { RegistrationService } from './registration.service';

/**
 * Public institution-registration funnel. Unauthenticated (`@Public`) so it bypasses the platform
 * AuthGuard; protected instead by a signed resume token (`x-registration-token`), the OTP lifecycle,
 * and full server-side re-validation.
 */
@ApiTags('registration')
@Public()
@SkipRateLimit()
@Controller('registration')
export class PublicRegistrationController {
  constructor(private readonly service: RegistrationService) {}

  /** Start a draft application. Returns the resume token the client stores to continue later. */
  @Post()
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

  /** Best-effort IP-based location guess to pre-fill the funnel. Declared before `:id`. */
  @Get('geo')
  geo(@ReqContext() ctx: EdrionRequestContext) {
    return this.service.detectLocation(ctx);
  }

  /** Cross-device resume — email a code to the draft owning this address. Declared before `:id`. */
  @Post('resume')
  resumeRequest(
    @Body(zodBody(resumeRequestSchema)) body: ResumeRequestInput,
    @ReqContext() ctx: EdrionRequestContext,
  ) {
    return this.service.resumeRequest(body, ctx);
  }

  /** Cross-device resume — verify the code, returning a fresh resume token + the draft. */
  @Post('resume/verify')
  resumeVerify(
    @Body(zodBody(resumeVerifySchema)) body: ResumeVerifyInput,
    @ReqContext() ctx: EdrionRequestContext,
  ) {
    return this.service.resumeVerify(body, ctx);
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
  submit(
    @Param('id') id: string,
    @Headers('x-registration-token') token: string,
    @Body(zodBody(submitRegistrationSchema)) body: SubmitRegistrationInput,
    @ReqContext() ctx: EdrionRequestContext,
  ) {
    return this.service.submit(id, token, body, ctx);
  }
}
