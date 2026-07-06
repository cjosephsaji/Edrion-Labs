import { Injectable } from '@nestjs/common';
import { schema } from '@edrion/database';
import type { CreatePortalCalendarEventInput } from '@edrion/schemas';
import { PortalCrudEngine, type CrudConfig } from '../portal-crud.engine';
import { PortalResourceService, resourceConfig } from '../portal-resource.service';
import type { PortalActionContext } from '../portal-action-context';

@Injectable()
export class PortalCalendarEventsService extends PortalResourceService {
  constructor(crud: PortalCrudEngine) {
    super(crud);
  }

  protected readonly configs: Record<string, CrudConfig> = {
    events: resourceConfig(schema.portalCalendarEvents, {
      module: 'portal-calendar-events',
      entityType: 'calendar_event',
      actionPrefix: 'calendar_event',
      search: [schema.portalCalendarEvents.title, schema.portalCalendarEvents.detail],
      sortable: { startsOn: schema.portalCalendarEvents.startsOn, createdAt: schema.portalCalendarEvents.createdAt },
      snapshot: (r) => ({ kind: r.kind, title: r.title }),
    }),
  };

  createEvent(ctx: PortalActionContext, input: CreatePortalCalendarEventInput) {
    return this.create('events', ctx, {
      institutionId: ctx.principal.institutionId,
      kind: input.kind,
      title: input.title,
      detail: input.detail ?? null,
      startsOn: input.startsOn,
      endsOn: input.endsOn ?? null,
      timeLabel: input.timeLabel ?? null,
      audience: input.audience,
      status: input.status,
      createdBy: ctx.principal.institutionUserId,
    });
  }
}
