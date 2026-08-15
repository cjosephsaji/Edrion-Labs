import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  petrosAssistantQuestionSchema,
  petrosDoorsDashboardQuerySchema,
  petrosIntentMetricInputSchema,
  resolvePetrosSessionIntentSchema,
  startPetrosSessionIntentSchema,
  type PetrosAssistantQuestionInput,
  type PetrosDoorsDashboardQuery,
  type PetrosIntentMetricInput,
  type ResolvePetrosSessionIntentInput,
  type StartPetrosSessionIntentInput,
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
import { PetrosSessionIntentService } from './petros-session-intent.service';

@ApiTags('student-petros-contextual-doors')
@Controller('student/petros')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard, StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use')
@StudentRateLimit(40, 60)
export class StudentPetrosSessionIntentController {
  constructor(private readonly service: PetrosSessionIntentService) {}

  private principal(raw: StudentPrincipal) {
    requireInstitutional(raw);
    return raw;
  }

  @Post('intents/resolve')
  resolve(
    @CurrentStudent() raw: StudentPrincipal,
    @Body(zodBody(resolvePetrosSessionIntentSchema)) body: ResolvePetrosSessionIntentInput,
  ) {
    return this.service.resolve(this.principal(raw), body);
  }

  @Get('intents/:intentId')
  read(@CurrentStudent() raw: StudentPrincipal, @Param('intentId') intentId: string) {
    return this.service.read(this.principal(raw), intentId);
  }

  @Post('intents/:intentId/start')
  start(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('intentId') intentId: string,
    @Body(zodBody(startPetrosSessionIntentSchema)) body: StartPetrosSessionIntentInput,
  ) {
    return this.service.start(this.principal(raw), intentId, body);
  }

  @Post('intents/:intentId/events')
  metric(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('intentId') intentId: string,
    @Body(zodBody(petrosIntentMetricInputSchema)) body: PetrosIntentMetricInput,
  ) {
    return this.service.metric(this.principal(raw), intentId, body);
  }

  @Post('assistant')
  assistant(
    @CurrentStudent() raw: StudentPrincipal,
    @Body(zodBody(petrosAssistantQuestionSchema)) body: PetrosAssistantQuestionInput,
  ) {
    return this.service.assistant(this.principal(raw), body);
  }

  @Get('sources')
  sources(@CurrentStudent() raw: StudentPrincipal) {
    return this.service.sources(this.principal(raw));
  }

  @Get('path')
  path(@CurrentStudent() raw: StudentPrincipal) {
    return this.service.path(this.principal(raw));
  }
}

@ApiTags('petros-doors-dashboard')
@Controller('petros-doors')
export class PetrosDoorsDashboardController {
  constructor(private readonly service: PetrosSessionIntentService) {}

  @Get('dashboard')
  @RequirePermissions('ai.view')
  read(
    @Query(zodBody(petrosDoorsDashboardQuerySchema)) query: PetrosDoorsDashboardQuery,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.dashboard(query, { principalContext: pc, request });
  }
}
