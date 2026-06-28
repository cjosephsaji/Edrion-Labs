'use client';
import { Badge, StatusBadge, type Column } from '@edrion/ui';
import { ResourceManager } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import type { AcademicYearRow } from '@/lib/academics';

const fields: FieldDef[] = [
  { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. 2025–2026' },
  { name: 'startDate', label: 'Start date', type: 'date', required: true },
  { name: 'endDate', label: 'End date', type: 'date', required: true },
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    required: true,
    options: [
      { value: 'planning', label: 'Planning' },
      { value: 'active', label: 'Active' },
      { value: 'archived', label: 'Archived' },
    ],
  },
  { name: 'isCurrent', label: 'Mark as the current year', type: 'checkbox', help: 'Only one year is current per scope.' },
];

const columns: Column<AcademicYearRow>[] = [
  {
    key: 'name',
    header: 'Name',
    sortable: true,
    render: (r) => (
      <span className="flex items-center gap-2">
        <span className="font-medium">{r.name}</span>
        {r.isCurrent && <Badge tone="primary">Current</Badge>}
      </span>
    ),
  },
  { key: 'startDate', header: 'Starts', sortable: true, render: (r) => fmtDate(r.startDate) },
  { key: 'endDate', header: 'Ends', render: (r) => fmtDate(r.endDate) },
  { key: 'status', header: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
  {
    key: 'scope',
    header: 'Applies to',
    render: (r) => <span className="text-text-muted">{r.campusId ? 'This campus' : 'All campuses'}</span>,
  },
];

export default function AcademicYearsPage() {
  return (
    <ResourceManager<AcademicYearRow>
      resource="academic-years"
      title="Academic Years"
      noun="academic year"
      columns={columns}
      fields={fields}
      defaultSortBy="startDate"
      defaultSortDir="desc"
      toFormValues={(r) => ({
        name: r.name,
        startDate: r.startDate,
        endDate: r.endDate,
        status: r.status,
        isCurrent: r.isCurrent,
      })}
    />
  );
}

function fmtDate(d: string): string {
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
