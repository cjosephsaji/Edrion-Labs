import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import type { ApiEnv } from '@edrion/config';
import type { PrincipalContext } from '@edrion/auth';
import {
  confirmPetrosHandwritingSchema,
  confirmPetrosQuestionSchema,
  createPetrosMediaIntentSchema,
  petrosModalityClientEventSchema,
  petrosModalityDashboardQuerySchema,
  petrosMediaTransformSchema,
  processPetrosMediaSchema,
  startPetrosFiveMinuteSchema,
  startPetrosVoiceSessionSchema,
  submitPetrosVoiceTurnSchema,
  type ConfirmPetrosHandwritingInput,
  type ConfirmPetrosQuestionInput,
  type CreatePetrosMediaIntentInput,
  type PetrosModalityClientEventInput,
  type PetrosModalityDashboardQuery,
  type ProcessPetrosMediaInput,
  type StartPetrosFiveMinuteInput,
  type StartPetrosVoiceSessionInput,
  type SubmitPetrosVoiceTurnInput,
} from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import {
  PrincipalCtx,
  ReqContext,
  RequirePermissions,
  SkipRateLimit,
} from '../../../common/decorators';
import type { EdrionRequestContext } from '../../../common/request-context';
import { zodBody } from '../../../common/zod-validation.pipe';
import { API_ENV } from '../../../common/tokens';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import {
  CurrentStudent,
  RequireStudentPermissions,
  StudentRateLimit,
} from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { PetrosInputModesService } from './petros-input-modes.service';

function readRawBody(req: Request, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > max) {
        done = true;
        req.destroy();
        reject(new BadRequestException({ code: 'PETROS_MEDIA_TOO_LARGE', message: 'The media exceeds the configured upload limit.' }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => !done && resolve(Buffer.concat(chunks)));
    req.on('error', (error) => !done && reject(error));
  });
}

@ApiTags('student-petros-input-modes')
@Controller('student/petros')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard, StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use')
@StudentRateLimit(40, 60)
export class StudentPetrosInputModesController {
  constructor(
    private readonly service: PetrosInputModesService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  private principal(raw: StudentPrincipal) {
    requireInstitutional(raw);
    return raw;
  }

  @Post('media/intents')
  createIntent(
    @CurrentStudent() raw: StudentPrincipal,
    @Body(zodBody(createPetrosMediaIntentSchema)) body: CreatePetrosMediaIntentInput,
  ) {
    return this.service.createMediaIntent(this.principal(raw), body);
  }

  @Put('media/:mediaId/content')
  async upload(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('mediaId') mediaId: string,
    @Query('idempotencyKey') idempotencyKey: string,
    @Query('rotationDegrees') rotation: string | undefined,
    @Query('crop') cropRaw: string | undefined,
    @Req() req: Request,
  ) {
    const principal = this.principal(raw);
    const transform = petrosMediaTransformSchema.parse({
      rotationDegrees: rotation == null ? 0 : Number(rotation),
      crop: cropRaw ? JSON.parse(cropRaw) : null,
    });
    if (!idempotencyKey) throw new BadRequestException({ code: 'PETROS_MEDIA_IDEMPOTENCY_REQUIRED', message: 'An idempotency key is required.' });
    const buffer = await readRawBody(req, Math.max(this.env.PETROS_MEDIA_MAX_AUDIO_BYTES, this.env.PETROS_MEDIA_MAX_IMAGE_BYTES) + 1);
    return this.service.uploadContent(principal, mediaId, buffer, { idempotencyKey, transform });
  }

  @Get('media/:mediaId')
  read(@CurrentStudent() raw: StudentPrincipal, @Param('mediaId') mediaId: string) {
    return this.service.read(this.principal(raw), mediaId);
  }

  @Post('media/:mediaId/process')
  process(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('mediaId') mediaId: string,
    @Body(zodBody(processPetrosMediaSchema)) body: ProcessPetrosMediaInput,
  ) {
    return this.service.process(this.principal(raw), mediaId, body);
  }

  @Post('media/:mediaId/confirm-question')
  confirmQuestion(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('mediaId') mediaId: string,
    @Body(zodBody(confirmPetrosQuestionSchema)) body: ConfirmPetrosQuestionInput,
  ) {
    return this.service.confirmQuestion(this.principal(raw), mediaId, body);
  }

  @Post('media/:mediaId/confirm-handwriting')
  confirmHandwriting(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('mediaId') mediaId: string,
    @Body(zodBody(confirmPetrosHandwritingSchema)) body: ConfirmPetrosHandwritingInput,
  ) {
    return this.service.confirmHandwriting(this.principal(raw), mediaId, body);
  }

  @Get('media/:mediaId/access')
  access(@CurrentStudent() raw: StudentPrincipal, @Param('mediaId') mediaId: string) {
    return this.service.access(this.principal(raw), mediaId);
  }

  @Get('media/:mediaId/content')
  async content(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('mediaId') mediaId: string,
    @Query('expires') expiresRaw: string,
    @Query('token') token: string,
    @Res() response: Response,
  ) {
    const result = await this.service.stream(this.principal(raw), mediaId, Number(expiresRaw), token);
    response.setHeader('Content-Type', result.row.mimeType);
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('Content-Disposition', 'inline');
    result.stream.pipe(response);
  }

  @Post('media/:mediaId/cancel')
  cancel(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('mediaId') mediaId: string,
    @Body(zodBody(processPetrosMediaSchema)) body: ProcessPetrosMediaInput,
  ) {
    return this.service.cancel(this.principal(raw), mediaId, body.idempotencyKey);
  }

  @Delete('media/:mediaId')
  delete(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('mediaId') mediaId: string,
    @Body(zodBody(processPetrosMediaSchema)) body: ProcessPetrosMediaInput,
  ) {
    return this.service.delete(this.principal(raw), mediaId, body.idempotencyKey);
  }

  @Get('media/:mediaId/export')
  export(@CurrentStudent() raw: StudentPrincipal, @Param('mediaId') mediaId: string) {
    return this.service.export(this.principal(raw), mediaId);
  }

  @Post('voice/sessions')
  startVoice(
    @CurrentStudent() raw: StudentPrincipal,
    @Body(zodBody(startPetrosVoiceSessionSchema)) body: StartPetrosVoiceSessionInput,
  ) {
    return this.service.startVoice(this.principal(raw), body);
  }

  @Post('voice/turns')
  @StudentRateLimit(20, 60)
  voiceTurn(
    @CurrentStudent() raw: StudentPrincipal,
    @Body(zodBody(submitPetrosVoiceTurnSchema)) body: SubmitPetrosVoiceTurnInput,
  ) {
    return this.service.voiceTurn(this.principal(raw), body);
  }

  @Post('five-minute/sessions')
  startFiveMinute(
    @CurrentStudent() raw: StudentPrincipal,
    @Body(zodBody(startPetrosFiveMinuteSchema)) body: StartPetrosFiveMinuteInput,
  ) {
    return this.service.startFiveMinute(this.principal(raw), body);
  }

  @Post('modality-events')
  clientEvent(
    @CurrentStudent() raw: StudentPrincipal,
    @Body(zodBody(petrosModalityClientEventSchema)) body: PetrosModalityClientEventInput,
  ) {
    return this.service.clientEvent(this.principal(raw), body);
  }
}

@ApiTags('petros-modality-operations')
@Controller('petros-input-modes')
export class PetrosInputModesOperationsController {
  constructor(private readonly service: PetrosInputModesService) {}

  @Get('dashboard')
  @RequirePermissions('ai.view')
  dashboard(
    @Query(zodBody(petrosModalityDashboardQuerySchema)) query: PetrosModalityDashboardQuery,
    @PrincipalCtx() principalContext: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.dashboard(query, { principalContext, request });
  }

  @Post('maintenance/cleanup')
  @RequirePermissions('ai.manage')
  cleanup(
    @PrincipalCtx() principalContext: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.cleanupExpired({ principalContext, request });
  }
}
