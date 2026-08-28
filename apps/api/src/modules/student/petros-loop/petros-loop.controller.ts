import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  petrosCloseSessionSchema,
  petrosComposerQuestionSchema,
  petrosCompleteBlockSchema,
  petrosContinueSessionSchema,
  petrosCreateLearningSessionSchema,
  petrosDecisionDiagnosticQuerySchema,
  petrosRequestHintSchema,
  petrosReexplainBlockSchema,
  petrosSubmitAnswerSchema,
  petrosUpdateBlockInteractionSchema,
  type PetrosCloseSessionInput,
  type PetrosComposerQuestionInput,
  type PetrosCompleteBlockInput,
  type PetrosContinueSessionInput,
  type PetrosCreateLearningSessionInput,
  type PetrosDecisionDiagnosticQuery,
  type PetrosRequestHintInput,
  type PetrosReexplainBlockInput,
  type PetrosSubmitAnswerInput,
  type PetrosUpdateBlockInteractionInput,
} from '@edrion/schemas';
import type { PrincipalContext } from '@edrion/auth';
import { Public } from '../../../common/guards/auth.guard';
import {
  PrincipalCtx,
  ReqContext,
  RequirePermissions,
  SkipRateLimit,
} from '../../../common/decorators';
import type { EdrionRequestContext } from '../../../common/request-context';
import { zodBody } from '../../../common/zod-validation.pipe';
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
import { PetrosLoopService } from './petros-loop.service';

@ApiTags('student-petros-learning')
@Controller('student/petros/sessions')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard, StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use')
@StudentRateLimit(30, 60)
export class StudentPetrosLoopController {
  constructor(private readonly service: PetrosLoopService) {}

  @Post()
  create(
    @CurrentStudent() raw: StudentPrincipal,
    @Body(zodBody(petrosCreateLearningSessionSchema)) body: PetrosCreateLearningSessionInput,
  ) {
    requireInstitutional(raw);
    return this.service.createUnresolved(raw, body);
  }

  /** Must be declared before `:sessionId` or Nest matches "history" as an id. */
  @Get('history')
  history(@CurrentStudent() raw: StudentPrincipal) {
    requireInstitutional(raw);
    return this.service.history(raw);
  }

  @Get(':sessionId')
  read(@CurrentStudent() raw: StudentPrincipal, @Param('sessionId') sessionId: string) {
    requireInstitutional(raw);
    return this.service.document(raw, sessionId);
  }

  @Post(':sessionId/continue')
  continueSession(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Body(zodBody(petrosContinueSessionSchema)) body: PetrosContinueSessionInput,
  ) {
    requireInstitutional(raw);
    return this.service.continue(raw, sessionId, body.idempotencyKey);
  }

  @Put(':sessionId/blocks/:blockId/interaction')
  interaction(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Param('blockId') blockId: string,
    @Body(zodBody(petrosUpdateBlockInteractionSchema)) body: PetrosUpdateBlockInteractionInput,
  ) {
    requireInstitutional(raw);
    return this.service.updateInteraction(raw, sessionId, blockId, body.interactionState);
  }

  @Post(':sessionId/blocks/:blockId/question')
  ensureQuestion(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Param('blockId') blockId: string,
    @Body(zodBody(petrosContinueSessionSchema)) body: PetrosContinueSessionInput,
  ) {
    requireInstitutional(raw);
    return this.service.ensureQuestion(raw, sessionId, blockId, body.idempotencyKey);
  }

  @Post(':sessionId/blocks/:blockId/reexplain')
  @StudentRateLimit(12, 60)
  reexplain(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Param('blockId') blockId: string,
    @Body(zodBody(petrosReexplainBlockSchema)) body: PetrosReexplainBlockInput,
  ) {
    requireInstitutional(raw);
    return this.service.reexplain(raw, sessionId, blockId, body);
  }

  @Post(':sessionId/blocks/:blockId/complete')
  complete(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Param('blockId') blockId: string,
    @Body(zodBody(petrosCompleteBlockSchema)) body: PetrosCompleteBlockInput,
  ) {
    requireInstitutional(raw);
    return this.service.complete(raw, sessionId, blockId, body);
  }

  @Post(':sessionId/blocks/:blockId/answers')
  @StudentRateLimit(20, 60)
  answer(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Param('blockId') blockId: string,
    @Body(zodBody(petrosSubmitAnswerSchema)) body: PetrosSubmitAnswerInput,
  ) {
    requireInstitutional(raw);
    return this.service.submitAnswer(raw, sessionId, blockId, body);
  }

  @Post(':sessionId/blocks/:blockId/hint')
  @StudentRateLimit(12, 60)
  hint(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Param('blockId') blockId: string,
    @Body(zodBody(petrosRequestHintSchema)) body: PetrosRequestHintInput,
  ) {
    requireInstitutional(raw);
    return this.service.requestHint(raw, sessionId, blockId, body);
  }

  @Post(':sessionId/questions')
  @StudentRateLimit(10, 60)
  composer(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Body(zodBody(petrosComposerQuestionSchema)) body: PetrosComposerQuestionInput,
  ) {
    requireInstitutional(raw);
    return this.service.composerQuestion(raw, sessionId, body);
  }

  @Post(':sessionId/pause')
  pause(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Body(zodBody(petrosContinueSessionSchema)) body: PetrosContinueSessionInput,
  ) {
    requireInstitutional(raw);
    return this.service.pause(raw, sessionId, body.idempotencyKey);
  }

  @Post(':sessionId/resume')
  resume(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Body(zodBody(petrosContinueSessionSchema)) body: PetrosContinueSessionInput,
  ) {
    requireInstitutional(raw);
    return this.service.resume(raw, sessionId, body.idempotencyKey);
  }

  @Post(':sessionId/close')
  close(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Body(zodBody(petrosCloseSessionSchema)) body: PetrosCloseSessionInput,
  ) {
    requireInstitutional(raw);
    return this.service.close(raw, sessionId, body);
  }

  @Get(':sessionId/blocks/:blockId/reason')
  reason(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Param('blockId') blockId: string,
  ) {
    requireInstitutional(raw);
    return this.service.reason(raw, sessionId, blockId);
  }
}

@ApiTags('petros-ai-routing')
@Controller('petros-ai-routing')
export class PetrosDecisionDiagnosticsController {
  constructor(private readonly service: PetrosLoopService) {}

  @Get('decisions')
  @RequirePermissions('ai.view')
  decisions(
    @Query(zodBody(petrosDecisionDiagnosticQuerySchema)) query: PetrosDecisionDiagnosticQuery,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.diagnostics(query, { principalContext: pc, request });
  }

  @Get('observations')
  @RequirePermissions('ai.view')
  observations(
    @Query(zodBody(petrosDecisionDiagnosticQuerySchema)) query: PetrosDecisionDiagnosticQuery,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.observationDiagnostics(query, { principalContext: pc, request });
  }
}
