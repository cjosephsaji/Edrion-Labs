import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  petrosMentorPlanInputSchema, petrosMentorPreferencesSchema, petrosMentorFeedbackSchema,
  type PetrosMentorPlanInput, type PetrosMentorPreferences, type PetrosMentorFeedback,
  petrosActionDecisionSchema,
  petrosCompanionPreferencesSchema,
  petrosCompanionTurnInputSchema,
  type PetrosActionDecisionInput,
  type PetrosCompanionPreferences,
  type PetrosCompanionTurnInput,
} from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { zodBody } from '../../../common/zod-validation.pipe';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { CurrentStudent, RequireStudentPermissions, StudentRateLimit } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { PetrosMentorService } from './petros-mentor.service';
import { PetrosBriefingService } from './petros-briefing.service';
import { PetrosCompanionService } from './petros-companion.service';

const dismissSchema = z.object({ nudgeKey: z.string().trim().min(1).max(200) }).strict();
const speechSchema = z.object({
  text: z.string().trim().min(1).max(2_000),
  voice: z.enum(['cedar', 'marin']).optional(),
  speed: z.number().min(0.85).max(1.15).optional(),
}).strict();

@ApiTags('student-petros-companion')
@Controller('student/petros/companion')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard, StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use')
@StudentRateLimit(60, 60)
export class StudentPetrosCompanionController {
  constructor(
    private readonly service: PetrosCompanionService,
    private readonly briefing: PetrosBriefingService,
    private readonly mentor: PetrosMentorService,
  ) {}

  /**
   * Institutional-only for now. The companion is hidden client-side for independent
   * learners, so this is a backstop rather than the primary gate.
   */
  private principal(raw: StudentPrincipal) {
    requireInstitutional(raw);
    return raw;
  }

  @Get('thread')
  thread(@CurrentStudent() raw: StudentPrincipal, @Query('threadId') threadId?: string) {
    return this.service.openThread(this.principal(raw), threadId);
  }

  @Get('threads')
  threads(@CurrentStudent() raw: StudentPrincipal) {
    return this.service.listThreads(this.principal(raw));
  }

  @Post('turns')
  turn(
    @CurrentStudent() raw: StudentPrincipal,
    @Body(zodBody(petrosCompanionTurnInputSchema)) body: PetrosCompanionTurnInput,
  ) {
    return this.service.turn(this.principal(raw), body);
  }

  @Post('speech')
  @StudentRateLimit(30, 60)
  speech(
    @CurrentStudent() raw: StudentPrincipal,
    @Body(zodBody(speechSchema)) body: z.infer<typeof speechSchema>,
  ) {
    return this.service.speak(this.principal(raw), body.text, { voice: body.voice, speed: body.speed });
  }

  @Post('actions/:proposalId/decision')
  decide(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('proposalId') proposalId: string,
    @Body(zodBody(petrosActionDecisionSchema)) body: PetrosActionDecisionInput,
  ) {
    return this.service.decideAction(this.principal(raw), proposalId, body);
  }

  @Post('threads/:threadId/archive')
  archive(@CurrentStudent() raw: StudentPrincipal, @Param('threadId') threadId: string) {
    return this.service.archiveThread(this.principal(raw), threadId);
  }

  @Delete('threads/:threadId')
  remove(@CurrentStudent() raw: StudentPrincipal, @Param('threadId') threadId: string) {
    return this.service.deleteThread(this.principal(raw), threadId);
  }

  @Get('preferences')
  preferences(@CurrentStudent() raw: StudentPrincipal) {
    return this.service.preferences(this.principal(raw));
  }

  @Put('preferences')
  savePreferences(
    @CurrentStudent() raw: StudentPrincipal,
    @Body(zodBody(petrosCompanionPreferencesSchema)) body: PetrosCompanionPreferences,
  ) {
    return this.service.savePreferences(this.principal(raw), body);
  }

  @Get('mentor')
  mentorDecision(@CurrentStudent() raw: StudentPrincipal) {
    return this.mentor.build(this.principal(raw));
  }

  @Put('mentor/preferences')
  mentorPreferences(@CurrentStudent() raw: StudentPrincipal, @Body(zodBody(petrosMentorPreferencesSchema)) body: PetrosMentorPreferences) {
    return this.mentor.preferences(this.principal(raw), body);
  }

  @Post('mentor/plan')
  mentorPlan(@CurrentStudent() raw: StudentPrincipal, @Body(zodBody(petrosMentorPlanInputSchema)) body: PetrosMentorPlanInput) {
    return this.mentor.plan(this.principal(raw), body);
  }

  @Post('mentor/feedback')
  mentorFeedback(@CurrentStudent() raw: StudentPrincipal, @Body(zodBody(petrosMentorFeedbackSchema)) body: PetrosMentorFeedback) {
    return this.mentor.feedback(this.principal(raw), body);
  }

  @Get('briefing')
  brief(@CurrentStudent() raw: StudentPrincipal) {
    return this.briefing.build(this.principal(raw));
  }

  @Post('briefing/dismiss')
  dismiss(
    @CurrentStudent() raw: StudentPrincipal,
    @Body(zodBody(dismissSchema)) body: { nudgeKey: string },
  ) {
    return this.briefing.dismiss(this.principal(raw), body.nudgeKey);
  }
}
