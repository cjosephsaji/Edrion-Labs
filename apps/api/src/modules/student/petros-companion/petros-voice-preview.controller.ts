import { Body, Controller, Get, Header, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { zodBody } from '../../../common/zod-validation.pipe';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { StudentOwnsTransactions } from '../core/student-owned-transactions';
import { CurrentStudent, RequireStudentPermissions, StudentRateLimit } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { voicePreviewSpeechSchema, voicePreviewTranscriptionSchema } from './petros-voice-preview.contract';
import { PetrosVoicePreviewService } from './petros-voice-preview.service';

/** Propagates a real client disconnect; provider billing can still occur after dispatch. */
export async function withPreviewDisconnect<T>(request: Request, response: Response, work: (signal: AbortSignal) => Promise<T>) {
  const abort = new AbortController();
  const cancelled = () => abort.abort();
  request.once('aborted', cancelled);
  response.once('close', cancelled);
  if (request.aborted || response.destroyed) abort.abort();
  try { abort.signal.throwIfAborted(); return await work(abort.signal); }
  finally { request.off('aborted', cancelled); response.off('close', cancelled); }
}

@ApiTags('student-petros-voice-preview')
@Controller('student/petros/companion/voice-preview')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard, StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use')
@StudentRateLimit(12, 60)
@StudentOwnsTransactions()
export class PetrosVoicePreviewController {
  constructor(private readonly service: PetrosVoicePreviewService) {}

  @Get('status')
  @Header('Cache-Control', 'private, no-store')
  status(@CurrentStudent() raw: StudentPrincipal) {
    requireInstitutional(raw);
    return this.service.status(raw);
  }

  @Post('speech')
  @Header('Cache-Control', 'private, no-store')
  speech(@CurrentStudent() raw: StudentPrincipal, @Body(zodBody(voicePreviewSpeechSchema)) body: z.infer<typeof voicePreviewSpeechSchema>,
    @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    requireInstitutional(raw);
    return withPreviewDisconnect(request, response, signal => this.service.speech(raw, body, signal));
  }

  @Post('transcription')
  @Header('Cache-Control', 'private, no-store')
  transcription(@CurrentStudent() raw: StudentPrincipal, @Body(zodBody(voicePreviewTranscriptionSchema)) body: z.infer<typeof voicePreviewTranscriptionSchema>,
    @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    requireInstitutional(raw);
    return withPreviewDisconnect(request, response, signal => this.service.transcription(raw, body, signal));
  }
}
