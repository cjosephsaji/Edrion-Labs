import { Body, Header, Controller, Get, Param, Post, Put, Query, UseGuards, Optional } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  petrosVisualCommandSchema,
  type PetrosVisualCommand,
  petrosCloseSessionSchema,
  petrosPilotActionSchema,
  petrosDocumentTeachingActionSchema,
  type PetrosPilotAction,
  type PetrosDocumentTeachingAction,
  petrosComposerQuestionSchema,
  petrosCompleteBlockSchema,
  petrosContinueSessionSchema,
  petrosCreateLearningSessionSchema,
  petrosDecisionDiagnosticQuerySchema,
  petrosRequestHintSchema,
  petrosReexplainBlockSchema,
  petrosSubmitAnswerSchema,
  petrosUpdateBlockInteractionSchema,
  petrosSavePresentationCheckpointSchema,
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
  type PetrosSavePresentationCheckpointInput,
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
import { PetrosQuestionExecutionService } from './petros-question-execution.service';

@ApiTags('student-petros-learning')
@Controller('student/petros/sessions')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard, StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use')
@StudentRateLimit(30, 60)
export class StudentPetrosLoopController {
  constructor(private readonly service: PetrosLoopService, @Optional() private readonly questions?: PetrosQuestionExecutionService) {}

  @Post()
  @Header('Cache-Control', 'private, no-store')
  create(
    @CurrentStudent() raw: StudentPrincipal,
    @Body(zodBody(petrosCreateLearningSessionSchema)) body: PetrosCreateLearningSessionInput,
  ) {
    requireInstitutional(raw);
    return this.service.createUnresolved(raw, body);
  }

  /** Must be declared before `:sessionId` or Nest matches "history" as an id. */
  @Get('history')
  @Header('Cache-Control', 'private, no-store')
  history(@CurrentStudent() raw: StudentPrincipal) {
    requireInstitutional(raw);
    return this.service.history(raw);
  }

  @Get(':sessionId')
  @Header('Cache-Control', 'private, no-store')
  read(@CurrentStudent() raw: StudentPrincipal, @Param('sessionId') sessionId: string) {
    requireInstitutional(raw);
    return this.service.document(raw, sessionId);
  }

  @Post(':sessionId/continue')
  @Header('Cache-Control', 'private, no-store')
  continueSession(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Body(zodBody(petrosContinueSessionSchema)) body: PetrosContinueSessionInput,
  ) {
    requireInstitutional(raw);
    return this.service.continue(raw, sessionId, body.idempotencyKey);
  }

  @Post(':sessionId/presentation')
  presentation(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Body(zodBody(petrosSavePresentationCheckpointSchema)) body: PetrosSavePresentationCheckpointInput,
  ) {
    requireInstitutional(raw);
    return this.service.savePresentationCheckpoint(raw, sessionId, body);
  }

  @Post(':sessionId/pilot')
  @StudentRateLimit(120, 60)
  pilot(@CurrentStudent() raw: StudentPrincipal, @Param('sessionId') sessionId: string,
    @Body(zodBody(petrosPilotActionSchema)) body: PetrosPilotAction) {
    requireInstitutional(raw);
    return this.service.pilotAction(raw, sessionId, body);
  }

  @Post(':sessionId/document-teaching')
  @StudentRateLimit(120, 60)
  documentTeaching(@CurrentStudent() raw: StudentPrincipal, @Param('sessionId') sessionId: string,
    @Body(zodBody(petrosDocumentTeachingActionSchema)) body: PetrosDocumentTeachingAction) {
    requireInstitutional(raw);
    return this.service.documentTeachingAction(raw, sessionId, body);
  }

  @Get(':sessionId/blocks/:blockId/visual')
  @Header('Cache-Control', 'private, no-store')
  visual(@CurrentStudent() raw: StudentPrincipal, @Param('sessionId') sessionId: string, @Param('blockId') blockId: string) {
    requireInstitutional(raw);
    return this.service.visual(raw, sessionId, blockId);
  }

  @Put(':sessionId/blocks/:blockId/visual')
  @Header('Cache-Control', 'private, no-store')
  visualCommand(@CurrentStudent() raw: StudentPrincipal, @Param('sessionId') sessionId: string, @Param('blockId') blockId: string,
    @Body(zodBody(petrosVisualCommandSchema)) body: PetrosVisualCommand) {
    requireInstitutional(raw);
    return this.service.visualCommand(raw, sessionId, blockId, body);
  }

  @Put(':sessionId/blocks/:blockId/interaction')
  @Header('Cache-Control', 'private, no-store')
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
  @Header('Cache-Control', 'private, no-store')
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
  @Header('Cache-Control', 'private, no-store')
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
  @Header('Cache-Control', 'private, no-store')
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
  @Header('Cache-Control', 'private, no-store')
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
  @Header('Cache-Control', 'private, no-store')
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
  @Header('Cache-Control', 'private, no-store')
  @StudentRateLimit(10, 60)
  async composer(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Body(zodBody(petrosComposerQuestionSchema)) body: PetrosComposerQuestionInput,
  ) {
    requireInstitutional(raw);
    await this.questions?.assertLegacyAllowed(raw, sessionId);
    return this.service.composerQuestion(raw, sessionId, body);
  }

  @Post(':sessionId/questions/:detourId/understood')
  @Header('Cache-Control', 'private, no-store')
  rejoinQuestion(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Param('detourId') detourId: string,
    @Body(zodBody(petrosContinueSessionSchema)) body: PetrosContinueSessionInput,
  ) {
    requireInstitutional(raw);
    return this.service.rejoinComposerQuestion(raw, sessionId, detourId, body.idempotencyKey);
  }

  @Post(':sessionId/pause')
  @Header('Cache-Control', 'private, no-store')
  pause(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Body(zodBody(petrosContinueSessionSchema)) body: PetrosContinueSessionInput,
  ) {
    requireInstitutional(raw);
    return this.service.pause(raw, sessionId, body.idempotencyKey);
  }

  @Post(':sessionId/resume')
  @Header('Cache-Control', 'private, no-store')
  resume(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Body(zodBody(petrosContinueSessionSchema)) body: PetrosContinueSessionInput,
  ) {
    requireInstitutional(raw);
    return this.service.resume(raw, sessionId, body.idempotencyKey);
  }

  @Post(':sessionId/close')
  @Header('Cache-Control', 'private, no-store')
  close(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Body(zodBody(petrosCloseSessionSchema)) body: PetrosCloseSessionInput,
  ) {
    requireInstitutional(raw);
    return this.service.close(raw, sessionId, body);
  }

  @Get(':sessionId/blocks/:blockId/reason')
  @Header('Cache-Control', 'private, no-store')
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
