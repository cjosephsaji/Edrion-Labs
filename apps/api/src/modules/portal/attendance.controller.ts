import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  attendanceAgendaQuerySchema,
  attendanceListQuerySchema,
  createAttendanceSessionSchema,
  markAttendanceSchema,
  openAttendanceSessionSchema,
  updateAttendanceSessionSchema,
  versionedDeleteSchema,
  type AttendanceAgendaQuery,
  type AttendanceListQuery,
  type CreateAttendanceSessionInput,
  type MarkAttendanceInput,
  type OpenAttendanceSessionInput,
  type UpdateAttendanceSessionInput,
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
import { AttendanceService } from './attendance.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Attendance API (Phase 5) — registers (sessions) + per-student marks. Same
 * boundary as the rest of the portal. Reads need attendance.view; mutations need attendance.manage.
 * Records are nested under a session.
 */
@ApiTags('portal-attendance')
@Controller('portal/attendance')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  private ctx(
    principal: InstitutionPrincipal,
    scope: InstitutionScope,
    request: EdrionRequestContext,
  ): PortalActionContext {
    return { principal, scope, request };
  }

  @Get('agenda')
  @RequireInstitutionPermissions('attendance.view')
  agenda(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(attendanceAgendaQuerySchema)) q: AttendanceAgendaQuery,
  ) {
    return this.service.agenda(this.ctx(p, s, r), q);
  }

  @Post('sessions/open')
  @RequireInstitutionPermissions('attendance.manage')
  openSession(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(openAttendanceSessionSchema)) body: OpenAttendanceSessionInput,
  ) {
    return this.service.openSession(this.ctx(p, s, r), body);
  }

  @Get('sessions')
  @RequireInstitutionPermissions('attendance.view')
  listSessions(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(attendanceListQuerySchema)) q: AttendanceListQuery,
  ) {
    return this.service.listSessions(this.ctx(p, s, r), q);
  }

  @Post('sessions')
  @RequireInstitutionPermissions('attendance.manage')
  createSession(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createAttendanceSessionSchema)) body: CreateAttendanceSessionInput,
  ) {
    return this.service.createSession(this.ctx(p, s, r), body);
  }

  @Patch('sessions/:id')
  @RequireInstitutionPermissions('attendance.manage')
  updateSession(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateAttendanceSessionSchema)) body: UpdateAttendanceSessionInput,
  ) {
    return this.service.updateSession(this.ctx(p, s, r), id, body);
  }

  @Delete('sessions/:id')
  @RequireInstitutionPermissions('attendance.manage')
  deleteSession(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteSession(this.ctx(p, s, r), id, body.version);
  }

  // --- records ---------------------------------------------------------------

  @Get('sessions/:id/records')
  @RequireInstitutionPermissions('attendance.view')
  listRecords(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listRecords(this.ctx(p, s, r), id);
  }

  @Post('sessions/:id/records')
  @RequireInstitutionPermissions('attendance.manage')
  mark(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(markAttendanceSchema)) body: MarkAttendanceInput,
  ) {
    return this.service.mark(this.ctx(p, s, r), id, body);
  }

  @Delete('sessions/:id/records/:recordId')
  @RequireInstitutionPermissions('attendance.manage')
  removeRecord(
    @Param('id') id: string,
    @Param('recordId') recordId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.removeRecord(this.ctx(p, s, r), id, recordId);
  }
}
