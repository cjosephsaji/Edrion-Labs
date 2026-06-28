'use client';
import { useMemo } from 'react';
import { Badge, type Column } from '@edrion/ui';
import { ResourceManager } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useDepartmentOptions, type SubjectRow } from '@/lib/academics';

const columns: Column<SubjectRow>[] = [
  { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
  { key: 'code', header: 'Code', sortable: true, render: (r) => <span className="font-mono text-text-secondary">{r.code}</span> },
  {
    key: 'kind',
    header: 'Type',
    sortable: true,
    render: (r) => <Badge tone={r.kind === 'core' ? 'info' : 'neutral'}>{r.kind === 'core' ? 'Core' : 'Elective'}</Badge>,
  },
  { key: 'departmentName', header: 'Department', render: (r) => <span className="text-text-muted">{r.departmentName ?? '—'}</span> },
];

export default function SubjectsPage() {
  const { data } = useDepartmentOptions();
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Algebra' },
      { name: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. MATH-ALG' },
      {
        name: 'kind',
        label: 'Type',
        type: 'select',
        required: true,
        options: [
          { value: 'core', label: 'Core' },
          { value: 'elective', label: 'Elective' },
        ],
      },
      {
        name: 'departmentId',
        label: 'Department',
        type: 'select',
        nullable: true,
        options: (data?.items ?? []).map((d) => ({ value: d.id, label: d.name })),
      },
    ],
    [data],
  );

  return (
    <ResourceManager<SubjectRow>
      resource="subjects"
      title="Subjects"
      noun="subject"
      columns={columns}
      fields={fields}
      defaultSortBy="name"
      toFormValues={(r) => ({ name: r.name, code: r.code, kind: r.kind, departmentId: r.departmentId ?? '' })}
    />
  );
}
