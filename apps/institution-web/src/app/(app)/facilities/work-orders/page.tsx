'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useFacilitiesList, useFacilitiesMutations } from '@/lib/staff-modules';
import type { WorkOrderRow } from '@/lib/staff-modules-types';

const KEY = 'work_orders.manage';
const PERMISSIONS: ResourcePermissions = { view: KEY, create: KEY, update: KEY, delete: KEY };

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];
const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function WorkOrdersPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Fix leaking tap' },
      { name: 'priority', label: 'Priority', type: 'select', required: true, options: PRIORITIES },
      { name: 'assignedTo', label: 'Assigned to', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'description', label: 'Description', type: 'textarea', nullable: true, placeholder: 'Optional' },
      { name: 'dueAt', label: 'Due on', type: 'date', nullable: true },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<WorkOrderRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      { key: 'priority', header: 'Priority', sortable: true, render: (r) => label(PRIORITIES, r.priority) },
      { key: 'assignedTo', header: 'Assigned', render: (r) => r.assignedTo ?? '—' },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<WorkOrderRow>
      resource="facilities/work-orders"
      title="Work Orders"
      noun="work order"
      columns={columns}
      fields={fields}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useFacilitiesList}
      useMutations={useFacilitiesMutations}
      rowLabel={(r) => r.title}
      toFormValues={(r) => ({
        title: r.title,
        priority: r.priority,
        assignedTo: r.assignedTo ?? '',
        description: r.description ?? '',
        dueAt: r.dueAt ?? '',
        status: r.status,
      })}
    />
  );
}
