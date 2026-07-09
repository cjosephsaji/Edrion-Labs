'use client';
import { useMemo, useState } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type FilterDef, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { ExamSchedulesPanel } from '@/components/exams/exam-schedules-panel';
import { RecipientPicker } from '@/components/recipients/recipient-picker';
import { useAcademicYearOptions } from '@/lib/academics';
import { useExamsList, useExamsMutations } from '@/lib/exams';
import { useProgrammeFacetFilters } from '@/lib/programme-facets';
import { useAcademicContextFilters } from '@/lib/academic-context';
import { useTerm } from '@/lib/term';
import type { Target } from '@/lib/recipients';
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
  const contextFilters = useAcademicContextFilters();
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const { data: years } = useAcademicYearOptions();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Term 1 Finals' },
      { name: 'examType', label: 'Type', type: 'select', required: true, options: EXAM_TYPES },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
      ...(facets.showFacets
        ? [
            {
              name: 'termId',
              label: t('term'),
              type: 'select' as const,
              nullable: true,
              options: facets.termOptions,
            },
          ]
        : [{ name: 'termLabel', label: t('term'), type: 'text' as const, nullable: true, placeholder: 'e.g. Term 1' }]),
      {
        name: 'academicYearId',
        label: t('academicYear'),
        type: 'select',
        nullable: true,
        options: (years?.items ?? []).map((y) => ({ value: y.id, label: y.name })),
      },
      { name: 'startDate', label: 'Start date', type: 'date', nullable: true },
      { name: 'endDate', label: 'End date', type: 'date', nullable: true },
      { name: 'durationMin', label: 'Duration (minutes)', type: 'number', nullable: true, min: 1, placeholder: 'Optional timed attempt' },
      {
        name: 'audience',
        label: 'Student audience',
        type: 'custom',
        render: (value, onChange) => (
          <RecipientPicker value={(value as Target[]) ?? []} onChange={onChange} studentsOnly />
        ),
        help: 'Who can attempt this exam online. Leave empty to skip online attempts.',
      },
      { name: 'description', label: 'Description', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [years, facets.showFacets, facets.termOptions, t],
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
      extraFilters={contextFilters}
      defaultSortBy="startDate"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useExamsList}
      useMutations={useExamsMutations}
      rowLabel={(r) => r.name}
      renderFormExtra={({ row }) => <ExamSchedulesPanel examId={row.id} examName={row.name} />}
      toFormValues={(r) => ({
        name: r.name,
        examType: r.examType,
        status: r.status,
        termId: r.termId ?? '',
        termLabel: r.termLabel ?? '',
        academicYearId: r.academicYearId ?? '',
        startDate: r.startDate ?? '',
        endDate: r.endDate ?? '',
        durationMin: r.durationMin ?? '',
        audience: r.audience ?? [],
        description: r.description ?? '',
      })}
    />
  );
}
