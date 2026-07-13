'use client';
import { useMemo } from 'react';
import { Badge, type Column, type DetailSection } from '@edrion/ui';
import { ResourceManager, type FilterDef } from '@/components/academics/resource-manager';
import { SubjectPlacementsPanel } from '@/components/academics/subject-placements-panel';
import type { FieldDef } from '@/components/academics/resource-form';
import { useDepartmentOptions, useProgrammeLevelSelectOptions, type SubjectRow } from '@/lib/academics';
import { useTerm } from '@/lib/term';

const SEMESTER_FILTER_OPTIONS = Array.from({ length: 8 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

export default function SubjectsPage() {
  const { t, tp } = useTerm();
  const { data } = useDepartmentOptions();
  const { options: levelOptions } = useProgrammeLevelSelectOptions();

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
      {
        key: 'programmeLevelId',
        label: `All ${t('gradeLevel').toLowerCase()}s`,
        options: levelOptions,
      },
      {
        key: 'semesterSequence',
        label: `All ${tp('term').toLowerCase()}`,
        options: SEMESTER_FILTER_OPTIONS.map((o) => ({
          value: o.value,
          label: `${t('term')} ${o.label}`,
        })),
      },
    ],
    [data, levelOptions, t, tp],
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
      {
        key: 'placements',
        header: 'Taught in',
        render: (r) => {
          const placements = r.placements ?? [];
          if (placements.length === 0) {
            return <span className="text-xs text-text-muted">Not placed</span>;
          }
          const shown = placements.slice(0, 2);
          return (
            <span className="flex flex-wrap items-center gap-1">
              {shown.map((p) => (
                <Badge key={p.id} tone="neutral">
                  {[p.departmentName, p.gradeLevelName].filter(Boolean).join(' · ')} · {t('term')}{' '}
                  {p.semesterSequence}
                </Badge>
              ))}
              {placements.length > shown.length && (
                <span className="text-xs text-text-muted">+{placements.length - shown.length}</span>
              )}
            </span>
          );
        },
      },
      { key: 'departmentName', header: `Owning ${t('department').toLowerCase()}`, render: (r) => <span className="text-text-muted">{r.departmentName ?? '—'}</span> },
      { key: 'classCount', header: 'Classes', align: 'right', render: (r) => <span className="tabular-nums">{r.classCount ?? '—'}</span> },
    ],
    [t],
  );

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Discrete Mathematics' },
      { name: 'code', label: 'Code', type: 'text', placeholder: 'e.g. MATH-DM' },
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
        label: `Owning ${t('department').toLowerCase()}`,
        type: 'select',
        nullable: true,
        options: (data?.items ?? []).map((d) => ({ value: d.id, label: d.name })),
        help: `Who owns the subject. Save, then use “Taught in” below to place it in a ${t('gradeLevel').toLowerCase()} and ${t('term').toLowerCase()}.`,
      },
    ],
    [data, t],
  );

  const detail = useMemo(
    () =>
      (r: SubjectRow): DetailSection[] => [
        {
          title: 'Overview',
          fields: [
            { label: 'Name', value: r.name },
            { label: 'Code', value: r.code },
            { label: 'Type', value: r.kind === 'core' ? 'Core' : 'Elective' },
            { label: `Owning ${t('department').toLowerCase()}`, value: r.departmentName ?? '—' },
            { label: 'Classes teaching it', value: r.classCount ?? 0 },
          ],
        },
      ],
    [t],
  );

  return (
    <ResourceManager<SubjectRow>
      resource="subjects"
      title={tp('subject')}
      noun={t('subject').toLowerCase()}
      columns={columns}
      fields={fields}
      filters={filters}
      detail={detail}
      defaultSortBy="name"
      renderFormExtra={({ row }) => (
        <SubjectPlacementsPanel subjectId={row.id} subjectName={row.name} />
      )}
      renderDetailExtra={({ row }) => (
        <SubjectPlacementsPanel subjectId={row.id} subjectName={row.name} />
      )}
      toFormValues={(r) => ({ name: r.name, code: r.code, kind: r.kind, departmentId: r.departmentId ?? '' })}
    />
  );
}
