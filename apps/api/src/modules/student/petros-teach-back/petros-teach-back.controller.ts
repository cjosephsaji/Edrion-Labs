import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { PrincipalContext } from '@edrion/auth';
import {
  correctPetrosTeachBackSegmentSchema,
  createPetrosTeachBackSessionSchema,
  petrosTeachBackDashboardQuerySchema,
  petrosTeachBackHelpSchema,
  petrosTeachBackLifecycleSchema,
  submitPetrosTeachBackSegmentSchema,
  type CorrectPetrosTeachBackSegmentInput,
  type CreatePetrosTeachBackSessionInput,
  type PetrosTeachBackDashboardQuery,
  type PetrosTeachBackHelpInput,
  type PetrosTeachBackLifecycleInput,
  type SubmitPetrosTeachBackSegmentInput,
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
import { PetrosTeachBackService } from './petros-teach-back.service';

@ApiTags('student-petros-teach-it-back')
@Controller('student/petros/teach-it-back')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard, StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use')
@StudentRateLimit(30, 60)
export class StudentPetrosTeachBackController {
  constructor(private readonly service: PetrosTeachBackService) {}

  private principal(raw: StudentPrincipal) {
    requireInstitutional(raw);
    return raw;
  }

  @Post('sessions')
  create(
    @CurrentStudent() raw: StudentPrincipal,
    @Body(zodBody(createPetrosTeachBackSessionSchema))
    body: CreatePetrosTeachBackSessionInput,
  ) {
    return this.service.create(this.principal(raw), body);
  }

  @Get('sessions/:sessionId')
  read(@CurrentStudent() raw: StudentPrincipal, @Param('sessionId') sessionId: string) {
    return this.service.read(this.principal(raw), sessionId);
  }

  @Post('sessions/:sessionId/segments')
  @StudentRateLimit(20, 60)
  segment(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Body(zodBody(submitPetrosTeachBackSegmentSchema))
    body: SubmitPetrosTeachBackSegmentInput,
  ) {
    return this.service.submit(this.principal(raw), sessionId, body);
  }

  @Put('sessions/:sessionId/segments/:segmentId')
  correct(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Param('segmentId') segmentId: string,
    @Body(zodBody(correctPetrosTeachBackSegmentSchema))
    body: CorrectPetrosTeachBackSegmentInput,
  ) {
    return this.service.correct(this.principal(raw), sessionId, segmentId, body);
  }

  @Post('sessions/:sessionId/help')
  help(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Body(zodBody(petrosTeachBackHelpSchema)) body: PetrosTeachBackHelpInput,
  ) {
    return this.service.help(this.principal(raw), sessionId, body);
  }

  @Post('sessions/:sessionId/pause')
  pause(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Body(zodBody(petrosTeachBackLifecycleSchema))
    body: PetrosTeachBackLifecycleInput,
  ) {
    return this.service.pause(this.principal(raw), sessionId, body);
  }

  @Post('sessions/:sessionId/resume')
  resume(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Body(zodBody(petrosTeachBackLifecycleSchema))
    body: PetrosTeachBackLifecycleInput,
  ) {
    return this.service.resume(this.principal(raw), sessionId, body);
  }

  @Post('sessions/:sessionId/close')
  close(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Body(zodBody(petrosTeachBackLifecycleSchema))
    body: PetrosTeachBackLifecycleInput,
  ) {
    return this.service.close(this.principal(raw), sessionId, body);
  }
}

@ApiTags('petros-teach-it-back-operations')
@Controller('petros-teach-back')
export class PetrosTeachBackOperationsController {
  constructor(private readonly service: PetrosTeachBackService) {}

  @Get('dashboard')
  @RequirePermissions('ai.view')
  dashboard(
    @Query(zodBody(petrosTeachBackDashboardQuerySchema))
    query: PetrosTeachBackDashboardQuery,
    @PrincipalCtx() principalContext: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.dashboard(query, { principalContext, request });
  }
}
