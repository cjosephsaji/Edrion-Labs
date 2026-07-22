import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createPeriodExceptionSchema,
  createTimetableSlotSchema,
  portalTimetableDayQuerySchema,
  revokePeriodExceptionSchema,
  timetableListQuerySchema,
  updateTimetableSlotSchema,
  versionedDeleteSchema,
  type CreatePeriodExceptionInput,
  type CreateTimetableSlotInput,
  type PortalTimetableDayQuery,
  type RevokePeriodExceptionInput,
  type TimetableListQuery,
  type UpdateTimetableSlotInput,
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
import { TimetableService } from './timetable.service';
import { TimetableExceptionsService } from './timetable-exceptions.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Timetable API — recurring weekly slots + live exceptions.
 */
@ApiTags('portal-timetable')
@Controller('portal/timetable')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class TimetableController {
  constructor(
    private readonly service: TimetableService,
    private readonly exceptions: TimetableExceptionsService,
  ) {}

  private ctx(
    principal: InstitutionPrincipal,
    scope: InstitutionScope,
    request: EdrionRequestContext,
  ): PortalActionContext {
    return { principal, scope, request };
  }

  @Get()
  @RequireInstitutionPermissions('timetable.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(timetableListQuerySchema)) q: TimetableListQuery,
  ) {
    return this.service.list(this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('timetable.manage')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createTimetableSlotSchema)) body: CreateTimetableSlotInput,
  ) {
    return this.service.create(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('timetable.manage')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateTimetableSlotSchema)) body: UpdateTimetableSlotInput,
  ) {
    return this.service.update(this.ctx(p, s, r), id, body);
  }

  @Delete(':id')
  @RequireInstitutionPermissions('timetable.manage')
  delete(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.delete(this.ctx(p, s, r), id, body.version);
  }

  @Get('day')
  @RequireInstitutionPermissions('timetable.view')
  day(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(portalTimetableDayQuerySchema)) q: PortalTimetableDayQuery,
  ) {
    return this.exceptions.dayView(this.ctx(p, s, r), q);
  }

  @Post('exceptions')
  @RequireInstitutionPermissions('timetable.exception.manage_all', 'timetable.exception.manage_own')
  createException(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(zodBody(createPeriodExceptionSchema)) body: CreatePeriodExceptionInput,
  ) {
    return this.exceptions.create(this.ctx(p, s, r), body, idempotencyKey);
  }

  @Post('exceptions/:id/revoke')
  @RequireInstitutionPermissions('timetable.exception.manage_all', 'timetable.exception.manage_own')
  revokeException(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(revokePeriodExceptionSchema)) body: RevokePeriodExceptionInput,
  ) {
    return this.exceptions.revoke(this.ctx(p, s, r), id, body);
  }
}
