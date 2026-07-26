import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createCalendarEventSchema,
  calendarEventListQuerySchema,
  updateCalendarEventSchema,
  versionedDeleteSchema,
  type CreateCalendarEventInput,
  type VersionedDeleteInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../../common/decorators';
import type { EdrionRequestContext } from '../../../common/request-context';
import { zodBody } from '../../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from '../portal.decorators';
import type { CrudListQuery } from '../portal-crud.engine';
import type { PortalActionContext } from '../portal-action-context';
import { CalendarEventsService } from './calendar-events.service';

@ApiTags('portal-calendar-events')
@Controller('portal/calendar-events')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class CalendarEventsController {
  constructor(private readonly svc: CalendarEventsService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get()
  @RequireInstitutionPermissions('calendar_events.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(calendarEventListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('events', this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('calendar_events.manage')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createCalendarEventSchema)) body: CreateCalendarEventInput,
  ) {
    return this.svc.createEvent(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('calendar_events.manage')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateCalendarEventSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('events', this.ctx(p, s, r), id, body);
  }

  @Delete(':id')
  @RequireInstitutionPermissions('calendar_events.manage')
  remove(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('events', this.ctx(p, s, r), id, body.version);
  }
}
