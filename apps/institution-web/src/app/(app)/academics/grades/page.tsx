'use client';
import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { type Column } from '@edrion/ui';
import { ResourceManager, type FilterDef } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useDepartmentOptions, type GradeLevelRow } from '@/lib/academics';
import { useTerm } from '@/lib/term';

const PROGRAMME_TYPES = new Set(['college', 'university', 'training_center']);

export default function GradeLevelsPage() {
  const { t, tp, type } = useTerm();
  const router = useRouter();

  useEffect(() => {
    if (PROGRAMME_TYPES.has(type)) router.replace('/academics/programme-structure');
  }, [type, router]);

  if (PROGRAMME_TYPES.has(type)) return null;

  const { data } = useDepartmentOptions();

  const filters = useMemo<FilterDef[]>(
    () => [
      {
        key: 'departmentId',
        label: `All ${t('department').toLowerCase()}s`,
        options: (data?.items ?? []).map((d) => ({ value: d.id, label: d.name })),
      },
    ],
    [data, t],
  );

  const columns: Column<GradeLevelRow>[] = useMemo(
    () => [
      { key: 'level', header: 'Level', sortable: true, align: 'left', render: (r) => <span className="tabular-nums text-text-secondary">{r.level}</span> },
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'departmentName', header: t('department'), render: (r) => <span className="text-text-muted">{r.departmentName ?? '—'}</span> },
      { key: 'classCount', header: 'Classes', align: 'right', render: (r) => <span className="tabular-nums">{r.classCount ?? '—'}</span> },
      { key: 'studentCount', header: 'Students', align: 'right', render: (r) => <span className="tabular-nums">{r.studentCount ?? '—'}</span> },
    ],
    [t],
  );
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: `e.g. ${t('gradeLevel')} 1` },
      { name: 'level', label: 'Level (order)', type: 'number', min: 0, help: 'Numeric order, e.g. 1 for the first level.' },
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
    <ResourceManager<GradeLevelRow>
      resource="grade-levels"
      title={tp('gradeLevel')}
      noun={t('gradeLevel').toLowerCase()}
      columns={columns}
      fields={fields}
      filters={filters}
      defaultSortBy="level"
      toFormValues={(r) => ({ name: r.name, level: r.level, departmentId: r.departmentId ?? '' })}
    />
  );
}
