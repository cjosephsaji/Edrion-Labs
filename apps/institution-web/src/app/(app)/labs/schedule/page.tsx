'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useLabsList, useLabsMutations } from '@/lib/staff-modules';
import type { LabScheduleRow } from '@/lib/staff-modules-types';

const KEY = 'labs.view_schedule';
const PERMISSIONS: ResourcePermissions = { view: KEY, create: KEY, update: KEY, delete: KEY };

const STATUSES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function LabSchedulePage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'labName', label: 'Lab', type: 'text', required: true, placeholder: 'e.g. Physics Lab 1' },
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Grade 9 practical' },
      { name: 'scheduledAt', label: 'Date', type: 'date', nullable: true },
      { name: 'durationMinutes', label: 'Duration (min)', type: 'number', min: 0, nullable: true },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<LabScheduleRow>[]>(
    () => [
      { key: 'labName', header: 'Lab', sortable: true, render: (r) => <span className="font-medium">{r.labName}</span> },
      { key: 'title', header: 'Title', render: (r) => r.title },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<LabScheduleRow>
      resource="labs/schedules"
      title="Lab Schedule"
      noun="schedule"
      columns={columns}
      fields={fields}
      defaultSortBy="scheduledAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useLabsList}
      useMutations={useLabsMutations}
      rowLabel={(r) => r.title}
      toFormValues={(r) => ({
        labName: r.labName,
        title: r.title,
        scheduledAt: r.scheduledAt ? r.scheduledAt.slice(0, 10) : '',
        durationMinutes: r.durationMinutes ?? '',
        status: r.status,
      })}
    />
  );
}
