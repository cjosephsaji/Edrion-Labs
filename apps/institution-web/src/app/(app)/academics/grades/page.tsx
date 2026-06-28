'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useDepartmentOptions, type GradeLevelRow } from '@/lib/academics';

const columns: Column<GradeLevelRow>[] = [
  { key: 'level', header: 'Level', sortable: true, align: 'left', render: (r) => <span className="tabular-nums text-text-secondary">{r.level}</span> },
  { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
  { key: 'departmentName', header: 'Department', render: (r) => <span className="text-text-muted">{r.departmentName ?? '—'}</span> },
];

export default function GradeLevelsPage() {
  const { data } = useDepartmentOptions();
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Grade 1' },
      { name: 'level', label: 'Level (order)', type: 'number', min: 0, help: 'Numeric order, e.g. 1 for the first grade.' },
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
    <ResourceManager<GradeLevelRow>
      resource="grade-levels"
      title="Grades"
      noun="grade"
      columns={columns}
      fields={fields}
      defaultSortBy="level"
      toFormValues={(r) => ({ name: r.name, level: r.level, departmentId: r.departmentId ?? '' })}
    />
  );
}
