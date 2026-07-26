'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useFrontDeskList, useFrontDeskMutations } from '@/lib/staff-modules';
import type { AppointmentRow } from '@/lib/staff-modules-types';

const KEY = 'appointments.manage';
const PERMISSIONS: ResourcePermissions = { view: KEY, create: KEY, update: KEY, delete: KEY };

const STATUSES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No show' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function AppointmentsPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'visitorName', label: 'Visitor', type: 'text', required: true, placeholder: 'e.g. Jane Doe' },
      { name: 'withWhom', label: 'With', type: 'text', nullable: true, placeholder: 'Staff member' },
      { name: 'scheduledAt', label: 'Date', type: 'date', nullable: true },
      { name: 'notes', label: 'Notes', type: 'textarea', nullable: true, placeholder: 'Optional' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<AppointmentRow>[]>(
    () => [
      { key: 'visitorName', header: 'Visitor', sortable: true, render: (r) => <span className="font-medium">{r.visitorName}</span> },
      { key: 'withWhom', header: 'With', render: (r) => r.withWhom ?? '—' },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<AppointmentRow>
      resource="front-desk/appointments"
      title="Appointments"
      noun="appointment"
      columns={columns}
      fields={fields}
      defaultSortBy="scheduledAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useFrontDeskList}
      useMutations={useFrontDeskMutations}
      rowLabel={(r) => r.visitorName}
      toFormValues={(r) => ({
        visitorName: r.visitorName,
        withWhom: r.withWhom ?? '',
        scheduledAt: r.scheduledAt ? r.scheduledAt.slice(0, 10) : '',
        notes: r.notes ?? '',
        status: r.status,
      })}
    />
  );
}
