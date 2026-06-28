'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useFacilitiesList, useFacilitiesMutations } from '@/lib/staff-modules';
import type { MaintenanceTaskRow } from '@/lib/staff-modules-types';

const KEY = 'maintenance_tasks.manage';
const PERMISSIONS: ResourcePermissions = { view: KEY, create: KEY, update: KEY, delete: KEY };

const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];
const STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'done', label: 'Done' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function MaintenanceTasksPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. HVAC filter change' },
      { name: 'frequency', label: 'Frequency', type: 'select', required: true, options: FREQUENCIES },
      { name: 'nextDueAt', label: 'Next due', type: 'date', nullable: true },
      { name: 'notes', label: 'Notes', type: 'textarea', nullable: true, placeholder: 'Optional' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<MaintenanceTaskRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      { key: 'frequency', header: 'Frequency', render: (r) => label(FREQUENCIES, r.frequency) },
      { key: 'nextDueAt', header: 'Next due', render: (r) => r.nextDueAt ?? '—' },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<MaintenanceTaskRow>
      resource="facilities/maintenance-tasks"
      title="Maintenance"
      noun="maintenance task"
      columns={columns}
      fields={fields}
      defaultSortBy="nextDueAt"
      defaultSortDir="asc"
      permissions={PERMISSIONS}
      useList={useFacilitiesList}
      useMutations={useFacilitiesMutations}
      rowLabel={(r) => r.title}
      toFormValues={(r) => ({
        title: r.title,
        frequency: r.frequency,
        nextDueAt: r.nextDueAt ?? '',
        notes: r.notes ?? '',
        status: r.status,
      })}
    />
  );
}
