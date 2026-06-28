'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import type { DepartmentRow } from '@/lib/academics';
import { useTeacherOptions } from '@/lib/people';

const columns: Column<DepartmentRow>[] = [
  { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
  { key: 'code', header: 'Code', sortable: true, render: (r) => <span className="font-mono text-text-secondary">{r.code}</span> },
  { key: 'headUserName', header: 'Head', render: (r) => <span className="text-text-muted">{r.headUserName ?? '—'}</span> },
  {
    key: 'description',
    header: 'Description',
    render: (r) => <span className="line-clamp-1 text-text-muted">{r.description ?? '—'}</span>,
  },
];

export default function DepartmentsPage() {
  const { data: teachers } = useTeacherOptions();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Science' },
      { name: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. SCI' },
      {
        name: 'headUserId',
        label: 'Department head',
        type: 'select',
        nullable: true,
        options: (teachers?.items ?? []).map((t) => ({ value: t.id, label: `${t.firstName} ${t.lastName}` })),
        help: 'A teacher who leads this department.',
      },
      { name: 'description', label: 'Description', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [teachers],
  );

  return (
    <ResourceManager<DepartmentRow>
      resource="departments"
      title="Departments"
      noun="department"
      columns={columns}
      fields={fields}
      defaultSortBy="name"
      toFormValues={(r) => ({ name: r.name, code: r.code, headUserId: r.headUserId ?? '', description: r.description ?? '' })}
    />
  );
}
