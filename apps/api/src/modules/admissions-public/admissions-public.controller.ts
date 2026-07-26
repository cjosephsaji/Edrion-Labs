import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import {
  admissionDraftPatchSchema,
  otpRequestSchema,
  otpVerifySchema,
  resumeRequestSchema,
  resumeVerifySchema,
  startAdmissionSchema,
  submitAdmissionSchema,
  submitInfoResponsesSchema,
  type AdmissionDraftPatchInput,
  type OtpRequestInput,
  type OtpVerifyInput,
  type ResumeRequestInput,
  type ResumeVerifyInput,
  type StartAdmissionInput,
  type SubmitAdmissionInput,
  type SubmitInfoResponsesInput,
} from '@edrion/schemas';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import type { EdrionRequestContext } from '../../common/request-context';
import { AdmissionsPublicService } from './admissions-public.service';

const MAX_UPLOAD_BYTES = 26_214_400; // 25 MiB

/** Collect a raw request body into a Buffer, rejecting anything over the cap. */
function readRawBody(req: ExpressRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on('data', (c: Buffer) => {
      if (done) return;
      size += c.length;
      if (size > MAX_UPLOAD_BYTES) {
        done = true;
        req.destroy();
        reject(new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'File exceeds the 25MB limit.' }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => !done && resolve(Buffer.concat(chunks)));
    req.on('error', (e) => !done && reject(e));
  });
}

/**
 * Public parent admission-apply funnel. Unauthenticated (`@Public`) so it bypasses the platform
 * AuthGuard; protected instead by a signed resume token (`x-admission-token`, only its SHA-256
 * hash is stored), the OTP lifecycle, and full server-side re-validation on submit. Mirrors the
 * institution-registration funnel.
 */
@ApiTags('admissions-public')
@Public()
@SkipRateLimit()
@Controller('admissions/apply')
export class AdmissionsPublicController {
  constructor(private readonly service: AdmissionsPublicService) {}

  /** Active institutions accepting applications (minimal public fields). */
  @Get('institutions')
  institutions(@Query('q') q?: string) {
    return this.service.listInstitutions(q);
  }

  /** Campuses / academic years / grade levels for one institution (public, minimal fields). */
  @Get('institutions/:id/options')
  options(@Param('id') id: string) {
    return this.service.institutionOptions(id);
  }

  /** Start a draft application. Returns the resume token the client stores to continue later. */
  @Post()
  start(
    @Body(zodBody(startAdmissionSchema)) body: StartAdmissionInput,
    @ReqContext() ctx: EdrionRequestContext,
  ) {
    return this.service.start(body, ctx);
  }

  /** Best-effort IP-based location guess to pre-fill the funnel. Declared before `:id`. */
  @Get('geo')
  geo(@ReqContext() ctx: EdrionRequestContext) {
    return this.service.geo(ctx);
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
  resume(@Param('id') id: string, @Headers('x-admission-token') token: string) {
    return this.service.getDraft(id, token);
  }

  /** Autosave one or more sections. */
  @Patch(':id')
  patch(
    @Param('id') id: string,
    @Headers('x-admission-token') token: string,
    @Body(zodBody(admissionDraftPatchSchema)) body: AdmissionDraftPatchInput,
    @ReqContext() ctx: EdrionRequestContext,
  ) {
    return this.service.patch(id, token, body, ctx);
  }

  /** Generate + email a verification code for the contact email. */
  @Post(':id/otp')
  requestOtp(
    @Param('id') id: string,
    @Headers('x-admission-token') token: string,
    @Body(zodBody(otpRequestSchema)) body: OtpRequestInput,
    @ReqContext() ctx: EdrionRequestContext,
  ) {
    return this.service.requestOtp(id, token, body.email, ctx);
  }

  /** Verify the code. On success the contact email is marked verified. */
  @Post(':id/otp/verify')
  verifyOtp(
    @Param('id') id: string,
    @Headers('x-admission-token') token: string,
    @Body(zodBody(otpVerifySchema)) body: OtpVerifyInput,
    @ReqContext() ctx: EdrionRequestContext,
  ) {
    return this.service.verifyOtp(id, token, body.code, ctx);
  }

  /** Final submission. Re-validates everything; requires a verified contact email. */
  @Post(':id/submit')
  submit(
    @Param('id') id: string,
    @Headers('x-admission-token') token: string,
    @Body(zodBody(submitAdmissionSchema)) body: SubmitAdmissionInput,
    @ReqContext() ctx: EdrionRequestContext,
  ) {
    return this.service.submit(id, token, body, ctx);
  }

  // ── Info requests (staff-built form the parent fills over a token link) ──────

  /** Load the info-request form definition (token-secured). */
  @Get('info/:requestId')
  getInfoRequest(@Param('requestId') requestId: string, @Headers('x-admission-token') token: string) {
    return this.service.getInfoRequest(requestId, token);
  }

  /** Upload one file for a `file` field (raw binary body; name/type in headers). */
  @Post('info/:requestId/files')
  async uploadInfoFile(
    @Param('requestId') requestId: string,
    @Headers('x-admission-token') token: string,
    @Req() req: ExpressRequest,
  ) {
    const buffer = await readRawBody(req);
    const rawName = req.header('x-file-name');
    const fileName = (rawName ? decodeURIComponent(rawName) : 'upload').split(/[/\\]/).pop()!.slice(0, 255);
    const contentType = req.header('x-file-type')?.slice(0, 160) || null;
    return this.service.uploadInfoFile(requestId, token, fileName, contentType, buffer);
  }

  /** Submit the completed form. Moves the application back to review + emails a confirmation. */
  @Post('info/:requestId/submit')
  submitInfo(
    @Param('requestId') requestId: string,
    @Headers('x-admission-token') token: string,
    @Body(zodBody(submitInfoResponsesSchema)) body: SubmitInfoResponsesInput,
  ) {
    return this.service.submitInfoResponses(requestId, token, body.responses);
  }
}
