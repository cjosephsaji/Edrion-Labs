import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { PrincipalContext } from '@edrion/auth';
import {
  petrosCalibrationLifecycleSchema,
  petrosGapAlarmLifecycleSchema,
  petrosRecapFeedbackSchema,
  petrosReflectionDashboardQuerySchema,
  petrosReflectionEvidenceQuerySchema,
  petrosReflectionRecommendationLifecycleSchema,
  petrosReflectionRecommendationIntentSchema,
  petrosReflectionRebuildSchema,
  type PetrosCalibrationLifecycleInput,
  type PetrosGapAlarmLifecycleInput,
  type PetrosRecapFeedbackInput,
  type PetrosReflectionDashboardQuery,
  type PetrosReflectionEvidenceQuery,
  type PetrosReflectionRecommendationIntentInput,
  type PetrosReflectionRecommendationLifecycleInput,
  type PetrosReflectionRebuildInput,
} from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import {
  PrincipalCtx,
  ReqContext,
  RequirePermissions,
  RequireRecentAuth,
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
import { PetrosReflectionService } from './petros-reflection.service';

const deleteSchema = z.object({ confirm: z.literal('DELETE REFLECTION DATA') }).strict();

@ApiTags('student-petros-reflection')
@Controller('student/petros/reflection')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard, StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use')
@StudentRateLimit(30, 60)
export class StudentPetrosReflectionController {
  constructor(private readonly service: PetrosReflectionService) {}

  private principal(raw: StudentPrincipal) {
    requireInstitutional(raw);
    return raw;
  }

  @Get()
  read(@CurrentStudent() raw: StudentPrincipal) {
    return this.service.read(this.principal(raw));
  }

  @Get('map')
  async map(@CurrentStudent() raw: StudentPrincipal, @Query('limit') rawLimit?: string) {
    const data = await this.service.read(this.principal(raw));
    const limit = Math.max(1, Math.min(300, Number(rawLimit ?? 300) || 300));
    return {
      ...data.map,
      topics: data.map.topics.slice(0, limit),
      relationships: data.map.relationships.filter(
        (edge) =>
          data.map.topics.slice(0, limit).some((topic) => topic.conceptId === edge.fromConceptId) &&
          data.map.topics.slice(0, limit).some((topic) => topic.conceptId === edge.toConceptId),
      ),
      thresholds: data.thresholds,
      stale: data.stale,
      rebuiltAt: data.rebuiltAt,
    };
  }

  @Get('insights/:kind/:id')
  async detail(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    const data = await this.service.read(this.principal(raw));
    if (kind === 'calibration' && data.calibration?.id === id) return data.calibration;
    if (kind === 'recap') return data.recaps.find((row) => row.id === id) ?? null;
    if (kind === 'alarm') return data.alarms.find((row) => row.id === id) ?? null;
    return null;
  }

  @Post('rebuild')
  rebuild(
    @CurrentStudent() raw: StudentPrincipal,
    @Body(zodBody(petrosReflectionRebuildSchema)) body: PetrosReflectionRebuildInput,
  ) {
    return this.service.rebuild(this.principal(raw), body);
  }

  @Post('recommendations/:id/intent')
  intent(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('id') id: string,
    @Body(zodBody(petrosReflectionRecommendationIntentSchema))
    body: PetrosReflectionRecommendationIntentInput,
  ) {
    return this.service.recommendationIntent(this.principal(raw), id, body);
  }

  @Post('recommendations/:id/lifecycle')
  recommendationLifecycle(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('id') id: string,
    @Body(zodBody(petrosReflectionRecommendationLifecycleSchema))
    body: PetrosReflectionRecommendationLifecycleInput,
  ) {
    return this.service.recommendationLifecycle(this.principal(raw), id, body);
  }

  @Post('calibration/:id/lifecycle')
  calibration(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('id') id: string,
    @Body(zodBody(petrosCalibrationLifecycleSchema)) body: PetrosCalibrationLifecycleInput,
  ) {
    return this.service.calibrationLifecycle(this.principal(raw), id, body);
  }

  @Post('recaps/:id/feedback')
  recap(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('id') id: string,
    @Body(zodBody(petrosRecapFeedbackSchema)) body: PetrosRecapFeedbackInput,
  ) {
    return this.service.recapFeedback(this.principal(raw), id, body);
  }

  @Post('alarms/:id/lifecycle')
  alarm(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('id') id: string,
    @Body(zodBody(petrosGapAlarmLifecycleSchema)) body: PetrosGapAlarmLifecycleInput,
  ) {
    return this.service.alarmLifecycle(this.principal(raw), id, body);
  }

  @Get('export')
  export(@CurrentStudent() raw: StudentPrincipal) {
    return this.service.export(this.principal(raw));
  }

  @Delete('data')
  delete(
    @CurrentStudent() raw: StudentPrincipal,
    @Body(zodBody(deleteSchema)) _body: z.infer<typeof deleteSchema>,
  ) {
    return this.service.delete(this.principal(raw));
  }
}

@ApiTags('petros-reflection-dashboard')
@Controller('petros-reflection')
export class PetrosReflectionOperationsController {
  constructor(private readonly service: PetrosReflectionService) {}

  @Get('dashboard')
  @RequirePermissions('ai.view')
  dashboard(
    @Query(zodBody(petrosReflectionDashboardQuerySchema)) query: PetrosReflectionDashboardQuery,
    @PrincipalCtx() principal: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.dashboard(query, { principalContext: principal, request });
  }

  @Get('evidence')
  @RequirePermissions('ai.view')
  @RequireRecentAuth()
  evidence(
    @Query(zodBody(petrosReflectionEvidenceQuerySchema)) query: PetrosReflectionEvidenceQuery,
    @PrincipalCtx() principal: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.evidence(query, { principalContext: principal, request });
  }
}
