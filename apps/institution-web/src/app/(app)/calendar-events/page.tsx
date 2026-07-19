'use client';

import { useMemo } from 'react';
import { StatusBadge, type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useCalendarEventsList, useCalendarEventsMutations } from '@/lib/calendar-events';
import type { CalendarEventRow } from '@/lib/calendar-events-types';
import { useQuery } from '@tanstack/react-query';
import { usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';
import type { InstitutionScope } from '@/lib/types';
import type { CalendarEventTypeRow } from '@/lib/calendar-events-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'calendar_events.view',
  create: 'calendar_events.manage',
  update: 'calendar_events.manage',
  delete: 'calendar_events.manage',
};

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
];

function scopeKey(scope: InstitutionScope): string {
  return scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
}

function useEventTypeOptions() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['calendar', 'event-types', scopeKey(scope)],
    queryFn: () => client.get<CalendarEventTypeRow[]>('/portal/calendar/event-types', scope),
  });
}

export default function CalendarEventsPage() {
  const { data: types } = useEventTypeOptions();
  const typeOptions = useMemo(
    () => (types ?? []).map((t) => ({ value: t.id, label: t.label })),
    [types],
  );

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Mid-term exams' },
      {
        name: 'eventTypeId',
        label: 'Type',
        type: 'select',
        required: true,
        options: typeOptions,
      },
      { name: 'startsOn', label: 'Starts on', type: 'date', required: true },
      { name: 'endsOn', label: 'Ends on', type: 'date', nullable: true },
      { name: 'startTime', label: 'Start time (HH:MM)', type: 'text', nullable: true, placeholder: '09:00' },
      { name: 'endTime', label: 'End time (HH:MM)', type: 'text', nullable: true, placeholder: '12:00' },
      { name: 'description', label: 'Detail', type: 'textarea', nullable: true },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [typeOptions],
  );

  const columns = useMemo<Column<CalendarEventRow>[]>(
    () => [
      {
        key: 'title',
        header: 'Title',
        sortable: true,
        render: (r) => <span className="font-medium">{r.title}</span>,
      },
      {
        key: 'type',
        header: 'Type',
        sortable: true,
        render: (r) => <span className="capitalize">{r.type}</span>,
      },
      {
        key: 'startsOn',
        header: 'Date',
        sortable: true,
        render: (r) => <span className="tabular-nums">{r.startsOn}</span>,
      },
      {
        key: 'status',
        header: 'Status',
        render: (r) => <StatusBadge status={r.status} />,
      },
    ],
    [],
  );

  return (
    <ResourceManager<CalendarEventRow>
      resource="calendar-events"
      title="Calendar events"
      noun="event"
      columns={columns}
      fields={fields}
      defaultSortBy="startsOn"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useCalendarEventsList}
      useMutations={useCalendarEventsMutations}
      filters={[{ key: 'status', label: 'All statuses', options: STATUSES }]}
      rowLabel={(r) => r.title}
      toFormValues={(r) => ({
        title: r.title,
        eventTypeId: r.eventTypeId ?? '',
        startsOn: r.startsOn,
        endsOn: r.endsOn ?? '',
        startTime: r.startTime ?? '',
        endTime: r.endTime ?? '',
        description: r.description ?? '',
        status: r.status,
      })}
    />
  );
}
