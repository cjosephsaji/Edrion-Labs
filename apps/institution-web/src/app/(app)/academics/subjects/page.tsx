'use client';
import { useMemo } from 'react';
import { Badge, type Column } from '@edrion/ui';
import { ResourceManager, type FilterDef } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useDepartmentOptions, type SubjectRow } from '@/lib/academics';
import { useTerm } from '@/lib/term';

export default function SubjectsPage() {
  const { t, tp } = useTerm();
  const { data } = useDepartmentOptions();

  const filters = useMemo<FilterDef[]>(
    () => [
      {
        key: 'kind',
        label: 'All types',
        options: [
          { value: 'core', label: 'Core' },
          { value: 'elective', label: 'Elective' },
        ],
      },
      {
        key: 'departmentId',
        label: `All ${t('department').toLowerCase()}s`,
        options: (data?.items ?? []).map((d) => ({ value: d.id, label: d.name })),
      },
    ],
    [data, t],
  );

  const columns: Column<SubjectRow>[] = useMemo(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'code', header: 'Code', sortable: true, render: (r) => <span className="font-mono text-text-secondary">{r.code}</span> },
      {
        key: 'kind',
        header: 'Type',
        sortable: true,
        render: (r) => <Badge tone={r.kind === 'core' ? 'info' : 'neutral'}>{r.kind === 'core' ? 'Core' : 'Elective'}</Badge>,
      },
      { key: 'departmentName', header: t('department'), render: (r) => <span className="text-text-muted">{r.departmentName ?? '—'}</span> },
      { key: 'classCount', header: 'Classes', align: 'right', render: (r) => <span className="tabular-nums">{r.classCount ?? '—'}</span> },
    ],
    [t],
  );
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
        label: t('department'),
        type: 'select',
        nullable: true,
        options: (data?.items ?? []).map((d) => ({ value: d.id, label: d.name })),
      },
    ],
    [data, t],
  );

  return (
    <ResourceManager<SubjectRow>
      resource="subjects"
      title={tp('subject')}
      noun={t('subject').toLowerCase()}
      columns={columns}
      fields={fields}
      filters={filters}
      defaultSortBy="name"
      toFormValues={(r) => ({ name: r.name, code: r.code, kind: r.kind, departmentId: r.departmentId ?? '' })}
    />
  );
}
