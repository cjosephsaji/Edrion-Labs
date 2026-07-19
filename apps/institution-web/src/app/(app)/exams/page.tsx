'use client';
import { useMemo, useState } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type FilterDef, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useAcademicYearOptions } from '@/lib/academics';
import { useExamsList, useExamsMutations } from '@/lib/exams';
import { useProgrammeFacetFilters } from '@/lib/programme-facets';
import { useTerm } from '@/lib/term';
import type { ExamRow } from '@/lib/exams-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'exams.view',
  create: 'exams.manage',
  update: 'exams.manage',
  delete: 'exams.manage',
};

const EXAM_TYPES = [
  { value: 'term', label: 'Term' },
  { value: 'midterm', label: 'Midterm' },
  { value: 'final', label: 'Final' },
  { value: 'unit_test', label: 'Unit test' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'practical', label: 'Practical' },
  { value: 'mock', label: 'Mock' },
];
const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'published', label: 'Published' },
  { value: 'cancelled', label: 'Cancelled' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function ExamsPage() {
  const { t } = useTerm();
  const facets = useProgrammeFacetFilters();
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const { data: years } = useAcademicYearOptions();

  // Minimal fields kept for detail auto-panel; create/edit go to the builder page.
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'examType', label: 'Type', type: 'combobox', required: true, options: EXAM_TYPES },
      { name: 'status', label: 'Status', type: 'combobox', required: true, options: STATUSES },
      {
        name: 'academicYearId',
        label: t('academicYear'),
        type: 'combobox',
        nullable: true,
        options: (years?.items ?? []).map((y) => ({ value: y.id, label: y.name })),
      },
    ],
    [years, t],
  );

  const columns = useMemo<Column<ExamRow>[]>(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'examType', header: 'Type', sortable: true, render: (r) => <span className="text-text-muted">{label(EXAM_TYPES, r.examType)}</span> },
      {
        key: 'termLabel',
        header: t('term'),
        render: (r) => r.termName ?? r.termLabel ?? '—',
      },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
      { key: 'startDate', header: 'Starts', sortable: true, render: (r) => <span className="tabular-nums">{r.startDate ?? '—'}</span> },
      {
        key: 'scheduleCount',
        header: 'Papers',
        align: 'right',
        render: (r) => <span className="tabular-nums">{r.scheduleCount || '—'}</span>,
      },
    ],
    [t],
  );

  const toolbarFilters = useMemo<FilterDef[]>(
    () => [
      ...facets.filters,
      { key: 'status', label: 'All statuses', options: STATUSES },
      { key: 'examType', label: 'All types', options: EXAM_TYPES },
    ],
    [facets.filters],
  );

  const listFilterValues = useMemo(
    () => ({
      ...facets.filterValues,
      status: statusFilter,
      examType: typeFilter,
    }),
    [facets.filterValues, statusFilter, typeFilter],
  );

  function onListFilterChange(key: string, value: string) {
    if (key === 'status') setStatusFilter(value);
    else if (key === 'examType') setTypeFilter(value);
    else facets.onFilterChange(key, value);
  }

  return (
    <ResourceManager<ExamRow>
      resource="exams"
      title="Exams"
      noun="exam"
      columns={columns}
      fields={fields}
      filters={toolbarFilters}
      filterValues={listFilterValues}
      onFilterChange={onListFilterChange}
      defaultSortBy="startDate"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useExamsList}
      useMutations={useExamsMutations}
      rowLabel={(r) => r.name}
      createHref="/exams/new"
      getEditHref={(r) => `/exams/${r.id}`}
      toFormValues={(r) => ({
        name: r.name,
        examType: r.examType,
        status: r.status,
        academicYearId: r.academicYearId ?? '',
      })}
    />
  );
}
