import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createExamScheduleSchema,
  createExamSchema,
  examsListQuerySchema,
  updateExamScheduleSchema,
  updateExamSchema,
  versionedDeleteSchema,
  type CreateExamInput,
  type CreateExamScheduleInput,
  type ExamsListQuery,
  type UpdateExamInput,
  type UpdateExamScheduleInput,
  type VersionedDeleteInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import {
  CurrentInstitutionPrincipal,
  CurrentScope,
  RequireInstitutionPermissions,
} from './portal.decorators';
import { ExamsService } from './exams.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Exams API (Phase 6) — exams + scheduled papers. Same boundary as the rest of
 * the portal. Reads need exams.view; mutations need exams.manage. Papers are nested under an exam.
 */
@ApiTags('portal-exams')
@Controller('portal/exams')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class ExamsController {
  constructor(private readonly service: ExamsService) {}

  private ctx(
    principal: InstitutionPrincipal,
    scope: InstitutionScope,
    request: EdrionRequestContext,
  ): PortalActionContext {
    return { principal, scope, request };
  }

  @Get()
  @RequireInstitutionPermissions('exams.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(examsListQuerySchema)) q: ExamsListQuery,
  ) {
    return this.service.list(this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('exams.manage')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createExamSchema)) body: CreateExamInput,
  ) {
    return this.service.create(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('exams.manage')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateExamSchema)) body: UpdateExamInput,
  ) {
    return this.service.update(this.ctx(p, s, r), id, body);
  }

  @Delete(':id')
  @RequireInstitutionPermissions('exams.manage')
  delete(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.delete(this.ctx(p, s, r), id, body.version);
  }

  // --- schedules (papers) ----------------------------------------------------

  @Get(':id/schedules')
  @RequireInstitutionPermissions('exams.view')
  listSchedules(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listSchedules(this.ctx(p, s, r), id);
  }

  @Post(':id/schedules')
  @RequireInstitutionPermissions('exams.manage')
  createSchedule(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createExamScheduleSchema)) body: CreateExamScheduleInput,
  ) {
    return this.service.createSchedule(this.ctx(p, s, r), id, body);
  }

  @Patch(':id/schedules/:scheduleId')
  @RequireInstitutionPermissions('exams.manage')
  updateSchedule(
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateExamScheduleSchema)) body: UpdateExamScheduleInput,
  ) {
    return this.service.updateSchedule(this.ctx(p, s, r), id, scheduleId, body);
  }

  @Delete(':id/schedules/:scheduleId')
  @RequireInstitutionPermissions('exams.manage')
  deleteSchedule(
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteSchedule(this.ctx(p, s, r), id, scheduleId, body.version);
  }
}
