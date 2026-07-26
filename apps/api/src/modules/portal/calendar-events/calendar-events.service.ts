import { Injectable } from '@nestjs/common';
import { schema } from '@edrion/database';
import type { CreateCalendarEventInput } from '@edrion/schemas';
import { PortalCrudEngine, type CrudConfig } from '../portal-crud.engine';
import { PortalResourceService, resourceConfig } from '../portal-resource.service';
import type { PortalActionContext } from '../portal-action-context';

@Injectable()
export class CalendarEventsService extends PortalResourceService {
  constructor(crud: PortalCrudEngine) {
    super(crud);
  }

  protected readonly configs: Record<string, CrudConfig> = {
    events: resourceConfig(schema.calendarEvents, {
      module: 'calendar-events',
      entityType: 'calendar_event',
      actionPrefix: 'calendar_event',
      search: [schema.calendarEvents.title, schema.calendarEvents.description],
      sortable: {
        startsOn: schema.calendarEvents.startsOn,
        createdAt: schema.calendarEvents.createdAt,
      },
      snapshot: (r) => ({ title: r.title, eventTypeId: r.eventTypeId, status: r.status }),
    }),
  };

  createEvent(ctx: PortalActionContext, input: CreateCalendarEventInput) {
    return this.create('events', ctx, {
      institutionId: ctx.principal.institutionId,
      title: input.title,
      eventTypeId: input.eventTypeId,
      type: 'event',
      startsOn: input.startsOn,
      endsOn: input.endsOn ?? null,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      description: input.description ?? null,
      status: input.status,
      audienceScope: input.audienceScope ?? 'institution',
      audienceRefId: input.audienceRefId ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
  }
}
