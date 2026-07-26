import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createCalendarEventTypeSchema,
  parseUnifiedCalendarSources,
  unifiedCalendarQuerySchema,
  updateCalendarEventTypeSchema,
  versionedDeleteSchema,
  type CreateCalendarEventTypeInput,
  type UnifiedCalendarQuery,
  type UpdateCalendarEventTypeInput,
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
import { CalendarService } from './calendar.service';
import type { PortalActionContext } from './portal-action-context';

@ApiTags('portal-calendar')
@Controller('portal/calendar')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  private ctx(
    principal: InstitutionPrincipal,
    scope: InstitutionScope,
    request: EdrionRequestContext,
  ): PortalActionContext {
    return { principal, scope, request };
  }

  @Get()
  @RequireInstitutionPermissions('calendar_events.view')
  unified(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(unifiedCalendarQuerySchema)) q: UnifiedCalendarQuery,
  ) {
    return this.service.unified(this.ctx(p, s, r), {
      from: q.from,
      to: q.to,
      sources: parseUnifiedCalendarSources(q.sources),
    });
  }

  @Get('event-types')
  @RequireInstitutionPermissions('calendar_events.view')
  eventTypes(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listEventTypes(this.ctx(p, s, r));
  }

  @Post('event-types')
  @RequireInstitutionPermissions('calendar_events.manage')
  createEventType(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createCalendarEventTypeSchema)) body: CreateCalendarEventTypeInput,
  ) {
    return this.service.createEventType(this.ctx(p, s, r), body);
  }

  @Patch('event-types/:id')
  @RequireInstitutionPermissions('calendar_events.manage')
  async updateEventType(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateCalendarEventTypeSchema)) body: UpdateCalendarEventTypeInput,
  ) {
    const updated = await this.service.updateEventType(this.ctx(p, s, r), id, body);
    if (!updated) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Event type not found' });
    }
    return updated;
  }

  @Delete('event-types/:id')
  @RequireInstitutionPermissions('calendar_events.manage')
  async deleteEventType(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    const result = await this.service.deleteEventType(this.ctx(p, s, r), id, body.version);
    if (result.reason === 'not_found') {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Event type not found' });
    }
    if (result.reason === 'system_type') {
      throw new BadRequestException({
        code: 'SYSTEM_TYPE',
        message: 'System event types cannot be deleted',
      });
    }
    if (result.reason === 'in_use') {
      throw new ConflictException({
        code: 'TYPE_IN_USE',
        message: 'This type is still used by calendar events',
      });
    }
    if (!result.deleted) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'This record changed since you loaded it. Reload and try again.',
      });
    }
    return { deleted: true };
  }
}
