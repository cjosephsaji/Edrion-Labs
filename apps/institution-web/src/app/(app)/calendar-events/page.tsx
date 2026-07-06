'use client';
import { useMemo } from 'react';
import { StatusBadge, type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useCalendarEventsList, useCalendarEventsMutations } from '@/lib/calendar-events';
import type { CalendarEventRow } from '@/lib/calendar-events-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'calendar_events.manage',
  create: 'calendar_events.manage',
  update: 'calendar_events.manage',
  delete: 'calendar_events.manage',
};

const KINDS = [
  { value: 'exam', label: 'Exam' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'event', label: 'Event' },
];

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
];

export default function CalendarEventsPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Mid-term exams' },
      { name: 'kind', label: 'Kind', type: 'select', required: true, options: KINDS },
      { name: 'startsOn', label: 'Starts on', type: 'date', required: true },
      { name: 'endsOn', label: 'Ends on', type: 'date', nullable: true },
      { name: 'timeLabel', label: 'Time label', type: 'text', nullable: true, placeholder: 'e.g. 9:00 AM' },
      { name: 'detail', label: 'Detail', type: 'textarea', nullable: true },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<CalendarEventRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      { key: 'kind', header: 'Kind', sortable: true, render: (r) => <span className="capitalize">{r.kind}</span> },
      { key: 'startsOn', header: 'Date', sortable: true, render: (r) => <span className="tabular-nums">{r.startsOn}</span> },
      { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
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
      filters={[
        { key: 'kind', label: 'All kinds', options: KINDS },
        { key: 'status', label: 'All statuses', options: STATUSES },
      ]}
      rowLabel={(r) => r.title}
      toFormValues={(r) => ({
        title: r.title,
        kind: r.kind,
        startsOn: r.startsOn,
        endsOn: r.endsOn ?? '',
        timeLabel: r.timeLabel ?? '',
        detail: r.detail ?? '',
        status: r.status,
      })}
    />
  );
}
