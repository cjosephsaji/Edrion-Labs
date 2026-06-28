import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createTimetableSlotSchema,
  timetableListQuerySchema,
  updateTimetableSlotSchema,
  versionedDeleteSchema,
  type CreateTimetableSlotInput,
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
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Timetable API (Phase 5) — recurring weekly slots. Same boundary as the rest of
 * the portal. Reads need timetable.view; mutations need timetable.manage.
 */
@ApiTags('portal-timetable')
@Controller('portal/timetable')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class TimetableController {
  constructor(private readonly service: TimetableService) {}

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
}
