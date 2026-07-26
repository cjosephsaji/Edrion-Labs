'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import type { FilterDef } from '@/components/academics/resource-manager';
import type { DepartmentRow } from '@/lib/academics';
import { useTeachingStaffOptions, teachingStaffSelectOptions } from '@/lib/people';
import { useTerm } from '@/lib/term';

export default function DepartmentsPage() {
  const { t, tp } = useTerm();
  const { data: teachers } = useTeachingStaffOptions();

  const teacherOptions = teachingStaffSelectOptions(teachers);

  const filters = useMemo<FilterDef[]>(
    () => [
      {
        key: 'hasHead',
        label: 'Department head',
        options: [
          { value: 'true', label: 'Has head' },
          { value: 'false', label: 'No head' },
        ],
      },
    ],
    [],
  );

  const columns = useMemo<Column<DepartmentRow>[]>(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'code', header: 'Code', sortable: true, render: (r) => <span className="font-mono text-text-secondary">{r.code}</span> },
      { key: 'headUserName', header: 'Head', render: (r) => <span className="text-text-muted">{r.headUserName ?? '—'}</span> },
      { key: 'staffCount', header: 'Staff', align: 'right', render: (r) => <span className="tabular-nums">{r.staffCount ?? '—'}</span> },
      { key: 'subjectCount', header: tp('subject'), align: 'right', render: (r) => <span className="tabular-nums">{r.subjectCount ?? '—'}</span> },
      {
        key: 'description',
        header: 'Description',
        render: (r) => <span className="line-clamp-1 text-text-muted">{r.description ?? '—'}</span>,
      },
    ],
    [tp],
  );

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Science' },
      { name: 'code', label: 'Code', type: 'text', placeholder: 'e.g. SCI' },
      {
        name: 'headUserId',
        label: `${t('department')} head`,
        type: 'select',
        nullable: true,
        options: teacherOptions,
        help: 'A teaching staff member who leads this department.',
      },
      { name: 'description', label: 'Description', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [teacherOptions, t],
  );

  return (
    <ResourceManager<DepartmentRow>
      resource="departments"
      title={tp('department')}
      noun={t('department').toLowerCase()}
      columns={columns}
      fields={fields}
      filters={filters}
      defaultSortBy="name"
      toFormValues={(r) => ({ name: r.name, code: r.code, headUserId: r.headUserId ?? '', description: r.description ?? '' })}
    />
  );
}
